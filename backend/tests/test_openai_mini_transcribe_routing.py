"""Unit contract for the bounded QA2 OpenAI-STT pilot (no network/audio)."""
from services import speech_to_text_service as stt


def _qa2_openai(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "openai")
    monkeypatch.setenv("TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("QA2_OPENAI_STT_TIMEOUT_SECONDS", "8")


def test_uses_only_gpt_4o_mini_transcribe(monkeypatch):
    _qa2_openai(monkeypatch)
    assert stt._model() == "gpt-4o-mini-transcribe"
    monkeypatch.setenv("TRANSCRIBE_MODEL", "gpt-transcribe")
    try:
        stt._model()
        assert False, "another paid OpenAI STT model must fail closed"
    except stt.SpeechToTextError as error:
        assert error.code == "TRANSCRIPTION_UNAVAILABLE"


def test_openai_does_not_treat_ui_locale_as_spoken_language(monkeypatch, tmp_path):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("QA2_OPENAI_STT_TIMEOUT_SECONDS", "8")
    seen = {}

    class Response:
        def raise_for_status(self): pass
        def json(self): return {"text": "русская речь", "usage": {"total_tokens": 1}}

    monkeypatch.setattr(stt.httpx, "post", lambda *_a, **kw: seen.update(kw) or Response())
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"test")
    result = stt._transcribe_openai(str(audio), filename="voice.m4a", language="zh", api_key="test")
    assert "language" not in seen["data"]
    assert result["source_lang"] == "auto"
    assert seen["timeout"] == 8


def test_openai_only_uses_explicit_provider_language_not_ui_locale(monkeypatch, tmp_path):
    """RU speech under zh UI, ZH speech under ru UI and mixed speech stay auto."""
    _qa2_openai(monkeypatch)
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"test")
    for ui_locale in ("zh", "ru", "en", "ru-ZH"):
        seen = {}

        class Response:
            def raise_for_status(self): pass
            def json(self): return {"text": "controlled", "usage": {"total_tokens": 1}}

        monkeypatch.setattr(stt.httpx, "post", lambda *_a, **kw: seen.update(kw) or Response())
        result = stt._transcribe_openai(str(audio), filename="voice.m4a", language=ui_locale, api_key="test")
        assert "language" not in seen["data"]
        assert result["source_lang"] == "auto"


def test_auto_empty_and_null_are_local_nllb_auto_detection_not_language_codes():
    from services.translate_service import _normalize_lang_code

    assert _normalize_lang_code("auto") is None
    assert _normalize_lang_code("") is None
    assert _normalize_lang_code(None) is None
    assert _normalize_lang_code("zh-CN") == "zh"


def test_openai_success_does_not_start_local_provider(monkeypatch):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("TRANSCRIBE_FALLBACK_PROVIDER", "local_ai")
    calls = []
    monkeypatch.setattr(stt, "_transcribe_openai", lambda *a, **k: calls.append("openai") or {
        "transcript_text": "Москва 10 тонн", "source_lang": "ru", "provider": "openai", "usage": None,
    })
    monkeypatch.setattr(stt, "_transcribe_local_ai", lambda *a, **k: calls.append("local") or {})
    result = stt.transcribe_audio_path("unused.m4a", language="ru")
    assert calls == ["openai"]
    assert result["provider"] == "openai"


def test_timeout_falls_back_once_and_sequentially(monkeypatch):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("TRANSCRIBE_FALLBACK_PROVIDER", "local_ai")
    calls = []

    def timed_out(*_args, **_kwargs):
        calls.append("openai")
        raise stt.SpeechToTextError("timeout", provider="openai", retryable=True, code="TRANSCRIPTION_TIMEOUT")

    def local(*_args, **_kwargs):
        calls.append("local")
        return {"transcript_text": "北京 500 USD", "source_lang": "zh", "provider": "local_faster_whisper", "usage": None}

    monkeypatch.setattr(stt, "_transcribe_openai", timed_out)
    monkeypatch.setattr(stt, "_transcribe_local_ai", local)
    result = stt.transcribe_audio_path("unused.m4a", language="zh")
    assert calls == ["openai", "local"]
    assert result["provider"] == "local_faster_whisper_fallback"


def test_network_and_5xx_are_eligible_for_one_local_fallback(monkeypatch):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("TRANSCRIBE_FALLBACK_PROVIDER", "local_ai")
    for code in ("TRANSCRIPTION_UNAVAILABLE", "TRANSCRIPTION_TIMEOUT"):
        calls = []

        def failed_openai(*_args, **_kwargs):
            calls.append("openai")
            raise stt.SpeechToTextError("transient", provider="openai", retryable=True, code=code)

        monkeypatch.setattr(stt, "_transcribe_openai", failed_openai)
        monkeypatch.setattr(stt, "_transcribe_local_ai", lambda *a, **k: calls.append("local") or {
            "transcript_text": "ok", "source_lang": "ru", "provider": "local_faster_whisper", "usage": None,
        })
        assert stt.transcribe_audio_path("unused.m4a")["provider"] == "local_faster_whisper_fallback"
        assert calls == ["openai", "local"]


def test_429_never_substitutes_a_local_result(monkeypatch):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("TRANSCRIBE_FALLBACK_PROVIDER", "local_ai")
    calls = []

    def rate_limited(*_args, **_kwargs):
        calls.append("openai")
        raise stt.SpeechToTextError(
            "rate limited", provider="openai", retryable=True,
            code="TRANSCRIPTION_TIMEOUT", fallback_allowed=False,
        )

    monkeypatch.setattr(stt, "_transcribe_openai", rate_limited)
    monkeypatch.setattr(stt, "_transcribe_local_ai", lambda *a, **k: calls.append("local") or {})
    try:
        stt.transcribe_audio_path("unused.m4a", language="ru")
        assert False, "429 must remain an OpenAI blocker"
    except stt.SpeechToTextError as error:
        assert error.code == "TRANSCRIPTION_TIMEOUT"
    assert calls == ["openai"]


def test_permanent_openai_or_fallback_failure_never_fabricates_transcript(monkeypatch):
    _qa2_openai(monkeypatch)
    monkeypatch.setenv("TRANSCRIBE_FALLBACK_PROVIDER", "local_ai")
    monkeypatch.setattr(
        stt, "_transcribe_openai",
        lambda *a, **k: (_ for _ in ()).throw(stt.SpeechToTextError(
            "bad request", provider="openai", retryable=False, code="TRANSCRIPTION_FAILED",
        )),
    )
    try:
        stt.transcribe_audio_path("unused.m4a")
        assert False
    except stt.SpeechToTextError as error:
        assert error.code == "TRANSCRIPTION_FAILED"

    monkeypatch.setattr(
        stt, "_transcribe_openai",
        lambda *a, **k: (_ for _ in ()).throw(stt.SpeechToTextError(
            "network", provider="openai", retryable=True, code="TRANSCRIPTION_UNAVAILABLE",
        )),
    )
    monkeypatch.setattr(
        stt, "_transcribe_local_ai",
        lambda *a, **k: (_ for _ in ()).throw(stt.SpeechToTextError(
            "local unavailable", provider="local_faster_whisper", retryable=True,
            code="TRANSCRIPTION_UNAVAILABLE",
        )),
    )
    try:
        stt.transcribe_audio_path("unused.m4a")
        assert False
    except stt.SpeechToTextError as error:
        assert error.provider == "openai_then_local_ai"
        assert error.retryable is True
