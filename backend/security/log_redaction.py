"""Централизованная редакция секретов в логах/ошибках/telemetry.

Root-cause fix инцидента с утечкой токена: раньше каждый call-site решал
сам, маскировать ли токен (и решал по-разному). Теперь:

1. `redact()` — рекурсивно вычищает чувствительные ключи и token-паттерны
   из любых структур перед логированием;
2. `RedactionFilter` — logging.Filter, который вычищает record.msg и
   record.args независимо от того, что передал call-site (defence in depth:
   даже если кто-то залогирует сырое значение, в sink уйдёт редacted);
3. `install_global_redaction()` — навешивает фильтр на все root handlers
   при старте backend (см. main.py).

Запрещено: печатать сами секреты. Допустимы только redacted value,
fingerprint (sha256 hex) или его prefix.
"""
from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

# --- Ключи, чьи значения никогда не покидают процесс в логах --------------
# Matching по "contains" в lower(): ловим и authorization, и x-admin-token,
# и access_token, и client_secret одной таблицей.
SENSITIVE_KEY_PARTS = (
    "authorization",      # Authorization / Proxy-Authorization
    "cookie",             # Cookie / Set-Cookie
    "token",              # token, access_token, refresh_token, id_token,
                          # push_token, x-admin-token, api-token ...
    "secret",             # secret, client_secret, webhook_secret ...
    "password",
    "passphrase",
    "api_key",
    "apikey",
    "api-key",            # X-Api-Key и прочие kebab-case варианты
    "session_id",
)

# --- Паттерны секретов внутри произвольных строк ---------------------------
_PATTERNS = (
    # Authorization: Bearer <value>
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{8,}"), r"\1***"),
    # JWT (header.payload.signature), header всегда начинается с eyJ
    (re.compile(r"eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{3,}"), "<jwt:***>"),
    # Expo push token
    (re.compile(r"ExponentPushToken\[[A-Za-z0-9_-]{4,}\]"), "ExponentPushToken[***]"),
    # Telegram bot token  <digits>:<35+ chars>
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{20,}\b"), "<telegram-token:***>"),
    # OpenAI-style ключи
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"), "sk-***"),
)

REDACTED = "***"


def token_fingerprint(value: str) -> str:
    """Необратимый fingerprint секрета для логов/отзыва (sha256 hex)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _is_sensitive_key(key: Any) -> bool:
    k = str(key).lower()
    return any(part in k for part in SENSITIVE_KEY_PARTS)


def redact_str(text: str) -> str:
    out = text
    for rx, repl in _PATTERNS:
        out = rx.sub(repl, out)
    return out


def redact(obj: Any) -> Any:
    """Рекурсивно вычищает секреты из dict/list/tuple/set/str.

    - dict: значения чувствительных ключей заменяются на ***; остальные
      значения обходятся рекурсивно;
    - str: вычищаются token-паттерны (Bearer/JWT/Expo/Telegram/sk-);
    - прочие объекты возвращаются как есть.
    """
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if _is_sensitive_key(k):
                out[k] = REDACTED
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, (list, tuple, set, frozenset)):
        return type(obj)(redact(v) for v in obj)
    if isinstance(obj, str):
        return redact_str(obj)
    return obj


class RedactionFilter(logging.Filter):
    """logging.Filter: вычищает msg и args записи перед форматированием.

    Навешивается на handlers (фильтр logger'а не срабатывает для
    propagated records от дочерних логгеров — только фильтр handler'а
    гарантирует редакцию на выходе).
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        try:
            if isinstance(record.msg, str):
                record.msg = redact_str(record.msg)
            if record.args:
                record.args = redact(record.args)
        except Exception:
            # Редакция не должна ронять логирование; в худшем случае
            # запись уйдёт с исходным msg — но без args, где живут значения.
            record.args = ()
        return True


def install_global_redaction() -> int:
    """Навешивает RedactionFilter на все root handlers. Идемпотентно.

    Возвращает число handlers, на которые фильтр добавлен.
    """
    root = logging.getLogger()
    added = 0
    for h in root.handlers:
        if not any(isinstance(f, RedactionFilter) for f in h.filters):
            h.addFilter(RedactionFilter())
            added += 1
    if not root.handlers:
        # Handlers ещё не настроены (ранний startup) — создаём default,
        # чтобы ни одна запись не ушла без фильтра.
        h = logging.StreamHandler()
        h.addFilter(RedactionFilter())
        root.addHandler(h)
        added = 1
    return added
