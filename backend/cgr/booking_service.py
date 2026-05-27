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

    Раздел 3.3 ТЗ + раздел 5.1 чеклиста.
    Локализация push — на стороне notifications_router (TODO когда подключим).
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
            new_status = parsed.get("status", b["status"])
            new_position = parsed.get("queue_position")

        was_changed = (new_status != b["status"]) or (new_position != b.get("queue_position"))
        if was_changed:
            cgr_dal.update_booking_status(
                booking_id=b["id"],
                status=new_status,
                queue_position=new_position,
                last_known_payload=parsed,
            )
            changed += 1
            # TODO: вызвать send_localized_push если позиция/статус изменились
            # с учётом cgr_dal.should_send_push (throttle)

        cgr_dal.log_booking_poll(
            booking_id=b["id"],
            old_status=b["status"],
            new_status=new_status,
            old_position=b.get("queue_position"),
            new_position=new_position,
            push_sent=False,
        )

    _metrics_polls += polled
    logger.info("cgr.booking: polled %d active bookings, %d changed, %d errors", polled, changed, errors)
    return {"polled": polled, "changed": changed, "errors": errors}


def metrics() -> dict[str, int]:
    return {"polls": _metrics_polls}
