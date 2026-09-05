"""Telegram Bot Webhook — автоподтверждение /start verify_XXXX.

Когда юзер жмёт deep link t.me/UrTruckBot?start=verify_1234 →
Telegram отправляет сюда webhook с текстом /start verify_1234.
Мы извлекаем код, проверяем в verification_codes, подтверждаем.

Настройка (после получения TELEGRAM_BOT_TOKEN):
  curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://urtruck.kz/security/api/v1/telegram/webhook"
"""
import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
from fastapi import APIRouter, Request, HTTPException
import httpx

from database import registration_dal as reg_dal

tg_webhook_router = APIRouter()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def _send_message(chat_id: int, text: str):
    if not BOT_TOKEN:
        print(f"[TG-bot MOCK] → {chat_id}: {text}")
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10.0,
        )
    except Exception as e:
        print(f"[TG-bot] sendMessage failed: {e}")


def _verify_telegram_signature(secret_token: str) -> bool:
    """Проверяет X-Telegram-Bot-Api-Secret-Token против env TELEGRAM_WEBHOOK_SECRET.

    Telegram при setWebhook?secret_token=X отправляет этот же X в заголовке —
    сверяем побайтово.
    """
    import hmac
    expected = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if not expected:
        # Предрелизный аудит 28.08.2026 (P0-hardening): fail-open здесь —
        # это OTP-oracle. Пока бот в MOCK (нет TELEGRAM_BOT_TOKEN), эндпоинт
        # ничего не отправляет и вреда нет. Но в момент, когда владелец задаст
        # TELEGRAM_BOT_TOKEN на проде без WEBHOOK_SECRET, любой аноним сможет
        # перебором вытащить чужой OTP-код. Поэтому: если бот АКТИВЕН на проде
        # без секрета — закрываемся наглухо (fail-closed), а не пропускаем.
        _is_prod = (os.getenv("URTRUCK_ENV", "production").strip().lower()
                    == "production")
        _bot_active = bool(os.getenv("TELEGRAM_BOT_TOKEN"))
        if _is_prod and _bot_active:
            return False  # активный бот без секрета — отказ, а не дыра
        return True  # secret не настроен и бот неактивен — dev/polling mode
    if not secret_token:
        return False  # secret задан, а заголовка нет — отказ
    return hmac.compare_digest(secret_token, expected)


@tg_webhook_router.post("/webhook")
async def telegram_webhook(request: Request):
    """Принимает Telegram Bot Update с проверкой подписи."""
    sig = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not _verify_telegram_signature(sig):
        raise HTTPException(status_code=403, detail="Invalid Telegram signature")
    body_bytes = await request.body()

    try:
        body = json.loads(body_bytes)
    except Exception:
        return {"ok": False}

    message = body.get("message", {})
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")
    from_user = message.get("from", {})

    if not chat_id:
        return {"ok": True}

    # /start verify_XXXX
    #
    # ROOT CAUSE (Release Block 6 audit, P0): mirrors the same oracle in
    # services/telegram_bot.py — resolved ANY live code from the shared
    # verification_codes table (issued by WhatsApp/SMS too) to a phone
    # number, with no rate limit and no chat_id↔phone binding. Telegram
    # OTP delivery is disabled (services/otp_service.py send_telegram) —
    # this webhook path must not touch verification_codes either, or the
    # oracle stays open via this alternate (webhook, vs polling-bot) path.
    if text.startswith("/start verify_"):
        _send_message(chat_id, "ℹ️ Подтверждение через Telegram временно недоступно. "
                       "Запросите код по WhatsApp или SMS в приложении UrTruck.")
        return {"ok": True}

    # /start (без кода)
    elif text.startswith("/start"):
        _send_message(
            chat_id,
            f"👋 Добро пожаловать в *UrTruck Bot*!\n\n"
            f"Этот бот используется для подтверждения номера телефона.\n"
            f"Перейдите в приложение и выберите «Telegram» в способах входа.\n\n"
            f"🌍 urtruck.kz"
        )
        return {"ok": True}

    # /help
    elif text.startswith("/help"):
        _send_message(
            chat_id,
            "ℹ️ *UrTruck Bot*\n\n"
            "Используется для OTP-подтверждения.\n"
            "Просто нажмите на ссылку в приложении — код подтвердится автоматически.\n\n"
            "Поддержка: 777ubu@gmail.com · WhatsApp +7 747 917 11 18"
        )
        return {"ok": True}

    return {"ok": True}


@tg_webhook_router.get("/webhook/info")
def webhook_info():
    return {
        "bot_token_set": bool(BOT_TOKEN),
        "mode": "MOCK" if not BOT_TOKEN else "REAL",
    }
