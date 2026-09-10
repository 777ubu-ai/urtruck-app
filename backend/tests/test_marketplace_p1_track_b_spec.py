"""Marketplace P1 — TEST SPEC ONLY for a separate Track B.

Release hardening track A (2026-09-10) was explicitly scoped to NOT modify
backend/api/marketplace.py — the Deal/Bid Race P0 repair is a separate,
already-in-flight track and this file must not collide with it. These six
tests document CONFIRMED, currently-reproducible gaps against the live
`marketplace.py`/`verification_gate.py` code on this branch, written and
run as real (not hypothetical) tests, and are marked `xfail(strict=True)`
so they:
  (a) do NOT fail this track's CI (they're expected to fail today), and
  (b) will loudly FAIL THE XFAIL ITSELF (strict=True) the moment Track B
      fixes the underlying gap and the test starts passing unexpectedly —
      that's the signal to flip `xfail` off and land the regression
      coverage for real.

Each test's docstring states the exact confirmed defect and what the
fixed behavior should be. Do not weaken these assertions when Track B
lands its fix — remove the `@pytest.mark.xfail` line instead.
"""
import time

import pytest
from fastapi import HTTPException

import api.marketplace as marketplace
from database.db import get_conn, new_id


def seed_cargo(owner_id: str, price: int = 1000, status: str = "active") -> str:
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow", "Мебель для офиса", "tent", price, 0, status),
        )
    return cargo_id


def seed_trip(driver_id: str, price: int = 5000, status: str = "active") -> str:
    trip_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO trips (id, driver_id, driver_phone, driver_name, from_city, to_city, "
            "truck_type, capacity_tons, price, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (trip_id, driver_id, "+700", "Driver", "Almaty", "Moscow", "tent", 20, price, status),
        )
    return trip_id


def seed_bid(cargo_id=None, trip_id=None, bidder_id: str = None, amount: int = 900, status: str = "pending") -> str:
    bid_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO bids (id, cargo_id, trip_id, bidder_id, bidder_name, amount, status) "
            "VALUES (?,?,?,?,?,?,?)",
            (bid_id, cargo_id, trip_id, bidder_id, "Bidder", amount, status),
        )
    return bid_id


def seed_driver(driver_id: str, *, role: str = "driver", verification_level: int = 1,
                 status: str = "pending") -> None:
    """Minimal drivers_registration row + a real session token, so
    verification_gate.require_level()'s ACTUAL dependency function (not a
    test-harness bypass) is what gets exercised in test #1 below — that's
    the whole point of that test."""
    with get_conn() as c:
        c.execute(
            "INSERT INTO drivers_registration (id, phone, verification_level, role, status) "
            "VALUES (?,?,?,?,?)",
            (driver_id, f"+7000{int(time.time() * 1000) % 10_000_000}", verification_level, role, status),
        )


def make_token(driver_id: str) -> str:
    from database import registration_dal
    return registration_dal.create_session(driver_id)


# ── 1. blacklisted/rejected user cannot mutate marketplace/chat ────────

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (Block 1 audit): verification_gate.require_level() only "
           "consults driver.status for min_level>=3 (level3_rejected check). A driver "
           "who reached verification_level=1 before being blacklisted/rejected during "
           "document moderation keeps full level-1 marketplace write access indefinitely "
           "-- create_cargo/create_bid/create_trip all only require_level(1).",
)
def test_rejected_driver_cannot_create_cargo():
    from api.verification_gate import require_level

    driver_id = new_id()
    seed_driver(driver_id, role="client", verification_level=1, status="rejected")
    token = make_token(driver_id)

    dependency = require_level(1)
    # Fixed behavior: a driver with status='rejected' must be refused even
    # at level 1, not just level 3 -- this call should raise HTTPException.
    with pytest.raises(HTTPException):
        dependency(authorization=f"Bearer {token}")


# ── 2. anonymous status enumeration blocked ─────────────────────────────

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (Block 2 audit): list_cargos()/list_trips() take `status` as "
           "a free-form, unauthenticated query param with no whitelist -- anyone can "
           "request status=unpublished/cancelled/taken/completed/expired and enumerate "
           "every user's non-active listings (price, description, route, owner_id).",
)
def test_anonymous_cannot_enumerate_non_active_cargos():
    owner_id = new_id()
    seed_cargo(owner_id, status="unpublished")

    # Fixed behavior: an unauthenticated caller asking for a non-'active'
    # status should get either a 401/403, or (if status filtering is kept
    # public) zero results for statuses that aren't meant to be public --
    # never someone else's non-active listing data.
    result = marketplace.list_cargos(status="unpublished")
    assert result["cargos"] == [], (
        f"anonymous status=unpublished query leaked {len(result['cargos'])} listing(s)"
    )


# ── 3. client cannot create a driver trip ───────────────────────────────

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (Block 1/2 audit): create_trip() has no user['role'] check "
           "at all -- a 'client'-role account can publish a driver trip listing directly "
           "via the API, even though the UI never offers this action to that role.",
)
def test_client_role_cannot_create_trip():
    client_id = new_id()
    seed_driver(client_id, role="client", verification_level=1, status="approved")
    body = marketplace.TripIn(
        from_city="Almaty", to_city="Moscow", truck_type="tent",
        capacity_tons=20, price=5000,
    )
    with pytest.raises(HTTPException):
        marketplace.create_trip(body=body, user={"id": client_id, "role": "client", "phone": "+700"})


# ── 4. driver cannot create a shipper cargo ─────────────────────────────

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (Block 1/2 audit): create_cargo() has no user['role'] check "
           "at all -- a 'driver'-role account can publish a client cargo listing directly "
           "via the API, even though the UI never offers this action to that role.",
)
def test_driver_role_cannot_create_cargo():
    driver_id = new_id()
    seed_driver(driver_id, role="driver", verification_level=1, status="approved")
    body = marketplace.CargoIn(
        from_city="Almaty", to_city="Moscow", cargo_desc="Мебель для офиса", price=1000,
    )
    with pytest.raises(HTTPException):
        marketplace.create_cargo(body=body, user={"id": driver_id, "role": "driver", "phone": "+700"})


# ── 5. invalid bid direction blocked ────────────────────────────────────

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (Block 1/2 audit): create_bid() has no user['role'] check -- "
           "a 'client'-role account can bid on ANOTHER client's cargo listing (a bid on "
           "cargo is only meaningful coming from a driver offering to carry it), and "
           "symmetrically a 'driver' can bid on another driver's trip. Neither direction "
           "makes product sense and neither is blocked server-side today.",
)
def test_client_cannot_bid_on_a_cargo_listing():
    owner_id, other_client_id = new_id(), new_id()
    seed_driver(other_client_id, role="client", verification_level=1, status="approved")
    cargo_id = seed_cargo(owner_id)
    body = marketplace.BidIn(cargo_id=cargo_id, amount=900)
    with pytest.raises(HTTPException):
        marketplace.create_bid(body=body, user={"id": other_client_id, "role": "client", "phone": "+700"})


# ── 6. legacy update_trip_status cannot reopen a trip with an active deal ──

@pytest.mark.xfail(
    strict=True,
    reason="CONFIRMED GAP (found during the independent P0 re-review of "
           "fix/p0-deal-bid-race-20260910, 2026-09-10): the legacy PATCH "
           "/trips/{id}/status endpoint (update_trip_status) writes trips.status "
           "unconditionally, with NO active-deal guard -- unlike unpublish_trip/"
           "update_trip/delete_cargo, which all correctly refuse when an active deal "
           "exists. A driver can reset an already-accepted trip's status back to "
           "'active', re-listing it in the public feed while the deal is still live; "
           "a second shipper's subsequent accept then only fails as an UNHANDLED "
           "sqlite3.IntegrityError (raw 500) against the new deals.trip_id partial "
           "UNIQUE index from the P0 track, not a clean 409 -- no data corruption "
           "(the whole transaction rolls back), but a real availability/UX bug this "
           "track's fix should also produce a clean 409 for.",
)
def test_legacy_update_trip_status_refuses_to_reopen_trip_with_active_deal():
    owner_id, driver_id = new_id(), new_id()
    trip_id = seed_trip(driver_id)
    bid_id = seed_bid(trip_id=trip_id, bidder_id=owner_id, amount=5000)

    # Accept the bid the normal way -- trip becomes 'booked', a deal exists.
    accept_owner = {"id": driver_id}  # trip's driver accepts a client's bid on their trip
    with get_conn() as c:
        bid = dict(c.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone())
        marketplace._finalize_accept_inline(c, accept_owner, bid, bid["amount"])
    with get_conn() as c:
        trip_after_accept = dict(c.execute("SELECT status FROM trips WHERE id=?", (trip_id,)).fetchone())
    assert trip_after_accept["status"] == "booked"

    # Fixed behavior: resetting an actively-dealt trip back to 'active' via
    # the legacy status endpoint must be refused (409), the same way
    # unpublish_trip/update_trip already refuse it.
    with pytest.raises(HTTPException):
        marketplace.update_trip_status(
            trip_id=trip_id,
            new_status="active",
            user={"id": driver_id},
        )


if __name__ == "__main__":
    import subprocess
    import sys
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
