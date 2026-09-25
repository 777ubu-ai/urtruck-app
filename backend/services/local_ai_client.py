"""Loopback-only client for the isolated QA2 AI service."""
import os
from pathlib import Path

import httpx


class LocalAIError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def _base_url() -> str:
    value = os.getenv("LOCAL_AI_URL", "http://127.0.0.1:8003").strip()
    if value not in {"http://127.0.0.1:8003", "http://localhost:8003"}:
        raise LocalAIError("AI_SERVICE_UNAVAILABLE")
    return value.rstrip("/")


def translate(text: str, source_lang: str | None, target_lang: str) -> dict:
    try:
        response = httpx.post(
            f"{_base_url()}/translate",
            json={"text": text, "source_lang": source_lang, "target_lang": target_lang},
            timeout=90.0,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.TimeoutException as exc:
        raise LocalAIError("TRANSLATION_TIMEOUT", retryable=True) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        code = "TRANSLATION_TIMEOUT" if retryable else "TRANSLATION_FAILED"
        raise LocalAIError(code, retryable=retryable) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise LocalAIError("TRANSLATION_UNAVAILABLE", retryable=True) from exc
    translated = str(data.get("translated_text") or "").strip()
    if not translated or translated == text.strip():
        raise LocalAIError("TRANSLATION_FAILED")
    return {
        "translated_text": translated,
        "provider": "local_nllb_1_3b",
        "source_lang": str(data.get("source_lang") or source_lang or "auto"),
    }


def transcribe(path: str, filename: str | None = None, language: str | None = None) -> dict:
    file_name = filename or Path(path).name or "voice.m4a"
    normalized_language = str(language or "").strip().lower().split("-", 1)[0]
    try:
        with open(path, "rb") as audio_file:
            response = httpx.post(
                f"{_base_url()}/transcribe",
                data={"language": normalized_language} if normalized_language else None,
                files={"file": (file_name, audio_file, "application/octet-stream")},
                timeout=240.0,
            )
        response.raise_for_status()
        data = response.json()
    except httpx.TimeoutException as exc:
        raise LocalAIError("TRANSCRIPTION_TIMEOUT", retryable=True) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        code = "TRANSCRIPTION_TIMEOUT" if retryable else "TRANSCRIPTION_FAILED"
        raise LocalAIError(code, retryable=retryable) from exc
    except (OSError, httpx.HTTPError, ValueError) as exc:
        raise LocalAIError("TRANSCRIPTION_UNAVAILABLE", retryable=True) from exc
    transcript = str(data.get("transcript_text") or "").strip()
    source_lang = str(data.get("source_lang") or "").strip()
    if not transcript or not source_lang:
        raise LocalAIError("TRANSCRIPTION_FAILED")
    return {
        "transcript_text": transcript,
        "provider": str(data.get("provider") or "local_faster_whisper_large_v3_turbo"),
        "source_lang": source_lang,
        "confidence": data.get("confidence"),
        "usage": None,
    }
