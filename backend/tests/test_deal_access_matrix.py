"""P0 2026-09-01 — матрица доступа GET /market/deals/{deal_id}.

Этот endpoint стал ЕДИНСТВЕННЫМ и ПЕРВЫМ оракулом доступа для прямого
deeplink urtruck://deals/{id} (см. src/utils/dealLinkGuard.js — тяжёлый
/market/my из deeplink-пути исключён). Значит его participant-семантика —
контракт безопасности, а не деталь реализации. Живой инцидент: победитель
Armando и shipper Fedya должны получать 200, проигравший торг Berik — 403,
посторонний — 403, несуществующая сделка — 404.

Матрица (5 кейсов):
  1. shipper (грузовладелец сделки)      → 200, body.id == deal_id
  2. winner driver (победивший торг)     → 200, body.id == deal_id
  3. loser driver (его bid отклонён)     → 403 (в deals-строке его нет)
  4. unrelated user (вообще не при делах) → 403
  5. неизвестный deal_id                 → 404

Run from backend/:
    DB_PATH=/tmp/urtruck_test_deal_access_matrix.db \
        python -m tests.test_deal_access_matrix
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_deal_access_matrix.db")
if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
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

SHIPPER = "matrix-shipper"
WINNER = "matrix-winner-driver"
LOSER = "matrix-loser-driver"
UNRELATED = "matrix-unrelated"


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def _seed_deal():
    """Груз shipper-а, победивший bid WINNER-а, отклонённый bid LOSER-а."""
    cargo_id = new_id()
    deal_id = new_id()
    winner_bid = new_id()
    loser_bid = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, weight_tons, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, SHIPPER, "+700", "Shipper", "Иу", "Алматы",
             "Товары народного потребления", "tent", 12.0, 306500, 2, "in_progress"),
        )
        c.execute(
            "INSERT INTO bids (id, cargo_id, bidder_id, bidder_name, amount, status) VALUES (?,?,?,?,?,?)",
            (winner_bid, cargo_id, WINNER, "Winner", 306500, "accepted"),
        )
        c.execute(
            "INSERT INTO bids (id, cargo_id, bidder_id, bidder_name, amount, status) VALUES (?,?,?,?,?,?)",
            (loser_bid, cargo_id, LOSER, "Loser", 306600, "rejected"),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, winner_bid, SHIPPER, WINNER, "Иу", "Алматы", 306500, "accepted"),
        )
    return deal_id


DEAL_ID = _seed_deal()


def test_shipper_gets_200():
    print("\n=== 1. shipper → 200 ===")
    as_user(SHIPPER)
    r = client.get(f"/api/v1/market/deals/{DEAL_ID}")
    expect(r.status_code == 200, f"shipper 200 (got {r.status_code} {r.text[:200]})")
    expect(r.json().get("id") == DEAL_ID, "body.id == deal_id")


def test_winner_driver_gets_200():
    print("\n=== 2. winner driver → 200 ===")
    as_user(WINNER)
    r = client.get(f"/api/v1/market/deals/{DEAL_ID}")
    expect(r.status_code == 200, f"winner 200 (got {r.status_code} {r.text[:200]})")
    expect(r.json().get("id") == DEAL_ID, "body.id == deal_id")


def test_loser_driver_gets_403():
    print("\n=== 3. loser driver → 403 ===")
    as_user(LOSER)
    r = client.get(f"/api/v1/market/deals/{DEAL_ID}")
    expect(r.status_code == 403, f"loser 403 (got {r.status_code} {r.text[:200]})")


def test_unrelated_user_gets_403():
    print("\n=== 4. unrelated → 403 ===")
    as_user(UNRELATED)
    r = client.get(f"/api/v1/market/deals/{DEAL_ID}")
    expect(r.status_code == 403, f"unrelated 403 (got {r.status_code} {r.text[:200]})")


def test_unknown_deal_gets_404():
    print("\n=== 5. unknown deal → 404 ===")
    as_user(SHIPPER)
    r = client.get(f"/api/v1/market/deals/{new_id()}")
    expect(r.status_code == 404, f"unknown 404 (got {r.status_code} {r.text[:200]})")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_shipper_gets_200()
    test_winner_driver_gets_200()
    test_loser_driver_gets_403()
    test_unrelated_user_gets_403()
    test_unknown_deal_gets_404()
    print("\nAll deal access matrix tests passed.")
