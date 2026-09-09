"""Сервис броней водителей — создание + опрос статусов."""
import logging

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRException
from .parsers import parse_booking_lookup
from .settings import cgr_settings

logger = logging.getLogger("cgr.booking")


# Метрики
_metrics_polls = 0


# Статусы парсера (in_queue/crossed/...) → жизненный цикл cgr_booking_status
# (CHECK: pending|verified|active|completed|cancelled|not_found).
_STATUS_TO_LIFECYCLE = {
    "in_queue": "active",
    "called": "active",
    "crossed": "completed",
    "revoked": "cancelled",
    "payment": "pending",
    "not_paid": "pending",
    "validating": "pending",
    "review_failed": "pending",
}


def _send_booking_change_push(booking: dict, parsed: dict | None,
                              old_status: str | None, old_position: int | None,
                              new_status: str, new_position: int | None) -> bool:
    """Send one throttled push for a meaningful CGR booking change.

    The CGR parser exposes a more precise public status (``called``,
    ``crossed``, ``revoked``) than the local lifecycle constraint.  Keep the
    database lifecycle normalized, but use the precise code for the driver's
    notification text.
    """
    parsed_code = (parsed or {}).get("status")
    status_kind = {
        "called": "queue_called",
        "crossed": "queue_crossed",
        "revoked": "queue_revoked",
    }.get(parsed_code)

    position_changed = (
        new_position is not None
        and old_position is not None
        and new_position != old_position
    )
    lifecycle_changed = old_status != new_status
    if not status_kind and not position_changed and not lifecycle_changed:
        return False

    # Do not notify about the first harmless transition pending -> active
    # unless CGR has a precise event or a known queue position.
    if lifecycle_changed and old_status == "pending" and not status_kind and not position_changed:
        return False

    push_kind = status_kind or ("queue_position" if position_changed else f"queue_{new_status}")
    if not cgr_dal.should_send_push(
        booking["id"], push_kind, throttle_minutes=cgr_settings.push_throttle_minutes
    ):
        return False

    plate_or_booking = booking.get("cgr_booking_number") or "бронь"
    checkpoint = booking.get("checkpoint_code")
    # Push-closure track: called/crossed/revoked are localized (recipient's
    # push_devices.locale) via push_i18n and durable — each happens at most
    # once per booking, so booking_id+status_kind is inherently a stable,
    # unique-per-occurrence event key (same key already used for the Bell
    # entry below, kept unchanged). position_changed/generic status text
    # stays RU-only and non-durable by design — that is the high-frequency
    # telemetry case this track was told not to add durability/Bell entries
    # for; localizing text that changes every few minutes is not worth the
    # added surface here.
    event_key = None
    if status_kind in ("queue_called", "queue_crossed", "queue_revoked"):
        from services import push_gateway, push_i18n
        loc = push_gateway.get_recipient_locale(booking["urtruck_user_id"])
        i18n_event = {"queue_called": "cgr_called", "queue_crossed": "cgr_crossed", "queue_revoked": "cgr_revoked"}[status_kind]
        title, body = push_i18n.push_text(i18n_event, loc, booking=plate_or_booking)
        event_key = f"{status_kind}:{booking['id']}"
    elif position_changed:
        title = "📍 Обновилась позиция в очереди"
        body = f"Бронь {plate_or_booking}: позиция {new_position}."
    else:
        title = "🔄 Обновился статус очереди"
        body = f"Бронь {plate_or_booking}: статус обновлён."
    if checkpoint:
        body += f" Пункт: {checkpoint}."

    try:
        from api.push import send_to_user
        push_data = {"booking_id": booking["id"], "status": parsed_code or new_status}
        if event_key:
            push_data["event_key"] = event_key
            push_data["event"] = f"cgr.{status_kind}"
        send_to_user(booking["urtruck_user_id"], title, body,
                     url="/queue", kind="queue", data=push_data)
        # Push-recovery track, Phase 4 (event-matrix audit finding): CGR
        # events were push-only, never reaching the in-app Bell/notifications
        # table. Only the 3 significant lifecycle events (called/crossed/
        # revoked) get a Bell entry — position_changed / generic status
        # updates are exactly the "high-frequency telemetry" this track was
        # told NOT to add to Bell history (queue position can shift several
        # times while a driver waits; called/crossed/revoked each happen at
        # most once per booking).
        if event_key:
            try:
                from api.notifications import create_notification
                create_notification(booking["urtruck_user_id"], status_kind, title, body, "🛂",
                                    url="/queue", event_key=event_key)
            except Exception:
                pass
        cgr_dal.log_push_sent(booking["id"], push_kind)
        return True
    except Exception:
        logger.exception("cgr.booking: push failed for booking %s", booking.get("id"))
        return False


def _to_lifecycle(code: str | None) -> str:
    return _STATUS_TO_LIFECYCLE.get(code or "", "pending")


async def lookup_by_plate(plate: str) -> dict:
    """Живой публичный поиск статуса по ГРНЗ (без БД, без авторизации).

    Возвращает driver-facing dict для эндпоинта /api/v1/borders/lookup.
    Это Поток А: данные из публичного реестра CGR.
    """
    if not cgr_settings.feature_enabled:
        return {"enabled": False}
    payload = await cgr_client.fetch_booking_lookup(plate)
    parsed = parse_booking_lookup(payload, plate)
    if parsed is None:
        return {"found": False, "plate": plate}
    return {
        "found": True,
        "plate": plate,
        "status": parsed["status"],            # in_queue / crossed / revoked / ...
        "is_late": parsed.get("is_late", False),
        "status_raw": parsed.get("status_raw"),
        "checkpoint": parsed.get("checkpoint"),
        "queue_datetime": parsed.get("queue_datetime"),
    }


def create_booking(
    urtruck_user_id: str,
    urtruck_trip_id: str | None,
    booking_number: str,
    checkpoint_code: str | None = None,
) -> dict:
    """Создаёт запись cgr_booking_status. Возвращает {booking_id, verification_status, message}.

    Раздел 3.2 ТЗ. Валидация формата номера — в API (Pydantic).
    После создания планируется фоновая проверка через poll_active().
    """
    bid = cgr_dal.create_booking(
        urtruck_user_id=urtruck_user_id,
        urtruck_trip_id=urtruck_trip_id,
        cgr_booking_number=booking_number,
        checkpoint_code=checkpoint_code,
    )
    return {
        "booking_id": bid,
        "verification_status": "pending",
        "message": "Проверяем номер брони...",
    }


async def poll_active() -> dict:
    """Cron: каждые CGR_BOOKING_POLL_INTERVAL_MIN минут — опрашивать активные брони.

    Раздел 3.3 ТЗ + раздел 5.1 чеклиста. Важные изменения отправляются
    адресным throttled push через общий UrTruck push-контур.
    """
    global _metrics_polls

    if not cgr_settings.feature_enabled:
        return {"skipped": True}

    active = cgr_dal.get_active_bookings()
    polled = 0
    changed = 0
    errors = 0

    for b in active:
        try:
            payload = await cgr_client.fetch_booking_lookup(b["cgr_booking_number"])
            parsed = parse_booking_lookup(payload, b["cgr_booking_number"])
        except NotImplementedError:
            logger.warning("cgr.booking: parser not implemented (waiting on discovery)")
            return {"skipped": True, "reason": "parser_pending_discovery"}
        except CGRException as e:
            errors += 1
            logger.warning("cgr.booking: fetch failed for booking %s: %s", b["id"], e)
            continue

        polled += 1
        if parsed is None:
            new_status = "not_found"
            new_position = None
        else:
            # parsed["status"] — код парсера (in_queue/crossed/...), маппим в
            # lifecycle, иначе нарушим CHECK-констрейнт cgr_booking_status.
            new_status = _to_lifecycle(parsed.get("status"))
            new_position = parsed.get("queue_position")

        was_changed = (new_status != b["status"]) or (new_position != b.get("queue_position"))
        push_sent = False
        if was_changed:
            cgr_dal.update_booking_status(
                booking_id=b["id"],
                status=new_status,
                queue_position=new_position,
                last_known_payload=parsed,
            )
            changed += 1
            push_sent = _send_booking_change_push(
                b, parsed, b["status"], b.get("queue_position"),
                new_status, new_position,
            )

        cgr_dal.log_booking_poll(
            booking_id=b["id"],
            old_status=b["status"],
            new_status=new_status,
            old_position=b.get("queue_position"),
            new_position=new_position,
            push_sent=push_sent,
        )

    _metrics_polls += polled
    logger.info("cgr.booking: polled %d active bookings, %d changed, %d errors", polled, changed, errors)
    return {"polled": polled, "changed": changed, "errors": errors}


def metrics() -> dict[str, int]:
    return {"polls": _metrics_polls}
