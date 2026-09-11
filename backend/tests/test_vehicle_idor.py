"""Vehicle Security & Trip Integrity Repair (2026-09-11) -- IDOR regression.

Reproduces, as real pytest assertions, the exact A/B scenario the overnight
forensic audit ran by hand with a live TestClient: two real, independently
registered driver accounts (A, B), each with their own Vehicle, probed
against every vehicle_id-accepting endpoint in api/vehicles.py (found via
the repo-wide `grep -rn vehicle_id backend/` search this track's report
documents). POST /market/trips is covered separately in
test_create_trip_vehicle_ownership.py -- it is a different router and a
different class of guard (inline ownership check in create_trip, not a
dedicated vehicles.py endpoint).

Uses REAL registration (guest session + DB verification_level/role patch),
not the require_level/require_active_level contextvar override used
elsewhere in this suite: api.vehicles's get_current_driver
(api.registration.get_current_driver) reads a real Bearer token via
reg_dal.get_driver_by_token, so a fake override would not exercise the
actual dependency at all -- this is the same reason the forensic audit's
own PoC script used real guest registration instead.

CI contract: top-level `def test_*` (not a class) -- CI (`pr-quality-gate.
yml`, `full-qa-audit.yml`) discovers pytest files via `grep '^def test_'`.
Order matters: pytest runs top-level functions in definition order, and
test_00_setup_two_drivers_and_vehicles creates the two accounts + vehicles
every later test in this file depends on.
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


def _register_driver():
    r = client.post("/api/v1/register/guest")
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["token"]
    uid = body.get("id") or body.get("user_id") or (body.get("user") or {}).get("id")
    assert uid, f"guest registration did not return a usable id: {body}"
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
        "vehicle_registration_country_code": "KZ",
        "vehicle_type": "solo_truck",
        "body_type": "curtain_sider",
        "make": "Volvo",
        "model": "FH",
        "license_plate": plate,
        "payload_tons": 20,
        "cargo_volume_m3": 82,
    })
    assert r.status_code == 200, r.text
    return r.json()["vehicle"]["id"]


def test_00_setup_two_drivers_and_vehicles():
    STATE["a_id"], STATE["a_headers"] = _register_driver()
    STATE["b_id"], STATE["b_headers"] = _register_driver()
    STATE["vehicle_a"] = _seed_vehicle(STATE["a_headers"], "IDOR-A-001")
    STATE["vehicle_b"] = _seed_vehicle(STATE["b_headers"], "IDOR-B-001")
    assert STATE["vehicle_a"] != STATE["vehicle_b"]


# ── A reads/updates its own vehicle -- must keep working ───────────────────

def test_01_a_reads_own_vehicle():
    r = client.get(f"/api/v1/driver/vehicles/{STATE['vehicle_a']}", headers=STATE["a_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["vehicle"]["id"] == STATE["vehicle_a"]
    assert r.json()["vehicle"]["owner_user_id"] == STATE["a_id"]


def test_02_a_updates_own_vehicle():
    r = client.put(f"/api/v1/driver/vehicles?vehicle_id={STATE['vehicle_a']}", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "Volvo", "model": "FH16", "license_plate": "IDOR-A-001", "payload_tons": 22, "cargo_volume_m3": 84,
    })
    assert r.status_code == 200, r.text
    assert r.json()["vehicle"]["model"] == "FH16"
    with get_conn() as c:
        row = c.execute("SELECT owner_user_id FROM vehicles WHERE id = ?", (STATE["vehicle_a"],)).fetchone()
    assert row["owner_user_id"] == STATE["a_id"], "update must not change ownership"


# ── A against B's vehicle -- everything must DENY ──────────────────────────

def test_03_a_cannot_read_vehicle_b():
    r = client.get(f"/api/v1/driver/vehicles/{STATE['vehicle_b']}", headers=STATE["a_headers"])
    assert r.status_code == 404, f"A read B's vehicle: {r.status_code} {r.text}"


def test_04_a_cannot_update_vehicle_b():
    r = client.put(f"/api/v1/driver/vehicles?vehicle_id={STATE['vehicle_b']}", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "HACKED", "model": "HACKED", "license_plate": "HACKED-PLATE", "payload_tons": 1, "cargo_volume_m3": 1,
    })
    assert r.status_code == 404, f"A updated B's vehicle: {r.status_code} {r.text}"
    with get_conn() as c:
        row = c.execute("SELECT make, owner_user_id FROM vehicles WHERE id = ?", (STATE["vehicle_b"],)).fetchone()
    assert row["owner_user_id"] == STATE["b_id"], "B's vehicle must be untouched by A's attempt"
    assert row["make"] != "HACKED", "A's payload must not have been written to B's row"


def test_05_existence_oracle_closed_same_status_and_body_for_missing_and_foreign():
    """The overnight audit's P2: a foreign vehicle_id used to 409 (leaking
    'this id exists') while a made-up one 404'd. Both must now be the exact
    same response -- an external caller must not be able to tell 'not
    yours' from 'does not exist' apart."""
    foreign = client.get(f"/api/v1/driver/vehicles/{STATE['vehicle_b']}", headers=STATE["a_headers"])
    missing = client.get("/api/v1/driver/vehicles/does-not-exist-at-all", headers=STATE["a_headers"])
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json(), (
        f"existence oracle: foreign={foreign.json()} vs missing={missing.json()}"
    )

    foreign_put = client.put(f"/api/v1/driver/vehicles?vehicle_id={STATE['vehicle_b']}", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "X", "model": "X", "license_plate": "ORACLE-CHECK-1", "payload_tons": 1, "cargo_volume_m3": 1,
    })
    missing_put = client.put("/api/v1/driver/vehicles?vehicle_id=does-not-exist-at-all", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "X", "model": "X", "license_plate": "ORACLE-CHECK-2", "payload_tons": 1, "cargo_volume_m3": 1,
    })
    assert foreign_put.status_code == missing_put.status_code == 404
    assert foreign_put.json() == missing_put.json()


# ── B's list must never include A's vehicle ─────────────────────────────

def test_06_b_cannot_use_vehicle_a_list_isolation():
    r = client.get("/api/v1/driver/vehicles", headers=STATE["b_headers"])
    assert r.status_code == 200, r.text
    ids = [v["id"] for v in r.json()["vehicles"]]
    assert STATE["vehicle_a"] not in ids
    assert STATE["vehicle_b"] in ids


# ── vehicle save idempotency / conflict around UNIQUE(owner, plate) ──────

def test_07_retry_identical_create_is_idempotent_not_a_duplicate():
    """Retrying a create with the EXACT same payload (same plate, same
    everything) after a simulated client timeout must return the existing
    vehicle, not a 409 error and not a second row."""
    payload = {
        "vehicle_registration_country_code": "KZ", "vehicle_type": "light_truck", "body_type": "van",
        "make": "DAF", "model": "CF", "license_plate": "RETRY-001", "payload_tons": 5, "cargo_volume_m3": 20,
    }
    r1 = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json=payload)
    r2 = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json=payload)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    assert r1.json()["vehicle"]["id"] == r2.json()["vehicle"]["id"]
    with get_conn() as c:
        n = c.execute(
            "SELECT COUNT(*) n FROM vehicles WHERE owner_user_id = ? AND license_plate = 'RETRY-001'",
            (STATE["a_id"],),
        ).fetchone()["n"]
    assert n == 1, f"retry created a duplicate row: {n}"


def test_08_same_plate_different_data_is_a_real_conflict_not_silently_accepted():
    """A DIFFERENT vehicle trying to reuse a plate this owner already has
    saved (not a retry -- genuinely different specs) must still be
    rejected, not silently merged into the existing row."""
    r = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "tractor_semitrailer", "body_type": "tanker",
        "make": "MAN", "model": "TGX", "license_plate": "RETRY-001", "payload_tons": 30, "cargo_volume_m3": 40,
    })
    assert r.status_code == 409, f"conflicting plate reuse was accepted: {r.status_code} {r.text}"
    with get_conn() as c:
        row = c.execute(
            "SELECT make FROM vehicles WHERE owner_user_id = ? AND license_plate = 'RETRY-001'",
            (STATE["a_id"],),
        ).fetchone()
    assert row["make"] == "DAF", "the conflicting write must not have overwritten the original vehicle"
