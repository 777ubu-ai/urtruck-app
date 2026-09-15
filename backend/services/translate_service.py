"""Translation service — OpenAI / stub / Google / DeepL.

OPENAI_API_KEY хранится ТОЛЬКО в backend .env.
Используется дешёвая модель gpt-4o-mini для перев��да.
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
    return {
        "provider": _get_provider(),
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
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.1,
        "max_tokens": 500,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
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
        is_server_error = status >= 500
        raise TranslationError(
            "Перевод временно недоступен" if is_server_error else "Не удалось перевести текст",
            provider="openai",
            retryable=is_server_error,
            code="TRANSLATION_TIMEOUT" if is_server_error else "TRANSLATION_FAILED",
        ) from exc
    except (urllib.error.URLError, socket.timeout) as exc:
        print(f"[translate] OpenAI network error: {exc}", flush=True)
        raise TranslationError("Перевод временно недоступен", provider="openai", retryable=True, code="TRANSLATION_TIMEOUT") from exc

    try:
        data = json.loads(raw)
        translated = data["choices"][0]["message"]["content"].strip()
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
