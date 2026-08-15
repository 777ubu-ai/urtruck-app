"""UrTruck Security — центральная конфигурация."""
import os

# API
API_HOST = "0.0.0.0"
API_PORT = 8001  # Отдельный порт (не 8080 — там фронтенд)
# Beta / Test mode — универсальный OTP-код для тестеров (bypass
# SMS/WhatsApp/Telegram).
#
# Stage 22 fix: до v69 дефолт был "true". Любой production-деплой,
# в котором забыли поставить BETA_MODE=false, пропускал универсальный
# код 0000 для каждого номера — security incident.
#
# SEC-001: runtime mode теперь fail-closed. Опечатка вроде "prodution" не
# должна превращать неизвестную среду в permissive dev и включать BETA bypass.
# Даже явно заданный BETA_MODE=true игнорируется в production/unknown env;
# env_check.py отдельно блокирует такую production-конфигурацию при startup.
VALID_RUNTIME_ENVIRONMENTS = frozenset({"production", "development", "preview", "test"})


def resolve_auth_runtime(environment: str | None, beta_value: str | None) -> tuple[str, bool, bool]:
    """Return (effective_env, env_is_valid, beta_enabled) without side effects."""
    raw_env = (environment or "production").strip().lower() or "production"
    env_is_valid = raw_env in VALID_RUNTIME_ENVIRONMENTS
    effective_env = raw_env if env_is_valid else "production"
    if beta_value is None or not str(beta_value).strip():
        beta_requested = effective_env != "production"
    else:
        beta_requested = str(beta_value).strip().lower() in ("1", "true", "yes")
    beta_enabled = bool(env_is_valid and effective_env != "production" and beta_requested)
    return effective_env, env_is_valid, beta_enabled


_raw_runtime_env = os.getenv("URTRUCK_ENV") or os.getenv("ENV")
URTRUCK_ENV, URTRUCK_ENV_VALID, BETA_MODE = resolve_auth_runtime(
    _raw_runtime_env,
    os.getenv("BETA_MODE"),
)
BETA_OTP_CODE = os.getenv("BETA_OTP_CODE", "0000")

# Ставки: конфиденциальный режим (InDrive-модель) под будущую монетизацию.
# По умолчанию FALSE — ставки ОТКРЫТЫ ДЛЯ ВСЕХ (полный список с суммами, как
# до фичи). При TRUE — не-владелец видит только count + свою ставку (чужие
# суммы скрыты). Телефон оферента в ЛЮБОМ режиме отдаётся только владельцу
# (это security, не зависит от флага). Решение владельца 2026-07: открыть,
# закрытый режим не удалять — спрятать за выключатель.
BIDS_CONFIDENTIAL = os.getenv("BIDS_CONFIDENTIAL", "false").lower() in ("1", "true", "yes")

# Database
# На сервере DB лежит в /home/ubuntu/urtruck/backend/database/security.db
DB_PATH = os.getenv("DB_PATH", "/home/ubuntu/urtruck/backend/database/security.db")

# Redis
REDIS_URL = "redis://localhost:6379/0"
CACHE_TTL_SECONDS = 3600

# OCR — языки доступны: rus, eng, kaz, uzb, uzb_cyrl, chi_sim, chi_tra
TESSERACT_CMD = "/usr/bin/tesseract"
OCR_LANGUAGES = "rus+eng+kaz+uzb+chi_sim"

# Соответствие языка UI → какие OCR-языки использовать (более точное распознавание)
OCR_LANG_MAP = {
    "RU": "rus+eng",
    "KZ": "kaz+rus+eng",
    "UZ": "uzb+rus+eng",
    "CN": "chi_sim+chi_tra+eng",
    "KG": "kir+rus+eng",  # если установлен kir
    "EN": "eng",
    "default": "rus+eng+kaz+chi_sim",
}

# Telegram (нужны api_id, api_hash от https://my.telegram.org)
TELEGRAM_API_ID = os.getenv("TG_API_ID", "")
TELEGRAM_API_HASH = os.getenv("TG_API_HASH", "")
TELEGRAM_SESSION = "urtruck_scanner"
TELEGRAM_DEMO_MODE = not (TELEGRAM_API_ID and TELEGRAM_API_HASH)

# Email OTP (SMTP) — канал для Китая (WhatsApp/TG заблокированы) + резерв.
# Подходит любой провайдер с SMTP: Resend / Amazon SES / SendGrid / Zoho / Yandex.
# Если host/user/password не заданы — email_service работает в MOCK (код в лог).
EMAIL_SMTP_HOST = os.getenv("EMAIL_SMTP_HOST", "")
EMAIL_SMTP_PORT = int(os.getenv("EMAIL_SMTP_PORT", "587"))
EMAIL_SMTP_USER = os.getenv("EMAIL_SMTP_USER", "")
EMAIL_SMTP_PASSWORD = os.getenv("EMAIL_SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "no-reply@urtruck.kz")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "UrTruck")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "true").lower() in ("1", "true", "yes")

# Интеграция с основным приложением
APP_WEBHOOK_URL = "http://127.0.0.1:8080/webhook"

# Скоринг — веса (сумма = 1.0)
SCORING_WEIGHTS = {
    "identity": 0.20,
    "reputation": 0.25,
    "social": 0.15,
    "experience": 0.15,
    "vehicle": 0.10,
    "financial": 0.10,
    "bonus": 0.05,
}

# Цветовые пороги
COLOR_THRESHOLDS = {
    "green": 70,    # >= 70
    "yellow": 40,   # 40-69
    "red": 1,       # 1-39
    "black": 0,     # 0 (бан)
}
