"""Подписка на разблокировку контактов (Google Play Billing) — контракт-тест.

Покрывает backend-контракт, на который опирается фронт (см.
src/screens/SubscriptionScreen.js, src/utils/subscription.js):
  - POST /payments/google/verify (MOCK-режим верификации, period_end ~ now+30d);
  - идемпотентность upsert по (provider, purchase_token) — Google шлёт один
    и тот же токен и на покупку, и на каждое RTDN-событие;
  - RTDN webhook: неизвестный токен игнорируется, мусорный конверт не роняет
    500, expired гасит подписку, cancelled фиксирует auto_renewing=false;
  - лимит бесплатных раскрытий contact_reveals (3/мес, повторный просмотр
    уже открытого контакта лимит не тратит, активная подписка = безлимит);
  - гейт контрагента в get_deal: выключенная монетизация — телефон отдаётся
    всегда (регресс на текущее прод-поведение), включённая + исчерпанный
    лимит — contact_locked:true без телефона;
  - GET /subscription/status: free-limit без подписки, limit=None с ней.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_payments.db python -m tests.test_payments_contract
Совместим с pytest.
"""
import base64
import contextvars
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_payments.db")
Path(TEST_DB).unlink(missing_ok=True)
os.environ.setdefault("URTRUCK_ENV", "test")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

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


# Патчим ДО импорта api.payments/api.marketplace — оба делают
# `from api.verification_gate import require_level` на уровне модуля.
verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient

import config
from database import db as ddb
from database import registration_dal as reg_dal
from database import subscription_dal as sub_dal
from database.db import get_conn, new_id
from services import google_play_service

ddb.init_db()
reg_dal.init_registration_schema()
sub_dal.init_payments_schema()

import api.marketplace as marketplace

marketplace._init()

from api.marketplace import mp_router
from api.payments import payments_router

app = FastAPI()
app.include_router(payments_router, prefix="/api/v1/payments")
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

PRODUCT_ID = config.GOOGLE_PLAY_CONTACTS_PRODUCT_ID


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def _rtdn(product_id: str, token: str, notif_type: int = 4) -> dict:
    """Pub/Sub push-конверт с RTDN (как шлёт Google Cloud Pub/Sub)."""
    payload = {
        "subscriptionNotification": {
            "version": "1.0",
            "notificationType": notif_type,
            "purchaseToken": token,
            "subscriptionId": product_id,
        }
    }
    data = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return {"message": {"data": data}, "subscription": "projects/x/subscriptions/y"}


def _future(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _past(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _seed_deal(shipper: str, driver: str, driver_phone: str = None) -> str:
    """Минимальный cargo + deal + водитель с реальным телефоном (контрагент)."""
    if driver_phone is None:
        # drivers_registration.phone UNIQUE — телефон должен быть уникален
        # между сидами, иначе INSERT OR IGNORE молча пропустит водителя.
        driver_phone = "+7701" + driver[-6:].rjust(6, "0")
    cargo_id, bid_id, deal_id = new_id(), new_id(), new_id()
    with get_conn() as c:
        c.execute(
            "INSERT OR IGNORE INTO drivers_registration (id, phone, full_name, verification_level, role) "
            "VALUES (?,?,?,?,?)",
            (driver, driver_phone, "Водитель Тест", 1, "driver"),
        )
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, shipper, "+77075554433", "Грузовладелец Тест", "Almaty", "Astana",
             "Test cargo", "tent", 3000, 0, "taken"),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, bid_id, shipper, driver, "Almaty", "Astana", 3000, "accepted"),
        )
    return deal_id


# ---------------------------------------------------------------- verify
def test_verify_mock_mode_activates_subscription_for_30_days():
    """GOOGLE_PLAY_SERVICE_ACCOUNT_JSON не задан в тесте → MOCK-режим:
    любая покупка принимается активной на 30 дней."""
    assert not (config.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or "").strip()
    uid = "pay-user-verify"
    as_user(uid)
    token = "tok-verify-" + new_id()
    r = client.post(
        "/api/v1/payments/google/verify",
        json={"product_id": PRODUCT_ID, "purchase_token": token},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active"] is True

    sub = sub_dal.get_subscription_by_token("google_play", token)
    assert sub is not None and sub["user_id"] == uid
    assert sub["status"] == "active"
    period_end = datetime.fromisoformat(sub["period_end"])
    delta = period_end - datetime.now(timezone.utc)
    assert timedelta(days=29) < delta < timedelta(days=31), f"period_end не ~+30д: {sub['period_end']}"


def test_verify_same_token_twice_updates_single_row():
    """Идемпотентность: дважды один purchase_token → ровно одна строка,
    второй вызов обновляет period_end/updated_at того же id."""
    uid = "pay-user-idem"
    as_user(uid)
    token = "tok-idem-" + new_id()

    calls = iter([
        {"status": "active", "auto_renewing": True, "period_start": None, "period_end": _future(30), "raw": {"n": 1}},
        {"status": "active", "auto_renewing": True, "period_start": None, "period_end": _future(60), "raw": {"n": 2}},
    ])
    original = google_play_service.verify_purchase
    google_play_service.verify_purchase = lambda _p, _t: next(calls)
    try:
        r1 = client.post("/api/v1/payments/google/verify", json={"product_id": PRODUCT_ID, "purchase_token": token})
        r2 = client.post("/api/v1/payments/google/verify", json={"product_id": PRODUCT_ID, "purchase_token": token})
    finally:
        google_play_service.verify_purchase = original
    assert r1.status_code == 200 and r2.status_code == 200

    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM subscriptions WHERE provider = ? AND purchase_token = ?",
            ("google_play", token),
        ).fetchall()
    assert len(rows) == 1, f"ожидалась ровно 1 строка, получено {len(rows)}"
    row = dict(rows[0])
    assert row["id"] == sub_dal.get_subscription_by_token("google_play", token)["id"]
    assert row["user_id"] == uid
    # второй вызов обновил period_end той же строки (второй fake давал +60д)
    assert datetime.fromisoformat(row["period_end"]) > datetime.now(timezone.utc) + timedelta(days=45)


# ---------------------------------------------------------------- RTDN
def test_rtdn_unknown_token_is_acknowledged_without_row():
    """RTDN о подписке, которую мы не видели через /verify — ack 200,
    строку не создаём (ждём подтверждения от клиента)."""
    token = "tok-unknown-" + new_id()
    r = client.post("/api/v1/payments/google/rtdn", json=_rtdn(PRODUCT_ID, token))
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert sub_dal.get_subscription_by_token("google_play", token) is None


def _seed_verified_subscription(uid: str, token: str) -> None:
    as_user(uid)
    r = client.post(
        "/api/v1/payments/google/verify",
        json={"product_id": PRODUCT_ID, "purchase_token": token},
    )
    assert r.status_code == 200


def test_rtdn_expired_deactivates_subscription():
    uid = "pay-user-expired"
    token = "tok-expired-" + new_id()
    _seed_verified_subscription(uid, token)

    original = google_play_service.verify_purchase
    google_play_service.verify_purchase = lambda _p, _t: {
        "status": "expired", "auto_renewing": False,
        "period_start": _past(31), "period_end": _past(1), "raw": {"mock": "expired"},
    }
    try:
        r = client.post("/api/v1/payments/google/rtdn", json=_rtdn(PRODUCT_ID, token, notif_type=13))
    finally:
        google_play_service.verify_purchase = original
    assert r.status_code == 200 and r.json() == {"ok": True}

    as_user(uid)
    r = client.get("/api/v1/payments/subscription/status")
    assert r.status_code == 200
    assert r.json()["active"] is False, "после RTDN expired подписка должна стать неактивной"


def test_rtdn_cancelled_stores_auto_renewing_false():
    uid = "pay-user-cancelled"
    token = "tok-cancelled-" + new_id()
    _seed_verified_subscription(uid, token)

    original = google_play_service.verify_purchase
    google_play_service.verify_purchase = lambda _p, _t: {
        "status": "cancelled", "auto_renewing": False,
        "period_start": _past(25), "period_end": _future(5), "raw": {"mock": "cancelled"},
    }
    try:
        r = client.post("/api/v1/payments/google/rtdn", json=_rtdn(PRODUCT_ID, token, notif_type=3))
    finally:
        google_play_service.verify_purchase = original
    assert r.status_code == 200 and r.json() == {"ok": True}

    sub = sub_dal.get_subscription_by_token("google_play", token)
    assert sub["status"] == "cancelled"
    assert int(sub["auto_renewing"]) == 0


def test_rtdn_garbage_body_does_not_raise():
    """Конверт без message.data / битый base64 → 200 без исключения."""
    r = client.post("/api/v1/payments/google/rtdn", json={"message": {}})
    assert r.status_code == 200 and r.json() == {"ok": True}

    r = client.post("/api/v1/payments/google/rtdn", json={"message": {"data": "!!!not-valid-base64!!!"}})
    assert r.status_code == 200 and r.json() == {"ok": True}

    r = client.post("/api/v1/payments/google/rtdn", json={"message": {"data": base64.b64encode(b"not json").decode()}})
    assert r.status_code == 200 and r.json() == {"ok": True}


# ------------------------------------------------------- reveal limit
def test_can_reveal_contact_limit_and_subscription_unlimited():
    old_enabled, old_free = config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT
    config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT = True, 3
    try:
        uid = "pay-user-limit"

        deals = ["deal-l1", "deal-l2", "deal-l3", "deal-l4"]
        for d in deals[:3]:
            gate = sub_dal.can_reveal_contact(uid, d)
            assert gate["allowed"] is True, f"раскрытие {d} должно быть разрешено"
            sub_dal.record_reveal(uid, d)

        fourth = sub_dal.can_reveal_contact(uid, deals[3])
        assert fourth["allowed"] is False
        assert fourth["used"] == 3 and fourth["limit"] == 3

        # повторный просмотр уже открытого контакта лимит не тратит
        again = sub_dal.can_reveal_contact(uid, deals[0])
        assert again["allowed"] is True
        assert sub_dal.count_reveals_this_period(uid) == 3

        # активная подписка → безлимит
        sub_dal.upsert_subscription(
            uid, provider="google_play", product_id=PRODUCT_ID,
            purchase_token="tok-limit-" + new_id(), status="active", auto_renewing=True,
            period_start=datetime.now(timezone.utc).isoformat(), period_end=_future(30),
        )
        gate = sub_dal.can_reveal_contact(uid, deals[3])
        assert gate["allowed"] is True and gate["unlimited"] is True
    finally:
        config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT = old_enabled, old_free


# ------------------------------------------------------- get_deal gate
def _set_monetization(enabled: bool, free_limit: int = 3):
    """Меняет config и возвращает предыдущие значения (try/finally в тесте)."""
    old = (config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT)
    config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT = enabled, free_limit
    return old


def test_get_deal_contact_gate_disabled_monetization_regression():
    """Регресс на текущее прод-поведение: монетизация выключена → телефон
    контрагента отдаётся участнику сделки без всякого гейта."""
    old = _set_monetization(False)
    try:
        shipper, driver = "pay-shipper-off", "pay-driver-off"
        deal_id = _seed_deal(shipper, driver)

        as_user(shipper)
        r = client.get(f"/api/v1/market/deals/{deal_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("counterparty_phone"), "телефон контрагента должен отдаваться без гейта"
        assert "contact_locked" not in body
    finally:
        config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT = old


def test_get_deal_contact_gate_locked_when_limit_exhausted():
    old = _set_monetization(True)
    try:
        shipper, driver = "pay-shipper-on", "pay-driver-on"
        deal_id = _seed_deal(shipper, driver)

        # исчерпываем бесплатный лимит другими сделками
        for i in range(3):
            sub_dal.record_reveal(shipper, f"pay-other-deal-{i}")

        as_user(shipper)
        r = client.get(f"/api/v1/market/deals/{deal_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("contact_locked") is True
        assert "counterparty_phone" not in body
        assert body.get("contacts_used_this_period") == 3
        assert body.get("contacts_limit") == 3
    finally:
        config.CONTACTS_MONETIZATION_ENABLED, config.FREE_CONTACT_LIMIT = old


# ------------------------------------------------------- status
def test_subscription_status_free_user_has_free_limit():
    uid = "pay-user-status-free"
    as_user(uid)
    r = client.get("/api/v1/payments/subscription/status")
    assert r.status_code == 200
    body = r.json()
    assert body["active"] is False
    assert body["contacts_limit"] == config.FREE_CONTACT_LIMIT


def test_subscription_status_active_subscription_is_unlimited():
    uid = "pay-user-status-pro"
    sub_dal.upsert_subscription(
        uid, provider="google_play", product_id=PRODUCT_ID,
        purchase_token="tok-status-" + new_id(), status="active", auto_renewing=True,
        period_start=datetime.now(timezone.utc).isoformat(), period_end=_future(30),
    )
    as_user(uid)
    r = client.get("/api/v1/payments/subscription/status")
    assert r.status_code == 200
    body = r.json()
    assert body["active"] is True
    assert body["contacts_limit"] is None, "подписчик с PREMIUM_CONTACT_LIMIT=0 — безлимит"
    assert body["auto_renewing"] is True


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  ok: {fn.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL: {fn.__name__}")
            traceback.print_exc()
    print(f"\n{'All passed' if not failed else str(failed) + ' FAILED'} ({len(tests)} tests)")
    sys.exit(1 if failed else 0)
