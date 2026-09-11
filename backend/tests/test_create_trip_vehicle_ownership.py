"""Vehicle Security & Trip Integrity Repair (2026-09-11) -- P0 IDOR closure.

Overnight forensic audit reproduced this live: POST /api/v1/market/trips
accepted ANY vehicle_id verbatim -- no existence check, no ownership check.
Driver A could create a real trip whose vehicle_id pointed at driver B's
vehicle (`driver_id=A, vehicle_id=<B's real id>` in the trips row), and an
entirely made-up vehicle_id was accepted just as happily. This file pins
the fix in api/marketplace.py::create_trip (the vehicles_dal.
vehicle_owned_by() guard added right after the existing Track B role
check) as real, executable assertions -- not a re-statement of the audit's
manual PoC.

Uses REAL registration for both routers under test (guest + DB level/role
patch): create_trip is gated by require_active_level (contextvar-
overridable elsewhere in this suite), but the vehicle_id check itself goes
through vehicles_dal against the SAME owner_user_id a real token resolves
to, so overriding just the level check would not exercise the real
ownership boundary. Simpler and more honest to use one real auth path for
both routers, exactly like test_vehicle_idor.py.

CI contract: top-level `def test_*` (not a class), order matters —
test_00 seeds the two drivers/vehicles every later test needs.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.registration import reg_router
from api.vehicles import router as vehicles_router
from api.marketplace import mp_router
from database.db import get_conn
from database import vehicles_dal

vehicles_dal.init_vehicles_schema()

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(vehicles_router, prefix="/api/v1/driver/vehicles")
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

STATE: dict = {}


def _register_driver():
    r = client.post("/api/v1/register/guest")
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["token"]
    uid = body.get("id") or body.get("user_id") or (body.get("user") or {}).get("id")
    with get_conn() as c:
        c.execute(
            "UPDATE drivers_registration SET verification_level = 1, role = 'driver', status = 'approved' "
            "WHERE id = ?",
            (uid,),
        )
        c.commit()
    return uid, {"Authorization": f"Bearer {token}"}


def _seed_vehicle(headers, plate):
    r = client.put("/api/v1/driver/vehicles", headers=headers, json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "Scania", "model": "R-series", "license_plate": plate, "payload_tons": 18, "cargo_volume_m3": 76,
    })
    assert r.status_code == 200, r.text
    return r.json()["vehicle"]["id"]


def _publish(headers, **overrides):
    payload = {"from_city": "Almaty", "to_city": "Moscow", "truck_type": "tent", "price": 1000}
    payload.update(overrides)
    return client.post("/api/v1/market/trips", headers=headers, json=payload)


def test_00_setup_two_drivers_and_vehicles():
    STATE["a_id"], STATE["a_headers"] = _register_driver()
    STATE["b_id"], STATE["b_headers"] = _register_driver()
    STATE["vehicle_a"] = _seed_vehicle(STATE["a_headers"], "TRIP-OWN-A")
    STATE["vehicle_b"] = _seed_vehicle(STATE["b_headers"], "TRIP-OWN-B")


def test_01_a_creates_trip_with_own_vehicle_passes():
    r = _publish(STATE["a_headers"], price=1001, vehicle_id=STATE["vehicle_a"])
    assert r.status_code == 200, r.text
    trip_id = r.json()["id"]
    with get_conn() as c:
        row = c.execute("SELECT driver_id, vehicle_id FROM trips WHERE id = ?", (trip_id,)).fetchone()
    assert row["driver_id"] == STATE["a_id"]
    assert row["vehicle_id"] == STATE["vehicle_a"]


def test_02_a_creates_trip_with_no_vehicle_still_passes():
    """vehicle_id is optional -- the ownership guard must not become a
    de-facto requirement to attach a vehicle."""
    r = _publish(STATE["a_headers"], price=1002)
    assert r.status_code == 200, r.text
    with get_conn() as c:
        row = c.execute("SELECT vehicle_id FROM trips WHERE id = ?", (r.json()["id"],)).fetchone()
    assert row["vehicle_id"] is None


def test_03_a_creates_trip_with_b_vehicle_denied():
    """The P0 itself: A must not be able to attach B's vehicle to A's trip."""
    r = _publish(STATE["a_headers"], price=1003, vehicle_id=STATE["vehicle_b"])
    assert r.status_code == 404, f"A used B's vehicle_id: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "VEHICLE_NOT_FOUND"
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) n FROM trips WHERE price = 1003").fetchone()["n"]
    assert n == 0, "a denied vehicle_id must not create a trip row at all"


def test_04_a_creates_trip_with_fake_vehicle_id_denied():
    r = _publish(STATE["a_headers"], price=1004, vehicle_id="totally-made-up-id-12345")
    assert r.status_code == 404, f"fake vehicle_id accepted: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "VEHICLE_NOT_FOUND"


def test_05_b_cannot_use_vehicle_a_for_own_trip():
    """Symmetric to test_03 -- ownership must not be direction-specific."""
    r = _publish(STATE["b_headers"], price=1005, vehicle_id=STATE["vehicle_a"])
    assert r.status_code == 404, f"B used A's vehicle_id: {r.status_code} {r.text}"


def test_06_denied_vehicle_id_leaves_no_partial_state():
    """A rejected vehicle_id must not create a trip, a notification, or any
    other side effect -- the guard runs before any write, not after."""
    with get_conn() as c:
        trips_before = c.execute("SELECT COUNT(*) n FROM trips").fetchone()["n"]
    r = _publish(STATE["a_headers"], price=99999, vehicle_id=STATE["vehicle_b"])
    assert r.status_code == 404
    with get_conn() as c:
        trips_after = c.execute("SELECT COUNT(*) n FROM trips").fetchone()["n"]
    assert trips_before == trips_after


def test_07_role_guard_still_enforced_ahead_of_vehicle_check():
    """Track B's existing role guard (client cannot create_trip) must still
    fire -- the new vehicle_id check must not have been inserted in a way
    that bypasses or reorders past it."""
    client_id, client_headers = _register_driver()
    with get_conn() as c:
        c.execute("UPDATE drivers_registration SET role = 'client' WHERE id = ?", (client_id,))
        c.commit()
    r = client.post("/api/v1/market/trips", headers=client_headers, json={
        "from_city": "Almaty", "to_city": "Moscow", "truck_type": "tent", "price": 1,
        "vehicle_id": STATE["vehicle_a"],
    })
    assert r.status_code == 403, f"client-role create_trip should still be blocked: {r.status_code} {r.text}"


def test_08_owner_with_multiple_vehicles_can_use_either_of_their_own():
    """Item 7 of the task: the ownership fix must not accidentally collapse
    the legitimate 2+ vehicles scenario -- a driver with several vehicles
    must be able to pick ANY of their own for a trip, not just the first
    one ever created."""
    second_vehicle = _seed_vehicle(STATE["a_headers"], "TRIP-OWN-A-2")
    r1 = _publish(STATE["a_headers"], price=1008, vehicle_id=STATE["vehicle_a"])
    r2 = _publish(STATE["a_headers"], price=1009, vehicle_id=second_vehicle)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    with get_conn() as c:
        row1 = c.execute("SELECT vehicle_id FROM trips WHERE id = ?", (r1.json()["id"],)).fetchone()
        row2 = c.execute("SELECT vehicle_id FROM trips WHERE id = ?", (r2.json()["id"],)).fetchone()
    assert row1["vehicle_id"] == STATE["vehicle_a"]
    assert row2["vehicle_id"] == second_vehicle
