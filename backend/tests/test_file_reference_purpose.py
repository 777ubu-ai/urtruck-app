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


def test_unsent_legacy_chat_key_requests_reupload_without_accepting_it():
    ref = storage_service.LOCAL_PUBLIC_BASE + '/chat/old-photo.jpg'
    with pytest.raises(HTTPException) as error:
        chat.send_message(chat.SendMessageIn(photo_url=ref, room_id='synthetic-room'), {'id': 'owner'})
    assert error.value.status_code == 403
    assert error.value.detail == 'FILE_UPLOAD_REQUIRED'


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


def test_cargo_rejects_signed_private_storage_url(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    ref = 'https://fixture.supabase.co/storage/v1/object/sign/fixture-private/chat_attachments/private.pdf?token=fixture'
    body = marketplace.CargoIn(from_city='A', to_city='B', cargo_desc='fixture', photos=[ref])
    with pytest.raises(HTTPException) as error:
        marketplace.create_cargo(body, {'id': 'fixture-owner', 'role': 'client'})
    assert error.value.status_code in (400, 403)
    assert marketplace._sign_cargo_photos([ref]) == []


def test_existing_cargo_photo_and_external_url_remain_visible(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    photo = 'https://fixture.supabase.co/storage/v1/object/sign/fixture-private/cargo_photos/photo.jpg?token=fixture'
    external = 'https://example.org/vehicle.jpg'
    local_photo = 'https://app.example/security/storage/cargo_photos/photo.jpg?exp=fixture&sig=fixture'
    assert marketplace._sign_cargo_photos([photo, external, local_photo]) == [photo, external, local_photo]


@pytest.mark.parametrize('prefix', [
    'https://fixture.supabase.co:443/storage/v1/object/sign/',
    'https://fixture.supabase.co./storage/v1/object/sign/',
    'https://fixture.supabase.co/storage%2fv1/object/authenticated/',
    'https://fixture.supabase.co/storage/v1/object/public/',
])
def test_storage_url_variants_do_not_bypass_photo_guard(monkeypatch, prefix):
    monkeypatch.setattr(storage_service, 'SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    ref = prefix + 'fixture-private/id_documents/private.pdf?token=fixture'
    assert storage_service.own_supabase_object_url(ref) == (True, 'id_documents')
    assert marketplace._sign_cargo_photos([ref]) == []
    body = marketplace.CargoIn(from_city='A', to_city='B', cargo_desc='fixture', photos=[ref])
    with pytest.raises(HTTPException):
        marketplace.create_cargo(body, {'id': 'fixture-owner', 'role': 'client'})


@pytest.mark.parametrize('ref', [
    'https://%66ixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    r'https://fixture.supabase.co\storage\v1\object\sign\fixture-private\id_documents\private.pdf?token=fixture',
    'https://fixture.supabase.co/./storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    'https://fixture.supabase.co/a/../storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    'https://fixture.supabase.co/%2e/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    '//fixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    'https://ｆixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    'https://fixture。supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    'https://app.example/security/storage/id_documents/private.pdf?exp=fixture&sig=fixture',
    ' //fixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    '\t//fixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    r'/\fixture.supabase.co/storage/v1/object/sign/fixture-private/id_documents/private.pdf?token=fixture',
    '/./security/storage/id_documents/private.pdf?exp=fixture&sig=fixture',
])
def test_browser_url_normalization_cannot_bypass_photo_guard(monkeypatch, ref):
    monkeypatch.setattr(storage_service, 'SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-private')
    assert marketplace._sign_cargo_photos([ref]) == []
    body = marketplace.CargoIn(from_city='A', to_city='B', cargo_desc='fixture', photos=[ref])
    with pytest.raises(HTTPException):
        marketplace.create_cargo(body, {'id': 'fixture-owner', 'role': 'client'})
