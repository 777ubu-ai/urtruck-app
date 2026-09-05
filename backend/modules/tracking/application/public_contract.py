"""Public Tracking contract placeholder for the modular boundary."""
from typing import Protocol


class TrackingApplication(Protocol):
    def ingest_location(self, deal_id: int, location: dict) -> None: ...
