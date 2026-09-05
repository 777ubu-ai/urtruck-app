"""Public Users contract placeholder for the modular boundary."""
from typing import Protocol


class UsersApplication(Protocol):
    def get_profile(self, user_id: int, actor_id: int) -> dict: ...
