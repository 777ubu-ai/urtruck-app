"""Vehicle Security & Trip Integrity Repair (2026-09-11) -- Vehicle save
concurrency.

Sequential retry/conflict behavior for PUT /api/v1/driver/vehicles is
covered in test_vehicle_idor.py (test_07/test_08 -- idempotent replay on
an exact-payload retry, real 409 on a genuinely conflicting plate reuse).
This file is specifically the "two parallel requests, not just two
sequential ones" property the task calls out separately: real OS threads
racing PUT /driver/vehicles, verifying the actual duplicate-prevention
guarantee is database.vehicles_schema.sql's UNIQUE(owner_user_id,
license_plate) index enforced by SQLite at INSERT-commit time -- not
vehicles_dal.upsert_vehicle's own SELECT-before-INSERT (which, in
isolation, can race: two threads' SELECTs can both see "no existing row"
before either commits). The UNIQUE index is what actually makes the
second INSERT fail deterministically regardless of thread interleaving;
see vehicles_dal.upsert_vehicle's docstring for the full reasoning.

CI contract: top-level `def test_*`, order matters -- test_00 seeds the
driver every later test needs.
"""
import threading

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
    with get_conn() as c:
        c.execute(
            "UPDATE drivers_registration SET verification_level = 1, role = 'driver', status = 'approved' "
            "WHERE id = ?",
            (uid,),
        )
        c.commit()
    return uid, {"Authorization": f"Bearer {token}"}


def test_00_setup_driver():
    STATE["a_id"], STATE["a_headers"] = _register_driver()


def test_01_ten_concurrent_identical_creates_produce_exactly_one_vehicle():
    """Same owner, same license plate, same everything, fired from 10 real
    threads at once -- this is the actual "two parallel save requests"
    scenario the task describes, not a sequential double-call."""
    payload = {
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "Volvo", "model": "FH", "license_plate": "CONCUR-A", "payload_tons": 20, "cargo_volume_m3": 82,
    }
    results = []
    lock = threading.Lock()

    def fire():
        r = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json=payload)
        with lock:
            results.append((r.status_code, r.json() if r.status_code == 200 else r.text))

    threads = [threading.Thread(target=fire) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for status, _ in results), (
        "a concurrent retry of the SAME payload must be idempotent (200), never a 409 error: "
        f"{results}"
    )
    ids = {body["vehicle"]["id"] for _, body in results}
    assert len(ids) == 1, f"10 concurrent identical creates returned {len(ids)} distinct vehicle ids"
    with get_conn() as c:
        n = c.execute(
            "SELECT COUNT(*) n FROM vehicles WHERE owner_user_id = ? AND license_plate = 'CONCUR-A'",
            (STATE["a_id"],),
        ).fetchone()["n"]
    assert n == 1, f"10 concurrent identical creates left {n} rows instead of 1"


def test_02_concurrent_creates_with_different_plates_all_succeed():
    """The UNIQUE(owner, plate) guard must not throttle unrelated
    concurrent creates -- only real duplicates."""
    results = []
    lock = threading.Lock()

    def fire(i):
        r = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json={
            "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
            "make": "MAN", "model": "TGX", "license_plate": f"MULTI-{i}", "payload_tons": 15, "cargo_volume_m3": 60,
        })
        with lock:
            results.append((i, r.status_code, r.json().get("vehicle", {}).get("id") if r.status_code == 200 else None))

    threads = [threading.Thread(target=fire, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for _, status, _ in results), results
    ids = [vid for _, _, vid in results]
    assert len(set(ids)) == 8, "8 distinct concurrent vehicle creates collided into fewer rows"
    with get_conn() as c:
        n = c.execute(
            "SELECT COUNT(*) n FROM vehicles WHERE owner_user_id = ? AND license_plate LIKE 'MULTI-%'",
            (STATE["a_id"],),
        ).fetchone()["n"]
    assert n == 8


def test_03_concurrent_update_of_own_vehicle_does_not_duplicate():
    """Two parallel PATCH-style updates (PUT with vehicle_id) to the SAME
    existing vehicle must never create a second row -- last-write-wins on
    the single row is fine, a second row is not."""
    created = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "DAF", "model": "XF", "license_plate": "UPDATE-RACE", "payload_tons": 18, "cargo_volume_m3": 70,
    })
    assert created.status_code == 200, created.text
    vehicle_id = created.json()["vehicle"]["id"]

    results = []
    lock = threading.Lock()

    def fire(payload_tons):
        r = client.put(f"/api/v1/driver/vehicles?vehicle_id={vehicle_id}", headers=STATE["a_headers"], json={
            "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
            "make": "DAF", "model": "XF", "license_plate": "UPDATE-RACE",
            "payload_tons": payload_tons, "cargo_volume_m3": 70,
        })
        with lock:
            results.append(r.status_code)

    threads = [threading.Thread(target=fire, args=(20 + i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for status in results), results
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) n FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()["n"]
        row = c.execute("SELECT owner_user_id FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
    assert n == 1, f"concurrent updates of the same vehicle produced {n} rows instead of 1"
    assert row["owner_user_id"] == STATE["a_id"]


def test_04_concurrent_attempts_to_claim_a_foreign_vehicle_id_all_denied():
    """Same P0 class as create_trip, exercised concurrently: many parallel
    attempts by a second driver to update a vehicle they do not own must
    ALL be denied -- none should slip through under contention, and the
    victim's row must remain completely untouched."""
    b_id, b_headers = _register_driver()
    victim = client.put("/api/v1/driver/vehicles", headers=STATE["a_headers"], json={
        "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
        "make": "Iveco", "model": "S-Way", "license_plate": "VICTIM-1", "payload_tons": 12, "cargo_volume_m3": 50,
    })
    assert victim.status_code == 200, victim.text
    victim_id = victim.json()["vehicle"]["id"]

    results = []
    lock = threading.Lock()

    def fire():
        r = client.put(f"/api/v1/driver/vehicles?vehicle_id={victim_id}", headers=b_headers, json={
            "vehicle_registration_country_code": "KZ", "vehicle_type": "solo_truck", "body_type": "curtain_sider",
            "make": "HACKED", "model": "HACKED", "license_plate": f"HACKED-{threading.get_ident()}",
            "payload_tons": 1, "cargo_volume_m3": 1,
        })
        with lock:
            results.append(r.status_code)

    threads = [threading.Thread(target=fire) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 404 for status in results), f"a concurrent foreign-vehicle_id claim slipped through: {results}"
    with get_conn() as c:
        row = c.execute("SELECT make, owner_user_id FROM vehicles WHERE id = ?", (victim_id,)).fetchone()
    assert row["make"] == "Iveco", "victim vehicle must be completely untouched"
    assert row["owner_user_id"] == STATE["a_id"]
