"""Authenticated Telegram webhook for the SEC-005 bound OTP flow."""
import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import hmac
import json
from fastapi import APIRouter, Request, HTTPException
import httpx

from services import telegram_otp

tg_webhook_router = APIRouter()

def _send_message(chat_id: int, text: str, **kwargs):
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return False
    payload = {"chat_id": chat_id, "text": text}
    if kwargs.get("reply_markup") is not None:
        payload["reply_markup"] = kwargs["reply_markup"]
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload,
            timeout=10.0,
        )
        return True
    except Exception:
        # Exception strings may contain the bot-token URL. Never log them.
        print("[TG-bot] sendMessage failed", flush=True)
        return False


def _verify_telegram_signature(secret_token: str) -> bool:
    """Проверяет X-Telegram-Bot-Api-Secret-Token против env TELEGRAM_WEBHOOK_SECRET.

    Telegram при setWebhook?secret_token=X отправляет этот же X в заголовке —
    сверяем побайтово.
    """
    expected = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()
    if len(expected) < telegram_otp.WEBHOOK_SECRET_MIN_LENGTH:
        return False
    if not secret_token:
        return False  # secret задан, а заголовка нет — отказ
    return hmac.compare_digest(secret_token, expected)


@tg_webhook_router.post("/webhook")
async def telegram_webhook(request: Request):
    """Принимает Telegram Bot Update с проверкой подписи."""
    if not telegram_otp.webhook_configured():
        raise HTTPException(status_code=503, detail="Telegram webhook disabled")
    sig = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not _verify_telegram_signature(sig):
        raise HTTPException(status_code=403, detail="Invalid Telegram signature")
    body_bytes = await request.body()

    try:
        body = json.loads(body_bytes)
    except Exception:
        return {"ok": False}

    message = body.get("message") or body.get("edited_message") or {}
    status = telegram_otp.handle_message(message, _send_message)
    return {"ok": True, "status": status}


@tg_webhook_router.get("/webhook/info")
def webhook_info():
    return {
        "enabled": telegram_otp.webhook_configured(),
        "mode": "REAL" if telegram_otp.webhook_configured() else "DISABLED",
    }
