"""Regression: chat polling must not make the same private photo blink."""

from services import file_signing
from services import storage_service
from urllib.parse import parse_qs, urlsplit


def test_local_signed_url_is_stable_inside_polling_window(monkeypatch):
    monkeypatch.setenv("FILE_SIGNING_KEY", "x" * 32)
    monkeypatch.setattr(file_signing.time, "time", lambda: 1_700_000_001)
    first = file_signing.sign("/security/storage/chat_photos/proof.jpg")

    # ChatScreen polls roughly every three seconds.  The exact same object
    # must keep its source URL, otherwise React Native reloads the image.
    monkeypatch.setattr(file_signing.time, "time", lambda: 1_700_000_004)
    second = file_signing.sign("/security/storage/chat_photos/proof.jpg")

    assert first == second


def test_local_expiry_and_key_change_affect_all_old_links(monkeypatch):
    monkeypatch.setenv('FILE_SIGNING_KEY', 'a' * 32)
    now = 1_700_000_001
    monkeypatch.setattr(file_signing.time, 'time', lambda: now)
    paths = ('chat_photos/one.jpg', 'chat_attachments/two.pdf')
    signed = [file_signing.sign('/security/storage/' + path) for path in paths]
    params = [parse_qs(urlsplit(url).query) for url in signed]
    expiry = int(params[0]['exp'][0])
    assert 86400 <= expiry - now < 86400 + 900
    assert all(file_signing.verify(path, item['exp'][0], item['sig'][0]) for path, item in zip(paths, params))
    monkeypatch.setenv('FILE_SIGNING_KEY', 'b' * 32)
    assert all(not file_signing.verify(path, item['exp'][0], item['sig'][0]) for path, item in zip(paths, params))
    monkeypatch.setenv('FILE_SIGNING_KEY', 'a' * 32)
    monkeypatch.setattr(file_signing.time, 'time', lambda: expiry)
    assert all(file_signing.verify(path, item['exp'][0], item['sig'][0]) for path, item in zip(paths, params))
    monkeypatch.setattr(file_signing.time, 'time', lambda: expiry + 1)
    assert all(not file_signing.verify(path, item['exp'][0], item['sig'][0]) for path, item in zip(paths, params))


def test_supabase_requested_ttl_is_bounded_in_source(monkeypatch):
    monkeypatch.setattr(storage_service, 'SUPABASE_URL', 'https://fixture.example')
    monkeypatch.setattr(storage_service, 'SUPABASE_KEY', 'fixture-key')
    monkeypatch.setattr(storage_service, 'SUPABASE_BUCKET', 'fixture-bucket')
    calls = []
    monkeypatch.setattr(storage_service, '_request_signed_url', lambda bucket, key, ttl: calls.append(ttl) or 'https://fixture.example/signed')
    storage_service.create_signed_url('supabase://fixture-bucket/chat_photos/a.jpg', ttl=1)
    storage_service.create_signed_url('supabase://fixture-bucket/chat_photos/b.jpg', ttl=900000)
    file_signing.sign('supabase://fixture-bucket/chat_photos/c.jpg')
    assert calls == [60, 7 * 24 * 60 * 60, 86400]
