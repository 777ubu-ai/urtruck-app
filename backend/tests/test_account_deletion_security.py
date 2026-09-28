"""Account deletion must revoke native push ownership without data leakage."""
from pathlib import Path
import os, sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_account_delete.db")
from fastapi.testclient import TestClient
from main import app
from database import registration_dal as reg_dal
from database.db import get_conn

client = TestClient(app)
def _user():
    u = reg_dal.create_guest(); uid = u["id"] if isinstance(u, dict) else u
    return uid, reg_dal.create_session(uid)
def _auth(t): return {"Authorization": f"Bearer {t}"}

def test_delete_deactivates_native_push_devices():
    uid, token = _user(); push = "fcm-delete-token-1234"
    assert client.post("/api/v1/push/register-native", json={"token":push,"provider":"fcm","platform":"android","device_id":"d"}, headers=_auth(token)).status_code == 200
    response = client.delete("/api/v1/registration/account", headers=_auth(token))
    assert response.status_code in (200, 204)
    with get_conn() as c:
        row = c.execute("SELECT enabled FROM push_devices WHERE push_token=?", (push,)).fetchone()
        assert row is None or row["enabled"] == 0

def test_old_session_cannot_read_after_delete():
    _, token = _user()
    client.delete("/api/v1/registration/account", headers=_auth(token))
    assert client.get("/api/v1/registration/me", headers=_auth(token)).status_code in (401, 403, 404)
