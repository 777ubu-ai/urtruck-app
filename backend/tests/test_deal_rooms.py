"""Variant B (14.06): канонические комнаты сделок (cargo + owner + bidder).

Проверяем инвариант и сквозную синхронизацию на уровне API-функций chat.py.
Самодостаточно: создаёт нужные таблицы/пользователей на активном DB_PATH,
использует уникальные id, чтобы не конфликтовать с другими тестами.
"""
import os
import uuid
from pathlib import Path

import pytest

# Изолированная БД + схема ДО импорта api.chat (его _init создаёт спец-юзеров и
# требует таблицу drivers_registration). Иначе падает на стадии импорта.
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_deal_rooms.db")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn
with get_conn() as _schema_conn:
    _schema_conn.executescript(
        (Path(__file__).resolve().parent.parent / "database" / "deals_schema.sql").read_text(encoding="utf-8")
    )
from api.chat import get_or_create_deal_room, send_message, get_messages, SendMessageIn
from fastapi import HTTPException


def _u(uid):
    return {"id": uid, "full_name": uid, "phone": "+7" + uid[:6]}


def _mk_users(*uids):
    with get_conn() as c:
        for u in uids:
            try:
                c.execute("INSERT INTO drivers_registration (id, full_name, phone) VALUES (?,?,?)",
                          (u, u, "+7" + u[:6]))
            except Exception:
                pass


def _accepted_room(cargo_id: str, owner_id: str, driver_id: str) -> str:
    deal_id = "deal_" + uuid.uuid4().hex[:10]
    room_id = "room_" + uuid.uuid4().hex[:10]
    bid_id = "bid_" + uuid.uuid4().hex[:10]
    p1, p2 = sorted([owner_id, driver_id])
    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_rooms(id,participant_1,participant_2,owner_id,bidder_id,bid_id,cargo_id,deal_key) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (room_id, p1, p2, owner_id, driver_id, bid_id, cargo_id, f"d:{deal_id}"),
        )
        c.execute(
            "INSERT INTO deals(id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) "
            "VALUES (?,?,?,?,?,'A','B',1,'accepted',?)",
            (deal_id, cargo_id, bid_id, owner_id, driver_id, room_id),
        )
    return room_id


def test_idempotent_same_cargo_owner_bidder():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    seeded = _accepted_room(cargo, o, d)
    r1 = get_or_create_deal_room(cargo, o, d)
    r2 = get_or_create_deal_room(cargo, d, o)  # порядок ролей не важен
    r3 = get_or_create_deal_room(cargo, o, d, bid_id="b1")  # повтор/дубль-ставка
    assert seeded == r1 == r2 == r3


def test_different_cargo_different_room():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    cargo_a = "cgA_" + uuid.uuid4().hex[:6]
    cargo_b = "cgB_" + uuid.uuid4().hex[:6]
    r_a = _accepted_room(cargo_a, o, d)
    r_b = _accepted_room(cargo_b, o, d)
    assert r_a != r_b


def test_message_sync_both_directions():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    room = _accepted_room(cargo, o, d)
    send_message(SendMessageIn(room_id=room, text="msg-driver"), user=_u(d))
    send_message(SendMessageIn(room_id=room, text="msg-owner"), user=_u(o))
    owner_view = [m["text"] for m in get_messages(room, user=_u(o))["messages"]]
    driver_view = [m["text"] for m in get_messages(room, user=_u(d))["messages"]]
    assert "msg-driver" in owner_view   # владелец видит сообщение водителя
    assert "msg-owner" in driver_view   # водитель видит ответ владельца
    assert owner_view == driver_view    # одна и та же история


def test_third_user_cannot_read_or_send():
    o, d, t = ("own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6], "thr_" + uuid.uuid4().hex[:6])
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d, t)
    room = _accepted_room(cargo, o, d)
    with pytest.raises(HTTPException) as e1:
        get_messages(room, user=_u(t))
    assert e1.value.status_code == 403
    with pytest.raises(HTTPException) as e2:
        send_message(SendMessageIn(room_id=room, text="hack"), user=_u(t))
    assert e2.value.status_code == 403


def test_recipient_must_match_verified_room():
    """Client-supplied recipient cannot override accepted-room context."""
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    room = _accepted_room(cargo, o, d)
    with pytest.raises(HTTPException) as exc:
        send_message(SendMessageIn(room_id=room, to_user_id="GARBAGE", text="hack"), user=_u(d))
    assert exc.value.status_code == 409
    send_message(SendMessageIn(room_id=room, text="hi"), user=_u(d))
    owner_view = [m["text"] for m in get_messages(room, user=_u(o))["messages"]]
    assert "hi" in owner_view
