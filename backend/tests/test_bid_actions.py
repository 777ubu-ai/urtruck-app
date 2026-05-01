"""Smoke tests for bid edit / cancel / reject endpoints.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_bid.db python -m tests.test_bid_actions

Uses a throw-away SQLite file at $DB_PATH (not the production DB) and stubs
out require_level so we don't need a real registered driver. The test file
exits with non-zero on any assertion failure.
"""
import contextvars
import os
import sys
from pathlib import Path

# Use an isolated DB. Caller can override via DB_PATH env var.
TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_bid.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Patch require_level BEFORE marketplace is imported.
from api import verification_gate

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

# Bring up minimal FastAPI app with marketplace routes only.
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

# Initialise security schema so drivers_registration etc. exist (not strictly
# required for these endpoints, but matches production startup).
ddb.init_db()

from api.marketplace import mp_router  # _init() runs here and creates bids/cargos/deals tables

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def as_user(uid: str, full_name: str = "Test User", phone: str = "+70000000000"):
    """Switch the active fake user for require_level."""
    _current_user.set({"id": uid, "full_name": full_name, "phone": phone, "verification_level": 1})


def seed_cargo(owner_id: str, price: int = 3000) -> str:
    from database.db import get_conn, new_id
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow",
             "Test cargo", "tent", price, 0, "active"),
        )
    return cargo_id


def get_bid(bid_id: str) -> dict:
    from database.db import get_conn
    with get_conn() as c:
        row = c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
        return dict(row) if row else None


def get_cargo(cargo_id: str) -> dict:
    from database.db import get_conn
    with get_conn() as c:
        row = c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
        return dict(row) if row else None


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_schema_has_updated_at():
    from database.db import get_conn
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(bids)").fetchall()}
    expect("updated_at" in cols, "bids.updated_at column exists")


def test_edit_own_pending():
    print("\n=== test_edit_own_pending ===")
    cargo_id = seed_cargo(owner_id="owner-1")
    as_user("driver-1")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 3000, "message": "first"})
    expect(r.status_code == 200, f"create bid 200 (got {r.status_code} {r.text})")
    bid_id = r.json()["id"]

    # bidder edits → discount
    r = client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 2800, "message": "discount"})
    expect(r.status_code == 200, f"PATCH 200 (got {r.status_code} {r.text})")
    body = r.json()
    expect(body["bid"]["amount"] == 2800, "amount updated to 2800")
    expect(body["bid"]["message"] == "discount", "message updated")
    expect(body["bid"]["status"] == "pending", "status still pending")
    expect(body["bid"]["updated_at"] is not None, "updated_at populated")


def test_edit_rejects_zero_amount():
    print("\n=== test_edit_rejects_zero_amount ===")
    cargo_id = seed_cargo(owner_id="owner-2")
    as_user("driver-2")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1000}).json()["id"]
    r = client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 0})
    expect(r.status_code == 400, f"amount<=0 → 400 (got {r.status_code})")


def test_edit_forbidden_for_other_user():
    print("\n=== test_edit_forbidden_for_other_user ===")
    cargo_id = seed_cargo(owner_id="owner-3")
    as_user("driver-3")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1500}).json()["id"]
    as_user("intruder")
    r = client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 100})
    expect(r.status_code == 403, f"non-bidder → 403 (got {r.status_code})")


def test_edit_404_when_missing():
    print("\n=== test_edit_404_when_missing ===")
    as_user("anyone")
    r = client.patch("/api/v1/market/bids/does-not-exist", json={"amount": 100})
    expect(r.status_code == 404, f"missing → 404 (got {r.status_code})")


def test_cancel_decrements_bids_count():
    print("\n=== test_cancel_decrements_bids_count ===")
    cargo_id = seed_cargo(owner_id="owner-4")
    as_user("driver-4")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2000}).json()["id"]
    expect(get_cargo(cargo_id)["bids_count"] == 1, "bids_count == 1 after create")

    r = client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    expect(r.status_code == 200, f"cancel 200 (got {r.status_code} {r.text})")
    expect(r.json()["status"] == "cancelled", "response status=cancelled")
    expect(get_bid(bid_id)["status"] == "cancelled", "DB status=cancelled")
    expect(get_cargo(cargo_id)["bids_count"] == 0, "bids_count decremented to 0")


def test_cancel_never_below_zero():
    print("\n=== test_cancel_never_below_zero ===")
    cargo_id = seed_cargo(owner_id="owner-5")
    # Force bids_count to 0 manually then cancel a freshly created bid → bids_count must clamp at 0
    from database.db import get_conn
    as_user("driver-5")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1100}).json()["id"]
    with get_conn() as c:
        c.execute("UPDATE cargos SET bids_count = 0 WHERE id = ?", (cargo_id,))
    r = client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    expect(r.status_code == 200, "cancel 200 even when count was already 0")
    expect(get_cargo(cargo_id)["bids_count"] == 0, "bids_count clamped at 0")


def test_cancel_409_if_not_pending():
    print("\n=== test_cancel_409_if_not_pending ===")
    cargo_id = seed_cargo(owner_id="owner-6")
    as_user("driver-6")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1200}).json()["id"]
    # Manually flip status to accepted
    from database.db import get_conn
    with get_conn() as c:
        c.execute("UPDATE bids SET status = 'accepted' WHERE id = ?", (bid_id,))
    r = client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    expect(r.status_code == 409, f"non-pending → 409 (got {r.status_code})")


def test_cancel_403_for_other_user():
    print("\n=== test_cancel_403_for_other_user ===")
    cargo_id = seed_cargo(owner_id="owner-7")
    as_user("driver-7")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1300}).json()["id"]
    as_user("not-the-bidder")
    r = client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    expect(r.status_code == 403, f"non-bidder cancel → 403 (got {r.status_code})")


def test_reject_by_cargo_owner():
    print("\n=== test_reject_by_cargo_owner ===")
    cargo_id = seed_cargo(owner_id="owner-8")
    as_user("driver-8")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1400}).json()["id"]

    as_user("owner-8")
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    expect(r.status_code == 200, f"reject 200 (got {r.status_code} {r.text})")
    expect(r.json()["status"] == "rejected", "response status=rejected")
    expect(get_bid(bid_id)["status"] == "rejected", "DB status=rejected")


def test_reject_403_for_non_owner():
    print("\n=== test_reject_403_for_non_owner ===")
    cargo_id = seed_cargo(owner_id="owner-9")
    as_user("driver-9")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1500}).json()["id"]
    as_user("rando")
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    expect(r.status_code == 403, f"non-owner reject → 403 (got {r.status_code})")


def test_reject_409_if_not_pending():
    print("\n=== test_reject_409_if_not_pending ===")
    cargo_id = seed_cargo(owner_id="owner-10")
    as_user("driver-10")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1600}).json()["id"]
    # Cancel first → status=cancelled
    client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    as_user("owner-10")
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    expect(r.status_code == 409, f"already cancelled → 409 (got {r.status_code})")


def test_list_bids_shows_cancelled_and_rejected_statuses():
    """GET /bids?cargo_id=... returns new lifecycle states (smoke check on persistence)."""
    print("\n=== test_list_bids_shows_cancelled_and_rejected_statuses ===")
    cargo_id = seed_cargo(owner_id="dash-owner")
    as_user("dash-driver")
    bid_a = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 100}).json()["id"]
    bid_b = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 200}).json()["id"]
    client.post(f"/api/v1/market/bids/{bid_a}/cancel")

    as_user("dash-owner")
    client.post(f"/api/v1/market/bids/{bid_b}/reject")

    r = client.get(f"/api/v1/market/bids?cargo_id={cargo_id}")
    expect(r.status_code == 200, f"GET /bids → 200 (got {r.status_code})")
    by_id = {b["id"]: b for b in r.json()["bids"]}
    expect(by_id[bid_a]["status"] == "cancelled", "list contains cancelled")
    expect(by_id[bid_b]["status"] == "rejected",  "list contains rejected")
    expect(by_id[bid_a]["updated_at"] is not None, "cancelled bid has updated_at")
    expect(by_id[bid_b]["updated_at"] is not None, "rejected bid has updated_at")


# ─── /my dashboard tests (regression for UnboundLocalError) ─────────────────

EXPECTED_MY_KEYS = {"my_cargos", "my_trips", "my_bids", "incoming_bids", "my_deals"}


def test_my_dashboard_empty_user():
    """User with no cargos/trips/bids must get a 200 with empty arrays."""
    print("\n=== test_my_dashboard_empty_user ===")
    as_user("empty-user")
    r = client.get("/api/v1/market/my")
    expect(r.status_code == 200, f"GET /my (empty) → 200 (got {r.status_code} {r.text})")
    body = r.json()
    expect(EXPECTED_MY_KEYS.issubset(body.keys()), f"keys present: {sorted(body.keys())}")
    for k in EXPECTED_MY_KEYS:
        expect(body[k] == [], f"{k} is empty list")


def test_my_dashboard_driver_with_bids():
    """Driver-only user (no cargos/trips) with pending+cancelled+rejected bids must work."""
    print("\n=== test_my_dashboard_driver_with_bids ===")
    cargo_id = seed_cargo(owner_id="dash2-owner")
    as_user("dash2-driver")
    bid_pending   = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1000}).json()["id"]
    bid_cancelled = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1100}).json()["id"]
    bid_rejected  = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1200}).json()["id"]
    client.post(f"/api/v1/market/bids/{bid_cancelled}/cancel")
    as_user("dash2-owner")
    client.post(f"/api/v1/market/bids/{bid_rejected}/reject")

    as_user("dash2-driver")
    r = client.get("/api/v1/market/my")
    expect(r.status_code == 200, f"GET /my (driver) → 200 (got {r.status_code} {r.text})")
    body = r.json()
    expect(body["my_cargos"] == [], "no cargos for driver-only user")
    expect(body["my_trips"]  == [], "no trips for driver-only user")
    statuses = {b["id"]: b["status"] for b in body["my_bids"]}
    expect(statuses.get(bid_pending)   == "pending",   "my_bids has pending")
    expect(statuses.get(bid_cancelled) == "cancelled", "my_bids has cancelled")
    expect(statuses.get(bid_rejected)  == "rejected",  "my_bids has rejected")


def test_my_dashboard_owner_with_cargos_and_incoming():
    """Owner-side: my_cargos populated, photos parsed, incoming_bids visible."""
    print("\n=== test_my_dashboard_owner_with_cargos_and_incoming ===")
    cargo_id = seed_cargo(owner_id="dash3-owner")
    as_user("dash3-bidder")
    client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 4242})

    as_user("dash3-owner")
    r = client.get("/api/v1/market/my")
    expect(r.status_code == 200, f"GET /my (owner) → 200 (got {r.status_code} {r.text})")
    body = r.json()
    expect(len(body["my_cargos"]) == 1, "1 cargo returned")
    expect(body["my_cargos"][0]["photos"] == [], "photos parsed as []")
    expect(any(b["amount"] == 4242 for b in body["incoming_bids"]), "incoming_bids visible")
    expect(body["my_bids"] == [], "no outgoing bids for owner")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_schema_has_updated_at()
    test_edit_own_pending()
    test_edit_rejects_zero_amount()
    test_edit_forbidden_for_other_user()
    test_edit_404_when_missing()
    test_cancel_decrements_bids_count()
    test_cancel_never_below_zero()
    test_cancel_409_if_not_pending()
    test_cancel_403_for_other_user()
    test_reject_by_cargo_owner()
    test_reject_403_for_non_owner()
    test_reject_409_if_not_pending()
    test_list_bids_shows_cancelled_and_rejected_statuses()
    test_my_dashboard_empty_user()
    test_my_dashboard_driver_with_bids()
    test_my_dashboard_owner_with_cargos_and_incoming()
    print("\nAll bid action tests passed.")
