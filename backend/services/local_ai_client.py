"""Loopback-only client for the isolated QA2 AI service."""
import os
import re
from pathlib import Path

import httpx


class LocalAIError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False, reason_codes=()):
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.reason_codes = tuple(reason_codes)


_SAFE_REASON_CODE = re.compile(r"^[a-z0-9_]+(?::[a-z0-9_]+)?$")


def _safe_error_details(response, fallback: str) -> tuple[str, tuple[str, ...]]:
    """Map private AI 4xx details to safe codes without leaking chat text."""
    try:
        detail = response.json().get("detail")
    except (AttributeError, TypeError, ValueError):
        return fallback, ()
    reason_codes = ()
    if isinstance(detail, dict):
        raw_reasons = detail.get("reason_codes") or detail.get("gate_failure_reasons") or ()
        if isinstance(raw_reasons, list):
            reason_codes = tuple(
                value for value in (str(item or "").strip().lower() for item in raw_reasons)
                if _SAFE_REASON_CODE.fullmatch(value)
            )
        detail = detail.get("message") or detail.get("error")
    detail = str(detail or "").strip().lower()
    code = {
        "translation confidence too low": "TRANSLATION_QUALITY_FAILED",
        "transcription quality too low": "TRANSCRIPTION_QUALITY_FAILED",
        "no speech detected": "TRANSCRIPTION_NO_SPEECH",
        "audio could not be decoded": "TRANSCRIPTION_AUDIO_INVALID",
    }.get(detail, fallback)
    return code, reason_codes


def _safe_error_code(response, fallback: str) -> str:
    """Map private AI 4xx details to stable safe codes without leaking text."""
    return _safe_error_details(response, fallback)[0]


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
        code, reason_codes = (
            ("TRANSLATION_TIMEOUT", ()) if retryable
            else _safe_error_details(exc.response, "TRANSLATION_FAILED")
        )
        raise LocalAIError(code, retryable=retryable, reason_codes=reason_codes) from exc
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
        code = "TRANSCRIPTION_TIMEOUT" if retryable else _safe_error_code(
            exc.response, "TRANSCRIPTION_FAILED"
        )
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
