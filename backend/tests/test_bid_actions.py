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

# chat_rooms is created by api/chat._init(); we don't import that module here
# (it pulls extra deps), so apply chat_schema.sql directly so accept/counter
# logic can write into chat_rooms without 'no such table' errors.
from database.db import get_conn as _get_conn_for_setup
_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with _get_conn_for_setup() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))

# PR-B: notifications table тоже нужна для проверки что create_notification
# реально пишет с url, а не молча проглатывается через try/except.
_notif_schema_path = ROOT / "database" / "notifications_schema.sql"
if _notif_schema_path.exists():
    with _get_conn_for_setup() as _c_notif:
        _c_notif.executescript(_notif_schema_path.read_text(encoding="utf-8"))

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


def seed_trip(driver_id: str, price: int = 5000) -> str:
    """PR-B: helper для тестов trip-bid пути (клиент → водитель)."""
    from database.db import get_conn, new_id
    trip_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO trips (id, driver_id, driver_phone, driver_name, from_city, to_city, "
            "truck_type, price, status) VALUES (?,?,?,?,?,?,?,?,?)",
            (trip_id, driver_id, "+701", "Driver", "Almaty", "Moscow",
             "tent", price, "active"),
        )
    return trip_id


def query_notifications(user_id: str) -> list:
    """PR-B: helper для проверки записей в notifications таблице."""
    from database.db import get_conn
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC", (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def query_chat_room(p1: str, p2: str) -> dict:
    """PR-B: helper для проверки записей в chat_rooms (UNIQUE по sorted pair)."""
    from database.db import get_conn
    a, b = sorted([p1, p2])
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM chat_rooms WHERE participant_1 = ? AND participant_2 = ?", (a, b),
        ).fetchone()
        return dict(row) if row else None


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


def test_cancelled_and_rejected_statuses_persist():
    """Terminal bid states persist even though public listings hide non-actionable rows."""
    print("\n=== test_list_bids_shows_cancelled_and_rejected_statuses ===")
    cargo_id = seed_cargo(owner_id="dash-owner")
    as_user("dash-driver-a")
    bid_a = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 100}).json()["id"]
    as_user("dash-driver-b")
    bid_b = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 200}).json()["id"]
    as_user("dash-driver-a")
    client.post(f"/api/v1/market/bids/{bid_a}/cancel")

    as_user("dash-owner")
    client.post(f"/api/v1/market/bids/{bid_b}/reject")

    # Public cargo bid listing intentionally exposes only actionable bids.
    # Terminal states are verified directly in persistence instead.
    stored_a = get_bid(bid_a)
    stored_b = get_bid(bid_b)
    expect(stored_a["status"] == "cancelled", "DB contains cancelled bid")
    expect(stored_b["status"] == "rejected", "DB contains rejected bid")
    expect(stored_a["updated_at"] is not None, "cancelled bid has updated_at")
    expect(stored_b["updated_at"] is not None, "rejected bid has updated_at")


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
    bid_cancelled = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1100}).json()["id"]
    client.post(f"/api/v1/market/bids/{bid_cancelled}/cancel")

    bid_rejected = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1200}).json()["id"]
    as_user("dash2-owner")
    client.post(f"/api/v1/market/bids/{bid_rejected}/reject")

    as_user("dash2-driver")
    bid_pending = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1000}).json()["id"]

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


# ─── Counter-offer + chat-before-accept ─────────────────────────────────────

def test_counter_schema_columns():
    """Migration must have added counter_* fields."""
    print("\n=== test_counter_schema_columns ===")
    from database.db import get_conn
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(bids)").fetchall()}
    for col in ("counter_amount", "counter_message", "counter_by", "counter_at"):
        expect(col in cols, f"bids.{col} present")


def _new_pending_bid(owner: str, driver: str, amount: int = 1000):
    cargo_id = seed_cargo(owner_id=owner)
    as_user(driver)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": amount}).json()["id"]
    return cargo_id, bid_id


def test_counter_owner_sends_counter():
    print("\n=== test_counter_owner_sends_counter ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-1", "co-driver-1", 1000)
    as_user("co-owner-1")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 800, "message": "lower"})
    expect(r.status_code == 200, f"counter 200 (got {r.status_code} {r.text})")
    bid = r.json()["bid"]
    expect(bid["status"] == "countered", "status=countered")
    expect(bid["counter_amount"] == 800, "counter_amount=800")
    expect(bid["counter_by"] == "owner", "counter_by=owner")
    expect(bid["counter_message"] == "lower", "counter_message stored")
    expect(bid["counter_at"] is not None, "counter_at populated")


def test_counter_non_owner_cannot():
    print("\n=== test_counter_non_owner_cannot ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-2", "co-driver-2", 1000)
    as_user("intruder")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 700})
    expect(r.status_code == 403, f"non-owner counter → 403 (got {r.status_code})")


def test_counter_only_pending():
    print("\n=== test_counter_only_pending ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-3", "co-driver-3", 1000)
    as_user("co-driver-3")
    client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    as_user("co-owner-3")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 700})
    expect(r.status_code == 409, f"counter on cancelled → 409 (got {r.status_code})")


def test_counter_amount_must_be_positive():
    print("\n=== test_counter_amount_must_be_positive ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-4", "co-driver-4", 1000)
    as_user("co-owner-4")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 0})
    expect(r.status_code == 400, f"amount<=0 → 400 (got {r.status_code})")


def test_counter_accept_creates_deal_and_chat():
    print("\n=== test_counter_accept_creates_deal_and_chat ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-5", "co-driver-5", 1500)
    as_user("co-owner-5")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 1300})

    as_user("co-driver-5")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
    expect(r.status_code == 200, f"counter/accept 200 (got {r.status_code} {r.text})")
    body = r.json()
    expect(body["amount"] == 1300, "amount echoed = 1300")
    expect(bool(body.get("deal_id")), "deal_id returned")
    expect(bool(body.get("chat_room_id")), "chat_room_id returned")

    final = get_bid(bid_id)
    expect(final["status"] == "accepted", "bid is accepted")
    expect(final["amount"] == 1300, "bid.amount overwritten with counter_amount")


def test_counter_accept_403_for_non_bidder():
    print("\n=== test_counter_accept_403_for_non_bidder ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-6", "co-driver-6", 1000)
    as_user("co-owner-6")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 800})
    as_user("rando")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
    expect(r.status_code == 403, f"non-bidder counter/accept → 403 (got {r.status_code})")


def test_counter_decline_returns_to_pending():
    print("\n=== test_counter_decline_returns_to_pending ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-7", "co-driver-7", 2000)
    as_user("co-owner-7")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 1700, "message": "lower pls"})
    as_user("co-driver-7")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter/decline")
    expect(r.status_code == 200, f"counter/decline 200 (got {r.status_code} {r.text})")
    final = get_bid(bid_id)
    expect(final["status"] == "pending", "back to pending")
    expect(final["counter_amount"] is None, "counter_amount cleared")
    expect(final["counter_message"] is None, "counter_message cleared")
    expect(final["counter_by"] is None, "counter_by cleared")
    expect(final["counter_at"] is None, "counter_at cleared")
    expect(final["amount"] == 2000, "original amount preserved")


def test_cancel_works_for_countered():
    print("\n=== test_cancel_works_for_countered ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-8", "co-driver-8", 1000)
    as_user("co-owner-8")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 800})
    as_user("co-driver-8")
    r = client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    expect(r.status_code == 200, f"cancel countered → 200 (got {r.status_code})")
    expect(get_bid(bid_id)["status"] == "cancelled", "status=cancelled")


def test_reject_works_for_countered():
    print("\n=== test_reject_works_for_countered ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-9", "co-driver-9", 1000)
    as_user("co-owner-9")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 800})
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    expect(r.status_code == 200, f"reject countered → 200 (got {r.status_code})")
    expect(get_bid(bid_id)["status"] == "rejected", "status=rejected")


def test_owner_cannot_directly_accept_countered():
    print("\n=== test_owner_cannot_directly_accept_countered ===")
    cargo_id, bid_id = _new_pending_bid("co-owner-10", "co-driver-10", 1500)
    as_user("co-owner-10")
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 1200})
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    expect(r.status_code == 409, f"owner accept countered → 409 (got {r.status_code})")


def test_chat_from_pending_bid_is_blocked():
    """A working chat room must not exist until the bid is accepted."""
    print("\n=== test_chat_from_pending_bid_is_blocked ===")
    cargo_id, bid_id = _new_pending_bid("chat-owner", "chat-driver", 1000)
    as_user("chat-driver")
    r = client.post(f"/api/v1/market/bids/{bid_id}/chat")
    expect(r.status_code == 409, f"pending bid chat blocked → 409 (got {r.status_code} {r.text})")
    expect(query_chat_room("chat-owner", "chat-driver") is None, "no chat room before accept")


def test_chat_blocked_when_bid_not_active():
    print("\n=== test_chat_blocked_when_bid_not_active ===")
    cargo_id, bid_id = _new_pending_bid("chat-owner-2", "chat-driver-2", 1000)
    as_user("chat-driver-2")
    client.post(f"/api/v1/market/bids/{bid_id}/cancel")
    r = client.post(f"/api/v1/market/bids/{bid_id}/chat")
    expect(r.status_code == 409, f"chat on cancelled → 409 (got {r.status_code})")


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
    # Counter-offer + chat-before-accept
    test_counter_schema_columns()
    test_counter_owner_sends_counter()
    test_counter_non_owner_cannot()
    test_counter_only_pending()
    test_counter_amount_must_be_positive()
    test_counter_accept_creates_deal_and_chat()
    test_counter_accept_403_for_non_bidder()
    test_counter_decline_returns_to_pending()
    test_cancel_works_for_countered()
    test_reject_works_for_countered()
    test_owner_cannot_directly_accept_countered()
    test_chat_from_pending_bid()
    test_chat_blocked_when_bid_not_active()
    # PR-B: notification url + InApp для trip + eager chat + amount validate
    test_pr_b_create_bid_rejects_zero_amount()
    test_pr_b_create_bid_rejects_negative_amount()
    test_pr_b_cargo_bid_creates_notif_with_url_and_chat_room()
    test_pr_b_trip_bid_creates_notif_with_url_and_chat_room()
    test_pr_b_accept_bid_creates_accepted_notif_with_deal_url()
    test_pr_b_reject_bid_notif_has_back_url()
    print("\nAll bid action tests passed.")


# ─── PR-B tests ──────────────────────────────────────────────────────────────
# PR-B (P0-B, P0-D, P0-E, P0-F): backend now —
#   - rejects amount<=0 with 400
#   - creates InApp notification with meaningful url for cargo AND trip bids
#   - eagerly creates chat_room so cargo owner / trip driver doesn't need to
#     wait for first message to have a thread
#   - bid_accepted notification carries /deals/{id} url
#   - bid_rejected notification carries /cargos|/trips/{id} back-url

def test_pr_b_create_bid_rejects_zero_amount():
    print("\n=== PR-B test_create_bid_rejects_zero_amount ===")
    cargo_id = seed_cargo(owner_id="owner-pr-b1")
    as_user("driver-pr-b1")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 0})
    expect(r.status_code == 400, f"amount=0 → 400 (got {r.status_code} {r.text})")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1})
    expect(r.status_code == 200, f"amount=1 → 200 OK (got {r.status_code} {r.text})")


def test_pr_b_create_bid_rejects_negative_amount():
    print("\n=== PR-B test_create_bid_rejects_negative_amount ===")
    cargo_id = seed_cargo(owner_id="owner-pr-b2")
    as_user("driver-pr-b2")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": -100})
    expect(r.status_code == 400, f"amount<0 → 400 (got {r.status_code} {r.text})")


def test_pr_b_cargo_bid_creates_notif_without_eager_chat_room():
    print("\n=== PR-B test_cargo_bid_creates_notif_with_url_and_chat_room ===")
    owner = "owner-pr-b3"
    driver = "driver-pr-b3"
    cargo_id = seed_cargo(owner_id=owner)
    as_user(driver)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2500})
    expect(r.status_code == 200, f"create bid 200 (got {r.status_code})")
    bid_id = r.json()["id"]

    # Notification for owner
    notifs = query_notifications(owner)
    expect(len(notifs) >= 1, f"owner has >= 1 notification (got {len(notifs)})")
    n = notifs[0]  # latest
    expect(n["type"] == "bid_created", f"notif type=bid_created (got {n['type']})")
    expect(n["url"] == f"/cargos/{cargo_id}?bid={bid_id}",
           f"notif url=/cargos/X?bid=Y (got {n['url']})")
    expect("Новое предложение" in n["title"] or "$2500" in n["title"],
           f"notif title meaningful (got {n['title']!r})")

    room = query_chat_room(driver, owner)
    expect(room is None, "no chat_room before cargo bid acceptance")


def test_pr_b_trip_bid_creates_notif_without_eager_chat_room():
    print("\n=== PR-B test_trip_bid_creates_notif_with_url_and_chat_room ===")
    driver = "driver-pr-b4"
    client_id = "client-pr-b4"
    trip_id = seed_trip(driver_id=driver)
    as_user(client_id)
    r = client.post("/api/v1/market/bids", json={"trip_id": trip_id, "amount": 4500})
    expect(r.status_code == 200, f"create bid 200 (got {r.status_code})")
    bid_id = r.json()["id"]

    # Trip-bid previously had no InApp notification — only push.
    notifs = query_notifications(driver)
    expect(len(notifs) >= 1, f"driver has >= 1 notification (got {len(notifs)}) — fix for P0-F")
    n = notifs[0]
    expect(n["type"] == "bid_created", f"notif type=bid_created (got {n['type']})")
    expect(n["url"] == f"/trips/{trip_id}?bid={bid_id}",
           f"notif url=/trips/X?bid=Y (got {n['url']})")

    room = query_chat_room(client_id, driver)
    expect(room is None, "no chat_room before trip bid acceptance")


def test_pr_b_accept_bid_creates_accepted_notif_with_order_url():
    print("\n=== PR-B test_accept_bid_creates_accepted_notif_with_deal_url ===")
    owner = "owner-pr-b5"
    driver = "driver-pr-b5"
    cargo_id = seed_cargo(owner_id=owner, price=5000)
    as_user(driver)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 4800}).json()["id"]

    as_user(owner)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    expect(r.status_code == 200, f"accept 200 (got {r.status_code} {r.text})")
    deal_id = r.json()["deal_id"]
    expect(deal_id, "deal_id returned")

    notifs = query_notifications(driver)
    accepted = [n for n in notifs if n["type"] == "bid_accepted"]
    expect(len(accepted) >= 1, f"driver got bid_accepted notif (count={len(accepted)})")
    n = accepted[0]
    expect(n["url"] == f"/cargos/{cargo_id}",
           f"accepted notif url=/cargos/{{id}} (got {n['url']})")


def test_pr_b_reject_bid_notif_has_back_url():
    print("\n=== PR-B test_reject_bid_notif_has_back_url ===")
    owner = "owner-pr-b6"
    driver = "driver-pr-b6"
    cargo_id = seed_cargo(owner_id=owner)
    as_user(driver)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2000}).json()["id"]

    as_user(owner)
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    expect(r.status_code == 200, f"reject 200 (got {r.status_code})")

    notifs = query_notifications(driver)
    rejected = [n for n in notifs if n["type"] == "bid_rejected"]
    expect(len(rejected) >= 1, f"driver got bid_rejected notif (count={len(rejected)})")
    n = rejected[0]
    expect(n["url"] == f"/cargos/{cargo_id}",
           f"rejected notif url=/cargos/{{id}} (got {n['url']})")
