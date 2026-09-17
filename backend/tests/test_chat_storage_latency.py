"""Приватные вложения не замедляют каждый poll и цикл обработки запросов."""
import asyncio
import io
import threading
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi import UploadFile

from api import chat
from services import storage_service as storage


@pytest.fixture
def signing(monkeypatch):
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://storage.example.test")
    monkeypatch.setattr(storage, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(storage, "SUPABASE_BUCKET", "private")
    monkeypatch.setattr(storage, "_SIGNED_URL_CACHE", storage.OrderedDict())
    clock = [100.0]
    monkeypatch.setattr(storage.time, "monotonic", lambda: clock[0])
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={"signedURL": f"/object/sign/private/photo.jpg?token={len(calls)}"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(storage.httpx, "post", post)
    return clock, calls


def test_polls_reuse_signed_url_and_refresh_before_expiry(signing):
    clock, calls = signing
    ref = "supabase://private/photo.jpg"
    first = storage.create_signed_url(ref, ttl=60)
    clock[0] += 3
    assert storage.create_signed_url(ref, ttl=60) == first
    assert len(calls) == 1
    clock[0] += 28
    assert storage.create_signed_url(ref, ttl=60) != first
    assert len(calls) == 2


def test_two_participants_share_one_signing_request(signing):
    _, calls = signing
    with ThreadPoolExecutor(max_workers=8) as pool:
        urls = list(pool.map(lambda _: storage.create_signed_url("supabase://private/voice.m4a"), range(32)))
    assert len(set(urls)) == 1
    assert len(calls) == 1


def test_cache_scopes_credentials_and_ttl(signing, monkeypatch):
    _, calls = signing
    ref = "supabase://private/photo.jpg"
    storage.create_signed_url(ref, 60)
    storage.create_signed_url(ref, 600)
    monkeypatch.setattr(storage, "SUPABASE_KEY", "rotated-test-key")
    storage.create_signed_url(ref, 600)
    assert len(calls) == 3


def test_failure_is_not_cached(signing, monkeypatch):
    _, calls = signing
    post = storage.httpx.post
    monkeypatch.setattr(storage.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.ReadTimeout("unavailable")))
    with pytest.raises(httpx.ReadTimeout):
        storage.create_signed_url("supabase://private/photo.jpg")
    monkeypatch.setattr(storage.httpx, "post", post)
    assert storage.create_signed_url("supabase://private/photo.jpg")
    assert len(calls) == 1


def test_cache_is_bounded(signing, monkeypatch):
    _, calls = signing
    monkeypatch.setattr(storage, "_SIGNED_URL_CACHE_LIMIT", 2)
    for name in ("a", "b", "c", "a"):
        storage.create_signed_url(f"supabase://private/{name}.jpg")
    assert len(storage._SIGNED_URL_CACHE) == 2
    assert len(calls) == 4


@pytest.mark.parametrize("endpoint,payload", [
    (chat.upload_chat_photo, b"\xff\xd8\xffimage"),
    (chat.upload_chat_voice, b"\x1a\x45\xdf\xa3webm"),
])
def test_slow_upload_does_not_block_event_loop(monkeypatch, endpoint, payload):
    entered, release = threading.Event(), threading.Event()

    def slow_save(*args, **kwargs):
        entered.set()
        assert release.wait(timeout=3), "Обработчик заблокировал цикл событий"
        return "supabase://private/file"

    monkeypatch.setattr(chat.storage, "save_file", slow_save)

    async def run():
        task = asyncio.create_task(endpoint(file=UploadFile(file=io.BytesIO(payload), filename="test"), user={"id": "test"}))
        try:
            for _ in range(100):
                if entered.is_set():
                    break
                await asyncio.sleep(0.01)
            assert entered.is_set()
        finally:
            release.set()
        return await task

    assert asyncio.run(run())
