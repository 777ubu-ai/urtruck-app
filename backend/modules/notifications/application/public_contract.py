"""Public Notifications contract placeholder for the modular boundary."""
from typing import Protocol


class NotificationsApplication(Protocol):
    def record_domain_event(self, event_type: str, payload: dict) -> None: ...
