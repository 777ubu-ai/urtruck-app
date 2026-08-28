"""Регрессия для двух фиксов предрелизного аудита (28.08.2026).

1. self_bid_forbidden — владелец груза / водитель рейса не может ставить
   ставку на собственный листинг (иначе проходит всю FSM сделки один).
2. telegram webhook fail-closed — активный бот на проде без секрета
   отклоняет подпись (OTP-oracle закрыт).

CI-контракт: top-level `def test_*` (не класс) — иначе CI гоняет файл как
скрипт без conftest и падает импорт api.chat. Схему БД поднимает conftest.
"""
import uuid

import contextvars
from api import verification_gate

_cu = contextvars.ContextVar("u", default=None)


def _fake_require_level(_min):
    from fastapi import HTTPException

    def dep():
        u = _cu.get()
        if not u:
            raise HTTPException(status_code=401)
        return u

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.marketplace import mp_router
from database.db import get_conn, new_id

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def _as(uid):
    _cu.set({"id": uid, "full_name": uid, "phone": "+700", "verification_level": 1})


def _seed_cargo(owner):
    cid = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cid, owner, "+700", "O", "Almaty", "Moscow", "KZ", "RU", "c", "tent", 1000, 0, "active"),
        )
    return cid


def _seed_trip(driver):
    tid = new_id()
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(trips)").fetchall()}
        base = {"id": tid, "driver_id": driver, "from_city": "Almaty",
                "to_city": "Moscow", "status": "active"}
        keys = [k for k in base if k in cols]
        c.execute(f"INSERT INTO trips ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                  [base[k] for k in keys])
    return tid


# ── self-bid ────────────────────────────────────────────

def test_owner_cannot_bid_own_cargo():
    owner = "own-" + uuid.uuid4().hex[:6]
    cid = _seed_cargo(owner)
    _as(owner)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cid, "amount": 900})
    assert r.status_code == 403, f"self-bid прошёл: {r.status_code} {r.text}"
    assert "self_bid" in r.text


def test_other_user_can_bid_cargo():
    owner = "own2-" + uuid.uuid4().hex[:6]
    cid = _seed_cargo(owner)
    _as("driver-" + uuid.uuid4().hex[:6])
    r = client.post("/api/v1/market/bids", json={"cargo_id": cid, "amount": 900})
    assert r.status_code == 200, f"чужая ставка отклонена: {r.status_code} {r.text}"


def test_driver_cannot_bid_own_trip():
    driver = "drv-" + uuid.uuid4().hex[:6]
    tid = _seed_trip(driver)
    _as(driver)
    r = client.post("/api/v1/market/bids", json={"trip_id": tid, "amount": 900})
    assert r.status_code == 403, f"self-bid на рейс прошёл: {r.status_code} {r.text}"


# ── telegram webhook fail-closed ────────────────────────

def _reload_tw():
    import importlib
    from api import telegram_webhook as tw
    importlib.reload(tw)
    return tw


def test_prod_active_bot_no_secret_fails_closed(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "1234:fake")
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    tw = _reload_tw()
    assert tw._verify_telegram_signature("") is False
    assert tw._verify_telegram_signature("anything") is False


def test_mock_bot_still_open(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)  # MOCK: нет токена
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    tw = _reload_tw()
    assert tw._verify_telegram_signature("") is True


def test_secret_set_still_enforced(monkeypatch):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "s3cr3t")
    tw = _reload_tw()
    assert tw._verify_telegram_signature("s3cr3t") is True
    assert tw._verify_telegram_signature("wrong") is False
    assert tw._verify_telegram_signature("") is False
