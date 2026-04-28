"""Translation service — OpenAI / stub / Google / DeepL.

OPENAI_API_KEY хранится ТОЛЬКО в backend .env.
Используется дешёвая модель gpt-4o-mini для перев��да.
"""
import os
import json

LANG_NAMES = {
    "ru": "Russian", "en": "English", "kz": "Kazakh", "cn": "Chinese",
    "uz": "Uzbek", "kg": "Kyrgyz", "de": "German", "fr": "French",
    "tj": "Tajik", "ge": "Georgian", "tm": "Turkmen",
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


def get_info():
    """Debug info — НЕ показывает сам ключ."""
    key = _get_api_key()
    return {
        "provider": _get_provider(),
        "openai_key_exists": bool(key and len(key) > 5),
        "openai_key_prefix": key[:8] + "..." if key and len(key) > 8 else "empty",
    }


def translate_text(text: str, target_lang: str, source_lang: str = None) -> dict:
    if not text or not text.strip():
        return {"translated_text": text, "provider": "skip", "source_lang": source_lang}

    provider = _get_provider()
    api_key = _get_api_key()

    if provider == "openai" and api_key:
        return _translate_openai(text, target_lang, source_lang, api_key)
    elif provider == "google":
        return _translate_google(text, target_lang, source_lang)
    elif provider == "deepl":
        return _translate_deepl(text, target_lang, source_lang)
    else:
        return {"translated_text": text, "provider": "stub", "source_lang": source_lang or "unknown"}


def _translate_openai(text, target_lang, source_lang, api_key):
    try:
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
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        translated = data["choices"][0]["message"]["content"].strip()
        return {
            "translated_text": translated,
            "provider": "openai",
            "source_lang": source_lang or "auto",
        }
    except Exception as e:
        print(f"[translate] OpenAI error: {e}")
        return {"translated_text": text, "provider": "openai_error", "source_lang": source_lang}


def _translate_google(text, target_lang, source_lang):
    return {"translated_text": text, "provider": "google_stub", "source_lang": source_lang}


def _translate_deepl(text, target_lang, source_lang):
    return {"translated_text": text, "provider": "deepl_stub", "source_lang": source_lang}
