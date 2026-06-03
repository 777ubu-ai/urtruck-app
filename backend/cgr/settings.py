"""Настройки CGR-интеграции — Pydantic Settings (TZ §2.6).

CGR_IIN_SALT обязателен на старте — если не задан, приложение падает
с понятной ошибкой (раздел 8.5 чеклиста).
"""
import os
import sys
from pathlib import Path

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    _HAVE_PYDANTIC_SETTINGS = True
except ImportError:
    # Fallback на случай если pydantic-settings ещё не установлен.
    # Не используем в production — main.py обязан установить пакет.
    _HAVE_PYDANTIC_SETTINGS = False
    BaseSettings = object  # type: ignore
    SettingsConfigDict = dict  # type: ignore


class CGRSettings(BaseSettings):
    """Все настройки префиксом CGR_*. Источник — env (.env подгружается в main.py)."""

    base_url: str = "https://cgr.qoldau.kz"
    user_agent: str = "UrTruck/1.0 (+https://urtruck.kz; partner-integration)"
    request_timeout_sec: int = 30

    scoreboard_interval_min: int = 5
    booking_poll_interval_min: int = 15
    blocklist_cron: str = "0 3 * * *"

    iin_salt: str = ""              # обязательно из env, проверка ниже
    rate_limit_requests_per_min: int = 20
    feature_enabled: bool = True

    push_throttle_minutes: int = 60

    if _HAVE_PYDANTIC_SETTINGS:
        model_config = SettingsConfigDict(
            env_prefix="CGR_",
            env_file=".env",
            extra="ignore",
        )
    else:
        # Минимальный fallback — читаем напрямую из os.environ
        def __init__(self, **kwargs):  # type: ignore[no-redef]
            for f in (
                "base_url", "user_agent", "request_timeout_sec",
                "scoreboard_interval_min", "booking_poll_interval_min",
                "blocklist_cron", "iin_salt", "rate_limit_requests_per_min",
                "feature_enabled", "push_throttle_minutes",
            ):
                env_key = "CGR_" + f.upper()
                if env_key in os.environ:
                    val = os.environ[env_key]
                    if f in ("request_timeout_sec", "scoreboard_interval_min",
                             "booking_poll_interval_min",
                             "rate_limit_requests_per_min", "push_throttle_minutes"):
                        val = int(val)
                    elif f == "feature_enabled":
                        val = val.lower() in ("true", "1", "yes")
                    setattr(self, f, val)


def _load_settings() -> CGRSettings:
    s = CGRSettings()
    if s.feature_enabled and not s.iin_salt:
        # Раздел 8.5 чеклиста — должно падать на старте с понятным сообщением.
        raise ValueError(
            "CGR_IIN_SALT is required when CGR_FEATURE_ENABLED=true. "
            "Generate via `openssl rand -hex 32` and add to backend/.env."
        )
    return s


cgr_settings = _load_settings()
