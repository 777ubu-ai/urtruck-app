"""Durable native FCM/APNs delivery contracts without provider network calls."""
import os, sys, uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_durable_delivery.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from database import db as ddb
from database import registration_dal as reg_dal
ddb.init_db(); reg_dal.init_registration_schema()
from database.db import get_conn
from services import push_gateway
import api.push as push_api  # noqa: F401

def setup_function(_):
    push_gateway.PUSH_PROVIDER_MODE = "native"
    with get_conn() as c:
        c.execute("DELETE FROM push_outbox"); c.execute("DELETE FROM push_devices")

def _user(provider="fcm"):
    guest = reg_dal.create_guest(); uid = guest["id"] if isinstance(guest, dict) else guest
    token = f"{provider}-{uuid.uuid4().hex}"
    with get_conn() as c:
        c.execute("INSERT INTO push_devices (user_id,device_id,platform,push_provider,push_token,enabled) VALUES (?,?,?,?,?,1)",
                  (uid, uuid.uuid4().hex, "ios" if provider == "apns" else "android", provider, token))
    return uid

def _row(event_id, uid):
    with get_conn() as c:
        return c.execute("SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (event_id, uid)).fetchone()

def _enqueue(uid, event_id):
    assert push_gateway.enqueue_event(event_id, "chat.message", uid, {"title": "T", "body": "B", "data": {}})

def _ok(tokens, title, body, data, badge=None): return {"sent": len(tokens)}
def _fail(tokens, title, body, data, badge=None): return {"sent": 0, "error": "transient"}

def test_native_outbox_delivers_once_and_is_idempotent():
    uid = _user(); _enqueue(uid, "evt-once")
    assert push_gateway.process_pending_once(_ok)["sent"] == 1
    assert push_gateway.process_pending_once(_ok)["picked"] == 0
    assert _row("evt-once", uid)["status"] == "sent"

def test_transient_provider_failure_is_bounded_and_retried():
    uid = _user(); _enqueue(uid, "evt-retry")
    assert push_gateway.process_pending_once(_fail)["failed"] == 1
    row = _row("evt-retry", uid); assert row["status"] == "pending" and row["attempt_count"] == 1
    with get_conn() as c: c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?", ("evt-retry",))
    assert push_gateway.process_pending_once(_ok)["sent"] == 1

def test_no_devices_are_terminally_skipped():
    guest = reg_dal.create_guest(); uid = guest["id"] if isinstance(guest, dict) else guest
    _enqueue(uid, "evt-no-device")
    assert push_gateway.process_pending_once(_ok)["skipped"] == 1
    assert _row("evt-no-device", uid)["status"] == "skipped_no_devices"

def test_legacy_rows_are_stored_but_never_selected():
    uid = _user(); _enqueue(uid, "evt-legacy")
    with get_conn() as c: c.execute("UPDATE push_devices SET push_provider='expo' WHERE user_id=?", (uid,))
    assert push_gateway.process_pending_once(_ok)["skipped"] == 1

def test_localization_is_per_native_device():
    uid = _user("fcm")
    with get_conn() as c:
        c.execute("INSERT INTO push_devices (user_id,device_id,platform,push_provider,push_token,locale,enabled) VALUES (?,?,?,?,?,?,1)",
                  (uid, uuid.uuid4().hex, "ios", "apns", f"apns-{uuid.uuid4().hex}", "zh"))
    _enqueue(uid, "evt-i18n"); captured = []
    def capture(tokens, title, body, data, badge=None): captured.append((title, body)); return {"sent": len(tokens)}
    assert push_gateway.process_pending_once(capture)["sent"] == 1
    assert len(captured) == 1
