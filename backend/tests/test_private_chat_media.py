"""Историческое медиа доступно только через связь сообщения с комнатой."""
import uuid

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import chat
from database.db import get_conn


@pytest.fixture
def legacy_media(monkeypatch):
    owner, driver, stranger, cargo = (uuid.uuid4().hex for _ in range(4))
    room = chat.get_or_create_deal_room(cargo, owner, driver)
    deal = uuid.uuid4().hex
    ref = '/storage/chat_voice/' + uuid.uuid4().hex + '.m4a'
    with get_conn() as c:
        c.execute('INSERT INTO deals (id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                  (deal, cargo, uuid.uuid4().hex, owner, driver, 'A', 'B', 1, 'accepted', room))
        message = c.execute('INSERT INTO chat_messages (room_id,sender_id,text,photo_url,is_voice) VALUES (?,?,?,?,?)',
                            (room, driver, '', ref, 1)).lastrowid
    calls = []
    def read_file(value, limit):
        calls.append(value)
        return b'\x00\x00\x00\x18ftypM4A ' + b'\x00' * 16
    monkeypatch.setattr(chat.storage, 'read_private_bytes', read_file)
    return owner, driver, stranger, room, deal, message, calls


def test_both_participants_receive_historical_media_not_outsider(legacy_media):
    owner, driver, stranger, room, _, message, calls = legacy_media
    for actor in (owner, driver):
        response = chat.get_message_media(room, message, user={'id': actor})
        assert response.body.startswith(b'\x00\x00\x00\x18ftyp')
        assert response.headers['cache-control'] == 'private, no-store'
    for room_id, msg_id, actor in ((room, message, stranger), (room, message + 1, owner), ('other-room', message, owner)):
        with pytest.raises(HTTPException) as error:
            chat.get_message_media(room_id, msg_id, user={'id': actor})
        assert error.value.status_code in (403, 404)
    assert len(calls) == 2


def test_capable_message_history_omits_legacy_url_and_marks_protected_media(legacy_media):
    owner, _, _, room, _, message, _ = legacy_media
    result = chat.get_messages(room, user={'id': owner}, capability='v1')
    item = next(row for row in result['messages'] if row['id'] == message)
    assert item['photo_url'] is None
    assert item['private_file_transport'] == 'v1'
    assert item['private_media_available'] is True
    assert item['attachment_unavailable'] is False


def test_old_client_keeps_signed_media_url_until_compatibility_cutoff(legacy_media, monkeypatch):
    owner, _, _, room, _, message, _ = legacy_media
    monkeypatch.setattr(chat.file_signing, 'sign', lambda ref: '/security/storage/voice.m4a?exp=2000000000&sig=fixture')
    result = chat.get_messages(room, user={'id': owner})
    item = next(row for row in result['messages'] if row['id'] == message)
    assert item['photo_url'].startswith('/security/storage/voice.m4a?')
    assert 'private_file_transport' not in item


def test_removed_deal_access_prevents_read(legacy_media):
    owner, _, _, room, deal, message, calls = legacy_media
    with get_conn() as c:
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal,))
    with pytest.raises(HTTPException) as error:
        chat.get_message_media(room, message, user={'id': owner})
    assert error.value.status_code == 403
    assert not calls


def test_guest_cannot_read_media(legacy_media):
    _, _, _, room, _, message, calls = legacy_media
    app = FastAPI()
    app.include_router(chat.chat_router, prefix='/api/v1/chat')
    response = TestClient(app).get(f'/api/v1/chat/messages/{room}/media/{message}')
    assert response.status_code in (401, 403)
    assert not calls


def test_revocation_during_read_prevents_response(legacy_media, monkeypatch):
    owner, _, _, room, deal, message, _ = legacy_media
    def revoke(value, limit):
        with get_conn() as c:
            c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal,))
        return b'\x00\x00\x00\x18ftypM4A ' + b'\x00' * 16
    monkeypatch.setattr(chat.storage, 'read_private_bytes', revoke)
    with pytest.raises(HTTPException) as error:
        chat.get_message_media(room, message, user={'id': owner})
    assert error.value.status_code == 403


def test_foreign_category_is_rejected_before_storage_access(legacy_media):
    owner, _, _, room, _, message, calls = legacy_media
    with get_conn() as c:
        c.execute("UPDATE chat_messages SET photo_url='/storage/id_documents/private.jpg' WHERE id=?", (message,))
    with pytest.raises(HTTPException) as error:
        chat.get_message_media(room, message, user={'id': owner})
    assert error.value.status_code == 404
    assert not calls


def test_media_change_during_read_is_not_disclosed(legacy_media, monkeypatch):
    owner, _, _, room, _, message, _ = legacy_media
    def replace(value, limit):
        with get_conn() as c:
            c.execute("UPDATE chat_messages SET photo_url='/storage/chat_voice/other.m4a' WHERE id=?", (message,))
        return b'private'
    monkeypatch.setattr(chat.storage, 'read_private_bytes', replace)
    with pytest.raises(HTTPException) as error:
        chat.get_message_media(room, message, user={'id': owner})
    assert error.value.status_code == 404


def test_different_accepted_deal_cannot_reopen_cancelled_room(legacy_media):
    owner, driver, _, room, deal, message, calls = legacy_media
    with get_conn() as c:
        cargo = c.execute('SELECT cargo_id FROM chat_rooms WHERE id=?', (room,)).fetchone()['cargo_id']
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal,))
        c.execute('INSERT INTO deals (id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                  (uuid.uuid4().hex, cargo, uuid.uuid4().hex, owner, driver, 'A', 'B', 1, 'accepted', uuid.uuid4().hex))
    with pytest.raises(HTTPException) as error:
        chat.get_message_media(room, message, user={'id': owner})
    assert error.value.status_code == 403
    assert not calls


@pytest.mark.parametrize('link', ['cargo', 'trip'])
def test_legacy_unlinked_deal_allows_only_participants_and_rechecks_revocation(legacy_media, monkeypatch, link):
    owner, driver, stranger, room, deal, message, calls = legacy_media
    with get_conn() as c:
        c.execute('UPDATE deals SET chat_room_id=NULL WHERE id=?', (deal,))
        if link == 'trip':
            trip = uuid.uuid4().hex
            c.execute('UPDATE chat_rooms SET cargo_id=NULL,trip_id=? WHERE id=?', (trip, room))
            c.execute('UPDATE deals SET cargo_id=NULL,trip_id=? WHERE id=?', (trip, deal))
    for actor in (owner, driver):
        assert chat.get_message_media(room, message, user={'id': actor}).body.startswith(b'\x00\x00\x00\x18ftyp')
    with pytest.raises(HTTPException) as outsider:
        chat.get_message_media(room, message, user={'id': stranger})
    assert outsider.value.status_code == 403
    def revoke(*args):
        with get_conn() as c:
            c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal,))
        return b'private'
    monkeypatch.setattr(chat.storage, 'read_private_bytes', revoke)
    with pytest.raises(HTTPException) as revoked:
        chat.get_message_media(room, message, user={'id': owner})
    assert revoked.value.status_code == 403


def test_ambiguous_legacy_deals_deny_media_before_storage_read(legacy_media):
    owner, driver, _, room, deal, message, calls = legacy_media
    with get_conn() as c:
        cargo = c.execute('SELECT cargo_id FROM chat_rooms WHERE id=?', (room,)).fetchone()['cargo_id']
        c.execute('UPDATE deals SET chat_room_id=NULL WHERE id=?', (deal,))
        trip = uuid.uuid4().hex
        c.execute('UPDATE chat_rooms SET trip_id=? WHERE id=?', (trip, room))
        c.execute('INSERT INTO deals(id,trip_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,NULL)',
                  (uuid.uuid4().hex, trip, uuid.uuid4().hex, owner, driver, 'A', 'B', 1, 'accepted'))
    with pytest.raises(HTTPException) as denied:
        chat.get_message_media(room, message, user={'id': owner})
    assert denied.value.status_code == 403
    assert not calls
