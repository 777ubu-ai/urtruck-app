"""Fail-closed Telegram long polling for the shared SEC-005 OTP flow."""
from __future__ import annotations

import os
import threading
import time

import httpx

from services import telegram_otp


POLL_TIMEOUT = 30
_running = False
_offset = 0
_token = ""
_api = ""


def _get_token() -> str:
    global _token, _api
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if token != _token:
        _token = token
        _api = f"https://api.telegram.org/bot{token}" if token else ""
    return _token


def _send(chat_id: int, text: str, **kwargs):
    if not _api:
        return False
    payload = {"chat_id": chat_id, "text": text}
    if kwargs.get("reply_markup") is not None:
        payload["reply_markup"] = kwargs["reply_markup"]
    try:
        httpx.post(f"{_api}/sendMessage", json=payload, timeout=10.0)
        return True
    except Exception:
        # The exception can contain the bot-token URL; keep logs secret-free.
        print("[TG-bot] send failed", flush=True)
        return False


def _handle_message(message: dict) -> str:
    return telegram_otp.handle_message(message, _send)


def _poll_loop():
    global _offset, _running
    print("[TG-bot] Polling started", flush=True)
    while _running:
        try:
            response = httpx.get(
                f"{_api}/getUpdates",
                params={"offset": _offset, "timeout": POLL_TIMEOUT},
                timeout=POLL_TIMEOUT + 5,
            )
            if response.status_code != 200:
                time.sleep(5)
                continue
            for update in (response.json().get("result") or []):
                update_id = update.get("update_id")
                if isinstance(update_id, int):
                    _offset = max(_offset, update_id + 1)
                message = update.get("message") or update.get("edited_message")
                if message:
                    try:
                        _handle_message(message)
                    except Exception:
                        print("[TG-bot] update rejected", flush=True)
        except Exception:
            # Do not emit URLs, token fragments, update payloads or PII.
            print("[TG-bot] polling request failed", flush=True)
            time.sleep(5)


def start_bot() -> bool:
    """Start only when polling is explicitly enabled and webhook is disabled."""
    global _running
    if not telegram_otp.polling_configured() or not _get_token():
        print("[TG-bot] Polling disabled", flush=True)
        return False
    if _running:
        return True
    _running = True
    thread = threading.Thread(target=_poll_loop, daemon=True)
    thread.start()
    print("[TG-bot] Background polling started", flush=True)
    return True


def stop_bot():
    global _running
    _running = False
