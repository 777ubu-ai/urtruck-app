"""Telegram Bot polling — автоподтверждение /start verify_XXXX.

Вместо webhook (требует HTTPS) используем long polling через getUpdates.
Запускается как фоновый поток при старте API.
"""
import os
import sys
import time
import threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

POLL_TIMEOUT = 30
_running = False
_offset = 0
_token = ""
_api = ""


def _get_token():
    global _token, _api
    if not _token:
        _token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        _api = f"https://api.telegram.org/bot{_token}"
    return _token


def _send(chat_id: int, text: str):
    try:
        httpx.post(f"{_api}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10.0,
        )
    except Exception as e:
        print(f"[TG-bot] send failed: {e}")


def _handle_message(msg: dict):
    text = msg.get("text", "")
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return

    if text.startswith("/start verify_"):
        # ROOT CAUSE (Release Block 6 audit, P0): this handler used to
        # SELECT phone FROM verification_codes WHERE code = ? and echo
        # BOTH the phone number and the code back to whoever sent this
        # message — with no rate limit, no expiry check beyond the code's
        # own TTL, and no binding between this chat_id and the phone.
        # Codes are 4 digits (9000 possible values) and this table is
        # shared across ALL delivery channels (WhatsApp/SMS-issued codes
        # too), so this was a standalone brute-force oracle: anyone
        # messaging the bot with random /start verify_XXXX values could
        # resolve live codes to phone numbers regardless of how those
        # codes were actually issued. Telegram OTP delivery is disabled
        # (see services/otp_service.py send_telegram) — this resolver is
        # now dead code by design, not just unreachable from the app's
        # normal flow, and never touches verification_codes.
        _send(chat_id, "ℹ️ Подтверждение через Telegram временно недоступно. "
              "Запросите код по WhatsApp или SMS в приложении UrTruck.")
        print(f"[TG-bot] /start verify_ received on disabled channel, chat={chat_id}")

    elif text.startswith("/start"):
        welcome = (
            "🚛 <b>UrTruck — Ваш надежный партнер в логистике</b>\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "👋 Добро пожаловать!\n\n"
            "<b>Как подтвердить номер:</b>\n"
            "1. Откройте приложение UrTruck\n"
            "2. Нажмите «Войти» → Telegram\n"
            "3. Нажмите ссылку → бот пришлёт код\n"
            "4. Введите код в приложении\n\n"
            "━━━━━━━━━━━━━━━━━━\n"
            "🇬🇧 <i>Welcome! Use this bot to verify your phone number in UrTruck app.</i>\n\n"
            "🌍 urtruck.kz · FTL Market · Китай ↔ СНГ"
        )
        try:
            httpx.post(f"{_api}/sendMessage",
                json={"chat_id": chat_id, "text": welcome, "parse_mode": "HTML"},
                timeout=10.0,
            )
        except Exception as e:
            print(f"[TG-bot] welcome failed: {e}")

    elif text.startswith("/help"):
        _send(chat_id,
            "ℹ️ *Помощь*\n\n"
            "1. В приложении выберите «Telegram» как способ входа\n"
            "2. Нажмите на ссылку — откроется этот бот\n"
            "3. Бот пришлёт вам 4-значный код\n"
            "4. Введите код в приложении\n\n"
            "Поддержка: 777ubu@gmail.com · WhatsApp +7 747 917 11 18"
        )


def _poll_loop():
    global _offset, _running
    print(f"[TG-bot] Polling started (token: ...{_token[-8:]})")
    while _running:
        try:
            r = httpx.get(f"{_api}/getUpdates",
                params={"offset": _offset, "timeout": POLL_TIMEOUT},
                timeout=POLL_TIMEOUT + 5,
            )
            if r.status_code != 200:
                time.sleep(5)
                continue
            data = r.json()
            for update in data.get("result", []):
                _offset = update["update_id"] + 1
                if "message" in update:
                    try:
                        _handle_message(update["message"])
                    except Exception as e:
                        print(f"[TG-bot] handle error: {e}")
        except Exception as e:
            print(f"[TG-bot] poll error: {e}")
            time.sleep(5)


def start_bot():
    """Запустить polling в фоновом потоке."""
    global _running
    token = _get_token()
    if not token:
        print("[TG-bot] No token — skipping")
        return
    if _running:
        return
    _running = True
    t = threading.Thread(target=_poll_loop, daemon=True)
    t.start()
    print("[TG-bot] Background polling started")


def stop_bot():
    global _running
    _running = False
