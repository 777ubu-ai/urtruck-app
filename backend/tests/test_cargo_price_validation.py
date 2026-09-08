"""Regression coverage for server-side negative price validation."""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_price.db")
if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min):
    from fastapi import HTTPException

    def dep():
        user = _current_user.get()
        if not user:
            raise HTTPException(status_code=401, detail="No test user")
        return user

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

ddb.init_db()

from api.marketplace import mp_router
from database.db import get_conn

_notif_schema = ROOT / "database" / "notifications_schema.sql"
if _notif_schema.exists():
    with get_conn() as _c:
        _c.executescript(_notif_schema.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

OWNER = "price-owner-1"


def _as(uid=OWNER):
    _current_user.set({
        "id": uid,
        "full_name": "Owner",
        "phone": "+700",
        "verification_level": 1,
    })


def _cargo_body(**overrides):
    body = {
        "from_city": "Almaty",
        "to_city": "Moscow",
        "cargo_desc": "Validation probe",
        "cargo_type": "tent",
        "price": 100000,
        "currency": "USD",
    }
    body.update(overrides)
    return body


def _cargo_count():
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) FROM cargos").fetchone()[0]


def _notif_count():
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]


def test_create_cargo_negative_price_is_422_and_has_no_side_effects():
    _as()
    cargos_before = _cargo_count()
    notifs_before = _notif_count()

    for price in (-100, -1):
        response = client.post("/api/v1/market/cargos", json=_cargo_body(price=price))
        assert response.status_code == 422, response.text

    assert _cargo_count() == cargos_before
    assert _notif_count() == notifs_before


def test_create_cargo_zero_and_positive_prices_still_work():
    _as()
    zero = client.post("/api/v1/market/cargos", json=_cargo_body(price=0))
    assert zero.status_code == 200, zero.text
    positive = client.post("/api/v1/market/cargos", json=_cargo_body(price=333000))
    assert positive.status_code == 200, positive.text


def test_patch_cargo_negative_price_is_422_and_does_not_partial_update():
    _as()
    created = client.post("/api/v1/market/cargos", json=_cargo_body(price=120000))
    assert created.status_code == 200, created.text
    cargo_id = created.json()["id"]

    response = client.patch(f"/api/v1/market/cargos/{cargo_id}", json={"price": -100})
    assert response.status_code == 422, response.text

    with get_conn() as c:
        price = c.execute("SELECT price FROM cargos WHERE id = ?", (cargo_id,)).fetchone()[0]
    assert price == 120000


def test_trip_create_and_patch_negative_price_are_422():
    _as()
    created = client.post("/api/v1/market/trips", json={
        "from_city": "Almaty",
        "to_city": "Moscow",
        "truck_type": "tent",
        "price": 120000,
    })
    assert created.status_code == 200, created.text
    trip_id = created.json()["id"]

    bad_create = client.post("/api/v1/market/trips", json={
        "from_city": "Almaty",
        "to_city": "Moscow",
        "truck_type": "tent",
        "price": -50,
    })
    assert bad_create.status_code == 422, bad_create.text

    bad_patch = client.patch(f"/api/v1/market/trips/{trip_id}", json={"price": -50})
    assert bad_patch.status_code == 422, bad_patch.text

    with get_conn() as c:
        price = c.execute("SELECT price FROM trips WHERE id = ?", (trip_id,)).fetchone()[0]
    assert price == 120000
