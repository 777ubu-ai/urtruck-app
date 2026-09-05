"""Public Borders contract placeholder for the modular boundary."""
from typing import Protocol


class BordersApplication(Protocol):
    def validate_route(self, route: dict) -> bool: ...
