"""Country guard on deal status transitions (PR2, приказ владельца 03.08.2026).

Серверная проверка in_progress → {at_border, delivered}: домашний рейс не
проходит границу, международный не доставляется минуя границу, неизвестный
маршрут не двигается дальше без уточнения. Cancelled и остальные переходы
существующей state machine не затрагиваются.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_country_guard.db python -m tests.test_deal_country_guard
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_country_guard.db")
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

from api.marketplace import mp_router
from database.db import get_conn as _get_conn_for_setup

_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with _get_conn_for_setup() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))

_notif_schema_path = ROOT / "database" / "notifications_schema.sql"
if _notif_schema_path.exists():
    with _get_conn_for_setup() as _c_notif:
        _c_notif.executescript(_notif_schema_path.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def seed_cargo(owner_id: str, from_country=None, to_country=None, price: int = 3000) -> str:
    from database.db import get_conn, new_id
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status, from_country, to_country) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow",
             "Test cargo", "tent", price, 0, "active", from_country, to_country),
        )
    return cargo_id


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def _make_in_progress_deal(owner_id, driver_id, from_country, to_country):
    """Seed a cargo with the given route, accept a bid on it, and advance
    the resulting deal to in_progress. Returns deal_id.

    Аудит Блок 3 (P0-2, 05.08.2026): accepted→in_progress теперь разрешён
    ТОЛЬКО driver_id (раньше — любой участник, включая владельца груза,
    что и было первопричиной P0-2). Актёра сменили на driver_id, логика
    country-guard (предмет ЭТОГО файла) не менялась."""
    cargo_id = seed_cargo(owner_id=owner_id, from_country=from_country, to_country=to_country)
    as_user(driver_id)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2500}).json()["id"]
    as_user(owner_id)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    expect(r.status_code == 200, f"accept bid 200 (got {r.status_code} {r.text})")
    deal_id = r.json()["deal_id"]
    as_user(driver_id)  # P0-2: только водитель может начать рейс
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=in_progress")
    expect(r.status_code == 200, f"accepted -> in_progress 200 (got {r.status_code} {r.text})")
    return deal_id


def test_domestic_at_border_409():
    print("\n=== test_domestic_at_border_409 (KZ -> KZ, at_border) ===")
    deal_id = _make_in_progress_deal("owner-dom-1", "driver-dom-1", "KZ", "KZ")
    as_user("driver-dom-1")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=at_border")
    expect(r.status_code == 409, f"KZ->KZ at_border -> 409 (got {r.status_code} {r.text})")


def test_domestic_delivered_200():
    print("\n=== test_domestic_delivered_200 (KZ -> KZ, delivered) ===")
    deal_id = _make_in_progress_deal("owner-dom-2", "driver-dom-2", "KZ", "KZ")
    as_user("driver-dom-2")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=delivered")
    expect(r.status_code == 200, f"KZ->KZ delivered -> 200 (got {r.status_code} {r.text})")


def test_international_at_border_200():
    print("\n=== test_international_at_border_200 (CN -> KZ, at_border) ===")
    deal_id = _make_in_progress_deal("owner-intl-1", "driver-intl-1", "CN", "KZ")
    as_user("driver-intl-1")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=at_border")
    expect(r.status_code == 200, f"CN->KZ at_border -> 200 (got {r.status_code} {r.text})")


def test_international_direct_delivered_409():
    print("\n=== test_international_direct_delivered_409 (CN -> KZ, direct delivered) ===")
    deal_id = _make_in_progress_deal("owner-intl-2", "driver-intl-2", "CN", "KZ")
    as_user("driver-intl-2")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=delivered")
    expect(r.status_code == 409, f"CN->KZ direct delivered -> 409 (got {r.status_code} {r.text})")
    # At_border первый — после него delivered должен пройти.
    r2 = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=at_border")
    expect(r2.status_code == 200, f"CN->KZ at_border 200 (got {r2.status_code} {r2.text})")
    r3 = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=delivered")
    expect(r3.status_code == 200, f"CN->KZ at_border -> delivered 200 (got {r3.status_code} {r3.text})")


def test_unknown_route_at_border_409():
    print("\n=== test_unknown_route_at_border_409 (null -> null, at_border) ===")
    deal_id = _make_in_progress_deal("owner-unk-1", "driver-unk-1", None, None)
    as_user("driver-unk-1")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=at_border")
    expect(r.status_code == 409, f"null->null at_border -> 409 (got {r.status_code} {r.text})")
    # Блок 4 (P0-3): формат ошибки теперь структурный ({error, message}) —
    # ROUTE_REQUIRES_CLARIFICATION вместо plain-string "Уточните страны маршрута".
    detail = r.json().get("detail", {})
    expect(isinstance(detail, dict) and detail.get("error") == "ROUTE_REQUIRES_CLARIFICATION",
           f"409 detail.error == ROUTE_REQUIRES_CLARIFICATION (got {detail})")


def test_unknown_route_delivered_409():
    print("\n=== test_unknown_route_delivered_409 (null -> null, delivered) ===")
    deal_id = _make_in_progress_deal("owner-unk-2", "driver-unk-2", None, None)
    as_user("driver-unk-2")  # P0-2: actor
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=delivered")
    expect(r.status_code == 409, f"null->null delivered -> 409 (got {r.status_code} {r.text})")


def test_unknown_route_cancel_still_allowed():
    print("\n=== test_unknown_route_cancel_still_allowed (guard doesn't touch cancelled) ===")
    deal_id = _make_in_progress_deal("owner-unk-3", "driver-unk-3", None, None)
    as_user("owner-unk-3")
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status?new_status=cancelled")
    expect(r.status_code == 200, f"null->null cancelled still allowed -> 200 (got {r.status_code} {r.text})")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_domestic_at_border_409()
    test_domestic_delivered_200()
    test_international_at_border_200()
    test_international_direct_delivered_409()
    test_unknown_route_at_border_409()
    test_unknown_route_delivered_409()
    test_unknown_route_cancel_still_allowed()
    print("\nAll country guard tests passed.")
