"""P1 regression fix (Release Block 6): create_cargo/create_trip had NO
price/weight/volume validation at all — the PATCH endpoints (update_cargo,
update_trip) have always guarded `if body.price < 0: raise 400`, but
nothing equivalent existed on POST. Regression of a previously-shipped fix
(P1-CARGO-VALIDATION-001, this project's own history): this branch forked
before that fix landed on main.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_create_price.db python -m pytest tests/test_create_price_validation.py -q
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_create_price.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_cu = contextvars.ContextVar("u", default=None)


def _fake(_m):
    from fastapi import HTTPException

    def dep():
        u = _cu.get()
        if not u:
            raise HTTPException(401, "no user")
        return u

    return dep


verification_gate.require_level = _fake

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

ddb.init_db()

from api.marketplace import mp_router
from database.db import get_conn

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def _as(uid="price-guard-owner"):
    _cu.set({"id": uid, "full_name": "x", "phone": "+7", "verification_level": 1})


def test_negative_price_cargo_rejected():
    """Live-fire репро оригинального дефекта: price=-100 → должен быть 400,
    а не 200 с реально созданным ACTIVE cargo."""
    _as()
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Алматы", "cargo_desc": "x",
        "cargo_type": "tent", "price": -100, "currency": "USD",
    })
    assert r.status_code == 400, r.text
    assert "price" in r.json().get("detail", "")


def test_negative_price_cargo_creates_no_row():
    """Не просто 400 — доказать, что строка ДЕЙСТВИТЕЛЬНО не попала в БД
    (раньше INSERT выполнялся безусловно до этого фикса)."""
    _as()
    before = 0
    with get_conn() as c:
        before = c.execute("SELECT COUNT(*) FROM cargos WHERE price < 0").fetchone()[0]
    client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Москва", "cargo_desc": "x",
        "cargo_type": "tent", "price": -50, "currency": "USD",
    })
    with get_conn() as c:
        after = c.execute("SELECT COUNT(*) FROM cargos WHERE price < 0").fetchone()[0]
    assert after == before, "негативная цена всё равно попала в БД"


def test_negative_weight_and_volume_cargo_rejected():
    _as()
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Алматы", "cargo_desc": "x",
        "cargo_type": "tent", "weight_tons": -5, "price": 100,
    })
    assert r.status_code == 400, r.text
    r2 = client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Алматы", "cargo_desc": "x",
        "cargo_type": "tent", "volume_m3": -1, "price": 100,
    })
    assert r2.status_code == 400, r2.text


def test_negative_price_trip_rejected():
    _as()
    r = client.post("/api/v1/market/trips", json={
        "from_city": "Иу", "to_city": "Алматы", "truck_type": "tent",
        "price": -300, "currency": "USD",
    })
    assert r.status_code == 400, r.text


def test_negative_capacity_trip_rejected():
    _as()
    r = client.post("/api/v1/market/trips", json={
        "from_city": "Иу", "to_city": "Алматы", "truck_type": "tent",
        "capacity_tons": -20, "price": 100,
    })
    assert r.status_code == 400, r.text


def test_zero_and_positive_price_still_accepted():
    """Регресс: не переусердствовать — 0 и положительные значения по-прежнему
    работают как раньше."""
    _as()
    r0 = client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Алматы", "cargo_desc": "x",
        "cargo_type": "tent", "price": 0,
    })
    assert r0.status_code == 200, r0.text
    r1 = client.post("/api/v1/market/cargos", json={
        "from_city": "Иу", "to_city": "Алматы", "cargo_desc": "x",
        "cargo_type": "tent", "price": 100000,
    })
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/v1/market/trips", json={
        "from_city": "Иу", "to_city": "Алматы", "truck_type": "tent", "price": 90000,
    })
    assert r2.status_code == 200, r2.text
