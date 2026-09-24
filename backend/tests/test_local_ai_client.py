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
            request = httpx.Request("POST", "http://127.0.0.1:8003/test")
            raise httpx.HTTPStatusError("failed", request=request, response=httpx.Response(self.status_code, request=request))

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
    assert result["provider"] == "local_m2m100"
    assert result["translated_text"] == "货物"


def test_translation_never_accepts_source_as_result(monkeypatch):
    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResponse({"translated_text": "Груз"}))
    with pytest.raises(client.LocalAIError) as error:
        client.translate("Груз", "ru", "zh")
    assert error.value.code == "TRANSLATION_FAILED"
