"""Доступ к байтам вложения проверяется для каждой сессии и конкретной комнаты."""
import uuid

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import deal_room
from database.db import get_conn


@pytest.fixture
def attachment_case(tmp_path, monkeypatch):
    owner, partner, stranger, room, attachment, deal = (uuid.uuid4().hex for _ in range(6))
    ref = '/storage/chat_attachments/' + uuid.uuid4().hex + '.pdf'
    with get_conn() as c:
        c.execute('INSERT INTO chat_rooms(id,participant_1,participant_2,cargo_id) VALUES (?,?,?,?)', (room, owner, partner, 'cargo-' + room))
        c.execute('INSERT INTO deals(id,bid_id,cargo_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)', (deal, 'bid-'+deal, 'cargo-'+room, owner, partner, 'A', 'B', 1, 'accepted', room))
        c.execute("INSERT INTO message_attachments(id,conversation_id,uploader_id,kind,url,mime_type,size_bytes,upload_status) VALUES (?,?,?,?,?,?,?,?)", (attachment, room, owner, 'document', ref, 'application/pdf', 12, 'uploaded'))
    calls = []
    def read_file(value, limit):
        calls.append(value)
        return b'%PDF-fixture'
    monkeypatch.setattr(deal_room.storage_service, 'read_private_bytes', read_file, raising=False)
    return {'owner':owner, 'partner':partner, 'stranger':stranger, 'room':room, 'attachment':attachment, 'deal':deal, 'calls':calls}


def test_authenticated_participants_can_read_bytes_but_not_wrong_ids(attachment_case):
    a = attachment_case
    for actor in (a['owner'], a['partner']):
        response = deal_room.get_attachment_content(a['room'], a['attachment'], {'id':actor})
        assert response.body == b'%PDF-fixture'
        assert response.headers['cache-control'] == 'private, no-store'
    for room, att, actor in ((a['room'], a['attachment'], a['stranger']), (a['room'], 'wrong-id', a['owner']), ('wrong-room', a['attachment'], a['owner'])):
        with pytest.raises(HTTPException) as error:
            deal_room.get_attachment_content(room, att, {'id':actor})
        assert error.value.status_code in (403, 404)
    assert len(a['calls']) == 2


def test_revocation_stops_subsequent_fetch_before_storage_access(attachment_case):
    a = attachment_case
    with get_conn() as c:
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (a['deal'],))
    with pytest.raises(HTTPException) as error:
        deal_room.get_attachment_content(a['room'], a['attachment'], {'id':a['owner']})
    assert error.value.status_code == 403
    assert not a['calls']


def test_guest_cannot_download_attachment(attachment_case):
    app = FastAPI()
    app.include_router(deal_room.deal_room_router, prefix='/api/v1')
    a = attachment_case
    response = TestClient(app).get(f"/api/v1/chat/conversations/{a['room']}/attachments/{a['attachment']}/content")
    assert response.status_code in (401, 403)
    assert not a['calls']


def test_revocation_during_file_read_does_not_return_content(attachment_case, monkeypatch, tmp_path):
    a = attachment_case
    def revoke_while_fetching(*args, **kwargs):
        with get_conn() as c:
            c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (a['deal'],))
        return b'%PDF-fixture'
    monkeypatch.setattr(deal_room.storage_service, 'read_private_bytes', revoke_while_fetching, raising=False)
    with pytest.raises(HTTPException) as error:
        deal_room.get_attachment_content(a['room'], a['attachment'], {'id':a['owner']})
    assert error.value.status_code == 403


def test_changed_attachment_during_read_is_not_returned(attachment_case, monkeypatch):
    a = attachment_case
    def replace_while_fetching(*args, **kwargs):
        with get_conn() as c:
            c.execute("UPDATE message_attachments SET url=? WHERE id=?", ('/storage/chat_attachments/other.pdf', a['attachment']))
        return b'%PDF-fixture'
    monkeypatch.setattr(deal_room.storage_service, 'read_private_bytes', replace_while_fetching)
    with pytest.raises(HTTPException) as error:
        deal_room.get_attachment_content(a['room'], a['attachment'], {'id':a['owner']})
    assert error.value.status_code == 404
