"""SEC-005 secure Telegram OTP challenge flow shared by webhook and polling."""
from __future__ import annotations

import hashlib
import os
import re
import secrets
from typing import Callable

from database import registration_dal as reg_dal


TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{40,128}$")
WEBHOOK_SECRET_MIN_LENGTH = 32


def _enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes"}


def webhook_configured() -> bool:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    secret = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()
    return bool(token and len(secret) >= WEBHOOK_SECRET_MIN_LENGTH)


def polling_configured() -> bool:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    # Polling must be an explicit alternative to webhook. Running both loses
    # updates because Telegram does not support getUpdates with an active hook.
    return bool(token and _enabled(os.getenv("TELEGRAM_POLLING_ENABLED")) and not webhook_configured())


def delivery_configured() -> bool:
    return webhook_configured() or polling_configured()


def create_challenge(phone: str, code: str) -> str:
    """Create a 256-bit one-time identity challenge and return its deep link."""
    if not delivery_configured():
        raise RuntimeError("telegram_otp_disabled")
    token = secrets.token_urlsafe(32)
    reg_dal.create_telegram_challenge(phone, code, token)
    username = (os.getenv("TELEGRAM_BOT_USERNAME") or "UrTruckbot").strip()
    return f"https://t.me/{username}?start=verify_{token}"


def _clean_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return f"+{digits}" if digits else ""


def _actor_scope(user_id: object, chat_id: object) -> str:
    raw = f"telegram-otp:{user_id}:{chat_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _private_actor(message: dict) -> tuple[str, str] | None:
    from_user = message.get("from") or {}
    chat = message.get("chat") or {}
    user_id = from_user.get("id")
    chat_id = chat.get("id")
    # Telegram private chats use the user's ID as chat ID. Reject channels,
    # groups and payloads with inconsistent identities.
    if user_id is None or chat_id is None:
        return None
    if chat.get("type") != "private" or str(user_id) != str(chat_id):
        return None
    return str(user_id), str(chat_id)


def _reply(send: Callable, chat_id: str, text: str, **kwargs) -> None:
    send(chat_id, text, **kwargs)


def handle_message(message: dict, send: Callable) -> str:
    """Process one authenticated Telegram update without logging PII/secrets."""
    actor = _private_actor(message)
    if not actor:
        return "actor_mismatch"
    user_id, chat_id = actor
    text = (message.get("text") or "").strip()
    contact = message.get("contact")

    if text.startswith("/start verify_"):
        if not reg_dal.allow_telegram_attempt(_actor_scope(user_id, chat_id)):
            _reply(send, chat_id, "Слишком много попыток. Запросите новый вход позже.")
            return "rate_limited"
        token = text[len("/start verify_"):].strip()
        if not TOKEN_RE.fullmatch(token):
            _reply(send, chat_id, "Ссылка недействительна. Запросите новую в приложении.")
            return "invalid"
        status = reg_dal.bind_telegram_challenge(token, user_id, chat_id)
        if status != "bound":
            _reply(send, chat_id, "Ссылка недействительна или уже использована.")
            return status
        _reply(
            send,
            chat_id,
            "Подтвердите собственный номер Telegram, чтобы получить одноразовый код UrTruck.",
            reply_markup={
                "keyboard": [[{"text": "Поделиться моим номером", "request_contact": True}]],
                "resize_keyboard": True,
                "one_time_keyboard": True,
            },
        )
        return "awaiting_contact"

    if contact is not None:
        if not reg_dal.allow_telegram_attempt(_actor_scope(user_id, chat_id)):
            _reply(send, chat_id, "Слишком много попыток. Запросите новый вход позже.")
            return "rate_limited"
        # A manually forwarded/arbitrary contact either has another user_id or
        # no user_id. Only Telegram's self-contact for this actor is accepted.
        if contact.get("user_id") is None or str(contact.get("user_id")) != user_id:
            _reply(send, chat_id, "Можно подтвердить только собственный номер Telegram.")
            return "contact_actor_mismatch"
        phone = _clean_phone(contact.get("phone_number") or "")
        if not phone:
            _reply(send, chat_id, "Не удалось проверить номер. Запросите новую ссылку.")
            return "phone_mismatch"
        status, otp = reg_dal.consume_telegram_challenge(user_id, chat_id, phone)
        if status != "consumed" or not otp:
            _reply(send, chat_id, "Номер не совпадает, ссылка истекла или уже использована.")
            return status
        _reply(
            send,
            chat_id,
            f"Ваш одноразовый код UrTruck: {otp}\nВведите его в приложении. Никому не сообщайте код.",
            reply_markup={"remove_keyboard": True},
        )
        return "consumed"

    if text.startswith("/start"):
        _reply(send, chat_id, "Откройте Telegram-ссылку из приложения UrTruck для подтверждения номера.")
        return "welcome"
    if text.startswith("/help"):
        _reply(send, chat_id, "Запросите вход через Telegram в приложении UrTruck и следуйте подсказкам бота.")
        return "help"
    return "ignored"
