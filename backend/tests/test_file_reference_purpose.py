"""Защита от использования ключей документов как фото грузов или чата."""
import pytest
from fastapi import HTTPException

from api import chat, marketplace
from services import storage_service


def test_cargo_feed_does_not_sign_document_reference(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    called = []
    monkeypatch.setattr(marketplace._cargo_file_signing, 'sign', lambda ref: called.append(ref) or 'signed')
    ref = 'supabase://fixture-private/chat_attachments/private.pdf'
    assert marketplace._sign_cargo_photos([ref]) == []
    assert called == []


def test_chat_rejects_document_reference_before_opening_room(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    ref = 'supabase://fixture-private/chat_attachments/private.pdf'
    body = chat.SendMessageIn(photo_url=ref, room_id='synthetic-room')
    with pytest.raises(HTTPException) as error:
        chat.send_message(body, {'id': 'owner'})
    assert error.value.status_code == 400


def test_private_chat_keys_accept_only_photo_or_voice_categories(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    assert storage_service.ref_has_purpose('supabase://fixture-private/chat_voice/voice.m4a', {'chat_voice', 'chat_photos'})
    assert storage_service.ref_has_purpose('supabase://fixture-private/chat_photos/photo.jpg', {'chat_voice', 'chat_photos'})
    assert not storage_service.ref_has_purpose('supabase://fixture-private/chat_voiceextra/voice.m4a', {'chat_voice', 'chat_photos'})
    assert not storage_service.ref_has_purpose('supabase://fixture-private/chat_photos/../chat_attachments/private.pdf', {'chat_voice', 'chat_photos'})


def test_cargo_cannot_claim_another_users_uploaded_photo(monkeypatch):
    import asyncio
    import io
    import uuid
    from fastapi import UploadFile
    owner, other = uuid.uuid4().hex, uuid.uuid4().hex
    ref = storage_service.LOCAL_PUBLIC_BASE + '/cargo_photos/' + uuid.uuid4().hex + '.jpg'
    monkeypatch.setattr(storage_service, 'save_image', lambda *args, **kwargs: ref)
    image = UploadFile(filename='photo.jpg', file=io.BytesIO(b'\xff\xd8\xff\xe0fixture'))
    assert asyncio.run(marketplace.upload_cargo_photo(file=image, user={'id': owner}))['photo_key'] == ref
    body = marketplace.CargoIn(from_city='A', to_city='B', cargo_desc='fixture', photos=[ref])
    with pytest.raises(HTTPException) as error:
        marketplace.create_cargo(body, {'id': other, 'role': 'client'})
    assert error.value.status_code == 403
    assert marketplace.create_cargo(body, {'id': owner, 'role': 'client'})['ok'] is True
