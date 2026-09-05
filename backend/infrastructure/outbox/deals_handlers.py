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


def acceptance_handlers(conn: sqlite3.Connection) -> dict[str, callable]:
    """Return handlers suitable for PersistentOutboxWorker in an API worker."""
    return {"BidAccepted": lambda event: handle_bid_accepted(conn, event)}
