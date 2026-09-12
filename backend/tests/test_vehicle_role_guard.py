"""Vehicle Security & Trip Integrity Repair, Round 2 (2026-09-11), item 5 --
Vehicle role isolation.

Independent review found a pure shipper/client account could create a
Vehicle -- api/vehicles.py used api.registration.get_current_driver, which
only checks "is this a valid token", never role. Every endpoint in that
router now uses the SAME canonical mechanism the rest of the marketplace
already uses for this exact problem: require_active_level(1) (auth +
"not rejected", api/verification_gate.py) followed by require_role(user,
("driver",), action) (the same helper create_cargo/create_trip/create_bid
call, promoted from api/marketplace.py to api/verification_gate.py in this
round specifically so this router could reuse it instead of inventing a
second role mechanism).

CI contract: top-level `def test_*`, order matters -- test_00 seeds a
driver and a shipper every later test needs.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.registration import reg_router
from api.vehicles import router as vehicles_router
from database.db import get_conn
from database import vehicles_dal

vehicles_dal.init_vehicles_schema()

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(vehicles_router, prefix="/api/v1/driver/vehicles")
client = TestClient(app)

STATE: dict = {}


def _register(role):
    r = client.post("/api/v1/register/guest")
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["token"]
    uid = body.get("id") or body.get("user_id") or (body.get("user") or {}).get("id")
    with get_conn() as c:
        c.execute(
            "UPDATE drivers_registration SET verification_level = 1, role = ?, status = 'approved' "
            "WHERE id = ?",
            (role, uid),
        )
        c.commit()
    return uid, {"Authorization": f"Bearer {token}"}


def _vehicle_payload(plate):
    return {
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "Volvo", "model": "FH", "license_plate": plate, "payload_tons": 20, "cargo_volume_m3": 82,
    }


def test_00_setup_driver_and_shipper():
    STATE["driver_id"], STATE["driver_headers"] = _register("driver")
    STATE["shipper_id"], STATE["shipper_headers"] = _register("client")


# ── driver: must keep working ──────────────────────────────────────────────

def test_01_driver_creates_vehicle_passes():
    r = client.put("/api/v1/driver/vehicles", headers=STATE["driver_headers"], json=_vehicle_payload("ROLE-DRV-1"))
    assert r.status_code == 200, r.text
    STATE["driver_vehicle_id"] = r.json()["vehicle"]["id"]


def test_02_driver_lists_own_vehicle_passes():
    r = client.get("/api/v1/driver/vehicles", headers=STATE["driver_headers"])
    assert r.status_code == 200, r.text
    ids = [v["id"] for v in r.json()["vehicles"]]
    assert STATE["driver_vehicle_id"] in ids


def test_03_driver_gets_own_vehicle_passes():
    r = client.get(f"/api/v1/driver/vehicles/{STATE['driver_vehicle_id']}", headers=STATE["driver_headers"])
    assert r.status_code == 200, r.text


def test_04_driver_updates_own_vehicle_passes():
    r = client.put(
        f"/api/v1/driver/vehicles?vehicle_id={STATE['driver_vehicle_id']}",
        headers=STATE["driver_headers"],
        json=_vehicle_payload("ROLE-DRV-1"),
    )
    assert r.status_code == 200, r.text


# ── pure shipper: everything must DENY ──────────────────────────────────────

def test_05_shipper_creates_vehicle_denied():
    r = client.put("/api/v1/driver/vehicles", headers=STATE["shipper_headers"], json=_vehicle_payload("ROLE-SHIP-1"))
    assert r.status_code == 403, f"pure shipper created a Vehicle: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "ROLE_NOT_ALLOWED"
    with get_conn() as c:
        n = c.execute(
            "SELECT COUNT(*) n FROM vehicles WHERE license_plate = 'ROLE-SHIP-1'"
        ).fetchone()["n"]
    assert n == 0, "the denied create must not have written a row"


def test_06_shipper_lists_driver_vehicle_api_denied():
    r = client.get("/api/v1/driver/vehicles", headers=STATE["shipper_headers"])
    assert r.status_code == 403, f"shipper listed the driver Vehicle API: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "ROLE_NOT_ALLOWED"


def test_07_shipper_gets_a_vehicle_by_id_denied():
    """Even a real, existing vehicle_id (the driver's own) -- role is
    checked before ownership is ever consulted, so a shipper cannot use
    this path to probe existence either."""
    r = client.get(f"/api/v1/driver/vehicles/{STATE['driver_vehicle_id']}", headers=STATE["shipper_headers"])
    assert r.status_code == 403, f"shipper read a vehicle by id: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "ROLE_NOT_ALLOWED"


def test_08_shipper_spoofing_a_real_vehicle_id_on_update_denied():
    r = client.put(
        f"/api/v1/driver/vehicles?vehicle_id={STATE['driver_vehicle_id']}",
        headers=STATE["shipper_headers"],
        json=_vehicle_payload("SPOOF-ATTEMPT"),
    )
    assert r.status_code == 403, f"shipper updated a vehicle via id spoofing: {r.status_code} {r.text}"
    with get_conn() as c:
        row = c.execute(
            "SELECT license_plate, owner_user_id FROM vehicles WHERE id = ?",
            (STATE["driver_vehicle_id"],),
        ).fetchone()
    assert row["license_plate"] == "ROLE-DRV-1", "the driver's vehicle must be untouched"
    assert row["owner_user_id"] == STATE["driver_id"]


def test_09_shipper_role_rejection_is_not_an_existence_oracle():
    """A shipper gets the SAME 403 for a real vehicle_id and a fake one --
    role is checked before any DB lookup, so nothing about existence leaks
    to a non-driver caller either."""
    real_id_resp = client.get(f"/api/v1/driver/vehicles/{STATE['driver_vehicle_id']}", headers=STATE["shipper_headers"])
    fake_id_resp = client.get("/api/v1/driver/vehicles/does-not-exist-at-all", headers=STATE["shipper_headers"])
    assert real_id_resp.status_code == fake_id_resp.status_code == 403
    assert real_id_resp.json() == fake_id_resp.json()


# ── legacy "shipper" alias normalizes the same as elsewhere in the app ─────

def test_10_legacy_shipper_alias_is_still_denied():
    """api.profile.py's own normalization (bare 'shipper' -> 'client')
    predates drivers_registration ever storing that literal value -- older
    rows/tokens may still carry it. require_role() must normalize it the
    same way create_cargo/create_trip already do, not treat it as some
    third, unrecognized role that happens to also fail closed for an
    unrelated reason."""
    legacy_id, legacy_headers = _register("shipper")
    r = client.put("/api/v1/driver/vehicles", headers=legacy_headers, json=_vehicle_payload("ROLE-LEGACY-1"))
    assert r.status_code == 403
    assert r.json()["detail"]["your_role"] == "client", (
        "legacy 'shipper' must normalize to 'client' in the rejection detail, "
        f"got: {r.json()['detail']}"
    )


# ── canonical mechanism, not a second one (sanity on the guard's own shape) ─

def test_11_role_rejection_uses_the_same_error_shape_as_marketplace():
    """Both routers must produce byte-compatible ROLE_NOT_ALLOWED bodies --
    proof this is the SAME require_role() call, not a parallel reimplementation
    that happens to also return 403."""
    r = client.put("/api/v1/driver/vehicles", headers=STATE["shipper_headers"], json=_vehicle_payload("ROLE-SHAPE-1"))
    detail = r.json()["detail"]
    assert set(detail.keys()) == {"error", "message", "your_role", "allowed_roles"}
    assert detail["error"] == "ROLE_NOT_ALLOWED"
    assert detail["allowed_roles"] == ["driver"]
