"""Native FCM/APNs token ownership and lifecycle contracts."""
import os, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_security.db")
from fastapi.testclient import TestClient
from main import app
from database import registration_dal as reg_dal
from database.db import get_conn
from services import push_sender

client = TestClient(app)

def _user():
    u = reg_dal.create_guest(); uid = u["id"] if isinstance(u, dict) else u
    return uid, reg_dal.create_session(uid)

def _auth(token): return {"Authorization": f"Bearer {token}"}

def test_fcm_registration_is_idempotent_and_native():
    uid, auth = _user(); token = "fcm-unit-token-123456"
    payload = {"token": token, "provider": "fcm", "platform": "android", "device_id": "d-1"}
    assert client.post("/api/v1/push/register-native", json=payload, headers=_auth(auth)).status_code == 200
    assert client.post("/api/v1/push/register-native", json=payload, headers=_auth(auth)).status_code == 200
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM push_tokens_native WHERE token=?", (token,)).fetchone()[0] == 1

def test_provider_must_match_platform_and_legacy_is_rejected():
    _, auth = _user()
    assert client.post("/api/v1/push/register-native", json={"token":"legacy-token-1234","provider":"expo","platform":"android","device_id":"d"}, headers=_auth(auth)).status_code == 400
    assert client.post("/api/v1/push/register-native", json={"token":"fcm-token-1234","provider":"fcm","platform":"ios","device_id":"d"}, headers=_auth(auth)).status_code == 400

def test_invalid_bearer_cannot_hijack_owned_token():
    _, auth = _user(); token = "fcm-owned-token-1234"
    payload = {"token": token, "provider": "fcm", "platform": "android", "device_id": "d-owner"}
    assert client.post("/api/v1/push/register-native", json=payload, headers=_auth(auth)).status_code == 200
    _, other = _user()
    assert client.post("/api/v1/push/register-native", json={**payload, "device_id":"d-other"}, headers=_auth(other)).status_code == 409

def test_logout_deactivates_native_devices():
    uid, auth = _user(); token = "fcm-logout-token-1234"
    assert client.post("/api/v1/push/register-native", json={"token":token,"provider":"fcm","platform":"android","device_id":"d"}, headers=_auth(auth)).status_code == 200
    push_sender.deactivate_user_push(uid)
    assert push_sender.native_token_diagnostics(uid)["count"] == 0
