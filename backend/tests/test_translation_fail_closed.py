"""Release-hardening track 2, item 4 — translation fail-silent fix.

Root cause: services/translate_service.py's _translate_openai() used to
catch EVERY exception and return {"translated_text": text, "provider":
"openai_error", ...} — i.e. silently hand back the ORIGINAL, untranslated
text disguised as a successful translation, with no way for a caller to
tell success from failure except by inspecting an internal `provider`
field the UI never showed. Worse, /chat/translate then CACHED that fake
result into chat_translations (INSERT OR REPLACE), so every subsequent
request for the same message+target_lang served the same broken
"translation" forever, never retrying.

This file proves, against the REAL functions (not a re-implementation):
  1. translate_text()/_translate_openai() now raise TranslationError with a
     stable `code` (mirrors speech_to_text_service.SpeechToTextError) for
     every failure shape — HTTP 4xx (non-retryable), HTTP 5xx (retryable),
     network/timeout (retryable), and a malformed 2xx body.
  2. POST /chat/translate surfaces that as a real error status + structured
     {error, hint} detail — never a fake 200 with translated_text ==
     original_text.
  3. A failed attempt is never cached — a subsequent retry actually calls
     the provider again (not silently served a phantom "success").
  4. POST /chat/transcribe's secondary (optional) translation step: a
     translation failure does not fail the whole transcribe response (the
     transcript itself is still good) but never masquerades the source
     text as if it were the translation.

CI contract: top-level `def test_*` (not a class) — see other tests in
this directory for why. Reuses test_idor_three_accounts.py's TestClient
scaffold.
"""
import contextvars
import io
import json as _json
import os
import socket
import urllib.error
import urllib.request
import uuid

os.environ.setdefault("ENV", "test")
os.environ.setdefault("STORAGE_PROVIDER", "local")

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.marketplace import mp_router
from api.chat import chat_router
from database.db import get_conn, new_id
from tests.auth_harness import override_require_level

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
override_require_level(app, _fake_require_level(1))
client = TestClient(app)

A = "tr-shipper-" + uuid.uuid4().hex[:8]
B = "tr-driver-" + uuid.uuid4().hex[:8]

STATE: dict = {}


def _as(uid, role="client"):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+700",
                       "verification_level": 1, "role": role})


def _seed_cargo(owner_id):
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Shipper", "Almaty", "Moscow", "KZ", "RU",
             "translation test cargo", "tent", 1000, 0, "active"),
        )
    return cargo_id


def _setup_room_and_text_message():
    cargo_id = _seed_cargo(A)
    _as(B, role="driver")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 700, "message": "tr bid"})
    bid_id = (r.json().get("bid") or {}).get("id") or r.json().get("bid_id") or r.json().get("id")
    _as(A)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    room_id = r.json().get("chat_room_id")
    _as(B)
    r = client.post("/api/v1/chat/send", json={"room_id": room_id, "text": "hello driver"})
    assert r.status_code == 200, r.text
    with get_conn() as c:
        row = c.execute(
            "SELECT id FROM chat_messages WHERE room_id = ? AND text = 'hello driver' ORDER BY id DESC LIMIT 1",
            (room_id,),
        ).fetchone()
    return room_id, row["id"]


def test_00_setup():
    room_id, message_id = _setup_room_and_text_message()
    STATE["room_id"] = room_id
    STATE["message_id"] = message_id


def test_00_stub_provider_fails_closed_instead_of_returning_source(monkeypatch):
    from services import translate_service as ts

    monkeypatch.delenv("TRANSLATE_PROVIDER", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        ts.translate_text("Привет", "zh", source_lang="ru")
        assert False, "an unconfigured provider must not return the source as a translation"
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_UNAVAILABLE"
        assert exc.provider == "stub"


# ─────────────────── 1. translate_service unit contract ───────────────────

def _fake_urlopen_http_error(status, body=b"provider said no"):
    def _raise(*a, **kw):
        raise urllib.error.HTTPError(
            "https://api.openai.com/v1/responses", status, "err",
            hdrs=None, fp=io.BytesIO(body),
        )
    return _raise


def test_01_4xx_is_not_retryable_and_does_not_leak_raw_body(monkeypatch):
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen_http_error(400, b"bad request details"))
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False, "must raise, not silently return the original text"
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_FAILED"
        assert exc.retryable is False
        assert "bad request details" not in str(exc), "raw provider body must not leak to the caller"


def test_02_5xx_is_retryable(monkeypatch):
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen_http_error(500, b"internal error"))
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_TIMEOUT"
        assert exc.retryable is True
        assert "internal error" not in str(exc)


def test_02b_429_is_retryable(monkeypatch):
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen_http_error(429, b"quota exhausted"))
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_TIMEOUT"
        assert exc.retryable is True
        assert "quota exhausted" not in str(exc)


def test_02c_429_insufficient_quota_is_unavailable_not_a_timeout(monkeypatch):
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    body = _json.dumps({"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted"}}).encode("utf-8")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen_http_error(429, body))
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_UNAVAILABLE"
        assert exc.retryable is False



def test_03_network_timeout_is_retryable(monkeypatch):
    from services import translate_service as ts

    def _raise(*a, **kw):
        raise socket.timeout("timed out")

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setattr(urllib.request, "urlopen", _raise)
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_TIMEOUT"
        assert exc.retryable is True


def test_04_malformed_response_fails_closed(monkeypatch):
    from services import translate_service as ts

    class _FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"<html>not json</html>"

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **kw: _FakeResp())
    try:
        ts.translate_text("hello", "ru", source_lang="en")
        assert False, "a malformed 2xx body must not silently succeed"
    except ts.TranslationError as exc:
        assert exc.code == "TRANSLATION_FAILED"
        assert "not json" not in str(exc)


def test_05_success_case_still_works(monkeypatch):
    from services import translate_service as ts

    class _FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return _json.dumps({
                "output": [{
                    "type": "message",
                    "content": [{"type": "output_text", "text": "  privet  "}],
                }],
            }).encode("utf-8")

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    captured = {}

    def _capture(req, **kw):
        captured["url"] = req.full_url
        captured["body"] = _json.loads(req.data.decode("utf-8"))
        return _FakeResp()

    monkeypatch.delenv("TRANSLATE_MODEL", raising=False)
    monkeypatch.setattr(urllib.request, "urlopen", _capture)
    result = ts.translate_text("hello", "ru", source_lang="en")
    assert result["translated_text"] == "privet"
    assert result["provider"] == "openai"
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["body"]["model"] == "gpt-5.6-luna"
    assert "messages" not in captured["body"]


# ───────────────────── 2. /chat/translate endpoint contract ────────────────

def test_06_endpoint_surfaces_structured_error_not_fake_success(monkeypatch):
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")

    def fake_translate_text(*a, **kw):
        raise ts.TranslationError("x", code="TRANSLATION_FAILED", retryable=False)

    monkeypatch.setattr(ts, "translate_text", fake_translate_text)

    _as(A)
    r = client.post("/api/v1/chat/translate", json={"message_id": STATE["message_id"], "target_lang": "ru"})
    assert r.status_code == 422, f"a translation failure must be a real error status: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "TRANSLATION_FAILED"


def test_07_failed_attempt_is_never_cached_retry_calls_provider_again(monkeypatch):
    """The actual regression this fixes: before, a failed attempt got
    INSERT OR REPLACE'd into chat_translations as if it succeeded, so every
    later request served the same broken result forever without retrying."""
    from services import translate_service as ts

    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")

    calls = {"n": 0}

    def flaky_translate_text(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ts.TranslationError("x", code="TRANSLATION_FAILED", retryable=False)
        return {"translated_text": "second try succeeded", "provider": "openai", "source_lang": "en"}

    monkeypatch.setattr(ts, "translate_text", flaky_translate_text)

    _as(A)
    r1 = client.post("/api/v1/chat/translate", json={"message_id": STATE["message_id"], "target_lang": "de"})
    assert r1.status_code == 422, r1.text

    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM chat_translations WHERE message_id = ? AND target_lang = 'de'",
            (STATE["message_id"],),
        ).fetchone()
    assert row is None, "a failed translation attempt must never be cached"

    r2 = client.post("/api/v1/chat/translate", json={"message_id": STATE["message_id"], "target_lang": "de"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["translated_text"] == "second try succeeded"
    assert r2.json()["cached"] is False
    assert calls["n"] == 2, "the retry must actually call the provider again, not serve a phantom cached failure"


# ──────────── 3. /chat/transcribe's secondary translation failure ─────────

def test_08_transcribe_secondary_translation_failure_does_not_fail_transcript(monkeypatch):
    from services import translate_service as ts
    from services import speech_to_text_service as stt_mod

    cargo_id = _seed_cargo(A)
    _as(B, role="driver")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 600, "message": "voice+tr test"})
    bid_id = (r.json().get("bid") or {}).get("id") or r.json().get("bid_id") or r.json().get("id")
    _as(A)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    room_id = r.json().get("chat_room_id")
    _as(B)
    webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    r = client.post("/api/v1/chat/voice", files={"file": ("voice.webm", io.BytesIO(webm_bytes), "audio/webm")})
    voice_key = r.json()["voice_key"]
    r = client.post("/api/v1/chat/send", json={"room_id": room_id, "is_voice": True, "photo_url": voice_key})
    with get_conn() as c:
        row = c.execute(
            "SELECT id FROM chat_messages WHERE room_id = ? AND is_voice = 1 ORDER BY id DESC LIMIT 1",
            (room_id,),
        ).fetchone()
    message_id = row["id"]

    def fake_transcribe(audio_ref, *, filename=None, language=None):
        return {"transcript_text": "hello there", "provider": "openai", "source_lang": "en"}

    def fake_translate_text(*a, **kw):
        raise ts.TranslationError("x", code="TRANSLATION_FAILED", retryable=False)

    monkeypatch.setattr(stt_mod, "transcribe_audio_ref", fake_transcribe)
    monkeypatch.setattr(ts, "translate_text", fake_translate_text)

    _as(A)
    r = client.post("/api/v1/chat/transcribe", json={"message_id": message_id, "target_lang": "de"})
    assert r.status_code == 200, f"a secondary translation failure must not fail the whole transcribe response: {r.status_code} {r.text}"
    body = r.json()
    assert body["transcript_text"] == "hello there", "the transcript itself must still be returned"
    assert body["translated_text"] is None, "must never masquerade the source text as a successful translation"
    assert body["translation_error"] == "TRANSLATION_FAILED"
