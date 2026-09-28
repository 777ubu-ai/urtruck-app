"""Anonymous callers cannot claim or deactivate an owned native token."""
import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_anon.db")
from fastapi.testclient import TestClient
from main import app
from database import registration_dal as reg_dal
from database.db import get_conn
client = TestClient(app)
def _auth():
    u = reg_dal.create_guest(); uid = u["id"] if isinstance(u, dict) else u
    return uid, reg_dal.create_session(uid)
def test_anonymous_cannot_reactivate_owned_native_token():
    uid, auth = _auth(); token = "fcm-owned-anon-token"
    payload={"token":token,"provider":"fcm","platform":"android","device_id":"d"}
    assert client.post("/api/v1/push/register-native",json=payload,headers={"Authorization":f"Bearer {auth}"}).status_code == 200
    with get_conn() as c: c.execute("UPDATE push_tokens_native SET active=0 WHERE token=?", (token,))
    assert client.post("/api/v1/push/register-native",json=payload).status_code in (401,403)
