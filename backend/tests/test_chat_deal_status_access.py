"""Regression coverage for deal-chat access across the canonical deal FSM.

The deal workspace remains active through ``received`` (receipt confirmed) until
``completed``. Chat authorization must therefore allow the same accepted /
successful statuses while still blocking pre-accept/terminal failure states.
"""
import os
from pathlib import Path

import pytest
from fastapi import HTTPException

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_chat_deal_status.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent

from database import db as ddb
from database.db import get_conn, new_id

# chat._init() expects the registration schema to exist; deals are normally
# initialized by marketplace startup. Reproduce both production contracts in
# this isolated DB before importing the chat module.
ddb.init_db()
with get_conn() as c:
    for schema_name in ("registration_schema.sql", "deals_schema.sql"):
        c.executescript((ROOT / "database" / schema_name).read_text(encoding="utf-8"))

from api import chat

SHIPPER_ID = "chat-status-shipper"
DRIVER_ID = "chat-status-driver"
SHIPPER = {"id": SHIPPER_ID, "full_name": "Status Shipper", "phone": "+77000000001", "verification_level": 1}
DRIVER = {"id": DRIVER_ID, "full_name": "Status Driver", "phone": "+77000000002", "verification_level": 1}

ROOM_ID = chat.get_or_create_deal_room(None, SHIPPER_ID, DRIVER_ID, bid_id="chat-status-bid")
DEAL_ID = new_id()
with get_conn() as c:
    c.execute(
        "INSERT INTO deals (id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status, chat_room_id) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (DEAL_ID, "chat-status-bid", SHIPPER_ID, DRIVER_ID, "Guangzhou", "Astana", 9700, "accepted", ROOM_ID),
    )


def set_status(status: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, DEAL_ID))


def test_chat_gate_matches_working_and_successful_deal_fsm():
    allowed = (
        "accepted",
        "in_progress",
        "at_border",
        "awaiting_confirmation",  # legacy alias for delivered
        "delivered",
        "received",
        "completed",
    )
    for status in allowed:
        set_status(status)
        chat._assert_chat_is_accepted(SHIPPER_ID, DRIVER_ID, room_id=ROOM_ID)

    for status in ("cancelled", "rejected", "expired"):
        set_status(status)
        with pytest.raises(HTTPException) as exc:
            chat._assert_chat_is_accepted(SHIPPER_ID, DRIVER_ID, room_id=ROOM_ID)
        assert exc.value.status_code == 403


def test_received_room_is_listed_and_allows_send_and_read():
    set_status("received")

    rooms = chat.my_rooms(user=SHIPPER)["rooms"]
    assert any(room["id"] == ROOM_ID and room["deal_status"] == "received" for room in rooms)

    result = chat.send_message(
        chat.SendMessageIn(
            room_id=ROOM_ID,
            text="received-chat-regression",
            client_msg_id="received-chat-regression-1",
        ),
        user=SHIPPER,
    )
    assert result["ok"] is True
    assert result["room_id"] == ROOM_ID

    payload = chat.get_messages(ROOM_ID, user=DRIVER)
    assert any(message.get("text") == "received-chat-regression" for message in payload["messages"])


def test_cancelled_room_is_hidden_and_send_is_blocked():
    set_status("cancelled")
    rooms = chat.my_rooms(user=SHIPPER)["rooms"]
    assert all(room["id"] != ROOM_ID for room in rooms)

    with pytest.raises(HTTPException) as exc:
        chat.send_message(
            chat.SendMessageIn(room_id=ROOM_ID, text="must-not-send"),
            user=SHIPPER,
        )
    assert exc.value.status_code == 403
