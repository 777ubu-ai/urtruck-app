import uuid
import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from api.push import push_router
from api import notifications
from database import registration_dal as reg
from database.db import get_conn
from services import push_gateway as gateway
from services.onesignal_transport import APP_ID, OneSignalTransport

SUB = "2baf4778-511e-4a9d-a791-8b278c196e55"

def identity():
    guest = reg.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    return uid, {"Authorization": "Bearer " + reg.create_session(uid)}

@pytest.fixture
def pilot(monkeypatch):
    for name, value in {"URTRUCK_ENV": "qa2", "URTRUCK_PUSH_PROVIDER": "onesignal", "ONESIGNAL_QA2_APP_ID": APP_ID, "ONESIGNAL_QA2_API_KEY": "unit-test-only"}.items():
        monkeypatch.setenv(name, value)
    app = FastAPI(); app.include_router(push_router, prefix="/push")
    return TestClient(app)

def registration(token, device):
    return {"token": token, "device_id": device, "provider": "fcm", "platform": "android", "app_id": "com.urtruck.app.qa2", "onesignal_subscription_id": SUB, "onesignal_user_id": SUB}

def provider_record(token, **overrides):
    return {"id": SUB, "app_id": APP_ID, "type": "AndroidPush", "token": token, "enabled": True, "notification_types": 1, **overrides}

def mock_verification(monkeypatch, record):
    monkeypatch.setattr(OneSignalTransport, "_get_ipv4", staticmethod(lambda *a, **k: httpx.Response(200, json={"subscriptions": [record]})))

def test_verified_registration_one_transport_and_no_fallback(pilot, monkeypatch):
    uid, auth = identity(); token = "fcm-" + uuid.uuid4().hex; device = uuid.uuid4().hex
    mock_verification(monkeypatch, provider_record(token))
    response = pilot.post("/push/register-native", json=registration(token, device), headers=auth)
    assert response.status_code == 200, response.text
    row = gateway.active_devices(uid)[0]; assert row["onesignal_subscription_id"] == SUB
    calls = []
    monkeypatch.setattr(OneSignalTransport, "_post_ipv4", staticmethod(lambda *a, **k: calls.append(k["json"]) or httpx.Response(503)))
    monkeypatch.setattr(gateway.FCMProvider, "send", lambda *a, **k: pytest.fail("direct FCM fallback"))
    result = gateway.send_to_devices(user_id=uid, title="T", body="B", data={"event_id": "e-"+device}, badge=3, mode="native")
    assert result["sent"] == 0 and result["retryable"] is True
    assert len(calls) == 1 and calls[0]["data"]["badge"] == 3
    monkeypatch.delenv("ONESIGNAL_QA2_API_KEY")
    result = gateway.send_to_devices(user_id=uid, title="T", body="B", data={"event_id": "e2-"+device}, badge=0, mode="native")
    assert result["errors"].get("onesignal_not_configured") == 1
    assert len(calls) == 1

def test_registration_mismatch_and_ownership_cannot_reassign(pilot, monkeypatch):
    uid, auth = identity(); token = "fcm-" + uuid.uuid4().hex; device = uuid.uuid4().hex
    mock_verification(monkeypatch, {**provider_record(token), "token": "wrong"})
    assert pilot.post("/push/register-native", json=registration(token, device), headers=auth).status_code == 400
    assert not gateway.active_devices(uid)
    mock_verification(monkeypatch, provider_record(token))
    assert pilot.post("/push/register-native", json=registration(token, device), headers=auth).status_code == 200
    other, other_auth = identity()
    assert pilot.post("/push/register-native", json=registration(token, uuid.uuid4().hex), headers=other_auth).status_code == 409
    assert not gateway.active_devices(other)
    assert gateway.active_devices(uid)[0]["push_token"] == token

def test_confirmed_read_is_owned_and_suppresses_delivery(monkeypatch):
    uid, _ = identity(); other, _ = identity(); event = "notif-" + uuid.uuid4().hex
    with get_conn() as c:
        cur = c.execute("INSERT INTO notifications(user_id,type,title,body,url,event_key) VALUES (?,?,?,?,?,?)", (uid,"reminder","T","B","/notifications",event))
        nid = cur.lastrowid
    with pytest.raises(HTTPException) as failure:
        notifications.mark_read(nid, user={"id": other})
    assert failure.value.status_code == 404
    confirmation = notifications.mark_read(nid, user={"id": uid})
    assert confirmation["read_ids"] == [nid] and confirmation["read_event_keys"] == [event]
    monkeypatch.setattr(gateway, "active_devices", lambda *_: pytest.fail("read event must stop before transport"))
    result = gateway.send_to_devices(user_id=uid,title="T",body="B",data={"notification_id": nid},badge=0,mode="native")
    assert result["suppressed_read"] is True
    assert not gateway.notification_already_read(other, {"notification_id": nid})

def test_read_all_confirms_only_owner_and_snapshot():
    uid, _ = identity(); other, _ = identity()
    def add(owner):
        with get_conn() as c:
            return c.execute("INSERT INTO notifications(user_id,type,title,body,url) VALUES (?,?,?,?,?)",(owner,"reminder","T","B","/notifications")).lastrowid
    own = add(uid); foreign = add(other)
    result = notifications.mark_all_read(user={"id": uid})
    assert own in result["read_ids"] and foreign not in result["read_ids"]
    newer = add(uid)
    with get_conn() as c:
        assert c.execute("SELECT is_read FROM notifications WHERE id=?",(newer,)).fetchone()[0] == 0
        assert c.execute("SELECT is_read FROM notifications WHERE id=?",(foreign,)).fetchone()[0] == 0


def test_outbox_read_retry_is_terminal_without_network(monkeypatch):
    uid, _ = identity(); event = "read-retry-" + uuid.uuid4().hex
    with get_conn() as c:
        cutoff = c.execute("SELECT COALESCE(MAX(id),0) FROM push_outbox").fetchone()[0]
        nid = c.execute("INSERT INTO notifications(user_id,type,title,body,url,is_read) VALUES (?,?,?,?,?,1)",(uid,"reminder","T","B","/notifications")).lastrowid
    monkeypatch.setenv("PUSH_OUTBOX_CUTOFF_ID", str(cutoff))
    gateway.enqueue_event(event,"reminder",uid,{"title":"T","body":"B","data":{"notification_id":nid}})
    monkeypatch.setattr(gateway,"send_to_devices",lambda *a,**k: pytest.fail("already read retry contacted provider"))
    result = gateway.process_pending_once()
    assert result["skipped"] == 1
    with get_conn() as c:
        row = c.execute("SELECT status,locked_by FROM push_outbox WHERE event_id=?",(event,)).fetchone()
        assert row["status"] == "skipped_read" and row["locked_by"] is None
    assert gateway.process_pending_once()["picked"] == 0


def test_legacy_api_commits_event_before_starting_daemon(monkeypatch):
    import api.push as push_api
    uid, _ = identity(); event = "durable-" + uuid.uuid4().hex
    class Thread:
        def __init__(self, **kwargs): pass
        def start(self):
            with get_conn() as c:
                row = c.execute("SELECT event_id FROM push_outbox WHERE event_id=? AND recipient_user_id=?",(event,uid)).fetchone()
                assert row is not None
    monkeypatch.setattr(push_api.threading,"Thread",Thread)
    assert push_api.send_to_user(uid,"T","B",data={"event_id":event,"type":"reminder"}) == 0
