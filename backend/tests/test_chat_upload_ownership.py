"""Один пользователь не может присвоить чужую загрузку того же типа."""
import asyncio
import io
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException, UploadFile

from api import chat
from database.db import get_conn


def test_new_photo_is_bound_to_uploader_and_cannot_be_reused_in_another_room(monkeypatch):
    owner, partner, other = (uuid.uuid4().hex for _ in range(3))
    room, other_room = (uuid.uuid4().hex for _ in range(2))
    with get_conn() as c:
        for rid, a, b in ((room, owner, partner), (other_room, owner, other)):
            c.execute('INSERT INTO chat_rooms(id, participant_1, participant_2) VALUES (?,?,?)', (rid, a, b))
    monkeypatch.setattr(chat, '_assert_chat_is_accepted', lambda *args, **kwargs: None)
    monkeypatch.setattr(chat, 'send_to_user', lambda *args, **kwargs: None)
    monkeypatch.setattr(chat, 'create_notification', lambda *args, **kwargs: None)
    key = chat.storage.LOCAL_PUBLIC_BASE + '/chat_photos/' + uuid.uuid4().hex + '.jpg'
    monkeypatch.setattr(chat.storage, 'save_file', lambda *args, **kwargs: key)
    upload = UploadFile(filename='fixture.jpg', file=io.BytesIO(b'\xff\xd8\xff\xe0synthetic'))
    result = asyncio.run(chat.upload_chat_photo(file=upload, user={'id': owner}))
    assert result['photo_key'] == key
    with pytest.raises(HTTPException) as before_send:
        chat.send_message(chat.SendMessageIn(room_id=room, photo_url=key), {'id': partner})
    assert before_send.value.status_code == 403
    message = chat.SendMessageIn(room_id=room, photo_url=key, client_msg_id='upload-' + uuid.uuid4().hex)
    assert chat.send_message(message, {'id': owner})['ok']
    assert chat.send_message(message, {'id': owner})['deduped']
    with pytest.raises(HTTPException) as second_participant:
        chat.send_message(chat.SendMessageIn(room_id=room, photo_url=key), {'id': partner})
    assert second_participant.value.status_code == 403
    with pytest.raises(HTTPException) as other_conversation:
        chat.send_message(chat.SendMessageIn(room_id=other_room, photo_url=key), {'id': owner})
    assert other_conversation.value.status_code == 403


def test_legacy_media_remains_visible_to_room_members_only(monkeypatch):
    owner, partner, stranger = (uuid.uuid4().hex for _ in range(3))
    room = uuid.uuid4().hex
    key = chat.storage.LOCAL_PUBLIC_BASE + '/chat_voice/' + uuid.uuid4().hex + '.m4a'
    with get_conn() as c:
        c.execute('INSERT INTO chat_rooms(id, participant_1, participant_2) VALUES (?,?,?)', (room, owner, partner))
        c.execute('INSERT INTO chat_messages(room_id,sender_id,text,photo_url,is_voice) VALUES (?,?,?,?,0)', (room, owner, 'старое вложение', key))
    monkeypatch.setattr(chat, '_assert_chat_is_accepted', lambda *args, **kwargs: None)
    monkeypatch.setattr(chat.file_signing, 'sign', lambda value: 'signed-fixture')
    for uid in (owner, partner):
        messages = chat.get_messages(room, user={'id': uid})['messages']
        assert any(item['photo_url'] == 'signed-fixture' for item in messages)
    with pytest.raises(HTTPException) as error:
        chat.get_messages(room, user={'id': stranger})
    assert error.value.status_code == 403


def test_parallel_reuse_cannot_bind_upload_to_two_rooms(monkeypatch):
    owner, first, second = (uuid.uuid4().hex for _ in range(3))
    rooms = [uuid.uuid4().hex, uuid.uuid4().hex]
    with get_conn() as c:
        for room, partner in zip(rooms, (first, second)):
            c.execute('INSERT INTO chat_rooms(id, participant_1, participant_2) VALUES (?,?,?)', (room, owner, partner))
    barrier = threading.Barrier(2)
    monkeypatch.setattr(chat, '_assert_chat_is_accepted', lambda *args, **kwargs: barrier.wait(timeout=5))
    monkeypatch.setattr(chat, 'send_to_user', lambda *args, **kwargs: None)
    monkeypatch.setattr(chat, 'create_notification', lambda *args, **kwargs: None)
    key = chat.storage.LOCAL_PUBLIC_BASE + '/chat_photos/' + uuid.uuid4().hex + '.jpg'
    monkeypatch.setattr(chat.storage, 'save_file', lambda *args, **kwargs: key)
    upload = UploadFile(filename='fixture.jpg', file=io.BytesIO(b'\xff\xd8\xff\xe0synthetic'))
    asyncio.run(chat.upload_chat_photo(file=upload, user={'id': owner}))

    def send(room):
        try:
            return bool(chat.send_message(chat.SendMessageIn(room_id=room, photo_url=key), {'id': owner})['ok'])
        except (HTTPException, chat.sqlite3.OperationalError):
            return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        result = list(executor.map(send, rooms))
    assert sum(result) == 1
    with get_conn() as c:
        rows = c.execute('SELECT room_id FROM chat_messages WHERE photo_url=?', (key,)).fetchall()
        receipt = c.execute('SELECT room_id,message_id FROM chat_upload_receipts WHERE storage_ref=?', (key,)).fetchone()
    assert len(rows) == 1
    assert receipt['room_id'] == rows[0]['room_id'] and receipt['message_id'] is not None
