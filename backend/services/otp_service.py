"""Unified OTP service — WhatsApp / SMS / Telegram.

Каждый канал в MOCK если не заданы env.
Для Telegram Deep Link — юзер открывает @UrTruckBot и присылает код, который мы же и сгенерили.
В таком варианте мы показываем код на экране → юзер копирует в бот.
"""
import os
import random
import urllib.parse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

# Новый WhatsApp модуль (Meta Cloud API)
from services import whatsapp as wa

# BETA bypass
try:
    from config import BETA_MODE, BETA_OTP_CODE
except Exception:
    BETA_MODE = False
    BETA_OTP_CODE = "0000"

# Совместимость со старыми именами env (на случай если кто ещё пользуется)
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "") or os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "") or os.getenv("WHATSAPP_PHONE_ID", "")
WA_MOCK = not wa.is_configured()

# SMS (Mobizon KZ / Twilio)
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "mock")  # mobizon | twilio | mock
MOBIZON_API_KEY = os.getenv("MOBIZON_API_KEY", "")
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_FROM", "")
SMS_MOCK = SMS_PROVIDER == "mock" or not any([MOBIZON_API_KEY, TWILIO_SID])

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "UrTruckbot")
TG_MOCK = not TG_BOT_TOKEN


def generate_code() -> str:
    return f"{random.randint(1000, 9999)}"


# ---------- WhatsApp ----------
def send_whatsapp(phone: str, code: str) -> dict:
    """Делегируем в services/whatsapp.py — там actual Meta Cloud call."""
    return wa.send_otp(phone, code)


# ---------- SMS ----------
def send_sms(phone: str, code: str) -> dict:
    msg = f"UrTruck: {code}"
    if SMS_MOCK:
        print(f"[OTP·SMS MOCK] {phone}: {code}")
        return {"sent": True, "mock": True, "channel": "sms", "code": code}
    try:
        if SMS_PROVIDER == "mobizon":
            # https://mobizon.kz API
            r = httpx.post("https://api.mobizon.kz/service/message/sendsmsmessage",
                data={"apiKey": MOBIZON_API_KEY, "recipient": phone.replace("+", ""), "text": msg},
                timeout=10.0,
            )
            r.raise_for_status()
            return {"sent": True, "mock": False, "channel": "sms", "provider": "mobizon"}
        elif SMS_PROVIDER == "twilio":
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
                auth=(TWILIO_SID, TWILIO_TOKEN),
                data={"From": TWILIO_FROM, "To": phone, "Body": msg},
                timeout=10.0,
            )
            r.raise_for_status()
            return {"sent": True, "mock": False, "channel": "sms", "provider": "twilio"}
    except Exception as e:
        print(f"[OTP·SMS ERROR] {e}")
        return {"sent": False, "error": str(e), "channel": "sms"}
    return {"sent": False, "error": "unknown provider", "channel": "sms"}


# ---------- Telegram ----------
def telegram_deeplink(code: str) -> str:
    """Deep link на бот — юзер откроет @UrTruckBot с preseed командой.
    Сценарий: юзер жмёт ссылку → Telegram → /start <code> → бот отвечает подтверждением.
    """
    payload = urllib.parse.quote(f"verify_{code}")
    return f"https://t.me/{TG_BOT_USERNAME}?start={payload}"


def send_telegram(phone: str, code: str) -> dict:
    """В MOCK режиме возвращаем код и deep link — юзер открывает бот, вводит код.
    В production с ботом можно дополнительно посылать уведомление админу.
    """
    link = telegram_deeplink(code)
    if TG_MOCK:
        print(f"[OTP·TG MOCK] {phone}: {code} → {link}")
        return {"sent": True, "mock": True, "channel": "telegram", "code": code, "deeplink": link}
    # При реальном боте можно логировать запрос или сделать ping админ-чату
    return {"sent": True, "mock": False, "channel": "telegram", "deeplink": link}


# ---------- Router с fallback ----------
def _try(channel_fn, phone, code, name):
    """Вызвать send_* и вернуть (True, result) при реальной доставке, иначе (False, result)."""
    try:
        r = channel_fn(phone, code) or {}
    except Exception as e:
        return False, {"sent": False, "channel": name, "error": str(e)}
    # Считаем доставку успешной только если реально ушло (не mock и sent=True)
    delivered = bool(r.get("sent")) and not r.get("mock")
    return delivered, r


def send_otp(phone: str, code: str, channel: str = "whatsapp") -> dict:
    """Отправка OTP с fallback WhatsApp → Telegram → SMS.

    BETA_MODE: ничего не отправляем, возвращаем код сразу (тестеры вводят 0000).

    channel — предпочтительный канал. Если MOCK/fail — fallback на следующий.
    Если все каналы MOCK — возвращаем последний mock-результат с кодом в ответе.
    """
    # ── BETA bypass ──────────────────────────────────────────
    if BETA_MODE:
        return {
            "sent": True, "mock": False, "beta": True,
            "channel": "beta",
            "code": BETA_OTP_CODE,
            "message": f"Beta-режим: введите код {BETA_OTP_CODE}",
        }

    channel = (channel or "whatsapp").lower()

    # Приоритет по умолчанию: WA → TG → SMS. Если юзер выбрал конкретный — он первый.
    order = {
        "whatsapp": ["whatsapp", "telegram", "sms"],
        "telegram": ["telegram", "whatsapp", "sms"],
        "sms":      ["sms", "whatsapp", "telegram"],
    }.get(channel, ["whatsapp", "telegram", "sms"])

    senders = {
        "whatsapp": send_whatsapp,
        "telegram": send_telegram,
        "sms":      send_sms,
    }

    attempts = []
    last = None
    for name in order:
        delivered, r = _try(senders[name], phone, code, name)
        attempts.append({"channel": name, "sent": r.get("sent"), "mock": r.get("mock", False), "error": r.get("error")})
        last = r
        if delivered:
            r["attempts"] = attempts
            if name != channel:
                r["fallback"] = True
                r["original_channel"] = channel
            return r

    # Все каналы mock/fail — возвращаем последний (с кодом для dev). Telegram deeplink если был.
    if last is None:
        last = {"sent": False, "channel": channel, "error": "no_channels"}
    last["attempts"] = attempts
    return last


def info() -> dict:
    return {
        "beta_mode": BETA_MODE,
        "priority_chain": ["whatsapp", "telegram", "sms"],
        "whatsapp": wa.info(),
        "sms": {"mode": "MOCK" if SMS_MOCK else SMS_PROVIDER.upper()},
        "telegram": {
            "mode": "MOCK" if TG_MOCK else "REAL",
            "bot": TG_BOT_USERNAME,
        },
    }
