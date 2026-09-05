"""Worker protocol for domain outbox delivery; wiring is deferred."""
import json
from collections.abc import Callable
from datetime import datetime, timedelta
import sqlite3

from .model import OutboxEvent


Handler = Callable[[OutboxEvent], None]


class OutboxWorker:
    def __init__(self, handlers: dict[str, Handler]) -> None:
        self._handlers = handlers

    def dispatch(self, event: OutboxEvent) -> None:
        handler = self._handlers.get(event.event_type)
        if handler is None:
            raise LookupError(f"no outbox handler for {event.event_type}")
        handler(event)

    @staticmethod
    def retry_delay(attempts: int, base_seconds: int = 1, max_seconds: int = 3600) -> int:
        return min(max_seconds, base_seconds * (2 ** max(0, attempts - 1)))


class PersistentOutboxWorker:
    """SQLite claim/ack worker. Handlers must be idempotent by event_id."""

    def __init__(self, conn: sqlite3.Connection, handlers: dict[str, Handler], max_attempts: int = 8) -> None:
        self.conn = conn
        self.handlers = handlers
        self.max_attempts = max_attempts

    def claim_one(self) -> OutboxEvent | None:
        self.conn.execute("BEGIN IMMEDIATE")
        row = self.conn.execute(
            "SELECT * FROM domain_outbox WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1"
        ).fetchone()
        if not row:
            self.conn.commit()
            return None
        self.conn.execute("UPDATE domain_outbox SET status='processing', attempts=attempts+1 WHERE event_id=? AND status='pending'", (row["event_id"],))
        self.conn.commit()
        return OutboxEvent(
            event_id=row["event_id"], event_type=row["event_type"], aggregate_type=row["aggregate_type"],
            aggregate_id=row["aggregate_id"], payload=json.loads(row["payload"]),
            created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")), attempts=row["attempts"] + 1,
        )

    def process_one(self) -> str | None:
        event = self.claim_one()
        if event is None:
            return None
        try:
            handler = self.handlers[event.event_type]
            handler(event)
        except Exception:
            terminal = event.attempts >= self.max_attempts
            delay = self.retry_delay(event.attempts)
            self.conn.execute(
                "UPDATE domain_outbox SET status=?, next_attempt_at=? WHERE event_id=? AND status='processing'",
                ("failed" if terminal else "pending", (datetime.utcnow() + timedelta(seconds=delay)).isoformat(), event.event_id),
            )
            self.conn.commit()
            return "failed" if terminal else "retry"
        self.conn.execute("UPDATE domain_outbox SET status='processed',processed_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='processing'", (event.event_id,))
        self.conn.commit()
        return "processed"
