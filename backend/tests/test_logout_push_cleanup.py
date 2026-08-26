"""Блок 2 аудита (P1-3/P1-4): POST /push/logout-cleanup — при выходе из
аккаунта push (и web-, и native-) для текущего пользователя обязан
деактивироваться, иначе push, адресованный уже вышедшему пользователю,
продолжает приходить на устройство (утечка контента следующему
пользователю, если logout/login происходят на одном физическом телефоне).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_logout_push.db python -m tests.test_logout_push_cleanup
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_logout_push.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from api.registration import reg_router
from api.push import push_router
from services import push_sender

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(push_router, prefix="/api/v1/push")
client = TestClient(app)


def _new_user_token():
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = reg_dal.create_session(uid)
    return uid, token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_logout_cleanup_deactivates_both_web_and_native():
    uid, tok = _new_user_token()
    native_tok = "ExponentPushToken[unit-test-logout-both]"
    endpoint = "https://fcm.googleapis.com/fcm/send/unit-test-logout-both"

    client.post("/api/v1/push/register-native", json={"token": native_tok, "device_id": "d-lc-1"}, headers=_auth(tok))
    client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}, "device_id": "d-lc-1",
    }, headers=_auth(tok))

    assert len(push_sender._native_tokens(uid)) == 1
    assert len(push_sender._web_subs(uid)) == 1

    r = client.post("/api/v1/push/logout-cleanup", json={"device_id": "d-lc-1"}, headers=_auth(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["web"] == 1 and body["native"] == 1

    assert push_sender._native_tokens(uid) == []
    assert push_sender._web_subs(uid) == []


def test_logout_cleanup_requires_auth():
    r = client.post("/api/v1/push/logout-cleanup", json={})
    assert r.status_code == 401, f"без токена logout-cleanup обязан требовать auth: {r.status_code}"


def test_logout_cleanup_without_device_id_deactivates_all_devices():
    """Фронт может не знать device_id (старый клиент) — logout всё равно
    обязан деактивировать ВСЕ устройства текущего пользователя, не только
    одно."""
    uid, tok = _new_user_token()
    t1, t2 = "ExponentPushToken[unit-test-lc-multi-1]", "ExponentPushToken[unit-test-lc-multi-2]"
    client.post("/api/v1/push/register-native", json={"token": t1, "device_id": "d-lc-2a"}, headers=_auth(tok))
    client.post("/api/v1/push/register-native", json={"token": t2, "device_id": "d-lc-2b"}, headers=_auth(tok))
    assert len(push_sender._native_tokens(uid)) == 2

    r = client.post("/api/v1/push/logout-cleanup", json={}, headers=_auth(tok))
    assert r.status_code == 200, r.text
    assert push_sender._native_tokens(uid) == []


def test_logout_cleanup_does_not_affect_other_users():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    tok_native_a = "ExponentPushToken[unit-test-lc-iso-a]"
    tok_native_b = "ExponentPushToken[unit-test-lc-iso-b]"
    client.post("/api/v1/push/register-native", json={"token": tok_native_a, "device_id": "d-lc-3a"}, headers=_auth(tok_a))
    client.post("/api/v1/push/register-native", json={"token": tok_native_b, "device_id": "d-lc-3b"}, headers=_auth(tok_b))

    client.post("/api/v1/push/logout-cleanup", json={}, headers=_auth(tok_a))

    assert push_sender._native_tokens(uid_a) == [], "A должен быть деактивирован"
    assert len(push_sender._native_tokens(uid_b)) == 1, "B не должен пострадать от logout A"


def test_deactivate_user_push_helper_used_by_delete_account_path():
    """Прямая проверка backend-функции api.push.deactivate_user_push —
    используется и logout-cleanup эндпоинтом, и (в перспективе)
    delete_account-путём в registration.py."""
    import api.push as push_api
    uid, tok = _new_user_token()
    native_tok = "ExponentPushToken[unit-test-helper-direct]"
    client.post("/api/v1/push/register-native", json={"token": native_tok, "device_id": "d-h-1"}, headers=_auth(tok))
    result = push_api.deactivate_user_push(uid, reason="account_deleted")
    assert result["native"] == 1
    assert push_sender._native_tokens(uid) == []


def test_register_logout_server_side_deactivates_push_and_frees_same_device_for_next_user():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    device = "d-register-logout-switch-1"
    tok_native_a = "ExponentPushToken[unit-test-register-logout-a]"
    tok_native_b = "ExponentPushToken[unit-test-register-logout-b]"
    endpoint_a = "https://fcm.googleapis.com/fcm/send/unit-test-register-logout-a"

    r1 = client.post("/api/v1/push/register-native", json={"token": tok_native_a, "device_id": device}, headers=_auth(tok_a))
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint_a, "keys": {"p256dh": "p", "auth": "a"}, "device_id": device,
    }, headers=_auth(tok_a))
    assert r2.status_code == 200, r2.text
    assert len(push_sender._native_tokens(uid_a)) == 1
    assert len(push_sender._web_subs(uid_a)) == 1

    logout = client.post("/api/v1/register/logout", headers=_auth(tok_a))
    assert logout.status_code == 200, logout.text
    assert logout.json()["ok"] is True
    assert logout.json()["revoked"] is True
    assert push_sender._native_tokens(uid_a) == []
    assert push_sender._web_subs(uid_a) == []

    r3 = client.post("/api/v1/push/register-native", json={"token": tok_native_b, "device_id": device}, headers=_auth(tok_b))
    assert r3.status_code == 200, r3.text
    assert push_sender._native_tokens(uid_a) == []
    assert [t["token"] for t in push_sender._native_tokens(uid_b)] == [tok_native_b]

    from database.db import get_conn
    with get_conn() as c:
        old_row = c.execute("SELECT active, invalidated_reason FROM push_tokens_native WHERE token = ?", (tok_native_a,)).fetchone()
        new_row = c.execute("SELECT user_id, active FROM push_tokens_native WHERE token = ?", (tok_native_b,)).fetchone()
        old_web = c.execute("SELECT active, invalidated_reason FROM push_subscriptions WHERE endpoint = ?", (endpoint_a,)).fetchone()
    assert old_row["active"] == 0 and old_row["invalidated_reason"] == "logout"
    assert old_web["active"] == 0 and old_web["invalidated_reason"] == "logout"
    assert new_row["user_id"] == uid_b and new_row["active"] == 1


if __name__ == "__main__":
    fails = 0
    for fn in [test_logout_cleanup_deactivates_both_web_and_native,
               test_logout_cleanup_requires_auth,
               test_logout_cleanup_without_device_id_deactivates_all_devices,
               test_logout_cleanup_does_not_affect_other_users,
               test_deactivate_user_push_helper_used_by_delete_account_path,
               test_register_logout_server_side_deactivates_push_and_frees_same_device_for_next_user]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
