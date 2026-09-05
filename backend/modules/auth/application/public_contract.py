"""Public Auth contract placeholder for the modular boundary."""
from typing import Protocol


class AuthApplication(Protocol):
    def authenticate(self, credentials: dict) -> dict: ...
