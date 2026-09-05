"""Public Trips contract placeholder for the modular boundary."""
from typing import Protocol


class TripsApplication(Protocol):
    def reserve(self, trip_id: int, deal_id: int) -> None: ...
