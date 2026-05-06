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
_beta_default = "false" if URTRUCK_ENV == "production" else "true"
BETA_MODE = os.getenv("BETA_MODE", _beta_default).lower() in ("1", "true", "yes")
BETA_OTP_CODE = os.getenv("BETA_OTP_CODE", "0000")

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
