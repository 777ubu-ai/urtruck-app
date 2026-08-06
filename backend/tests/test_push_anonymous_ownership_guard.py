"""Regression tests for anonymous mutation of owned push registrations.

An unauthenticated or invalidly authenticated caller may create/update a truly
anonymous push row, but must never modify an endpoint/token that already has a
user_id. Before the fix, COALESCE protected only user_id while attacker-supplied
keys/metadata and active=1 were still written.
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_anon_guard.db")
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

from api.push import push_router

app = FastAPI()
app.include_router(push_router, prefix="/api/v1/push")
client = TestClient(app)


def _new_user_token():
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    return uid, reg_dal.create_session(uid)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _web_row(endpoint):
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
    return dict(row) if row else None


def _native_row(token):
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_tokens_native WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def test_anonymous_cannot_mutate_owned_web_subscription():
    uid, auth = _new_user_token()
    endpoint = "https://push.example/owned-web-anon-guard"
    created = client.post("/api/v1/push/subscribe", headers=_auth(auth), json={
        "endpoint": endpoint,
        "keys": {"p256dh": "owner-p", "auth": "owner-a"},
        "device_id": "device-owned-web-guard",
        "platform": "web",
    })
    assert created.status_code == 200, created.text

    attacked = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint,
        "keys": {"p256dh": "attacker-p", "auth": "attacker-a"},
        "device_id": "device-attacker-web",
        "platform": "evil",
    })
    assert attacked.status_code == 409, attacked.text
    assert attacked.json()["detail"]["error"] == "TOKEN_OWNERSHIP_CONFLICT"

    row = _web_row(endpoint)
    assert row["user_id"] == uid
    assert row["p256dh"] == "owner-p"
    assert row["auth"] == "owner-a"
    assert row["device_id"] == "device-owned-web-guard"
    assert row["platform"] == "web"
    assert row["active"] == 1


def test_invalid_bearer_cannot_reactivate_owned_native_token():
    uid, auth = _new_user_token()
    token = "ExponentPushToken[owned-native-anon-guard]"
    created = client.post("/api/v1/push/register-native", headers=_auth(auth), json={
        "token": token,
        "provider": "expo",
        "platform": "ios",
        "device_name": "Owner iPhone",
        "device_id": "device-owned-native-guard",
    })
    assert created.status_code == 200, created.text

    with get_conn() as c:
        c.execute(
            "UPDATE push_tokens_native SET active=0, invalidated_reason='test-deactivated' WHERE token=?",
            (token,),
        )

    attacked = client.post("/api/v1/push/register-native", headers=_auth("invalid-session-token"), json={
        "token": token,
        "provider": "fcm",
        "platform": "android",
        "device_name": "Attacker Phone",
        "device_id": "device-attacker-native",
    })
    assert attacked.status_code == 409, attacked.text
    assert attacked.json()["detail"]["error"] == "TOKEN_OWNERSHIP_CONFLICT"

    row = _native_row(token)
    assert row["user_id"] == uid
    assert row["provider"] == "expo"
    assert row["platform"] == "ios"
    assert row["device_name"] == "Owner iPhone"
    assert row["device_id"] == "device-owned-native-guard"
    assert row["active"] == 0
    assert row["invalidated_reason"] == "test-deactivated"


def test_anonymous_can_update_truly_anonymous_web_row():
    endpoint = "https://push.example/truly-anonymous-row"
    first = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint,
        "keys": {"p256dh": "p1", "auth": "a1"},
    })
    assert first.status_code == 200, first.text
    second = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint,
        "keys": {"p256dh": "p2", "auth": "a2"},
    })
    assert second.status_code == 200, second.text
    row = _web_row(endpoint)
    assert row["user_id"] is None
    assert row["p256dh"] == "p2"
    assert row["auth"] == "a2"


def test_authenticated_owner_can_still_refresh_own_native_metadata():
    uid, auth = _new_user_token()
    token = "ExponentPushToken[owner-refresh-native]"
    first = client.post("/api/v1/push/register-native", headers=_auth(auth), json={
        "token": token,
        "provider": "expo",
        "platform": "ios",
        "device_name": "Old Name",
        "device_id": "device-owner-refresh",
    })
    assert first.status_code == 200, first.text
    second = client.post("/api/v1/push/register-native", headers=_auth(auth), json={
        "token": token,
        "provider": "expo",
        "platform": "ios",
        "device_name": "New Name",
        "device_id": "device-owner-refresh",
    })
    assert second.status_code == 200, second.text
    row = _native_row(token)
    assert row["user_id"] == uid
    assert row["device_name"] == "New Name"
