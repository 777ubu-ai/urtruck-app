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


def _verify_telegram_signature(body_bytes: bytes, secret_token: str) -> bool:
    """Проверка X-Telegram-Bot-Api-Secret-Token если настроен."""
    if not secret_token:
        return True  # Если secret не настроен — пропускаем (для polling mode)
    import hashlib, hmac
    expected = hashlib.sha256(BOT_TOKEN.encode()).hexdigest()[:32]
    return hmac.compare_digest(secret_token, expected)


@tg_webhook_router.post("/webhook")
async def telegram_webhook(request: Request):
    """Принимает Telegram Bot Update с проверкой подписи."""
    # Проверка подписи (если настроен secret_token при setWebhook)
    sig = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    body_bytes = await request.body()
    if sig and not _verify_telegram_signature(body_bytes, sig):
        raise HTTPException(status_code=403, detail="Invalid Telegram signature")

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
    if text.startswith("/start verify_"):
        code = text.replace("/start verify_", "").strip()
        if not code:
            _send_message(chat_id, "❌ Код не указан. Попробуйте ещё раз.")
            return {"ok": True}

        # Ищем код в verification_codes
        from database.db import get_conn
        with get_conn() as c:
            row = c.execute(
                "SELECT phone FROM verification_codes WHERE code = ?", (code,)
            ).fetchone()

        if not row:
            _send_message(chat_id, "❌ Код не найден или истёк. Запросите новый в приложении.")
            return {"ok": True}

        phone = row["phone"]
        # НЕ удаляем код — отправляем юзеру, он введёт в приложении
        _send_message(
            chat_id,
            f"🔐 *Ваш код подтверждения:*\n\n"
            f"```\n{code}\n```\n\n"
            f"Введите этот код в приложении UrTruck.\n"
            f"Код действителен 5 минут.\n\n"
            f"_Никому не сообщайте этот код!_"
        )
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
            "Поддержка: @UrTruckSupport"
        )
        return {"ok": True}

    return {"ok": True}


@tg_webhook_router.get("/webhook/info")
def webhook_info():
    return {
        "bot_token_set": bool(BOT_TOKEN),
        "mode": "MOCK" if not BOT_TOKEN else "REAL",
    }
