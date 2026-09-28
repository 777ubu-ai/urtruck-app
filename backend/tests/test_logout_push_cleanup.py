"""Logout cleanup is soft-deactivation for native FCM/APNs rows."""
import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_logout_push.db")
from database import registration_dal as reg_dal
from database.db import get_conn
from services import push_sender

def test_logout_deactivates_all_native_devices_but_keeps_history():
    u = reg_dal.create_guest(); uid = u["id"] if isinstance(u, dict) else u
    with get_conn() as c:
        for provider, platform in (("fcm", "android"), ("apns", "ios")):
            c.execute("INSERT INTO push_devices (user_id,device_id,platform,push_provider,push_token,enabled) VALUES (?,?,?,?,?,1)",
                      (uid, provider, platform, provider, f"{provider}-logout-token", 1))
    push_sender.deactivate_user_push(uid, reason="logout")
    with get_conn() as c:
        rows = c.execute("SELECT enabled FROM push_devices WHERE user_id=?", (uid,)).fetchall()
        assert rows and all(r["enabled"] == 0 for r in rows)

def test_cleanup_is_idempotent():
    push_sender.deactivate_user_push("missing-user", reason="logout")
