"""Проверка привязки файла к сообщению выполняется до записи в хранилище."""
import asyncio
import io
import sqlite3
from contextlib import contextmanager

import pytest
from fastapi import HTTPException, UploadFile

from api import deal_room


@pytest.mark.parametrize('message_id', ['42', '999'])
def test_attachment_rejects_message_from_another_room_or_missing(monkeypatch, message_id):
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, room_id TEXT NOT NULL)')
    db.execute("INSERT INTO chat_messages(id, room_id) VALUES (42, 'other-room')")

    @contextmanager
    def connection():
        yield db

    monkeypatch.setattr(deal_room, 'get_conn', connection)
    monkeypatch.setattr(deal_room.dr, 'room_exists', lambda room: True)
    monkeypatch.setattr(deal_room.dr, 'is_participant', lambda room, uid: True)
    monkeypatch.setattr(deal_room, '_assert_deal_room_open', lambda *args: None)
    monkeypatch.setattr(deal_room, '_ensure_attachment_columns', lambda: None)
    monkeypatch.setattr(deal_room, '_existing_attachment', lambda *args: None)
    monkeypatch.setattr(deal_room.storage_service, 'save_file', lambda *args, **kwargs: pytest.fail('Запись в хранилище до проверки принадлежности сообщения'))
    upload = UploadFile(filename='fixture.pdf', file=io.BytesIO(b'%PDF-1.7\n'))
    upload.headers = {'content-type': 'application/pdf'}
    with pytest.raises(HTTPException) as error:
        asyncio.run(deal_room.upload_attachment(conversation_id='own-room', file=upload, kind='document', message_id=message_id, client_upload_id=None, user={'id': 'owner'}))
    assert error.value.status_code in (403, 404)
    db.close()


def test_valid_message_in_own_room_preserves_idempotent_retry(monkeypatch):
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, room_id TEXT NOT NULL)')
    db.execute("INSERT INTO chat_messages(id, room_id) VALUES (42, 'own-room')")

    @contextmanager
    def connection():
        yield db

    monkeypatch.setattr(deal_room, 'get_conn', connection)
    monkeypatch.setattr(deal_room.dr, 'room_exists', lambda room: True)
    monkeypatch.setattr(deal_room.dr, 'is_participant', lambda room, uid: True)
    monkeypatch.setattr(deal_room, '_assert_deal_room_open', lambda *args: None)
    monkeypatch.setattr(deal_room, '_ensure_attachment_columns', lambda: None)
    monkeypatch.setattr(deal_room, '_existing_attachment', lambda *args: {'id': 'attachment', 'url': '/storage/fixture.pdf', 'upload_status': 'uploaded'})
    monkeypatch.setattr(deal_room, '_sign_attachment', lambda att: att)
    upload = UploadFile(filename='fixture.pdf', file=io.BytesIO(b'%PDF-1.7\n'))
    result = asyncio.run(deal_room.upload_attachment(conversation_id='own-room', file=upload, kind='document', message_id='42', client_upload_id='retry', user={'id': 'owner'}))
    assert result['deduplicated'] is True
    assert result['attachment']['id'] == 'attachment'
    db.close()
