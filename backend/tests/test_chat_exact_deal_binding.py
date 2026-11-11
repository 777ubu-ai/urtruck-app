"""Другая сделка не должна восстанавливать доступ к закрытой комнате."""
import uuid

import pytest
from fastapi import HTTPException

from api import chat
from database.db import get_conn


def test_cancelled_room_not_reopened_by_other_deal_on_same_trip():
    a, b, room, trip = (uuid.uuid4().hex for _ in range(4))
    with get_conn() as c:
        for status, deal_room in [('cancelled', room), ('accepted', uuid.uuid4().hex)]:
            c.execute('INSERT INTO deals (id,bid_id,trip_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                      (uuid.uuid4().hex, uuid.uuid4().hex, trip, a, b, 'A', 'B', 1, status, deal_room))
    with pytest.raises(HTTPException) as error:
        chat._assert_chat_is_accepted(a, b, room_id=room, trip_id=trip)
    assert error.value.status_code == 403


def test_unique_legacy_unbound_deal_remains_accessible():
    a, b, room, cargo = (uuid.uuid4().hex for _ in range(4))
    with get_conn() as c:
        c.execute('INSERT INTO deals (id,bid_id,cargo_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,NULL)',
                  (uuid.uuid4().hex, uuid.uuid4().hex, cargo, a, b, 'A', 'B', 1, 'accepted'))
    chat._assert_chat_is_accepted(a, b, room_id=room, cargo_id=cargo)


def test_ambiguous_legacy_deals_are_not_guessed():
    a, b, room, cargo = (uuid.uuid4().hex for _ in range(4))
    with get_conn() as c:
        for status in ('accepted', 'cancelled'):
            c.execute('INSERT INTO deals (id,bid_id,cargo_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,NULL)',
                      (uuid.uuid4().hex, uuid.uuid4().hex, cargo, a, b, 'A', 'B', 1, status))
    with pytest.raises(HTTPException) as error:
        chat._assert_chat_is_accepted(a, b, room_id=room, cargo_id=cargo)
    assert error.value.status_code == 403


def test_legacy_send_does_not_write_into_selected_cancelled_room(monkeypatch):
    a, b, room, other_room, trip = (uuid.uuid4().hex for _ in range(5))
    with get_conn() as c:
        for status, deal_room in [('cancelled', room), ('accepted', other_room)]:
            c.execute('INSERT INTO deals (id,bid_id,trip_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                      (uuid.uuid4().hex, uuid.uuid4().hex, trip, a, b, 'A', 'B', 1, status, deal_room))
        c.execute('INSERT INTO chat_rooms (id,participant_1,participant_2,trip_id) VALUES (?,?,?,?)', (room, a, b, trip))
    monkeypatch.setattr(chat, '_get_or_create_room', lambda *args: room)
    with pytest.raises(HTTPException) as error:
        chat.send_message(chat.SendMessageIn(to_user_id=b, trip_id=trip, text='fixture'), {'id': a})
    assert error.value.status_code == 403
    with get_conn() as c:
        assert c.execute('SELECT count(*) FROM chat_messages WHERE room_id=?', (room,)).fetchone()[0] == 0
