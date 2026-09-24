"""Speech-to-text service for chat voice messages."""
import json
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
    """`code` is the stable, translatable machine code (see err_<CODE> in
    src/utils/i18n.js) the frontend/API contract should key off of — the
    `message` is a RU-language fallback for callers that don't localize it,
    never raw provider text (a provider's HTTP error body may echo request
    internals — model name, account/plan details — that shouldn't reach an
    end user; see _transcribe_openai's own comment for what's logged
    instead)."""
    def __init__(self, message: str, *, provider: str = "", retryable: bool = False, code: str = "TRANSCRIPTION_FAILED"):
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable
        self.code = code


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


def _is_quota_exhausted(body: str) -> bool:
    """Distinguish a transient 429 rate limit from a billing stop.

    Provider text stays server-side; only its stable machine code controls the
    user-facing error contract.
    """
    try:
        error = json.loads(body or "{}").get("error") or {}
    except (TypeError, ValueError):
        return False
    return (
        str(error.get("type") or "").lower() == "insufficient_quota"
        or str(error.get("code") or "").lower() in {"insufficient_quota", "credit_balance_exhausted"}
    )


def transcribe_audio_ref(audio_ref: str, *, filename: str | None = None, language: str | None = None) -> dict:
    suffix = Path(filename or audio_ref or "voice.m4a").suffix or ".m4a"
    with storage.materialize_for_processing(audio_ref, suffix=suffix) as local_path:
        if not local_path or not Path(local_path).exists():
            raise SpeechToTextError("Голосовой файл не найден", provider=_provider(), code="TRANSCRIPTION_UNAVAILABLE")
        return transcribe_audio_path(local_path, filename=filename or Path(local_path).name, language=language)


def transcribe_audio_path(path: str, *, filename: str | None = None, language: str | None = None) -> dict:
    provider = _provider()
    if provider == "local_ai":
        from services.local_ai_client import LocalAIError, transcribe
        try:
            return transcribe(path, filename=filename)
        except LocalAIError as exc:
            raise SpeechToTextError(
                "Распознавание голоса временно недоступно", provider="local_faster_whisper",
                retryable=exc.retryable, code=exc.code,
            ) from exc
    if provider == "local_whisper":
        from services.local_speech_service import LocalSpeechError, transcribe
        try:
            return transcribe(path)
        except LocalSpeechError as exc:
            raise SpeechToTextError(
                "Распознавание голоса временно недоступно", provider=provider,
                retryable=exc.retryable, code=exc.code,
            ) from exc
    if provider != "openai":
        # Fail-closed (i18n-16/STT-hardening spec item 7): no configured
        # provider means no fake transcript — a controlled, canonical error
        # code, never a silently-invented result.
        raise SpeechToTextError("Распознавание голоса не настроено", provider=provider, code="TRANSCRIPTION_UNAVAILABLE")
    api_key = _api_key()
    if not api_key:
        # Deliberately does NOT say "OPENAI_API_KEY" to the caller — that's
        # an internal config-variable name, not something to leak past the
        # trust boundary (STT-hardening spec item 7's "no raw internal
        # exception" applies to config detail too, not just provider text).
        raise SpeechToTextError("Распознавание голоса не настроено", provider=provider, code="TRANSCRIPTION_UNAVAILABLE")
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
        raise SpeechToTextError("Распознавание голоса долго отвечает", provider="openai", retryable=True, code="TRANSCRIPTION_TIMEOUT") from exc
    except httpx.HTTPStatusError as exc:
        # STT-hardening spec item 7: the raw provider response body (may
        # echo request/account internals) is logged server-side ONLY — the
        # exception that reaches the API layer (and, from there, the HTTP
        # client) carries just a canonical code + generic RU text. A 5xx
        # from OpenAI (their own outage) is distinguished from a 4xx (this
        # specific request/audio was rejected) via `retryable`, so a
        # transient provider failure can be retried instead of reported to
        # the user as "this recording can't be transcribed."
        status = exc.response.status_code if exc.response is not None else 0
        body = exc.response.text[:300] if exc.response is not None else ""
        print(f"[stt] OpenAI HTTP {status}: {body}", flush=True)
        # A generic 429 is a transient rate-limit condition. OpenAI also
        # returns 429 for exhausted billing credit; that one cannot recover by
        # retrying and must not be shown as a timeout.
        quota_exhausted = status == 429 and _is_quota_exhausted(body)
        is_retryable = status >= 500 or (status == 429 and not quota_exhausted)
        code = (
            "TRANSCRIPTION_UNAVAILABLE" if quota_exhausted
            else "TRANSCRIPTION_TIMEOUT" if is_retryable
            else "TRANSCRIPTION_FAILED"
        )
        raise SpeechToTextError(
            "Распознавание голоса временно недоступно" if (quota_exhausted or is_retryable) else "Не удалось распознать голосовое сообщение",
            provider="openai",
            retryable=is_retryable,
            code=code,
        ) from exc
    except httpx.HTTPError as exc:
        raise SpeechToTextError("Сервис распознавания голоса недоступен", provider="openai", retryable=True, code="TRANSCRIPTION_UNAVAILABLE") from exc

    try:
        data = response.json()
    except ValueError as exc:
        # Malformed 2xx body (STT-hardening spec item 4) — a provider that
        # returns success with an unparsable body must still fail closed,
        # not bubble up as an unhandled 500.
        print(f"[stt] OpenAI returned non-JSON 2xx body: {response.text[:300]!r}", flush=True)
        raise SpeechToTextError("Распознавание голоса вернуло некорректный ответ", provider="openai", code="TRANSCRIPTION_FAILED") from exc
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
