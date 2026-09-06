"""Adapters from domain events to the existing push outbox.

The domain transaction owns the event. Delivery is deliberately deferred to
the existing push worker, so provider failures cannot roll back a deal.
"""
import json
import sqlite3

from .model import OutboxEvent


def enqueue_acceptance_push(conn: sqlite3.Connection, event: OutboxEvent) -> int:
    """Enqueue one push per intended recipient, idempotently.

    The push worker remains the only provider-delivery mechanism. Consumers
    use the domain event id as their stable dedupe key.
    """
    recipients = event.payload.get("recipient_user_ids") or []
    if event.event_type != "BidAccepted" or not recipients:
        return 0
    payload = {
        "event_id": event.event_id,
        "event_type": "bid.accepted",
        "title": "Ставка принята",
        "body": "Ваше предложение принято. Сделка создана.",
        "data": {
            "event_id": event.event_id,
            "deal_id": event.payload.get("deal_id"),
            "chat_room_id": event.payload.get("chat_room_id"),
            "url": event.payload.get("url") or "/",
        },
    }
    inserted = 0
    for user_id in dict.fromkeys(str(value) for value in recipients if value):
        cur = conn.execute(
            "INSERT INTO push_outbox(event_id,event_type,recipient_user_id,payload,priority) "
            "VALUES (?,?,?,?,?) ON CONFLICT(event_id,recipient_user_id) DO NOTHING",
            (event.event_id, "bid.accepted", user_id, json.dumps(payload, ensure_ascii=False), "critical"),
        )
        inserted += cur.rowcount
    return inserted


def record_acceptance_notifications(event: OutboxEvent) -> None:
    """Write durable in-app notifications using the existing dedupe key."""
    from api.notifications import create_notification

    for user_id in dict.fromkeys(str(value) for value in event.payload.get("recipient_user_ids") or [] if value):
        create_notification(
            user_id,
            "bid_accepted",
            "Ставка принята",
            "Ваше предложение принято. Сделка создана.",
            "✅",
            url=event.payload.get("url") or "/",
            event_key=f"domain:{event.event_id}:{user_id}",
        )


def handle_bid_accepted(conn: sqlite3.Connection, event: OutboxEvent) -> None:
    enqueue_acceptance_push(conn, event)
    # Notifications use the existing API and its own connection. Commit the
    # push enqueue before opening that connection; both consumers are
    # idempotent, so a retry after a later notification failure is safe.
    conn.commit()
    record_acceptance_notifications(event)


# AC6 (2026-09-07): DealStatusChanged / DealCancelled real consumers.
#
# Root cause closed here: api/marketplace.py's update_deal_status() sends
# push + in-app notification for every user-visible transition
# (in_progress/at_border/delivered/received/completed/cancelled), but only
# on the legacy (DEALS_V2_ENABLED=false) code path — the V2 adapter returns
# early (`if v2_result is not None: return v2_result`) before that block is
# ever reached. Confirmed by the 2026-09-06 corrective architecture audit:
# these two event types were acknowledged by a no-op handler, so under V2 ON
# a driver/shipper got zero push and zero bell notification for "Рейс
# начался" / "На границе" / "Доставлен" / etc. This mirrors the exact same
# recipient selection, status→label mapping, and money formatting the
# legacy handler used (see modules/deals/application/service.py's
# transition_deal(), which now records those as event FACTS).
_DEAL_STATUS_LABELS = {
    "in_progress": "🚛 Рейс начался",
    "at_border": "🛂 На границе",
    "delivered": "✅ Доставлен — ожидается подтверждение получения",
    "received": "✅ Получение подтверждено",
    "completed": "🤝 Сделка завершена",
    "cancelled": "❌ Отменено",
}


def _deal_status_deep_link(event: OutboxEvent) -> str:
    payload = event.payload
    if payload.get("cargo_id"):
        return f"/cargos/{payload['cargo_id']}"
    if payload.get("trip_id"):
        return f"/trips/{payload['trip_id']}"
    return f"/deals/{payload.get('deal_id') or event.aggregate_id}"


def enqueue_status_push(conn: sqlite3.Connection, event: OutboxEvent) -> int:
    """Enqueue one localized push per recipient for a deal status transition.

    Localization: routed through the SAME kind="deal_status" catalog
    (services/push_sender._SYSTEM_PUSH_COPY, RU/EN/KK/ZH) the synchronous
    legacy path already uses via send_to_user(kind="deal_status", ...) — see
    services/push_sender._localize_system_copy. The Russian strings below
    are only the fallback used when a recipient's locale/catalog entry is
    unavailable, matching the legacy hardcoded labels exactly.
    """
    if event.event_type not in ("DealStatusChanged", "DealCancelled"):
        return 0
    to_status = event.payload.get("to_status")
    label = _DEAL_STATUS_LABELS.get(to_status)
    recipients = event.payload.get("recipient_user_ids") or []
    if not label or not recipients:
        return 0
    from services.push_sender import _localize_system_copy

    from_city = event.payload.get("from_city")
    to_city = event.payload.get("to_city")
    route = " → ".join(str(v) for v in (from_city, to_city) if v)
    fallback_title = label
    fallback_body = f"{from_city or ''}→{to_city or ''} · {event.payload.get('amount_display') or ''}".strip("· ").strip()
    push_data = {
        "status": to_status, "from_city": from_city, "to_city": to_city,
        "amount": event.payload.get("amount"), "route": route,
    }
    deal_url = _deal_status_deep_link(event)
    inserted = 0
    for user_id in dict.fromkeys(str(value) for value in recipients if value):
        title, body = _localize_system_copy(user_id, "deal_status", fallback_title, fallback_body, push_data)
        payload = {
            "event_id": event.event_id,
            "event_type": "deal.status",
            "title": title,
            "body": body,
            "data": {
                **push_data,
                "event_id": event.event_id,
                "event_key": event.event_id,
                "deal_id": event.payload.get("deal_id") or event.aggregate_id,
                "url": deal_url,
            },
        }
        cur = conn.execute(
            "INSERT INTO push_outbox(event_id,event_type,recipient_user_id,payload,priority) "
            "VALUES (?,?,?,?,?) ON CONFLICT(event_id,recipient_user_id) DO NOTHING",
            (event.event_id, "deal.status", user_id, json.dumps(payload, ensure_ascii=False), "high"),
        )
        inserted += cur.rowcount
    return inserted


def record_status_notifications(event: OutboxEvent) -> None:
    """Write durable in-app (bell) notifications. Not localized — matches
    the legacy in-app notification, which has never been locale-aware
    (only push copy is, via push_sender)."""
    to_status = event.payload.get("to_status")
    label = _DEAL_STATUS_LABELS.get(to_status)
    if not label:
        return
    from api.notifications import create_notification

    from_city = event.payload.get("from_city")
    to_city = event.payload.get("to_city")
    body = f"{from_city or ''}→{to_city or ''} · {event.payload.get('amount_display') or ''}".strip("· ").strip()
    deal_url = _deal_status_deep_link(event)
    for user_id in dict.fromkeys(str(value) for value in event.payload.get("recipient_user_ids") or [] if value):
        create_notification(
            user_id, "deal_status", label, body, "🚛",
            url=deal_url,
            event_key=f"domain:{event.event_id}:{user_id}",
        )


def handle_deal_status_changed(conn: sqlite3.Connection, event: OutboxEvent) -> None:
    """Shared by DealStatusChanged and DealCancelled — legacy treats
    "cancelled" as just another value flowing through the exact same
    push+notification block (api/marketplace.py's `labels` dict includes
    "cancelled"), not a structurally different side effect."""
    enqueue_status_push(conn, event)
    conn.commit()
    record_status_notifications(event)


def acceptance_handlers(conn: sqlite3.Connection) -> dict[str, callable]:
    """Return handlers suitable for PersistentOutboxWorker in an API worker."""
    return {
        "BidAccepted": lambda event: handle_bid_accepted(conn, event),
        # DealCreated deliberately stays a no-op — NOT an oversight (AC6
        # §22). Legacy's accept_bid() sends exactly ONE push/notification
        # per acceptance ("✅ Сделка создана", already delivered by the
        # BidAccepted handler above). DealCreated has no independent
        # product side effect in the legacy path; acknowledging it here
        # without a handler prevents it from blocking/poisoning the queue
        # ahead of the real BidAccepted notification, without inventing a
        # second, product-undefined notification.
        "DealCreated": lambda event: None,
        "DealStatusChanged": lambda event: handle_deal_status_changed(conn, event),
        "DealCancelled": lambda event: handle_deal_status_changed(conn, event),
    }
