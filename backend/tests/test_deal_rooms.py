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
from api.chat import get_or_create_deal_room, send_message, get_messages, my_rooms, SendMessageIn
from fastapi import HTTPException


def _u(uid):
    return {"id": uid, "full_name": uid, "phone": "+7" + uid[:6]}


def _mk_users(*uids):
    with get_conn() as c:
        columns = {row["name"] for row in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}
        if "legal_form" not in columns:
            c.execute("ALTER TABLE drivers_registration ADD COLUMN legal_form TEXT")
        for u in uids:
            try:
                c.execute("INSERT INTO drivers_registration (id, full_name, phone) VALUES (?,?,?)",
                          (u, u, "+7" + u[:6]))
            except Exception:
                pass


def test_idempotent_same_cargo_owner_bidder():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    r1 = get_or_create_deal_room(cargo, o, d)
    r2 = get_or_create_deal_room(cargo, d, o)  # порядок ролей не важен
    r3 = get_or_create_deal_room(cargo, o, d, bid_id="b1")  # повтор/дубль-ставка
    assert r1 == r2 == r3


def test_different_cargo_different_room():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    r_a = get_or_create_deal_room("cgA_" + uuid.uuid4().hex[:6], o, d)
    r_b = get_or_create_deal_room("cgB_" + uuid.uuid4().hex[:6], o, d)
    assert r_a != r_b



def _mk_accepted_deal(cargo, owner, driver, room):
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo, None, "bid_" + uuid.uuid4().hex[:8], owner, driver,
             "Almaty", "Astana", 1000, "accepted", room),
        )
    return deal_id


def test_message_sync_both_directions():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
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
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    with pytest.raises(HTTPException) as e1:
        get_messages(room, user=_u(t))
    assert e1.value.status_code == 403
    with pytest.raises(HTTPException) as e2:
        send_message(SendMessageIn(room_id=room, text="hack"), user=_u(t))
    assert e2.value.status_code == 403
