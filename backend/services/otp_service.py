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

# WhatsApp Meta Cloud API
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WA_MOCK = not (WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)

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
    if WA_MOCK:
        print(f"[OTP·WA MOCK] {phone}: {code}")
        return {"sent": True, "mock": True, "channel": "whatsapp", "code": code}
    try:
        url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        r = httpx.post(url,
            headers={"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "to": phone.replace("+", ""),
                "type": "template",
                "template": {
                    "name": "otp_code",
                    "language": {"code": "ru"},
                    "components": [{"type": "body", "parameters": [{"type": "text", "text": code}]}],
                },
            },
            timeout=10.0,
        )
        r.raise_for_status()
        return {"sent": True, "mock": False, "channel": "whatsapp"}
    except Exception as e:
        print(f"[OTP·WA ERROR] {e}")
        return {"sent": False, "error": str(e), "channel": "whatsapp"}


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
def send_otp(phone: str, code: str, channel: str = "whatsapp") -> dict:
    """Единая точка с автоматическим fallback на Telegram.
    Цепочка: выбранный канал → если MOCK/fail → Telegram (всегда работает).
    Юзер ВСЕГДА получит код."""
    channel = (channel or "whatsapp").lower()

    if channel == "whatsapp":
        result = send_whatsapp(phone, code)
        if result.get("mock") or not result.get("sent"):
            # WhatsApp mock/недоступен → fallback Telegram
            tg = send_telegram(phone, code)
            tg["fallback"] = True
            tg["original_channel"] = "whatsapp"
            return tg
        return result

    if channel == "sms":
        result = send_sms(phone, code)
        if result.get("mock") or not result.get("sent"):
            # SMS mock/недоступен → fallback Telegram
            tg = send_telegram(phone, code)
            tg["fallback"] = True
            tg["original_channel"] = "sms"
            return tg
        return result

    return send_telegram(phone, code)


def info() -> dict:
    return {
        "whatsapp": {"mode": "MOCK" if WA_MOCK else "REAL"},
        "sms": {"mode": "MOCK" if SMS_MOCK else SMS_PROVIDER.upper()},
        "telegram": {
            "mode": "MOCK" if TG_MOCK else "REAL",
            "bot": TG_BOT_USERNAME,
        },
    }
