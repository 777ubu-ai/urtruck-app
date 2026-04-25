"""WhatsApp Meta Cloud API — отправка OTP через approved-шаблон.

Переменные окружения (заданы в .env на сервере):
  WHATSAPP_TOKEN       — System User access token (permanent)
  WHATSAPP_PHONE_ID    — phone_number_id (ID тестового/боевого номера)
  WHATSAPP_ACCOUNT_ID  — waba_id (WhatsApp Business Account ID) — нужен для будущих операций
                         (загрузка media, webhooks и т.д.). На send OTP не требуется, но логируется.

Meta требует approved template для OTP к незнакомым номерам.
В Business Manager создан шаблон:
  Name:     otp_code
  Category: AUTHENTICATION
  Language: ru
  Body:     «UrTruck: Ваш код {{1}}. Действует 5 минут.»

Если шаблон ещё не одобрен / не существует, Meta вернёт ошибку
132001 (template_not_found) — код распаковывает это в понятный error.
"""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_ACCOUNT_ID = os.getenv("WHATSAPP_ACCOUNT_ID", "")
WHATSAPP_TEMPLATE = os.getenv("WHATSAPP_TEMPLATE_NAME", "otp_code")
WHATSAPP_LANG = os.getenv("WHATSAPP_TEMPLATE_LANG", "ru")

# Fallback на старые имена, чтобы не ломать деплои
if not WHATSAPP_TOKEN:
    WHATSAPP_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
if not WHATSAPP_PHONE_ID:
    WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")

WA_MOCK = not (WHATSAPP_TOKEN and WHATSAPP_PHONE_ID)

META_API_VERSION = "v21.0"


def is_configured() -> bool:
    return not WA_MOCK


def send_otp(phone: str, code: str) -> dict:
    """Отправить OTP-код через WhatsApp Cloud API.

    В MOCK-режиме (нет токена) возвращаем код в ответе — для локальной разработки.
    В BOOT-режиме (есть токен) вызываем Meta Graph API.

    phone — с "+" или без, E.164 без разделителей (напр. +77001234567).
    Возвращаем {"sent": bool, "mock": bool, "channel": "whatsapp",
                "code": str?, "error": str?, "message_id": str?}
    """
    if WA_MOCK:
        print(f"[WA MOCK] {phone}: {code}")
        return {
            "sent": True, "mock": True, "channel": "whatsapp",
            "code": code,
        }

    to = phone.lstrip("+").replace(" ", "").replace("-", "")
    url = f"https://graph.facebook.com/{META_API_VERSION}/{WHATSAPP_PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": {
            "name": WHATSAPP_TEMPLATE,
            "language": {"code": WHATSAPP_LANG},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": code}]}
            ],
        },
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        r = httpx.post(url, headers=headers, json=payload, timeout=10.0)
        if r.status_code >= 400:
            # Meta возвращает JSON с error.message
            try:
                err = r.json().get("error", {})
                err_msg = err.get("message") or r.text
                err_code = err.get("code")
            except Exception:
                err_msg = r.text
                err_code = None
            print(f"[WA ERROR] {r.status_code} code={err_code} msg={err_msg}")
            return {
                "sent": False, "mock": False, "channel": "whatsapp",
                "error": err_msg, "error_code": err_code,
                "http_status": r.status_code,
            }
        data = r.json()
        msg_id = (data.get("messages") or [{}])[0].get("id")
        return {
            "sent": True, "mock": False, "channel": "whatsapp",
            "message_id": msg_id,
        }
    except httpx.TimeoutException:
        return {"sent": False, "mock": False, "channel": "whatsapp", "error": "timeout"}
    except Exception as e:
        print(f"[WA ERROR] {type(e).__name__}: {e}")
        return {"sent": False, "mock": False, "channel": "whatsapp", "error": str(e)}


def info() -> dict:
    return {
        "mode": "MOCK" if WA_MOCK else "REAL",
        "phone_id": WHATSAPP_PHONE_ID or None,
        "account_id": WHATSAPP_ACCOUNT_ID or None,
        "template": WHATSAPP_TEMPLATE,
        "language": WHATSAPP_LANG,
        "api_version": META_API_VERSION,
    }
