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
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    # Standalone execution — under pytest, conftest.py owns DB_PATH/schema.
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn
import api.chat as chat_module
from api.chat import (
    get_or_create_deal_room, send_message, get_messages,
    unread_count, SendMessageIn,
)
from services import push_sender
from api.notifications import create_notification, unread_badge_count


@pytest.fixture(autouse=True)
def _isolate_chat_state_from_async_push(monkeypatch):
    """Не даём send_message() запускать daemon push-потоки в этих unit-тестах.

    api.push.send_to_user намеренно отправляет push в фоне. Без этой изоляции
    поток из предыдущего теста может дожить до следующего кейса, попасть в его
    временный mock push_sender._send_native и перезаписать captured badge.
    Именно эта гонка давала 5 вместо 1 после test_inv5 (пять сообщений), хотя
    unread/notification данные нового пользователя были корректны.

    Здесь проверяется арифметика unread/badge, а сам push transport покрывается
    отдельными push-тестами, поэтому фоновые отправки являются только шумом.
    """
    monkeypatch.setattr(chat_module, "send_to_user", lambda *args, **kwargs: 0)
    yield


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


def _mk_accepted_deal(cargo, owner, driver, room, status="accepted"):
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo, None, "bid_" + uuid.uuid4().hex[:8], owner, driver,
             "Almaty", "Astana", 1000, status, room),
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


def test_canonical_badge_counts_disjoint_non_chat_events_and_active_chat_once():
    """Tab, provider payload and launcher share this exact inclusion set."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    send_message(SendMessageIn(room_id=room, text="one chat event"), user=_u(d))
    create_notification(o, "bid_created", "One actionable bid", event_key="badge-bid-" + uuid.uuid4().hex)
    # The durable Bell mirror of the same chat message is deliberately
    # excluded, otherwise one message would increment the canonical badge twice.
    create_notification(o, "chat_message", "Mirrored chat", event_key="badge-chat-" + uuid.uuid4().hex)
    assert unread_badge_count(o) == 2
    assert push_sender._compute_recipient_badge(o) == 2


def test_canonical_badge_sequence_bid_message_mirrors_then_reads_to_zero():
    """0 → bid 1 → duplicate mirror 1 → message 2 → mirror 2 → reads 0."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    assert unread_badge_count(o) == 0

    bid_event_key = "bid-created-" + uuid.uuid4().hex
    create_notification(o, "bid_created", "New bid", event_key=bid_event_key)
    assert unread_badge_count(o) == 1
    # Retry/mirror of the same business event is idempotent.
    create_notification(o, "bid_created", "New bid", event_key=bid_event_key)
    assert unread_badge_count(o) == 1

    sent = send_message(SendMessageIn(room_id=room, text="one message"), user=_u(d))
    assert sent["ok"] is True
    assert unread_badge_count(o) == 2
    create_notification(
        o, "chat_message", "Message mirror",
        event_key="chat-message-" + uuid.uuid4().hex,
    )
    assert unread_badge_count(o) == 2
    assert push_sender._compute_recipient_badge(o) == 2

    with get_conn() as c:
        c.execute(
            "UPDATE notifications SET is_read=1 "
            "WHERE user_id=? AND event_key=?",
            (o, bid_event_key),
        )
    assert unread_badge_count(o) == 1
    get_messages(room, user=_u(o))
    assert unread_badge_count(o) == 0
    assert push_sender._compute_recipient_badge(o) == 0


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

    def fake_native(uid, title, body, data, badge=None, provider=None):
        captured["badge"] = badge
        return {"sent": 0, "devices": 0, "already_delivered": 0}

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


@pytest.mark.parametrize("status", ["completed", "cancelled", "rejected"])
def test_closed_deal_room_cannot_create_phantom_badge(status):
    """Closed/dead deal rooms are excluded from Bell and app-icon unread."""
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room, status=status)
    # New messages are correctly rejected in a closed deal; emulate a stale
    # historical row left by the old flow.
    with get_conn() as c:
        c.execute("INSERT INTO chat_messages (room_id, sender_id, text, is_read) VALUES (?,?,?,0)", (room, d, "stale"))
    assert unread_count(user=_u(o))["unread"] == 0
    assert push_sender._compute_recipient_badge(o) == 0


def test_completed_deal_chat_notification_cannot_leave_native_badge_stuck():
    """The APNs/FCM payload must use the same total as the mobile client.

    A real incoming message creates both a raw chat row and a durable Bell
    row.  Once its deal is completed, both client unread endpoints exclude the
    event; counting raw notifications in the native push sender used to leave
    this one historical event on the launcher badge indefinitely.
    """
    o, d = _ids()
    cargo = "cg_" + uuid.uuid4().hex[:6]
    room = get_or_create_deal_room(cargo, o, d)
    deal_id = _mk_accepted_deal(cargo, o, d, room)
    send_message(SendMessageIn(room_id=room, text="historical"), user=_u(d))
    assert unread_count(user=_u(o))["unread"] == 1
    assert push_sender._compute_recipient_badge(o) == 1

    with get_conn() as c:
        c.execute("UPDATE deals SET status = 'completed' WHERE id = ?", (deal_id,))

    assert unread_count(user=_u(o))["unread"] == 0
    assert push_sender._compute_recipient_badge(o) == 0


def test_database_busy_never_becomes_authoritative_zero_badge(monkeypatch):
    """Contention must trigger retry, not erase a previously visible badge."""
    from contextlib import contextmanager
    from api import notifications
    from database.db import DatabaseBusyError

    @contextmanager
    def busy_connection():
        raise DatabaseBusyError("SQLite temporarily busy")
        yield  # pragma: no cover

    monkeypatch.setattr(notifications, "get_conn", busy_connection)
    with pytest.raises(DatabaseBusyError):
        notifications.unread_badge_count("badge-owner")
    with pytest.raises(DatabaseBusyError):
        push_sender._compute_recipient_badge("badge-owner")


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


# Ночной аудит: новые сообщения после снимка истории нельзя отмечать прочитанными.
def _late_room_message(room, owner, driver, text):
    with get_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO chat_messages(room_id,sender_id,text) VALUES(?,?,?)", (room, driver, text),
        )
        message_id = cursor.lastrowid
        create_notification(owner, "chat_message", text, url=f"/chats/{room}",
                            event_key=f"chat:{room}:msg:{message_id}", conn=conn)
    return message_id


def _read_race_room():
    owner, driver = _ids()
    cargo = "cg_read_race_" + uuid.uuid4().hex[:8]
    room = get_or_create_deal_room(cargo, owner, driver)
    _mk_accepted_deal(cargo, owner, driver, room)
    send_message(SendMessageIn(room_id=room, text="visible-before-read"), user=_u(driver))
    return room, owner, driver


def test_new_message_between_history_select_and_update_stays_unread(monkeypatch):
    from contextlib import contextmanager
    monkeypatch.setattr(dbm, "_maybe_expire_marketplace", lambda _conn: None)
    room, owner, driver = _read_race_room()
    real_connection = chat_module.get_conn
    late = []
    @contextmanager
    def injected_connection():
        with real_connection() as conn:
            class Proxy:
                def execute(self, sql, args=()):
                    if sql.lstrip().startswith("UPDATE chat_messages SET is_read") and not late:
                        late.append(_late_room_message(room, owner, driver, "arrived-after-snapshot"))
                    return conn.execute(sql, args)
                def __getattr__(self, key):
                    return getattr(conn, key)
            yield Proxy()
    monkeypatch.setattr(chat_module, "get_conn", injected_connection)
    response = get_messages(room, user=_u(owner))
    assert late, "Гонка должна быть воспроизведена перед UPDATE"
    assert all(m["id"] != late[0] for m in response["messages"])
    with get_conn() as conn:
        raw = conn.execute("SELECT is_read FROM chat_messages WHERE id=?", (late[0],)).fetchone()[0]
        bell = conn.execute("SELECT is_read FROM notifications WHERE event_key=?",
                            (f"chat:{room}:msg:{late[0]}",)).fetchone()[0]
    assert raw == 0, "Не попавшее в ответ новое сообщение должно оставаться unread"
    assert bell == 0, "Его новый Bell event тоже должен остаться unread"
    assert unread_count(user=_u(owner))["unread"] == 1


def test_new_notification_after_history_commit_is_not_consumed(monkeypatch):
    room, owner, driver = _read_race_room()
    real_mark = chat_module.mark_notifications_read_by_urls
    late = []
    def late_mark(*args, **kwargs):
        late.append(_late_room_message(room, owner, driver, "arrived-before-bell-cleanup"))
        return real_mark(*args, **kwargs)
    monkeypatch.setattr(chat_module, "mark_notifications_read_by_urls", late_mark)
    response = get_messages(room, user=_u(owner))
    assert late and all(m["id"] != late[0] for m in response["messages"])
    with get_conn() as conn:
        old = conn.execute("SELECT is_read FROM notifications WHERE user_id=? AND body=?",
                           (owner, "visible-before-read")).fetchone()[0]
        new = conn.execute("SELECT is_read FROM notifications WHERE event_key=?",
                           (f"chat:{room}:msg:{late[0]}",)).fetchone()[0]
    assert old == 1
    assert new == 0, "Поздний event текущей комнаты нельзя погасить старым чтением"
    assert unread_count(user=_u(owner))["unread"] == 1


def test_history_page_does_not_read_newer_unseen_page():
    room, owner, driver = _read_race_room()
    send_message(SendMessageIn(room_id=room, text="newer-not-returned"), user=_u(driver))
    response = get_messages(room, limit=1, offset=1, user=_u(owner))
    assert [m["text"] for m in response["messages"]] == ["visible-before-read"]
    assert unread_count(user=_u(owner))["unread"] == 1
    with get_conn() as conn:
        latest = conn.execute("SELECT is_read FROM notifications WHERE user_id=? AND body=?",
                              (owner, "newer-not-returned")).fetchone()[0]
    assert latest == 0
