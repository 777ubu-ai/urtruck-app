"""Contract for the loopback-only QA2 AI client."""
from types import SimpleNamespace

import pytest

from services import local_ai_client as client


class FakeResponse:
    def __init__(self, data, status=200):
        self._data = data
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            import json
            request = httpx.Request("POST", "http://127.0.0.1:8003/test")
            response = httpx.Response(
                self.status_code,
                request=request,
                content=json.dumps(self._data).encode("utf-8"),
                headers={"content-type": "application/json"},
            )
            raise httpx.HTTPStatusError("failed", request=request, response=response)

    def json(self):
        return self._data


def test_local_url_is_fail_closed(monkeypatch):
    monkeypatch.setenv("LOCAL_AI_URL", "https://example.com")
    with pytest.raises(client.LocalAIError) as error:
        client.translate("Груз", "ru", "zh")
    assert error.value.code == "AI_SERVICE_UNAVAILABLE"


def test_translation_uses_private_service(monkeypatch):
    seen = {}
    def post(url, **kwargs):
        seen["url"] = url
        seen["json"] = kwargs["json"]
        return FakeResponse({"translated_text": "货物", "source_lang": "ru"})
    monkeypatch.setenv("LOCAL_AI_URL", "http://127.0.0.1:8003")
    monkeypatch.setattr(client.httpx, "post", post)
    result = client.translate("Груз", "ru", "zh")
    assert seen == {"url": "http://127.0.0.1:8003/translate", "json": {"text": "Груз", "source_lang": "ru", "target_lang": "zh"}}
    assert result["provider"] == "local_nllb_1_3b"
    assert result["translated_text"] == "货物"


def test_translation_never_accepts_source_as_result(monkeypatch):
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResponse({"translated_text": "Груз"}))
    with pytest.raises(client.LocalAIError) as error:
        client.translate("Груз", "ru", "zh")
    assert error.value.code == "TRANSLATION_FAILED"


def test_translation_quality_rejection_has_stable_safe_code(monkeypatch):
    monkeypatch.setattr(
        client.httpx,
        "post",
        lambda *a, **k: FakeResponse(
            {"detail": {
                "message": "translation confidence too low",
                "candidate": "private",
                "reason_codes": ["city_missing:almaty", "not safe text!"],
            }},
            status=422,
        ),
    )
    with pytest.raises(client.LocalAIError) as error:
        client.translate("Груз", "ru", "zh")
    assert error.value.code == "TRANSLATION_QUALITY_FAILED"
    assert error.value.reason_codes == ("city_missing:almaty",)
    assert "private" not in str(error.value)


def test_transcription_sends_explicit_language_hint(monkeypatch, tmp_path):
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"audio")
    seen = {}
    def post(url, **kwargs):
        seen.update(url=url, data=kwargs["data"], timeout=kwargs["timeout"])
        return FakeResponse({
            "transcript_text": "Груз готов",
            "source_lang": "ru",
            "provider": "local_faster_whisper_large_v3_turbo",
            "confidence": 0.97,
        })
    monkeypatch.setattr(client.httpx, "post", post)
    result = client.transcribe(str(audio), language="ru-RU")
    assert seen == {
        "url": "http://127.0.0.1:8003/transcribe",
        "data": {"language": "ru"},
        "timeout": 240.0,
    }
    assert result["source_lang"] == "ru"
    assert result["confidence"] == 0.97


def test_transcription_422_is_a_file_failure_not_service_outage(monkeypatch, tmp_path):
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"not-audio")
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResponse({}, status=422))
    with pytest.raises(client.LocalAIError) as error:
        client.transcribe(str(audio))
    assert error.value.code == "TRANSCRIPTION_FAILED"
    assert error.value.retryable is False


def test_transcription_quality_rejection_has_stable_safe_code(monkeypatch, tmp_path):
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"audio")
    monkeypatch.setattr(
        client.httpx,
        "post",
        lambda *a, **k: FakeResponse({"detail": "transcription quality too low"}, status=422),
    )
    with pytest.raises(client.LocalAIError) as error:
        client.transcribe(str(audio))
    assert error.value.code == "TRANSCRIPTION_QUALITY_FAILED"


def test_transcription_503_is_retryable(monkeypatch, tmp_path):
    audio = tmp_path / "voice.m4a"
    audio.write_bytes(b"audio")
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResponse({}, status=503))
    with pytest.raises(client.LocalAIError) as error:
        client.transcribe(str(audio))
    assert error.value.code == "TRANSCRIPTION_TIMEOUT"
    assert error.value.retryable is True
