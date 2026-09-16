"""Контракт дополнительного STT-провайдера без платных API и загрузки моделей."""
from types import SimpleNamespace

import pytest

from services import local_speech_service as local
from services import speech_to_text_service as speech


def test_local_provider_detects_audio_language_without_ui_hint(monkeypatch):
    calls = []
    def transcribe(path, **kwargs):
        calls.append((path, kwargs))
        return iter([SimpleNamespace(text=" 货物7800美元 ")]), SimpleNamespace(language="zh")
    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "local_whisper")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(local, "_load_model", lambda: SimpleNamespace(transcribe=transcribe))
    result = speech.transcribe_audio_path("voice.wav", language="ru")
    assert result == {"transcript_text": "货物7800美元", "source_lang": "zh",
                      "provider": "local_whisper", "usage": None}
    assert "language" not in calls[0][1]


def test_local_rejects_remote_model_name(monkeypatch):
    monkeypatch.setenv("LOCAL_WHISPER_MODEL_PATH", "Systran/faster-whisper-small")
    with pytest.raises(local.LocalSpeechError) as error:
        local._load_model()
    assert error.value.code == "TRANSCRIPTION_UNAVAILABLE"


def test_busy_retries_without_starting_another_inference(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "local_whisper")
    local._slot.acquire()
    try:
        with pytest.raises(speech.SpeechToTextError) as error:
            speech.transcribe_audio_path("voice.wav")
        assert error.value.retryable
        assert error.value.code == "TRANSCRIPTION_TIMEOUT"
    finally:
        local._slot.release()


def test_empty_transcript_fails_and_releases_slot(monkeypatch):
    monkeypatch.setattr(local, "_load_model", lambda: SimpleNamespace(
        transcribe=lambda *a, **k: (iter([]), SimpleNamespace(language="ru"))))
    with pytest.raises(local.LocalSpeechError) as error:
        local.transcribe("voice.wav")
    assert error.value.code == "TRANSCRIPTION_FAILED"
    assert local._slot.acquire(blocking=False)
    local._slot.release()


def test_openai_provider_remains_selectable(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(speech, "_transcribe_openai", lambda *a, **k: {"provider": "openai"})
    assert speech.transcribe_audio_path("voice.wav")["provider"] == "openai"
