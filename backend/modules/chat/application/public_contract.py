"""Public Chat application contract.

AC2 (2026-09-07): replaces the original placeholder, whose `ensure_room(deal_id)`
signature could never have worked — a deal does not exist yet at the point a
room must be created (room creation happens DURING bid acceptance, before
the `deals` row is inserted). The real, implemented contract lives in
`application/service.py::create_or_get_deal_room` and is intentionally
connection-scoped rather than owning its own transaction — see that
module's docstring.
"""
from typing import Protocol


class ChatApplication(Protocol):
    def create_or_get_deal_room(
        self, conn, shipper_or_owner_id: str, driver_or_bidder_id: str,
        cargo_id=None, trip_id=None, bid_id=None,
    ) -> str: ...
