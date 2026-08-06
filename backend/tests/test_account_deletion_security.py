"""Account-deletion security regression suite.

Covers the complete lifecycle required by App Store Guideline 5.1.1(v):
PII anonymisation, session revocation, push deactivation, isolation, idempotency,
and safe token reuse by a different account after deletion.
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_account_deletion.db")
Path(TEST_DB).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal as reg_dal
from database.db import get_conn

ddb.init_db()
reg_dal.init_registration_schema()

from api.registration import reg_router
from api.push import push_router
from services import push_sender

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/registration")
app.include_router(push_router, prefix="/api/v1/push")
client = TestClient(app)


def _driver_columns():
    with get_conn() as c:
        return {row["name"] for row in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}


def _new_user(*, name="Delete Me", phone=None):
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    reg_dal.upgrade_level(uid, 1, role="client")
    candidates = {
        "full_name": name,
        "phone": phone or f"+7700{uid.replace('-', '')[:7]}",
        "email": f"{uid[:8]}@example.com",
        "city": "Almaty",
        "about": "private profile",
    }
    columns = _driver_columns()
    reg_dal.update_driver(uid, {key: value for key, value in candidates.items() if key in columns})
    return uid, reg_dal.create_session(uid)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _delete(token, method="delete"):
    if method == "post":
        return client.post("/api/v1/registration/account/delete", headers=_auth(token))
    return client.delete("/api/v1/registration/account", headers=_auth(token))


def _register_push(token, suffix):
    native = f"ExponentPushToken[account-delete-{suffix}]"
    endpoint = f"https://fcm.googleapis.com/fcm/send/account-delete-{suffix}"
    r1 = client.post("/api/v1/push/register-native", json={
        "token": native, "device_id": f"device-{suffix}",
    }, headers=_auth(token))
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint,
        "keys": {"p256dh": "p", "auth": "a"},
        "device_id": f"device-{suffix}",
    }, headers=_auth(token))
    assert r2.status_code == 200, r2.text
    return native, endpoint


def test_delete_requires_authentication():
    r = client.delete("/api/v1/registration/account")
    assert r.status_code == 401


def test_delete_endpoint_returns_success():
    _, token = _new_user(name="Delete success")
    r = _delete(token)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "deleted": True}


def test_post_alias_deletes_account():
    uid, token = _new_user(name="Delete alias")
    r = _delete(token, method="post")
    assert r.status_code == 200, r.text
    assert reg_dal.get_driver(uid)["status"] == "deleted"


def test_delete_anonymizes_personal_data_but_keeps_row():
    uid, token = _new_user(name="Private Person")
    _delete(token)
    row = reg_dal.get_driver(uid)
    columns = _driver_columns()
    assert row is not None, "row must remain to preserve FK history"
    for field in ("full_name", "email", "city", "about"):
        if field in columns:
            assert row[field] is None
    assert str(row["phone"]).startswith("deleted_")
    assert row["status"] == "deleted"
    assert row["role"] == "deleted"
    assert row["verification_level"] == 0


def test_delete_revokes_all_sessions_for_user():
    uid, token1 = _new_user(name="Two sessions")
    token2 = reg_dal.create_session(uid)
    _delete(token1)
    assert reg_dal.get_driver_by_token(token1) is None
    assert reg_dal.get_driver_by_token(token2) is None


def test_old_token_cannot_access_me_after_delete():
    _, token = _new_user(name="Old token")
    _delete(token)
    r = client.get("/api/v1/registration/me", headers=_auth(token))
    assert r.status_code == 401


def test_delete_deactivates_native_and_web_push():
    uid, token = _new_user(name="Push cleanup")
    _register_push(token, "both")
    assert len(push_sender._native_tokens(uid)) == 1
    assert len(push_sender._web_subs(uid)) == 1
    _delete(token)
    assert push_sender._native_tokens(uid) == []
    assert push_sender._web_subs(uid) == []


def test_delete_does_not_affect_other_user():
    uid_a, token_a = _new_user(name="Delete A")
    uid_b, token_b = _new_user(name="Keep B")
    _register_push(token_a, "iso-a")
    _register_push(token_b, "iso-b")
    _delete(token_a)
    assert reg_dal.get_driver(uid_a)["status"] == "deleted"
    assert reg_dal.get_driver(uid_b)["status"] != "deleted"
    assert len(push_sender._native_tokens(uid_b)) == 1
    assert len(push_sender._web_subs(uid_b)) == 1
    assert reg_dal.get_driver_by_token(token_b) == uid_b


def test_delete_account_dal_is_idempotent():
    uid, _ = _new_user(name="Idempotent")
    assert reg_dal.delete_account(uid) is True
    assert reg_dal.delete_account(uid) is True
    row = reg_dal.get_driver(uid)
    assert row["status"] == "deleted"
    assert str(row["phone"]).startswith("deleted_")


def test_deactivated_native_token_can_be_rebound_safely():
    uid_a, token_a = _new_user(name="Old owner")
    native, _ = _register_push(token_a, "rebind")
    _delete(token_a)
    assert push_sender._native_tokens(uid_a) == []

    uid_b, token_b = _new_user(name="New owner")
    r = client.post("/api/v1/push/register-native", json={
        "token": native, "device_id": "device-rebind-new",
    }, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert push_sender._native_tokens(uid_a) == []
    assert [x["token"] for x in push_sender._native_tokens(uid_b)] == [native]
