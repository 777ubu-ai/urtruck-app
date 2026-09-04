"""P1-CARGO-VALIDATION-001 (nightly 04.09.2026) — server-side price validation.

Физический/API факт: POST /market/cargos с price=-100 принял запрос и создал
ACTIVE cargo. Сервер — источник истины валидации, независимо от клиента.

Контракт (§15): price — целое, валюта отдельным полем; price < 0
структурно недопустима и ОТВЕРГАЕТСЯ; price == 0 сохраняется (исторический
дефолт схемы / «договорная», плюс legacy-записи и рейсы). UI при публикации
груза отдельно требует > 0 — это UX-слой.

Единый источник валидации (§16): один _reject_negative_price подключён
field_validator'ом во ВСЕ схемы с ценой (CargoIn, TripIn, TripPatchIn,
CargoPatchIn), поэтому нельзя закрыть POST и оставить PATCH дырой.

Контракт ошибки (§17): pydantic ValidationError → HTTP 422 (FastAPI), НЕ
500; cargo не создаётся, partial-записи/push/notification не появляются
(валидация проходит ДО тела эндпоинта).

Патчим require_level ДО импорта marketplace — как в остальных тестах этого
пакета.
"""
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
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user")
        return u

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

ddb.init_db()

from api.marketplace import mp_router
from database.db import get_conn

# notifications-таблица нужна, чтобы доказать «ноль notification» при отказе.
_notif_schema = ROOT / "database" / "notifications_schema.sql"
if _notif_schema.exists():
    with get_conn() as _c:
        _c.executescript(_notif_schema.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

OWNER = "price-owner-1"


def _as(uid=OWNER):
    _current_user.set({"id": uid, "full_name": "Owner", "phone": "+700", "verification_level": 1})


def _cargo_body(**over):
    body = {
        "from_city": "Almaty",
        "to_city": "Moscow",
        "cargo_desc": "Validation probe",
        "cargo_type": "tent",
        "price": 100000,
        "currency": "USD",
    }
    body.update(over)
    return body


def _cargo_count():
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) FROM cargos").fetchone()[0]


def _notif_count():
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]


# ─── P1-P8: create-контракт ───

def test_p1_negative_price_rejected():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=-100))
    assert r.status_code == 422, r.text
    assert r.status_code != 500


def test_p2_negative_fraction_rejected():
    _as()
    # price — int; -0.01 отвергается (либо как non-int, либо как negative).
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=-0.01))
    assert r.status_code == 422, r.text


def test_p3_valid_price_accepted():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=250000))
    assert r.status_code == 200, r.text
    assert r.json().get("id")


def test_p4_large_boundary_accepted():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=2_000_000_000))
    assert r.status_code == 200, r.text


def test_p5_non_numeric_string_rejected():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price="abc"))
    assert r.status_code == 422, r.text


def test_p6_nan_and_infinity_rejected():
    _as()
    # JSON транспорт: явные not-a-number формы приходят строкой.
    for bad in ("NaN", "Infinity", "-Infinity"):
        r = client.post("/api/v1/market/cargos", json=_cargo_body(price=bad))
        assert r.status_code == 422, f"{bad}: {r.text}"


def test_p7_null_price_uses_contract_default():
    _as()
    # price=null у create-схемы схлопывается в дефолт 0 (договорная) — принято.
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=None))
    assert r.status_code == 200, r.text


def test_p8_zero_price_accepted_per_contract():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=0))
    assert r.status_code == 200, r.text
    assert r.json().get("id")


# ─── P9: PATCH нельзя оставить дырой ───

def test_p9_patch_negative_price_rejected():
    _as()
    created = client.post("/api/v1/market/cargos", json=_cargo_body(price=120000))
    assert created.status_code == 200, created.text
    cargo_id = created.json()["id"]

    r = client.patch(f"/api/v1/market/cargos/{cargo_id}", json={"price": -100})
    assert r.status_code == 422, r.text

    # Цена в БД не изменилась на отрицательную.
    with get_conn() as c:
        price = c.execute("SELECT price FROM cargos WHERE id = ?", (cargo_id,)).fetchone()[0]
    assert price == 120000, f"PATCH с negative не должен менять цену, стало {price}"


# ─── P10-P12: отказ не оставляет следов ───

def test_p10_p11_p12_rejected_create_leaves_no_side_effects():
    _as()
    cargos_before = _cargo_count()
    notif_before = _notif_count()

    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=-999))
    assert r.status_code == 422, r.text

    assert _cargo_count() == cargos_before, "P10: отклонённый запрос не должен создавать cargo"
    assert _notif_count() == notif_before, "P11/P12: отклонённый запрос не создаёт notification/матч-пуш"


# ─── P13: валидный create по-прежнему работает целиком ───

def test_p13_valid_create_unchanged():
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=333000, cargo_desc="Full valid"))
    assert r.status_code == 200, r.text
    cargo_id = r.json()["id"]
    with get_conn() as c:
        row = c.execute(
            "SELECT price, status, cargo_desc FROM cargos WHERE id = ?", (cargo_id,)
        ).fetchone()
    assert row["price"] == 333000
    assert row["status"] == "active"
    assert row["cargo_desc"] == "Full valid"


# ─── Trip-путь тоже закрыт ───

def test_trip_negative_price_rejected():
    _as()
    r = client.post("/api/v1/market/trips", json={
        "from_city": "Almaty", "to_city": "Moscow", "truck_type": "tent", "price": -50,
    })
    assert r.status_code == 422, r.text


def test_status_code_is_422_not_500_for_negative():
    """Явная фиксация §17: невалидная цена — клиентская 4xx, не серверная 5xx."""
    _as()
    r = client.post("/api/v1/market/cargos", json=_cargo_body(price=-1))
    assert 400 <= r.status_code < 500, r.text
    assert r.status_code == 422, r.text
