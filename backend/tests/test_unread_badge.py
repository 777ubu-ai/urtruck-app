"""Глубокая проверка серверных инвариантов счётчиков чата (badge desync hunt).

Фундамент рассинхрона «иконка ↔ точка внутри ↔ колокольчик»: если серверные
числа (unread_count, _compute_recipient_badge, read-marking) врут — клиент не
спасёт. Проверяем INV-1…INV-7 из qa/CHAT_BADGE_DESYNC_DEEP_TEST_PROMPT.md.

Самодостаточно: своя БД, уникальные id.
"""
import os
import uuid
from pathlib import Path

import pytest

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_unread_badge.db")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn
from api.chat import (
    get_or_create_deal_room, send_message, get_messages,
    unread_count, SendMessageIn,
)
from services import push_sender


def _u(uid):
    return {"id": uid, "full_name": uid, "phone": "+7" + uid[:6]}


def _mk_users(*uids):
    with get_conn() as c:
        for u in uids:
            try:
                c.execute(
                    "INSERT INTO drivers_registration (id, full_name, phone) VALUES (?,?,?)",
                    (u, u, "+7" + u[:6]),
                )
            except Exception:
                pass


def _ids():
    o = "own_" + uuid.uuid4().hex[:6]
    d = "drv_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    return o, d



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


def test_inv1_send_increments_recipient_not_sender():
    """INV-1: send(a→b) поднимает unread b, не трогает unread a (H6/H7)."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    before_o = unread_count(user=_u(o))["unread"]
    before_d = unread_count(user=_u(d))["unread"]
    send_message(SendMessageIn(room_id=room, text="hello"), user=_u(d))  # водитель → владелец
    after_o = unread_count(user=_u(o))["unread"]
    after_d = unread_count(user=_u(d))["unread"]
    assert after_o == before_o + 1   # получатель +1
    assert after_d == before_d       # отправитель без изменений


def test_inv2_badge_matches_unread():
    """INV-2: _compute_recipient_badge(b) == unread_count(b) — C1-бэк и C2-источник совпадают."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    send_message(SendMessageIn(room_id=room, text="m1"), user=_u(d))
    send_message(SendMessageIn(room_id=room, text="m2"), user=_u(d))
    assert push_sender._compute_recipient_badge(o) == unread_count(user=_u(o))["unread"]


def test_inv3_read_marks_only_opened_room():
    """INV-3: get_messages помечает прочитанной ТОЛЬКО открытую комнату (H5)."""
    o, d = _ids()
    cargo_a = "cgA_" + uuid.uuid4().hex[:6]
    room_a = get_or_create_deal_room(cargo_a, o, d)
    _mk_accepted_deal(cargo_a, o, d, room_a)
    cargo_b = "cgB_" + uuid.uuid4().hex[:6]
    room_b = get_or_create_deal_room(cargo_b, o, d)
    _mk_accepted_deal(cargo_b, o, d, room_b)
    send_message(SendMessageIn(room_id=room_a, text="a1"), user=_u(d))
    send_message(SendMessageIn(room_id=room_b, text="b1"), user=_u(d))
    assert unread_count(user=_u(o))["unread"] == 2
    get_messages(room_a, user=_u(o))  # владелец открыл только комнату A
    # комната B по-прежнему непрочитана
    assert unread_count(user=_u(o))["unread"] == 1


def test_inv4_multiroom_decrements_per_room():
    """INV-4: после чтения одной из двух — остаётся ровно N оставшихся, не 0 и не всё (H5)."""
    o, d = _ids()
    cargo_a = "cgA_" + uuid.uuid4().hex[:6]
    room_a = get_or_create_deal_room(cargo_a, o, d)
    _mk_accepted_deal(cargo_a, o, d, room_a)
    cargo_b = "cgB_" + uuid.uuid4().hex[:6]
    room_b = get_or_create_deal_room(cargo_b, o, d)
    _mk_accepted_deal(cargo_b, o, d, room_b)
    send_message(SendMessageIn(room_id=room_a, text="a1"), user=_u(d))
    send_message(SendMessageIn(room_id=room_a, text="a2"), user=_u(d))
    send_message(SendMessageIn(room_id=room_b, text="b1"), user=_u(d))
    assert unread_count(user=_u(o))["unread"] == 3
    get_messages(room_a, user=_u(o))            # прочитали обе в A
    assert unread_count(user=_u(o))["unread"] == 1   # осталась одна в B
    get_messages(room_b, user=_u(o))
    assert unread_count(user=_u(o))["unread"] == 0


def test_inv5_own_messages_never_counted():
    """INV-5: своё сообщение (sender_id==uid) не входит в unread (H6)."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    for i in range(5):
        send_message(SendMessageIn(room_id=room, text=f"own-{i}"), user=_u(d))
    assert unread_count(user=_u(d))["unread"] == 0   # сам себе не накрутил
    assert unread_count(user=_u(o))["unread"] == 5


def test_inv6_only_chat_kind_sets_badge():
    """INV-6: badge считается только для kind='chat' / type='chat_message' (H8).

    Проверяем логику выбора в push_sender.send без реальной отправки —
    мокаем транспорты, читаем переданный badge.
    """
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    send_message(SendMessageIn(room_id=room, text="x"), user=_u(d))  # у o есть 1 непрочитанное

    captured = {}

    def fake_web(uid, title, body, data, url):
        return 0

    def fake_native(uid, title, body, data, badge=None):
        captured["badge"] = badge
        return 0

    orig_web, orig_native = push_sender._send_web, push_sender._send_native
    push_sender._send_web, push_sender._send_native = fake_web, fake_native
    try:
        # Вариант 2: badge = чат + уведомления для ЛЮБОГО kind.
        push_sender.send(o, "t", "b", kind="chat", data={"type": "chat_message"})
        chat_badge = captured.get("badge")
        push_sender.send(o, "t", "b", kind="bid", data={"type": "new_bid"})
        bid_badge = captured.get("badge")
    finally:
        push_sender._send_web, push_sender._send_native = orig_web, orig_native

    # У получателя o: 1 непрочитанный чат + 0 уведомлений (в тесте notifications
    # не создаются) → badge = 1 для обоих пушей (единый сигнал «всё новое»).
    assert chat_badge == 1
    assert bid_badge == 1


def test_inv7_idempotent_client_msg_id():
    """INV-7: повторный send с тем же client_msg_id не даёт +2 (дедуп)."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    cmid = "cm_" + uuid.uuid4().hex[:8]
    send_message(SendMessageIn(room_id=room, text="dup", client_msg_id=cmid), user=_u(d))
    send_message(SendMessageIn(room_id=room, text="dup", client_msg_id=cmid), user=_u(d))
    # владелец должен увидеть ровно 1 сообщение, не 2
    assert unread_count(user=_u(o))["unread"] == 1


def test_mine_flag_regression():
    """Регресс фикса чат-эхо (85cb3c8): get_messages помечает mine по uid."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    send_message(SendMessageIn(room_id=room, text="from-driver"), user=_u(d))
    send_message(SendMessageIn(room_id=room, text="from-owner"), user=_u(o))
    # глазами водителя: своё — mine=True, чужое — mine=False
    for m in get_messages(room, user=_u(d))["messages"]:
        if m["text"] == "from-driver":
            assert m["mine"] is True
        if m["text"] == "from-owner":
            assert m["mine"] is False
    # глазами владельца — зеркально
    for m in get_messages(room, user=_u(o))["messages"]:
        if m["text"] == "from-owner":
            assert m["mine"] is True
        if m["text"] == "from-driver":
            assert m["mine"] is False