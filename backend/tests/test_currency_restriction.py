"""Core-валюты: новые операции только в USD/CNY/RUB/EUR.

Проверяем:
  - create cargo/trip в USD/CNY/RUB/EUR → 200;
  - create cargo/trip в KZT/UZS/KGS → 422;
  - edit cargo currency → KZT → 422;
  - legacy запись (currency='KZT' в БД) читается без ошибки (read-path permissive).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_currency.db python -m tests.test_currency_restriction
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_currency.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate
_current_user = contextvars.ContextVar("user", default=None)

def fake_require_level(_m):
    from fastapi import HTTPException
    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user")
        return u
    return dep

verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal
ddb.init_db()
registration_dal.init_registration_schema()
from api.marketplace import mp_router
from database.db import get_conn, new_id

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

USER = "test-currency-user"
def as_user(uid=USER):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})

CARGO = {"from_city": "A", "to_city": "B", "cargo_type": "tent", "cargo_desc": "cur test", "price": 1000}
TRIP = {"from_city": "A", "to_city": "B", "truck_type": "tent", "price": 1000}
ALLOWED = ["USD", "CNY", "RUB", "EUR"]
DISALLOWED = ["KZT", "UZS", "KGS"]


def test_create_cargo_allowed_currencies_200():
    as_user()
    for cur in ALLOWED:
        r = client.post("/api/v1/market/cargos", json={**CARGO, "currency": cur})
        assert r.status_code in (200, 201), f"cargo {cur} → {r.status_code}: {r.text}"


def test_create_cargo_disallowed_currencies_422():
    as_user()
    for cur in DISALLOWED:
        r = client.post("/api/v1/market/cargos", json={**CARGO, "currency": cur})
        assert r.status_code == 422, f"cargo {cur} должен 422, получили {r.status_code}: {r.text}"


def test_create_trip_currencies():
    as_user()
    for cur in ALLOWED:
        r = client.post("/api/v1/market/trips", json={**TRIP, "currency": cur})
        assert r.status_code in (200, 201), f"trip {cur} → {r.status_code}: {r.text}"
    r = client.post("/api/v1/market/trips", json={**TRIP, "currency": "KZT"})
    assert r.status_code == 422, f"trip KZT должен 422, получили {r.status_code}"


def test_edit_cargo_to_disallowed_currency_422():
    as_user()
    r = client.post("/api/v1/market/cargos", json={**CARGO, "currency": "USD"})
    cid = r.json()["id"]
    r = client.patch(f"/api/v1/market/cargos/{cid}", json={"currency": "KZT"})
    assert r.status_code == 422, f"edit→KZT должен 422, получили {r.status_code}: {r.text}"


def test_legacy_kzt_record_readable():
    as_user()
    cid = new_id()
    with get_conn() as c:
        c.execute("INSERT INTO cargos (id, owner_id, from_city, to_city, cargo_desc, "
                  "cargo_type, price, currency, status) VALUES (?,?,?,?,?,?,?,?,?)",
                  (cid, USER, "Almaty", "Astana", "legacy kzt", "tent", 1500000, "KZT", "active"))
    r = client.get(f"/api/v1/market/cargos/{cid}")
    assert r.status_code == 200, f"legacy read → {r.status_code}: {r.text}"
    assert r.json().get("currency") == "KZT", f"legacy currency изменилась: {r.json().get('currency')}"


if __name__ == "__main__":
    fails = 0
    for fn in [test_create_cargo_allowed_currencies_200, test_create_cargo_disallowed_currencies_422,
               test_create_trip_currencies, test_edit_cargo_to_disallowed_currency_422,
               test_legacy_kzt_record_readable]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
