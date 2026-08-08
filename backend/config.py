"""UrTruck Security — центральная конфигурация."""
import os

# API
API_HOST = "0.0.0.0"
API_PORT = 8001  # Отдельный порт (не 8080 — там фронтенд)
API_SECRET = os.getenv("URTRUCK_API_SECRET", "urtruck-security-demo-2026")

# Beta / Test mode — универсальный OTP-код для тестеров (bypass
# SMS/WhatsApp/Telegram).
#
# Stage 22 fix: до v69 дефолт был "true". Любой production-деплой,
# в котором забыли поставить BETA_MODE=false, пропускал универсальный
# код 0000 для каждого номера — security incident. Теперь дефолт
# завязан на URTRUCK_ENV:
#   * URTRUCK_ENV=production → BETA_MODE=false по дефолту
#     (env_check.py дополнительно ругается, если включить вручную).
#   * dev / preview / unset → BETA_MODE=true (тестеры заходят с 0000).
URTRUCK_ENV = os.getenv("URTRUCK_ENV", "").lower()
IS_PRODUCTION = URTRUCK_ENV == "production"
_beta_default = "false" if URTRUCK_ENV == "production" else "true"
BETA_MODE = os.getenv("BETA_MODE", _beta_default).lower() in ("1", "true", "yes")
BETA_OTP_CODE = os.getenv("BETA_OTP_CODE", "0000")

# Ставки: конфиденциальный режим (InDrive-модель) под будущую монетизацию.
# По умолчанию FALSE — ставки ОТКРЫТЫ ДЛЯ ВСЕХ (полный список с суммами, как
# до фичи). При TRUE — не-владелец видит только count + свою ставку (чужие
# суммы скрыты). Телефон оферента в ЛЮБОМ режиме отдаётся только владельцу
# (это security, не зависит от флага). Решение владельца 2026-07: открыть,
# закрытый режим не удалять — спрятать за выключатель.
BIDS_CONFIDENTIAL = os.getenv("BIDS_CONFIDENTIAL", "false").lower() in ("1", "true", "yes")

# App Store / Google Play review — демо-вход для ревьюера (Guideline 2.1a).
# Фиксированный email + код принимаются ТОЛЬКО для этого одного адреса —
# это НЕ глобальный BETA_MODE (тот отключён на проде). Даёт ревьюеру доступ ко
# всем функциям без реального OTP. Аккаунт обычный (не админ, чужие данные
# по-прежнему защищены owner-check/IDOR-фиксами). Значения можно переопределить
# в .env; код 4-значный, чтобы влезал в OTP-поле приложения (не 0000).
REVIEWER_DEMO_EMAIL = os.getenv("REVIEWER_DEMO_EMAIL", "appreview@urtruck.kz").strip().lower()
REVIEWER_DEMO_CODE = os.getenv("REVIEWER_DEMO_CODE", "1975")

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
