"""Speech-to-text service for chat voice messages."""
import os
from pathlib import Path

import httpx

from services import storage_service as storage

OPENAI_TRANSCRIPT_URL = "https://api.openai.com/v1/audio/transcriptions"

LANG_ALIAS = {
    "cn": "zh",
    "zh-cn": "zh",
    "zh-hans": "zh",
    "kz": "kk",
    "kk-kz": "kk",
}


class SpeechToTextError(RuntimeError):
    def __init__(self, message: str, *, provider: str = "", retryable: bool = False):
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable


def _normalize_lang_code(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in LANG_ALIAS:
        return LANG_ALIAS[raw]
    base = raw.split("-", 1)[0]
    return LANG_ALIAS.get(base, base)


def _provider() -> str:
    explicit = os.getenv("TRANSCRIBE_PROVIDER", "").strip().lower()
    if explicit:
        return explicit
    return "openai" if os.getenv("OPENAI_API_KEY", "").strip() else "stub"


def _model() -> str:
    return os.getenv("TRANSCRIBE_MODEL", "gpt-transcribe").strip() or "gpt-transcribe"


def _api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def transcribe_audio_ref(audio_ref: str, *, filename: str | None = None, language: str | None = None) -> dict:
    suffix = Path(filename or audio_ref or "voice.m4a").suffix or ".m4a"
    with storage.materialize_for_processing(audio_ref, suffix=suffix) as local_path:
        if not local_path or not Path(local_path).exists():
            raise SpeechToTextError("Голосовой файл не найден", provider=_provider())
        return transcribe_audio_path(local_path, filename=filename or Path(local_path).name, language=language)


def transcribe_audio_path(path: str, *, filename: str | None = None, language: str | None = None) -> dict:
    provider = _provider()
    if provider != "openai":
        raise SpeechToTextError("Распознавание голоса не настроено", provider=provider)
    api_key = _api_key()
    if not api_key:
        raise SpeechToTextError("OPENAI_API_KEY не задан", provider=provider)
    return _transcribe_openai(path, filename=filename, language=language, api_key=api_key)


def _transcribe_openai(path: str, *, filename: str | None = None, language: str | None = None, api_key: str) -> dict:
    file_name = filename or Path(path).name or "voice.m4a"
    mime = (
        "audio/webm" if file_name.endswith(".webm") else
        "audio/ogg" if file_name.endswith(".ogg") else
        "audio/wav" if file_name.endswith(".wav") else
        "audio/mpeg" if file_name.endswith(".mp3") else
        "audio/mp4"
    )
    form = {
        "model": _model(),
        "response_format": "json",
    }
    normalized_lang = _normalize_lang_code(language)
    if normalized_lang:
        form["language"] = normalized_lang
    try:
        with open(path, "rb") as audio_file:
            response = httpx.post(
                OPENAI_TRANSCRIPT_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                data=form,
                files={"file": (file_name, audio_file, mime)},
                timeout=60.0,
            )
        response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise SpeechToTextError("Распознавание голоса долго отвечает", provider="openai", retryable=True) from exc
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:300] if exc.response is not None else ""
        raise SpeechToTextError(
            f"OpenAI speech-to-text отклонил запрос: {body or exc.response.status_code}",
            provider="openai",
        ) from exc
    except httpx.HTTPError as exc:
        raise SpeechToTextError("Сервис распознавания голоса недоступен", provider="openai", retryable=True) from exc

    data = response.json()
    transcript = str(data.get("text") or "").strip()
    detected_lang = None
    languages = data.get("languages")
    if isinstance(languages, list) and languages:
      first = languages[0] or {}
      if isinstance(first, dict):
          detected_lang = _normalize_lang_code(first.get("code"))
    return {
        "transcript_text": transcript,
        "provider": "openai",
        "source_lang": detected_lang or normalized_lang or "auto",
        "usage": data.get("usage"),
    }
