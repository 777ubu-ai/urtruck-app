"""SEC-002: commercial chat exists only inside an accepted deal."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_chat_deal_security.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import chat, marketplace
from api.chat import SUPPORT_ID, chat_router
from api.marketplace import mp_router
from database import db as ddb
from database import deal_room_dal
from database import registration_dal as reg_dal
from database.db import get_conn, new_id


ddb.init_db()
reg_dal.init_registration_schema()
marketplace._init()
chat._init()
deal_room_dal.init_deal_room_schema()

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_state():
    ddb.init_db()
    reg_dal.init_registration_schema()
    marketplace._init()
    chat._init()
    deal_room_dal.init_deal_room_schema()
    with get_conn() as c:
        for table in (
            "message_read_receipts", "message_attachments", "conversation_participants",
            "deal_events", "support_escalations", "chat_messages", "deals", "bids",
            "cargos", "trips", "chat_rooms", "reg_sessions", "drivers_registration",
        ):
            c.execute(f"DELETE FROM {table}")
    chat._ensure_special_users()


def _user(phone: str, role: str) -> tuple[str, str]:
    user = reg_dal.get_or_create_driver(phone)
    reg_dal.update_driver(user["id"], {"role": role, "verification_level": 1})
    return user["id"], reg_dal.create_session(user["id"])


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _pending_cargo_bid(owner_id: str, driver_id: str, suffix: str) -> tuple[str, str]:
    cargo_id = f"cargo-{suffix}"
    bid_id = f"bid-{suffix}"
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) "
            "VALUES (?,?, 'Алматы','Астана','SEC-002','active')",
            (cargo_id, owner_id),
        )
        c.execute(
            "INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES (?,?,?,?, 'pending')",
            (bid_id, cargo_id, driver_id, 1000),
        )
    return cargo_id, bid_id


def _accept(owner_token: str, bid_id: str) -> dict:
    response = client.post(
        f"/api/v1/market/bids/{bid_id}/accept", headers=_headers(owner_token),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _message_count(room_id: str | None = None) -> int:
    with get_conn() as c:
        if room_id:
            return c.execute(
                "SELECT COUNT(*) AS n FROM chat_messages WHERE room_id=?", (room_id,),
            ).fetchone()["n"]
        return c.execute("SELECT COUNT(*) AS n FROM chat_messages").fetchone()["n"]


def test_arbitrary_and_preaccept_recipient_cannot_create_room_or_message():
    owner_id, owner_token = _user("sec002-owner@example.invalid", "client")
    driver_id, _ = _user("sec002-driver@example.invalid", "driver")
    third_id, _ = _user("sec002-third@example.invalid", "driver")
    cargo_id, bid_id = _pending_cargo_bid(owner_id, driver_id, "preaccept")

    arbitrary = client.post(
        "/api/v1/chat/send", headers=_headers(owner_token),
        json={"to_user_id": third_id, "text": "contact theft"},
    )
    preaccept = client.post(
        "/api/v1/chat/send", headers=_headers(owner_token),
        json={"to_user_id": driver_id, "cargo_id": cargo_id, "text": "before accept"},
    )
    bid_chat = client.post(
        f"/api/v1/market/bids/{bid_id}/chat", headers=_headers(owner_token),
    )

    assert arbitrary.status_code == 403
    assert preaccept.status_code == 403
    assert bid_chat.status_code == 409
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM chat_rooms").fetchone()["n"] == 0
    assert _message_count() == 0


def test_legacy_orphan_room_is_quarantined_from_send_read_and_listing():
    actor_id, actor_token = _user("sec002-orphan-actor@example.invalid", "client")
    victim_id, _ = _user("sec002-orphan-victim@example.invalid", "driver")
    p1, p2 = sorted([actor_id, victim_id])
    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_rooms(id,participant_1,participant_2,cargo_id,deal_key) "
            "VALUES ('orphan-room',?,?, 'victim-cargo', ?)",
            (p1, p2, f"c:victim-cargo:{p1}:{p2}"),
        )

    assert client.post(
        "/api/v1/chat/send", headers=_headers(actor_token),
        json={"room_id": "orphan-room", "text": "orphan"},
    ).status_code == 403
    assert client.get(
        "/api/v1/chat/messages/orphan-room", headers=_headers(actor_token),
    ).status_code == 403
    listed = client.get("/api/v1/chat/rooms", headers=_headers(actor_token))
    assert listed.status_code == 200
    assert listed.json()["rooms"] == []
    assert _message_count("orphan-room") == 0


def test_accept_atomically_creates_exact_deal_room_and_legitimate_chat():
    owner_id, owner_token = _user("sec002-accepted-owner@example.invalid", "client")
    driver_id, driver_token = _user("sec002-accepted-driver@example.invalid", "driver")
    cargo_id, bid_id = _pending_cargo_bid(owner_id, driver_id, "accepted")

    accepted = _accept(owner_token, bid_id)
    room_id = accepted["chat_room_id"]
    with get_conn() as c:
        deal = dict(c.execute("SELECT * FROM deals WHERE id=?", (accepted["deal_id"],)).fetchone())
        room = dict(c.execute("SELECT * FROM chat_rooms WHERE id=?", (room_id,)).fetchone())
        bid = dict(c.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone())
    assert bid["status"] == "accepted"
    assert deal["status"] == "accepted" and deal["chat_room_id"] == room_id
    assert room["deal_key"] == f"d:{deal['id']}"
    assert {room["participant_1"], room["participant_2"]} == {owner_id, driver_id}
    assert (room["cargo_id"], room["trip_id"], room["bid_id"]) == (cargo_id, None, bid_id)

    driver_send = client.post(
        "/api/v1/chat/send", headers=_headers(driver_token),
        json={"room_id": room_id, "text": "accepted driver"},
    )
    owner_send = client.post(
        "/api/v1/chat/send", headers=_headers(owner_token),
        json={"room_id": room_id, "text": "accepted owner"},
    )
    assert driver_send.status_code == owner_send.status_code == 200
    messages = client.get(
        f"/api/v1/chat/messages/{room_id}", headers=_headers(owner_token),
    )
    assert messages.status_code == 200
    texts = [message["text"] for message in messages.json()["messages"]]
    assert "accepted driver" in texts and "accepted owner" in texts


def test_room_rejects_third_party_wrong_recipient_and_cross_context():
    owner_id, owner_token = _user("sec002-context-owner@example.invalid", "client")
    driver_id, driver_token = _user("sec002-context-driver@example.invalid", "driver")
    third_id, third_token = _user("sec002-context-third@example.invalid", "driver")
    cargo_id, bid_id = _pending_cargo_bid(owner_id, driver_id, "context")
    room_id = _accept(owner_token, bid_id)["chat_room_id"]
    before = _message_count(room_id)

    cases = [
        (third_token, {"room_id": room_id, "text": "third"}, 403),
        (driver_token, {"room_id": room_id, "to_user_id": third_id, "text": "wrong"}, 409),
        (driver_token, {"room_id": room_id, "cargo_id": "other-cargo", "text": "cross"}, 409),
        (driver_token, {"room_id": room_id, "trip_id": "other-trip", "text": "cross"}, 409),
    ]
    for token, payload, expected in cases:
        response = client.post("/api/v1/chat/send", headers=_headers(token), json=payload)
        assert response.status_code == expected, response.text
    assert client.get(
        f"/api/v1/chat/messages/{room_id}", headers=_headers(third_token),
    ).status_code == 403
    assert _message_count(room_id) == before


def test_inactive_deal_denies_new_send_but_keeps_participant_history():
    owner_id, owner_token = _user("sec002-inactive-owner@example.invalid", "client")
    driver_id, driver_token = _user("sec002-inactive-driver@example.invalid", "driver")
    _, bid_id = _pending_cargo_bid(owner_id, driver_id, "inactive")
    accepted = _accept(owner_token, bid_id)
    room_id = accepted["chat_room_id"]
    with get_conn() as c:
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (accepted["deal_id"],))
    before = _message_count(room_id)

    denied = client.post(
        "/api/v1/chat/send", headers=_headers(driver_token),
        json={"room_id": room_id, "text": "after cancellation"},
    )
    assert denied.status_code == 403
    assert _message_count(room_id) == before
    assert client.get(
        f"/api/v1/chat/messages/{room_id}", headers=_headers(owner_token),
    ).status_code == 200


def test_support_is_exact_separate_allowlist_context():
    user_id, token = _user("sec002-support-user@example.invalid", "client")
    other_support_id, _ = _user("sec002-role-support@example.invalid", "support")

    arbitrary_support_role = client.post(
        "/api/v1/chat/send", headers=_headers(token),
        json={"to_user_id": other_support_id, "text": "not allowlisted"},
    )
    mixed_context = client.post(
        "/api/v1/chat/send", headers=_headers(token),
        json={"to_user_id": SUPPORT_ID, "cargo_id": "cargo-x", "text": "mixed"},
    )
    valid = client.post(
        "/api/v1/chat/send", headers=_headers(token),
        json={"to_user_id": SUPPORT_ID, "text": "help"},
    )

    assert arbitrary_support_role.status_code == 403
    assert mixed_context.status_code == 409
    assert valid.status_code == 200
    room_id = valid.json()["room_id"]
    with get_conn() as c:
        room = dict(c.execute("SELECT * FROM chat_rooms WHERE id=?", (room_id,)).fetchone())
        assert c.execute("SELECT COUNT(*) AS n FROM deals WHERE chat_room_id=?", (room_id,)).fetchone()["n"] == 0
    assert {room["participant_1"], room["participant_2"]} == {user_id, SUPPORT_ID}
    assert room["deal_key"].startswith("p:")
    assert all(room[field] is None for field in ("cargo_id", "trip_id", "bid_id", "owner_id", "bidder_id"))


def test_same_pair_second_deal_gets_distinct_room():
    owner_id, owner_token = _user("sec002-repeat-owner@example.invalid", "client")
    driver_id, _ = _user("sec002-repeat-driver@example.invalid", "driver")
    cargo_a, bid_a = _pending_cargo_bid(owner_id, driver_id, "repeat-a")
    first = _accept(owner_token, bid_a)
    with get_conn() as c:
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (first["deal_id"],))
    cargo_b, bid_b = _pending_cargo_bid(owner_id, driver_id, "repeat-b")
    second = _accept(owner_token, bid_b)

    assert cargo_a != cargo_b
    assert first["deal_id"] != second["deal_id"]
    assert first["chat_room_id"] != second["chat_room_id"]
