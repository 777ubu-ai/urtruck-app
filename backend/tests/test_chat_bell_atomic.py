"""Real send endpoint + SQLite transaction; only push transport is mocked."""
import contextvars
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import chat
from database.db import get_conn
from tests.auth_harness import override_require_level

current_user = contextvars.ContextVar('chat_bell_user')
app = FastAPI()
app.include_router(chat.chat_router, prefix='/chat')
override_require_level(app, lambda: current_user.get())
client = TestClient(app, raise_server_exceptions=False)

@pytest.fixture
def room(monkeypatch):
    tag = uuid.uuid4().hex
    sender, recipient, room_id = 'sender-' + tag, 'recipient-' + tag, 'room-' + tag
    with get_conn() as c:
        c.execute('INSERT INTO chat_rooms(id, participant_1, participant_2) VALUES(?,?,?)', (room_id, sender, recipient))
        c.execute('INSERT INTO deals(id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES(?,?,?,?,?,?,?,?,?)', (tag, tag, sender, recipient, 'Almaty', 'Astana', 1000, 'accepted', room_id))
    current_user.set({'id': sender, 'full_name': 'Sender', 'verification_level': 1})
    pushes = []
    monkeypatch.setattr(chat, 'send_to_user', lambda *args, **kwargs: pushes.append((args, kwargs)))
    return room_id, sender, recipient, pushes

def counts(room_id, recipient):
    with get_conn() as c:
        return (c.execute('SELECT COUNT(*) FROM chat_messages WHERE room_id=?', (room_id,)).fetchone()[0], c.execute('SELECT COUNT(*) FROM notifications WHERE user_id=? AND type=?', (recipient, 'chat_message')).fetchone()[0])

def test_send_and_retry_persist_exactly_one_message_and_bell(room):
    room_id, sender, recipient, pushes = room
    payload = {'room_id': room_id, 'text': 'hello', 'client_msg_id': room_id + '-key'}
    assert client.post('/chat/send', json=payload).status_code == 200
    assert client.post('/chat/send', json=payload).json()['deduped'] is True
    assert counts(room_id, recipient) == (1, 1)
    assert len(pushes) == 1
    with get_conn() as c:
        row = c.execute('SELECT url,event_key FROM notifications WHERE user_id=?', (recipient,)).fetchone()
        assert row['url'] == '/chats/' + room_id
        assert row['event_key'].startswith('chat:' + room_id + ':msg:')

def test_failed_bell_rolls_back_message_and_same_key_can_retry(room, monkeypatch):
    room_id, sender, recipient, pushes = room
    real = chat.create_notification
    def fail(*args, **kwargs):
        assert kwargs.get('conn') is not None
        real(*args, **kwargs)
        raise RuntimeError('injected failure after Bell insert')
    monkeypatch.setattr(chat, 'create_notification', fail)
    payload = {'room_id': room_id, 'text': 'hello', 'client_msg_id': room_id + '-key'}
    assert client.post('/chat/send', json=payload).status_code == 500
    assert counts(room_id, recipient) == (0, 0)
    assert not pushes
    with get_conn() as c:
        assert c.execute('SELECT last_message FROM chat_rooms WHERE id=?', (room_id,)).fetchone()[0] is None
    monkeypatch.setattr(chat, 'create_notification', real)
    assert client.post('/chat/send', json=payload).status_code == 200
    assert counts(room_id, recipient) == (1, 1)

def test_provider_failure_keeps_message_and_in_app_notification(room, monkeypatch):
    room_id, sender, recipient, pushes = room
    def fail(*args, **kwargs): raise RuntimeError('provider unavailable')
    monkeypatch.setattr(chat, 'send_to_user', fail)
    assert client.post('/chat/send', json={'room_id': room_id, 'text': 'hello'}).status_code == 200
    assert counts(room_id, recipient) == (1, 1)

def test_nonparticipant_still_gets_403_without_side_effects(room):
    room_id, sender, recipient, pushes = room
    current_user.set({'id': 'stranger', 'verification_level': 1})
    assert client.post('/chat/send', json={'room_id': room_id, 'text': 'hello'}).status_code == 403
    assert counts(room_id, recipient) == (0, 0)
    assert not pushes
