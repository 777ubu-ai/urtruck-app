"""Marketplace P1 — Track B closure.

Release hardening track A (2026-09-10) added these six tests as
`xfail(strict=True)` specs against six CONFIRMED, then-unfixed gaps in
`marketplace.py`/`verification_gate.py`. Track B (2026-09-10) closes the
root causes and flips all six to plain, asserting tests -- no assertion
here was weakened to make it pass; every one still asserts the exact fixed
behavior the original xfail spec called for.

Fixes landed (see api/marketplace.py and api/verification_gate.py for the
implementation comments):

1. `require_active_level()` (verification_gate.py) -- wraps require_level()
   with a `driver.status != 'rejected'` fail-closed check at every level,
   not just level 3. Wired into every marketplace WRITE endpoint (listing
   create/edit/publish, bid lifecycle, deal status transitions) -- not
   folded into require_level() itself, which stays the auth dependency for
   chat/reviews/notifications/profile, where a driver rejected mid-deal
   must still be able to coordinate wind-down of an already-accepted
   commitment.
2. `_require_public_listing_status()` -- list_cargos()/list_trips() now
   whitelist the public `status` query param to {"active"} (400 otherwise),
   shared by both symmetric endpoints.
3. `require_driver_trip_publication` is the canonical create-trip
   dependency: it combines active-level, driver-role, and basic-onboarding /
   approved publication gating.
4. `_require_role(user, ("client",), ...)` in create_cargo().
5. `_require_role(...)` in create_bid(), keyed off which of cargo_id/
   trip_id the bid targets.
6. An `_active_deal_exists()` guard (also now shared by delete_cargo/
   unpublish_cargo/unpublish_trip, replacing three hand-copied literal
   status-tuple checks) added to the legacy update_trip_status for the
   "active"/"booked" transitions, which previously bypassed the deal FSM
   entirely.
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
    verification_gate's ACTUAL dependency function (not a test-harness
    bypass) is what gets exercised in test #1 below — that's the whole
    point of that test."""
    with get_conn() as c:
        c.execute(
            "INSERT INTO drivers_registration (id, phone, verification_level, role, status) "
            "VALUES (?,?,?,?,?)",
            (driver_id, f"+7000{int(time.time() * 1000) % 10_000_000}", verification_level, role, status),
        )


def make_token(driver_id: str) -> str:
    from database import registration_dal
    return registration_dal.create_session(driver_id)


# ── 1. rejected/blacklisted user cannot mutate marketplace ─────────────

def test_rejected_driver_cannot_create_cargo():
    """require_active_level() (the guard every marketplace write endpoint
    now uses) must refuse a driver with status='rejected' even at level 1
    -- require_level() alone still wouldn't (that's by design, see the
    guard's own docstring), so this specifically exercises the new,
    wrapping dependency."""
    from api.verification_gate import require_active_level

    driver_id = new_id()
    seed_driver(driver_id, role="client", verification_level=1, status="rejected")
    token = make_token(driver_id)

    dependency = require_active_level(1)
    with pytest.raises(HTTPException) as exc_info:
        dependency(authorization=f"Bearer {token}")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "account_rejected"


def test_approved_driver_still_passes_require_active_level():
    """Sanity check that the fix is scoped correctly -- an ordinary,
    non-rejected level-1 driver must still pass."""
    from api.verification_gate import require_active_level

    driver_id = new_id()
    seed_driver(driver_id, role="client", verification_level=1, status="pending")
    token = make_token(driver_id)

    dependency = require_active_level(1)
    driver = dependency(authorization=f"Bearer {token}")
    assert driver["id"] == driver_id


# ── 2. anonymous status enumeration blocked ─────────────────────────────

def test_anonymous_cannot_enumerate_non_active_cargos():
    owner_id = new_id()
    seed_cargo(owner_id, status="unpublished")

    with pytest.raises(HTTPException) as exc_info:
        marketplace.list_cargos(status="unpublished")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "STATUS_NOT_PUBLIC"


def test_anonymous_cannot_enumerate_non_active_trips():
    """Symmetric coverage -- the original xfail spec only tested cargos;
    the fix (`_require_public_listing_status`) is shared by both
    list_cargos and list_trips, so both get a regression test."""
    driver_id = new_id()
    seed_trip(driver_id, status="cancelled")

    with pytest.raises(HTTPException) as exc_info:
        marketplace.list_trips(status="cancelled")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "STATUS_NOT_PUBLIC"


def test_active_status_still_works_publicly():
    """Sanity check: the whitelist must not accidentally break the one
    status value real anonymous browsing actually needs."""
    owner_id = new_id()
    seed_cargo(owner_id, status="active")
    result = marketplace.list_cargos(status="active")
    assert result["total"] >= 1


# ── 3. client cannot create a driver trip ───────────────────────────────

def test_client_role_cannot_create_trip():
    client_id = new_id()
    seed_driver(client_id, role="client", verification_level=1, status="approved")
    token = make_token(client_id)
    from api.verification_gate import require_driver_trip_publication

    with pytest.raises(HTTPException) as exc_info:
        require_driver_trip_publication(authorization=f"Bearer {token}")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "driver_role_required"


def test_driver_role_can_still_create_trip():
    """Sanity check: the correct role must still work."""
    driver_id = new_id()
    body = marketplace.TripIn(
        from_city="Almaty", to_city="Moscow", truck_type="tent",
        capacity_tons=20, price=5000,
    )
    result = marketplace.create_trip(body=body, user={"id": driver_id, "role": "driver", "phone": "+700"})
    assert result["ok"] is True


# ── 4. driver cannot create a shipper cargo ─────────────────────────────

def test_driver_role_cannot_create_cargo():
    driver_id = new_id()
    seed_driver(driver_id, role="driver", verification_level=1, status="approved")
    body = marketplace.CargoIn(
        from_city="Almaty", to_city="Moscow", cargo_desc="Мебель для офиса", price=1000,
    )
    with pytest.raises(HTTPException) as exc_info:
        marketplace.create_cargo(body=body, user={"id": driver_id, "role": "driver", "phone": "+700"})
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "ROLE_NOT_ALLOWED"


def test_client_role_can_still_create_cargo():
    """Sanity check: the correct role must still work."""
    client_id = new_id()
    body = marketplace.CargoIn(
        from_city="Almaty", to_city="Moscow", cargo_desc="Мебель для офиса", price=1000,
    )
    result = marketplace.create_cargo(body=body, user={"id": client_id, "role": "client", "phone": "+700"})
    assert result["ok"] is True


def test_shipper_alias_normalizes_to_client_for_cargo_creation():
    """_require_role treats the bare 'shipper' role value the same as
    'client' (api/profile.py already normalizes 'shipper' -> 'client' at
    write time; this matches that in case an older token predates it)."""
    shipper_id = new_id()
    body = marketplace.CargoIn(
        from_city="Almaty", to_city="Moscow", cargo_desc="Мебель для офиса", price=1000,
    )
    result = marketplace.create_cargo(body=body, user={"id": shipper_id, "role": "shipper", "phone": "+700"})
    assert result["ok"] is True


# ── 5. invalid bid direction blocked ────────────────────────────────────

def test_client_cannot_bid_on_a_cargo_listing():
    owner_id, other_client_id = new_id(), new_id()
    seed_driver(other_client_id, role="client", verification_level=1, status="approved")
    cargo_id = seed_cargo(owner_id)
    body = marketplace.BidIn(cargo_id=cargo_id, amount=900)
    with pytest.raises(HTTPException) as exc_info:
        marketplace.create_bid(body=body, user={"id": other_client_id, "role": "client", "phone": "+700"})
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "ROLE_NOT_ALLOWED"


def test_driver_cannot_bid_on_a_trip_listing():
    """Symmetric coverage -- the original xfail spec only tested the cargo
    direction; bid direction enforcement covers both."""
    owner_driver_id, other_driver_id = new_id(), new_id()
    trip_id = seed_trip(owner_driver_id)
    body = marketplace.BidIn(trip_id=trip_id, amount=4500)
    with pytest.raises(HTTPException) as exc_info:
        marketplace.create_bid(body=body, user={"id": other_driver_id, "role": "driver", "phone": "+700"})
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "ROLE_NOT_ALLOWED"


def test_driver_can_still_bid_on_a_cargo_listing():
    """Sanity check: the correct (real) direction must still work."""
    owner_id, driver_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    body = marketplace.BidIn(cargo_id=cargo_id, amount=900)
    result = marketplace.create_bid(body=body, user={"id": driver_id, "role": "driver", "phone": "+700"})
    assert result["ok"] is True


def test_client_can_still_bid_on_a_trip_listing():
    driver_id, client_id = new_id(), new_id()
    trip_id = seed_trip(driver_id)
    body = marketplace.BidIn(trip_id=trip_id, amount=4500)
    result = marketplace.create_bid(body=body, user={"id": client_id, "role": "client", "phone": "+700"})
    assert result["ok"] is True


def test_unbound_bid_still_allowed_without_a_role_check():
    """A bid with neither cargo_id nor trip_id (the pre-existing "demo/
    local cargo" case) has no direction to validate -- must not suddenly
    require a specific role now."""
    bidder_id = new_id()
    body = marketplace.BidIn(amount=500)
    result = marketplace.create_bid(body=body, user={"id": bidder_id, "role": "client", "phone": "+700"})
    assert result["ok"] is True


# ── 6. legacy update_trip_status cannot reopen a trip with an active deal ──

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

    for hostile_status in ("active", "booked"):
        with pytest.raises(HTTPException) as exc_info:
            marketplace.update_trip_status(trip_id=trip_id, new_status=hostile_status, user={"id": driver_id})
        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["error"] == "ACTIVE_DEAL_EXISTS"

    # The trip status itself must be untouched by the refused attempts.
    with get_conn() as c:
        trip_after_refusal = dict(c.execute("SELECT status FROM trips WHERE id=?", (trip_id,)).fetchone())
    assert trip_after_refusal["status"] == "booked"


def test_update_trip_status_still_allows_forward_progress_on_an_active_deal():
    """Sanity check: the new guard is scoped to "active"/"booked" only --
    legitimate forward FSM progress (e.g. in_transit, already validated by
    _transition_deal) must keep working."""
    owner_id, driver_id = new_id(), new_id()
    trip_id = seed_trip(driver_id)
    bid_id = seed_bid(trip_id=trip_id, bidder_id=owner_id, amount=5000)
    accept_owner = {"id": driver_id}
    with get_conn() as c:
        bid = dict(c.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone())
        result = marketplace._finalize_accept_inline(c, accept_owner, bid, bid["amount"])
    with get_conn() as c:
        c.execute("UPDATE deals SET status = 'in_progress' WHERE id = ?", (result["deal_id"],))

    out = marketplace.update_trip_status(trip_id=trip_id, new_status="in_transit", user={"id": driver_id})
    assert out["ok"] is True


def test_update_trip_status_without_any_deal_is_unaffected():
    """Sanity check: a trip with no deal at all must be completely
    unaffected by the new guard (delete_cargo pin already covers a similar
    concern; this one is specific to update_trip_status's own path)."""
    driver_id = new_id()
    trip_id = seed_trip(driver_id, status="active")
    out = marketplace.update_trip_status(trip_id=trip_id, new_status="booked", user={"id": driver_id})
    assert out["ok"] is True


if __name__ == "__main__":
    import subprocess
    import sys
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
