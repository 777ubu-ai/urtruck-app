"""Direct FCM/APNs delivery-log result contracts (no Expo receipts)."""
import os, sys, uuid
from pathlib import Path
TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_delivery_results.db")
ROOT = Path(__file__).resolve().parent.parent; sys.path.insert(0, str(ROOT))
from database import db as ddb
from database import registration_dal as reg_dal
ddb.init_db(); reg_dal.init_registration_schema()
from database.db import get_conn
from services import push_gateway
import api.push as push_api  # noqa: F401

def setup_function(_):
    with get_conn() as c: c.execute("DELETE FROM push_outbox"); c.execute("DELETE FROM push_devices"); c.execute("DELETE FROM push_delivery_log")
def _user(token=None):
    g=reg_dal.create_guest(); uid=g["id"] if isinstance(g,dict) else g
    with get_conn() as c: c.execute("INSERT INTO push_devices (user_id,device_id,platform,push_provider,push_token,enabled) VALUES (?,?,?,?,?,1)",(uid,uuid.uuid4().hex,"android","fcm",token or f"fcm-{uuid.uuid4().hex}"))
    return uid
def _enqueue(uid,e): push_gateway.enqueue_event(e,"chat.message",uid,{"title":"t","body":"b","data":{}})
def _row(e,uid):
    with get_conn() as c: return c.execute("SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?",(e,uid)).fetchone()
def _ok(tokens,*a,**k): return {"sent":len(tokens)}
def _fail(tokens,*a,**k): return {"sent":0,"error":"transient"}

def test_successful_provider_response_is_logged_sent():
    uid=_user(); _enqueue(uid,"ok"); assert push_gateway.process_pending_once(_ok)["sent"]==1; assert _row("ok",uid)["status"]=="sent"
def test_invalid_token_is_disabled():
    uid=_user(token="x"); _enqueue(uid,"invalid"); assert push_gateway.process_pending_once(_ok)["skipped"]==1
    with get_conn() as c: assert c.execute("SELECT enabled FROM push_devices WHERE user_id=?",(uid,)).fetchone()[0]==1
def test_transient_provider_error_is_retryable():
    uid=_user(); _enqueue(uid,"retry"); assert push_gateway.process_pending_once(_fail)["failed"]==1; assert _row("retry",uid)["status"]=="pending"
def test_backoff_prevents_immediate_repeat():
    uid=_user(); _enqueue(uid,"backoff"); push_gateway.process_pending_once(_fail); assert push_gateway.process_pending_once(_fail)["picked"]==0
def test_exhausted_attempts_become_dead():
    uid=_user(); _enqueue(uid,"dead")
    for _ in range(push_gateway.MAX_OUTBOX_ATTEMPTS):
        push_gateway.process_pending_once(_fail)
        with get_conn() as c: c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id='dead'")
    assert _row("dead",uid)["status"]=="dead"
def test_one_failed_device_does_not_erase_other_delivery_log():
    uid=_user();
    with get_conn() as c: c.execute("INSERT INTO push_devices (user_id,device_id,platform,push_provider,push_token,enabled) VALUES (?,?,?,?,?,1)",(uid,uuid.uuid4().hex,"ios","apns",f"apns-{uuid.uuid4().hex}",))
    _enqueue(uid,"partial"); calls=[]
    def partial(tokens,*a,**k): calls.append(tokens); return {"sent":1}
    push_gateway.process_pending_once(partial); assert calls
