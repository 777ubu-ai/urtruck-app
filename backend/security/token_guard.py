"""Token-guard: отзыв скомпрометированных токенов по fingerprint.

Механика инцидент-response для утечки QA-токена:

- Сами токены НИГДЕ не хранятся и не коммитятся. Revocation list — это
  набор SHA-256 fingerprint-префиксов, переданный через env
  `URTRUCK_REVOKED_TOKEN_SHA256` (comma-separated, hex, ≥8 символов).
- `assert_not_revoked(token)` вызывается в точке верификации Bearer-токена
  (api/registration.py::get_current_driver) ДО обращения к БД: отозванный
  токен получает 401, даже если он ещё валиден в sessions-таблице.
- `assert_config_tokens_not_revoked()` — startup-проверка конфигурационных
  секретов (ADMIN_TOKEN, QA_AGENT_TOKEN и т.п.): если задействованный
  секрет в revocation list — процесс падает fail-closed, а не работает
  со скомпрометированной конфигурацией.

В отчётах/логах/коммитах допустимы только fingerprint-префиксы.
"""
from __future__ import annotations

import hashlib
import os

from fastapi import HTTPException

# Env с revocation list. Значения — hex-префиксы sha256(token), ≥8 символов,
# через запятую. Пример: URTRUCK_REVOKED_TOKEN_SHA256="9f2ab71c44de,0123abcd"
REVOKED_ENV = "URTRUCK_REVOKED_TOKEN_SHA256"

# Конфигурационные env-секреты, проверяемые на startup.
CONFIG_SECRET_ENVS = (
    "ADMIN_TOKEN",
    "API_KEY",
    "QA_AGENT_TOKEN",
    "EXPO_ACCESS_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "SUPABASE_SERVICE_KEY",
)

MIN_PREFIX_LEN = 8


def fingerprint(token: str) -> str:
    """sha256 hex токена — единственная допустимая форма его публикации."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def revoked_fingerprints() -> frozenset:
    """Revocation list из env: очищенный набор lowercase hex-префиксов."""
    raw = os.getenv(REVOKED_ENV, "")
    out = set()
    for part in raw.split(","):
        p = part.strip().lower()
        if not p:
            continue
        if len(p) < MIN_PREFIX_LEN or not all(c in "0123456789abcdef" for c in p):
            # Невалидная запись игнорируется: кривой prefix не должен ни
            # блокировать легитимные токены, ни создавать ложное чувство
            # безопасности.
            continue
        out.add(p)
    return frozenset(out)


def is_revoked(token: str) -> bool:
    fp = fingerprint(token)
    return any(fp.startswith(p) for p in revoked_fingerprints())


def assert_not_revoked(token: str) -> None:
    """401 для отозванного токена. Вызывать до любой работы с токеном."""
    if token and is_revoked(token):
        raise HTTPException(status_code=401, detail="Токен отозван")


def assert_config_tokens_not_revoked() -> None:
    """Startup fail-closed: задействованный конфиг-секрет в revocation list
    → процесс не стартует. В ошибку попадает ТОЛЬКО имя env и fingerprint-
    префикс, никогда сам секрет."""
    revoked = revoked_fingerprints()
    if not revoked:
        return
    for env_name in CONFIG_SECRET_ENVS:
        value = os.getenv(env_name)
        if not value:
            continue
        fp = fingerprint(value)
        if any(fp.startswith(p) for p in revoked):
            raise RuntimeError(
                f"FATAL: {env_name} отозван (sha256:{fp[:12]}…) — "
                f"секрет скомпрометирован и обязан быть заменён до старта"
            )
