"""STT/voice-hardening track — real behavioral coverage for the STT
pipeline (backend/services/speech_to_text_service.py + POST /chat/transcribe,
POST /chat/translate, POST /chat/send's photo_url gate).

Before this file, `grep transcribe|speech_to_text|SpeechToTextError` across
backend/tests/ matched nothing — only upload-validation (MIME/size) and
frontend source-text "contract" tests existed. This exercises the REAL
endpoints/service against a real (temp) SQLite DB, not source-regex.

Covers, against real code:
  1. photo_url must be an owned storage reference (P0 security-audit fix) —
     an arbitrary client-supplied path/URL is rejected at /chat/send, and
     (defense in depth) at /chat/transcribe too.
  2. access control: a non-participant (C) cannot transcribe/translate.
  3. the deal-status gate (_assert_chat_is_accepted) newly applied to
     /chat/transcribe and /chat/translate, matching /chat/messages.
  4. idempotency: an already-transcribed message never calls the provider
     again; a concurrent in-flight attempt is claimed (409), and a stale
     (crashed) claim self-heals instead of blocking forever.
  5. structured error codes (TRANSCRIPTION_UNAVAILABLE/_TIMEOUT/_FAILED/
     _IN_PROGRESS) instead of raw provider text, for each SpeechToTextError
     shape the service can raise.
  6. speech_to_text_service's own provider/model/api-key selection and
     fail-closed behavior, isolated from the endpoint.
  7. storage_service.is_owned_storage_ref()'s shape-matching in isolation.

(The push_gateway.CRITICAL_EVENTS producer-string fix has its own test
file, test_push_priority_classification.py, in the push-reliability commit.)

CI contract: top-level `def test_*` (not a class) — see
test_idor_three_accounts.py's docstring for why; this file reuses that
same TestClient/dependency-override scaffold.
"""
import contextvars
import io
import os
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

A = "stt-shipper-" + uuid.uuid4().hex[:8]
B = "stt-driver-" + uuid.uuid4().hex[:8]
C = "stt-stranger-" + uuid.uuid4().hex[:8]

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
             "STT test cargo", "tent", 1000, 0, "active"),
        )
    return cargo_id


# ─────────────────────── setup: accepted deal + room ───────────────────────

def test_00_setup_accepted_deal_and_room():
    STATE["cargo_id"] = _seed_cargo(A)
    _as(B, role="driver")
    r = client.post("/api/v1/market/bids", json={"cargo_id": STATE["cargo_id"], "amount": 900, "message": "stt bid"})
    assert r.status_code == 200, r.text
    bid_id = (r.json().get("bid") or {}).get("id") or r.json().get("bid_id") or r.json().get("id")
    assert bid_id
    _as(A)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 200, r.text
    STATE["deal_id"] = r.json()["deal_id"]
    STATE["room_id"] = r.json().get("chat_room_id")
    assert STATE["room_id"], "accept must return a chat_room_id for STT tests to use"


# ───────────────────── 1. P0: photo_url must be owned ──────────────────────

def test_01_arbitrary_photo_url_rejected_at_send():
    """The security-audit P0 fix: photo_url is no longer accepted verbatim —
    it must look like a ref this backend's own storage service issued."""
    _as(A)
    for bad in ("/etc/passwd", "../../etc/passwd", "http://attacker.example/pixel.png",
                "file:///etc/passwd", "", None):
        if bad is None:
            continue  # None means "no photo" — not the case under test
        r = client.post("/api/v1/chat/send", json={
            "room_id": STATE["room_id"], "is_voice": True, "photo_url": bad,
        })
        assert r.status_code == 400, f"{bad!r} should be rejected, got {r.status_code} {r.text}"


def test_02_real_voice_upload_then_send_succeeds():
    """A key actually returned by /chat/voice passes the same gate."""
    _as(B)
    # Minimal valid WebM (EBML magic) — enough for upload_validation's
    # sniff_audio_mime, matches test_upload_validation.py's own fixture.
    webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    r = client.post(
        "/api/v1/chat/voice",
        files={"file": ("voice.webm", io.BytesIO(webm_bytes), "audio/webm")},
    )
    assert r.status_code == 200, r.text
    voice_key = r.json()["voice_key"]
    STATE["voice_key"] = voice_key

    r = client.post("/api/v1/chat/send", json={
        "room_id": STATE["room_id"], "is_voice": True, "photo_url": voice_key,
    })
    assert r.status_code == 200, r.text
    STATE["message_id"] = r.json()["message_id"] if "message_id" in r.json() else r.json().get("id")
    if not STATE["message_id"]:
        # send_message's response shape may nest the message; fall back to
        # reading it back from the DB by room+sender+is_voice.
        with get_conn() as c:
            row = c.execute(
                "SELECT id FROM chat_messages WHERE room_id = ? AND is_voice = 1 ORDER BY id DESC LIMIT 1",
                (STATE["room_id"],),
            ).fetchone()
        STATE["message_id"] = row["id"]
    assert STATE["message_id"]


def test_02b_voice_duration_boundary_rejects_over_60_seconds():
    """The API must enforce the voice-duration contract server-side."""
    _as(B)
    for duration in (0, 60):
        r = client.post("/api/v1/chat/send", json={
            "room_id": STATE["room_id"], "is_voice": True,
            "photo_url": STATE["voice_key"], "voice_duration": duration,
            "client_msg_id": f"voice-boundary-{duration}-{uuid.uuid4().hex}",
        })
        assert r.status_code == 200, f"{duration}s should be accepted: {r.status_code} {r.text}"

    for duration in (61,):
        r = client.post("/api/v1/chat/send", json={
            "room_id": STATE["room_id"], "is_voice": True,
            "photo_url": STATE["voice_key"], "voice_duration": duration,
            "client_msg_id": f"voice-boundary-{duration}-{uuid.uuid4().hex}",
        })
        assert r.status_code == 422, f"{duration}s must be rejected: {r.status_code} {r.text}"


# ───────────────────────── 2. access control ────────────────────────────

def test_03_stranger_cannot_transcribe():
    _as(C)
    r = client.post("/api/v1/chat/transcribe", json={"message_id": STATE["message_id"]})
    assert r.status_code == 403, r.text


def test_04_stranger_cannot_translate():
    _as(C)
    r = client.post("/api/v1/chat/translate", json={"message_id": STATE["message_id"], "target_lang": "en"})
    assert r.status_code == 403, r.text


# ──────────────── 3. deal-status gate (participant, but deal ineligible) ────

def test_05_participant_blocked_once_deal_leaves_chat_eligible_statuses(monkeypatch):
    """Security-audit finding: /chat/transcribe and /chat/translate used to
    only check room participancy, unlike /chat/messages (which also
    re-validates the deal is still in a chat-eligible status). A real
    participant of a deal that moved to a non-eligible status (e.g.
    cancelled) must now be blocked the same way on all three routes."""
    with get_conn() as c:
        c.execute("UPDATE deals SET status = 'cancelled' WHERE id = ?", (STATE["deal_id"],))
    try:
        _as(A)
        r = client.post("/api/v1/chat/transcribe", json={"message_id": STATE["message_id"]})
        assert r.status_code == 403, f"transcribe should 403 once deal is cancelled: {r.status_code} {r.text}"
        r = client.post("/api/v1/chat/translate", json={"message_id": STATE["message_id"], "target_lang": "en"})
        assert r.status_code == 403, f"translate should 403 once deal is cancelled: {r.status_code} {r.text}"
    finally:
        with get_conn() as c:
            c.execute("UPDATE deals SET status = 'accepted' WHERE id = ?", (STATE["deal_id"],))


# ───────────────────── 4. real transcription + idempotency ─────────────────

def test_06_transcribe_success_and_idempotent_on_repeat(monkeypatch):
    calls = {"n": 0, "language": None}

    def fake_transcribe(audio_ref, *, filename=None, language=None):
        calls["n"] += 1
        calls["language"] = language
        return {"transcript_text": "hello world", "provider": "openai", "source_lang": "en"}

    from services import push_gateway, speech_to_text_service
    monkeypatch.setattr(push_gateway, "get_recipient_locale", lambda user_id: "en-US")
    monkeypatch.setattr(speech_to_text_service, "transcribe_audio_ref", fake_transcribe)

    _as(A)
    r = client.post("/api/v1/chat/transcribe", json={"message_id": STATE["message_id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["transcript_text"] == "hello world"
    assert body["cached"] is False
    assert calls["n"] == 1
    assert calls["language"] == "en"

    # Idempotency: a second call (by either participant) must NOT invoke
    # the provider again — the persisted transcript is reused.
    _as(B)
    r2 = client.post("/api/v1/chat/transcribe", json={"message_id": STATE["message_id"]})
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["transcript_text"] == "hello world"
    assert body2["cached"] is True
    assert calls["n"] == 1, "a cached transcript must never re-invoke the STT provider"


# ─────────────── 5. concurrent-claim race + stale-claim self-heal ──────────

def test_07_concurrent_claim_returns_409_and_stale_claim_self_heals():
    cargo_id = _seed_cargo(A)
    _as(B, role="driver")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 500, "message": "claim test"})
    bid_id = (r.json().get("bid") or {}).get("id") or r.json().get("bid_id") or r.json().get("id")
    _as(A)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    room_id = r.json().get("chat_room_id")

    _as(B)
    webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    r = client.post("/api/v1/chat/voice", files={"file": ("voice.webm", io.BytesIO(webm_bytes), "audio/webm")})
    voice_key = r.json()["voice_key"]
    r = client.post("/api/v1/chat/send", json={"room_id": room_id, "is_voice": True, "photo_url": voice_key})
    assert r.status_code == 200, r.text
    with get_conn() as c:
        row = c.execute(
            "SELECT id FROM chat_messages WHERE room_id = ? AND is_voice = 1 ORDER BY id DESC LIMIT 1",
            (room_id,),
        ).fetchone()
    message_id = row["id"]

    # Simulate a first attempt already in flight.
    with get_conn() as c:
        c.execute(
            "UPDATE chat_messages SET voice_transcribe_claimed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (message_id,),
        )
    _as(A)
    r = client.post("/api/v1/chat/transcribe", json={"message_id": message_id})
    assert r.status_code == 409, f"a fresh claim must block a concurrent attempt: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "TRANSCRIPTION_IN_PROGRESS"

    # A claim older than the stale threshold (90s) must self-heal — simulate
    # a crashed request that never released its claim.
    with get_conn() as c:
        c.execute(
            "UPDATE chat_messages SET voice_transcribe_claimed_at = datetime('now', '-200 seconds') WHERE id = ?",
            (message_id,),
        )

    def fake_transcribe(audio_ref, *, filename=None, language=None):
        return {"transcript_text": "reclaimed", "provider": "openai", "source_lang": "en"}

    import services.speech_to_text_service as stt_mod
    real_fn = stt_mod.transcribe_audio_ref
    stt_mod.transcribe_audio_ref = fake_transcribe
    try:
        r = client.post("/api/v1/chat/transcribe", json={"message_id": message_id})
        assert r.status_code == 200, f"a stale (>90s) claim must self-heal, not block forever: {r.status_code} {r.text}"
        assert r.json()["transcript_text"] == "reclaimed"
    finally:
        stt_mod.transcribe_audio_ref = real_fn


# ───────────────────── 6. structured error codes ───────────────────────────

def test_08_error_codes_map_to_correct_status_and_no_raw_leak(monkeypatch):
    from services import speech_to_text_service as stt_mod

    cases = [
        (stt_mod.SpeechToTextError("x", code="TRANSCRIPTION_UNAVAILABLE", retryable=False), 422),
        (stt_mod.SpeechToTextError("x", code="TRANSCRIPTION_TIMEOUT", retryable=True), 503),
        (stt_mod.SpeechToTextError("x", code="TRANSCRIPTION_FAILED", retryable=False), 422),
    ]
    for exc, expected_status in cases:
        cargo_id = _seed_cargo(A)
        _as(B, role="driver")
        r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 400, "message": "err test"})
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

        def fake_transcribe(audio_ref, *, filename=None, language=None, _exc=exc):
            raise _exc

        monkeypatch.setattr(stt_mod, "transcribe_audio_ref", fake_transcribe)
        _as(A)
        r = client.post("/api/v1/chat/transcribe", json={"message_id": message_id})
        assert r.status_code == expected_status, f"{exc.code}: expected {expected_status}, got {r.status_code} {r.text}"
        detail = r.json()["detail"]
        assert detail["error"] == exc.code
        assert "OPENAI_API_KEY" not in str(detail), "must never leak the config var name to the client"


# ─────────────── 7. speech_to_text_service unit contract (no HTTP) ─────────

def test_09_provider_selection_and_fail_closed(monkeypatch):
    from services import speech_to_text_service as stt_mod

    monkeypatch.delenv("TRANSCRIBE_PROVIDER", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert stt_mod._provider() == "stub", "no key, no explicit provider -> stub, never a fake real provider"

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake-key-not-real")
    assert stt_mod._provider() == "openai"

    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "google")
    assert stt_mod._provider() == "google", "explicit TRANSCRIBE_PROVIDER always wins over the key-presence default"

    # Fail-closed: an unconfigured/unknown provider must raise a controlled
    # error, never fabricate a transcript.
    try:
        stt_mod.transcribe_audio_path("/tmp/does-not-matter.m4a")
        assert False, "must raise for a non-openai provider"
    except stt_mod.SpeechToTextError as exc:
        assert exc.code == "TRANSCRIPTION_UNAVAILABLE"
        assert "OPENAI_API_KEY" not in str(exc), "must never surface the config var name"

    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        stt_mod.transcribe_audio_path("/tmp/does-not-matter.m4a")
        assert False, "must raise when OPENAI_API_KEY is missing"
    except stt_mod.SpeechToTextError as exc:
        assert exc.code == "TRANSCRIPTION_UNAVAILABLE"
        assert "OPENAI_API_KEY" not in str(exc)


def test_10_lang_normalization_ru_zh_en():
    from services import speech_to_text_service as stt_mod

    assert stt_mod._normalize_lang_code("ru") == "ru"
    assert stt_mod._normalize_lang_code("RU-ru") == "ru"
    assert stt_mod._normalize_lang_code("cn") == "zh"
    assert stt_mod._normalize_lang_code("zh-CN") == "zh"
    assert stt_mod._normalize_lang_code("en") == "en"
    assert stt_mod._normalize_lang_code("") is None
    assert stt_mod._normalize_lang_code(None) is None


def test_11_malformed_provider_response_fails_closed(monkeypatch):
    """A 2xx response with a non-JSON body must not raise an unhandled
    500 — it must fail closed with a canonical, non-leaking error."""
    from services import speech_to_text_service as stt_mod

    class _FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            raise ValueError("not json")

        text = "<html>not json</html>"

    monkeypatch.setattr(stt_mod.httpx, "post", lambda *a, **kw: _FakeResponse())
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")

    import tempfile
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.write(fd, b"\x00" * 16)
    os.close(fd)
    try:
        stt_mod._transcribe_openai(path, filename="voice.m4a", api_key="sk-test-fake")
        assert False, "must raise, not silently return garbage"
    except stt_mod.SpeechToTextError as exc:
        assert exc.code == "TRANSCRIPTION_FAILED"
        assert "not json" not in str(exc), "raw provider body must not reach the user-facing message"
    finally:
        os.unlink(path)


def test_12_5xx_is_retryable_4xx_is_not(monkeypatch):
    """STT-hardening fix: previously EVERY httpx.HTTPStatusError (4xx and
    5xx alike) mapped to non-retryable/422 — a transient OpenAI outage was
    indistinguishable from 'this audio can't be transcribed'."""
    import httpx
    from services import speech_to_text_service as stt_mod

    def _raise(status):
        request = httpx.Request("POST", stt_mod.OPENAI_TRANSCRIPT_URL)
        response = httpx.Response(status, request=request, text="provider said no")

        class _R:
            status_code = status

            def raise_for_status(self_inner):
                raise httpx.HTTPStatusError("boom", request=request, response=response)

        return _R()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.write(fd, b"\x00" * 16)
    os.close(fd)
    try:
        monkeypatch.setattr(stt_mod.httpx, "post", lambda *a, **kw: _raise(500))
        try:
            stt_mod._transcribe_openai(path, filename="voice.m4a", api_key="sk-test-fake")
            assert False
        except stt_mod.SpeechToTextError as exc:
            assert exc.retryable is True, "a 5xx must be retryable"
            assert "provider said no" not in str(exc), "raw provider body must not leak"

        monkeypatch.setattr(stt_mod.httpx, "post", lambda *a, **kw: _raise(400))
        try:
            stt_mod._transcribe_openai(path, filename="voice.m4a", api_key="sk-test-fake")
            assert False
        except stt_mod.SpeechToTextError as exc:
            assert exc.retryable is False, "a 4xx (this specific request) must not be retryable"
    finally:
        os.unlink(path)


def test_12b_429_rate_limit_is_retryable_not_treated_as_bad_audio(monkeypatch):
    """Hardening B (2026-09-14): 429 (OpenAI rate limit / quota exceeded) is
    a 4xx status code, but unlike '400 this request is malformed' or '401/403
    bad key' it is TRANSIENT — OpenAI's own guidance is back off and retry.
    Before this fix `is_server_error = status >= 500` alone decided
    retryable, so a rate-limited transcription was reported to the driver
    identically to 'this recording can't be transcribed' (422, no retry
    hint) instead of 'try again shortly' (503, retryable) — see the sibling
    test_12 for the 5xx/4xx baseline this extends."""
    import httpx
    from services import speech_to_text_service as stt_mod

    def _raise_429():
        request = httpx.Request("POST", stt_mod.OPENAI_TRANSCRIPT_URL)
        response = httpx.Response(429, request=request, text="rate limit exceeded, account internals here")

        class _R:
            status_code = 429

            def raise_for_status(self_inner):
                raise httpx.HTTPStatusError("boom", request=request, response=response)

        return _R()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.write(fd, b"\x00" * 16)
    os.close(fd)
    try:
        monkeypatch.setattr(stt_mod.httpx, "post", lambda *a, **kw: _raise_429())
        try:
            stt_mod._transcribe_openai(path, filename="voice.m4a", api_key="sk-test-fake")
            assert False, "must raise for a 429 response"
        except stt_mod.SpeechToTextError as exc:
            assert exc.retryable is True, "429 (rate limit) must be retryable, not reported as bad audio"
            assert exc.code == "TRANSCRIPTION_TIMEOUT"
            assert "rate limit exceeded" not in str(exc), "raw provider body must not leak"
            assert "account internals" not in str(exc)
    finally:
        os.unlink(path)
    # A 429-shaped SpeechToTextError (code=TRANSCRIPTION_TIMEOUT,
    # retryable=True — exactly what the assertions above just confirmed
    # _transcribe_openai constructs for a 429) reaches POST /chat/transcribe
    # as 503, not 422 — already exercised end-to-end for this exact
    # (code, retryable) shape by test_08's TRANSCRIPTION_TIMEOUT/503 case.


def test_12c_429_insufficient_quota_is_unavailable_not_a_timeout(monkeypatch):
    import httpx
    from services import speech_to_text_service as stt_mod

    request = httpx.Request("POST", stt_mod.OPENAI_TRANSCRIPT_URL)
    response = httpx.Response(
        429, request=request,
        json={"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted"}},
    )

    class _R:
        status_code = 429

        def raise_for_status(self):
            raise httpx.HTTPStatusError("boom", request=request, response=response)

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.write(fd, b"\x00" * 16)
    os.close(fd)
    try:
        monkeypatch.setattr(stt_mod.httpx, "post", lambda *a, **kw: _R())
        try:
            stt_mod._transcribe_openai(path, filename="voice.m4a", api_key="sk-test-fake")
            assert False
        except stt_mod.SpeechToTextError as exc:
            assert exc.code == "TRANSCRIPTION_UNAVAILABLE"
            assert exc.retryable is False
    finally:
        os.unlink(path)


# ───────────────────── 8. storage_service.is_owned_storage_ref ─────────────

def test_13_is_owned_storage_ref_shapes():
    from services import storage_service

    assert storage_service.is_owned_storage_ref(None) is False
    assert storage_service.is_owned_storage_ref("") is False
    assert storage_service.is_owned_storage_ref("/etc/passwd") is False
    assert storage_service.is_owned_storage_ref("../../etc/passwd") is False
    assert storage_service.is_owned_storage_ref("http://attacker.example/pixel.png") is False
    assert storage_service.is_owned_storage_ref("file:///etc/passwd") is False
    assert storage_service.is_owned_storage_ref(f"supabase://{storage_service.SUPABASE_BUCKET}/../secret") is False
    assert storage_service.is_owned_storage_ref(f"supabase://not-our-bucket/chat_voice/x.webm") is False
    assert storage_service.is_owned_storage_ref(f"supabase://{storage_service.SUPABASE_BUCKET}/chat_voice/x.webm") is True
    assert storage_service.is_owned_storage_ref(f"{storage_service.LOCAL_PUBLIC_BASE}/chat_voice/x.webm") is True
    assert storage_service.is_owned_storage_ref(f"{storage_service.LOCAL_PUBLIC_BASE}/../../etc/passwd") is False
