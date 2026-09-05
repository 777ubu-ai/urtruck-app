"""Worker protocol for domain outbox delivery; wiring is deferred."""
from collections.abc import Callable

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
