"""Public Chat contract placeholder for the modular boundary."""
from typing import Protocol


class ChatApplication(Protocol):
    def ensure_room(self, deal_id: int) -> str: ...
