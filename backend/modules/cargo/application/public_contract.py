"""Public Cargo contract placeholder for the modular boundary."""
from typing import Protocol


class CargoApplication(Protocol):
    def reserve(self, cargo_id: int, deal_id: int) -> None: ...
