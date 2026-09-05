import contextvars
import os
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import verification_gate
from database import db as dbm, registration_dal
from database.db import get_conn, new_id

# Chat creates its support account during module import; initialize the same
# registration schema that the canonical backend test harness provides first.
dbm.init_db()
registration_dal.init_registration_schema()

from api.chat import chat_router
from api.marketplace import mp_router
from api import profile as profile_api

profile_api._ensure_columns()


_current_user = contextvars.ContextVar("kimi_user", default=None)


def _as(uid):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+700", "verification_level": 1})


app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
client = TestClient(app)


def test_real_http_idor_matrix_with_v2(monkeypatch):
    monkeypatch.setenv("DEALS_V2_ENABLED", "true")
    shipper = "kimi-ship-" + uuid.uuid4().hex[:8]
    driver = "kimi-driver-" + uuid.uuid4().hex[:8]
    stranger_driver = "kimi-driver-c-" + uuid.uuid4().hex[:8]
    stranger_shipper = "kimi-ship-d-" + uuid.uuid4().hex[:8]
    cargo = new_id()
    with get_conn() as conn:
        conn.execute("INSERT INTO cargos(id,owner_id,owner_phone,owner_name,from_city,to_city,cargo_desc,status) VALUES (?,?,?,?,?,?,?,?)", (cargo, shipper, "+700", shipper, "A", "B", "x", "active"))

    _as(driver)
    bid_response = client.post("/api/v1/market/bids", json={"cargo_id": cargo, "amount": 100})
    assert bid_response.status_code == 200, bid_response.text
    bid_id = bid_response.json().get("id") or bid_response.json().get("bid_id") or bid_response.json().get("bid", {}).get("id")
    assert bid_id
    _as(shipper)
    accepted = client.post(f"/api/v1/market/bids/{bid_id}/accept", headers={"Idempotency-Key": "kimi-http-accept-" + cargo})
    assert accepted.status_code == 200, accepted.text
    room_id = accepted.json()["chat_room_id"]

    monkeypatch.setenv("DEALS_V2_ENABLED", "false")
    _as(shipper)
    after_switch = client.get(f"/api/v1/chat/messages/{room_id}")
    assert after_switch.status_code == 200, after_switch.text
    with get_conn() as conn:
        assert conn.execute("SELECT COUNT(*) FROM deals WHERE id=?", (accepted.json()["deal_id"],)).fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM chat_rooms WHERE id=?", (room_id,)).fetchone()[0] == 1
    monkeypatch.setenv("DEALS_V2_ENABLED", "true")

    evidence = []
    for actor, expected in ((shipper, 200), (driver, 200), (stranger_driver, 403), (stranger_shipper, 403)):
        _as(actor)
        for method, url, kwargs in (
            ("get", f"/api/v1/chat/rooms", {}),
            ("get", f"/api/v1/chat/messages/{room_id}", {}),
            ("post", "/api/v1/chat/send", {"json": {"room_id": room_id, "text": "probe", "client_msg_id": f"probe-{actor}"}}),
        ):
            response = getattr(client, method)(url, **kwargs)
            evidence.append((method.upper(), url, actor, response.status_code))
            if url.endswith("/chat/rooms") and actor not in (shipper, driver):
                # The list endpoint is intentionally a filtered collection:
                # 200 is safe only when the private room is absent.
                body = response.json()
                assert room_id not in str(body), evidence[-1]
            elif actor in (shipper, driver):
                assert response.status_code == expected, evidence[-1]
            else:
                assert response.status_code in (403, 404), evidence[-1]
    assert len(evidence) == 12
