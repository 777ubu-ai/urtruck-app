"""get_deal() returns the cargo/trip weight data TrackTruck needs for
server-side road routing (P1, независимый release review PR #239, 2026-08-19).

Real end-to-end proof (not just source regex) that GET /market/deals/{id}
returns cargo_weight_tons and trip_capacity_tons — the values ChatScreen.js
now threads into TrackTruck -> TruckMap -> routingAPI.roadRoute()'s vehicle
argument. Both columns already existed in the schema (cargos.weight_tons,
trips.capacity_tons); this only proves get_deal() actually surfaces them,
it does not add or fabricate any new field.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_deal_weight.db python -m tests.test_deal_weight_enrichment
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_deal_weight.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate
import contextvars

_current_user = contextvars.ContextVar("user", default=None)
def fake_require_level(_min_level):
    from fastapi import HTTPException
    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u
    return dep

verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

ddb.init_db()

from database import registration_dal
registration_dal.init_registration_schema()

from api.marketplace import mp_router
from database.db import get_conn, new_id

_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with get_conn() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))

_notif_schema_path = ROOT / "database" / "notifications_schema.sql"
if _notif_schema_path.exists():
    with get_conn() as _c_notif:
        _c_notif.executescript(_notif_schema_path.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def test_cargo_backed_deal_exposes_cargo_weight_tons():
    print("\n=== test_cargo_backed_deal_exposes_cargo_weight_tons ===")
    owner_id, driver_id = "owner-weight-1", "driver-weight-1"
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, weight_tons, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow",
             "Real weight-tagged cargo", "tent", 18.5, 3000, 0, "active"),
        )

    as_user(driver_id)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2500}).json()["id"]
    as_user(owner_id)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    expect(r.status_code == 200, f"accept bid 200 (got {r.status_code} {r.text})")
    deal_id = r.json()["deal_id"]

    as_user(owner_id)
    deal = client.get(f"/api/v1/market/deals/{deal_id}").json()
    expect(deal.get("cargo_weight_tons") == 18.5,
           f"deal.cargo_weight_tons == 18.5, the real cargos.weight_tons value (got {deal.get('cargo_weight_tons')})")


def test_trip_backed_deal_exposes_trip_capacity_tons():
    print("\n=== test_trip_backed_deal_exposes_trip_capacity_tons ===")
    # Seeds trip + deal rows directly (bypassing the trip-bid HTTP flow,
    # which is exercised elsewhere) to isolate exactly what this fix
    # touches: does GET /deals/{id} surface trips.capacity_tons.
    driver_id, shipper_id = "driver-weight-2", "shipper-weight-2"
    trip_id = new_id()
    deal_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO trips (id, driver_id, driver_phone, driver_name, from_city, to_city, "
            "truck_type, capacity_tons, price, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (trip_id, driver_id, "+700", "Driver", "Khorgos", "Almaty", "tent", 22.0, 2800, "booked"),
        )
        c.execute(
            "INSERT INTO deals (id, trip_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, trip_id, new_id(), shipper_id, driver_id, "Khorgos", "Almaty", 2800, "accepted"),
        )

    as_user(shipper_id)
    deal = client.get(f"/api/v1/market/deals/{deal_id}").json()
    expect(deal.get("trip_capacity_tons") == 22.0,
           f"deal.trip_capacity_tons == 22.0, the real trips.capacity_tons value (got {deal.get('trip_capacity_tons')})")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_cargo_backed_deal_exposes_cargo_weight_tons()
    test_trip_backed_deal_exposes_trip_capacity_tons()
    print("\nAll deal weight enrichment tests passed.")
