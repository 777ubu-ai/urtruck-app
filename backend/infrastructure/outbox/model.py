"""Domain outbox record independent from the existing push_outbox."""
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class OutboxEvent:
    event_id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: dict[str, Any]
    created_at: datetime
    processed_at: datetime | None = None
    attempts: int = 0
    next_attempt_at: datetime | None = None
    status: str = "pending"
