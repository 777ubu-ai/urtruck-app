"""Translation service — OpenAI / stub / Google / DeepL.

OPENAI_API_KEY хранится ТОЛЬКО в backend .env.
Используется самая дешёвая realtime text-модель GPT-5.6 Luna.
"""
import os
import json

# Release-hardening track 2, item 4: TranslationError mirrors
# speech_to_text_service.SpeechToTextError's contract — `code` is the
# stable, translatable machine code (err_<CODE> in src/utils/i18n.js),
# `message` is a RU-language fallback for callers that don't localize it,
# never raw provider text.
class TranslationError(RuntimeError):
    def __init__(self, message: str, *, provider: str = "", retryable: bool = False, code: str = "TRANSLATION_FAILED"):
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable
        self.code = code


LANG_NAMES = {
    "ru": "Russian", "en": "English", "kk": "Kazakh", "kz": "Kazakh",
    "zh": "Chinese", "cn": "Chinese", "uz": "Uzbek", "kg": "Kyrgyz",
    "ky": "Kyrgyz", "de": "German", "fr": "French", "tj": "Tajik",
    "ge": "Georgian", "tm": "Turkmen",
}

LANG_ALIAS = {
    "cn": "zh",
    "zh-cn": "zh",
    "zh-hans": "zh",
    "kz": "kk",
    "kk-kz": "kk",
}

TRANSLATION_PROMPT_VERSION = "logistics-v2-nllb-quality-gate"

SYSTEM_PROMPT = (
    "You are a logistics translation engine. "
    "Translate the text exactly and neutrally. "
    "Do not add information. Do not explain. Do not improve style. "
    "Preserve numbers, prices, dates, locations, addresses, vehicle numbers, and phone numbers. "
    "Return only the translated text."
)


def _get_provider():
    return os.environ.get("TRANSLATE_PROVIDER", "stub")


def _get_api_key():
    return os.environ.get("OPENAI_API_KEY", "")


def _get_model():
    return os.environ.get("TRANSLATE_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna"


def _is_quota_exhausted(body):
    """Return true only for OpenAI's non-retryable billing 429 shape."""
    try:
        error = json.loads(body or "{}").get("error") or {}
    except (TypeError, ValueError):
        return False
    return (
        str(error.get("type") or "").lower() == "insufficient_quota"
        or str(error.get("code") or "").lower() in {"insufficient_quota", "credit_balance_exhausted"}
    )


def get_cache_identity():
    provider = (_get_provider() or "stub").strip().lower()
    return {
        "provider": provider,
        "model": _get_model() if provider == "openai" else "nllb_200_distilled_1_3b_int8" if provider == "local_ai" else "",
        "prompt_version": TRANSLATION_PROMPT_VERSION,
    }


def _normalize_lang_code(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in LANG_ALIAS:
        return LANG_ALIAS[raw]
    base = raw.split("-", 1)[0]
    return LANG_ALIAS.get(base, base)


def get_info():
    """Debug info — НЕ раскрывает ключ. QA-находка: endpoint публичный,
    поэтому префикс ключа наружу не отдаём вовсе (только факт наличия)."""
    key = _get_api_key()
    provider = _get_provider()
    return {
        "provider": provider,
        "model": _get_model() if provider == "openai" else "nllb_200_distilled_1_3b_int8" if provider == "local_ai" else "",
        "prompt_version": TRANSLATION_PROMPT_VERSION,
        "openai_key_exists": bool(key and len(key) > 5),
    }


def translate_text(text: str, target_lang: str, source_lang: str = None) -> dict:
    if not text or not text.strip():
        return {"translated_text": text, "provider": "skip", "source_lang": source_lang}
    target_lang = _normalize_lang_code(target_lang) or "en"
    source_lang = _normalize_lang_code(source_lang) or source_lang
    if source_lang and target_lang == source_lang:
        return {"translated_text": text, "provider": "skip_same_lang", "source_lang": source_lang}

    provider = _get_provider()
    api_key = _get_api_key()

    if provider == "openai" and api_key:
        return _translate_openai(text, target_lang, source_lang, api_key)
    if provider == "local_ai":
        from services.local_ai_client import LocalAIError, translate
        try:
            return translate(text, source_lang, target_lang)
        except LocalAIError as exc:
            raise TranslationError(
                "Перевод временно недоступен", provider="local_nllb_1_3b",
                retryable=exc.retryable, code=exc.code,
            ) from exc

    # A provider stub must never return the source text as a successful
    # translation. That made an unconfigured deployment look healthy and
    # cached untranslated logistics messages as if they were translated.
    # Keep legacy provider names selectable for diagnostics, but fail closed
    # until a real provider is configured.
    raise TranslationError(
        "Перевод не настроен",
        provider=provider or "stub",
        code="TRANSLATION_UNAVAILABLE",
    )


def _translate_openai(text, target_lang, source_lang, api_key):
    import socket
    import urllib.error
    import urllib.request

    lang_name = LANG_NAMES.get(target_lang.lower(), target_lang)
    user_msg = f"Translate to {lang_name}:\n{text}"

    body = json.dumps({
        "model": _get_model(),
        "instructions": SYSTEM_PROMPT,
        "input": user_msg,
        "max_output_tokens": 500,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    # Release-hardening track 2, item 4 ("translation fail-silent"): this
    # used to catch EVERY exception and return {"translated_text": text,
    # "provider": "openai_error", ...} — i.e. silently hand back the
    # ORIGINAL, untranslated text disguised as a successful translation. A
    # user could not tell "translated (and happens to read the same)" from
    # "translation failed" except by inspecting an internal `provider`
    # field the UI never showed. Now raises a structured TranslationError
    # (mirrors SpeechToTextError) instead — the caller (chat.py) must
    # surface this as a real failure, never cache it as a successful
    # translation, and never fall back to displaying the source text as if
    # it were the requested translation.
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        status = exc.code
        detail_body = ""
        try:
            detail_body = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        print(f"[translate] OpenAI HTTP {status}: {detail_body}", flush=True)
        quota_exhausted = status == 429 and _is_quota_exhausted(detail_body)
        is_retryable = status >= 500 or (status == 429 and not quota_exhausted)
        code = (
            "TRANSLATION_UNAVAILABLE" if quota_exhausted
            else "TRANSLATION_TIMEOUT" if is_retryable
            else "TRANSLATION_FAILED"
        )
        raise TranslationError(
            "Перевод временно недоступен" if (quota_exhausted or is_retryable) else "Не удалось перевести текст",
            provider="openai",
            retryable=is_retryable,
            code=code,
        ) from exc
    except (urllib.error.URLError, socket.timeout) as exc:
        print(f"[translate] OpenAI network error: {exc}", flush=True)
        raise TranslationError("Перевод временно недоступен", provider="openai", retryable=True, code="TRANSLATION_TIMEOUT") from exc

    try:
        data = json.loads(raw)
        parts = []
        for item in data.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    parts.append(content["text"])
        translated = "".join(parts).strip()
        if not translated:
            raise ValueError("response has no output_text")
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        print(f"[translate] OpenAI returned an unparsable response: {raw[:300]!r}", flush=True)
        raise TranslationError("Перевод вернул некорректный ответ", provider="openai", code="TRANSLATION_FAILED") from exc

    return {
        "translated_text": translated,
        "provider": "openai",
        "source_lang": source_lang or "auto",
    }


def _translate_google(text, target_lang, source_lang):
    return {"translated_text": text, "provider": "google_stub", "source_lang": source_lang}


def _translate_deepl(text, target_lang, source_lang):
    return {"translated_text": text, "provider": "deepl_stub", "source_lang": source_lang}
