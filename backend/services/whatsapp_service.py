"""WhatsApp service — сейчас MOCK, позже Meta Cloud API.

В production:
  - Получить токен на developers.facebook.com/docs/whatsapp/cloud-api
  - Подставить WHATSAPP_ACCESS_TOKEN и WHATSAPP_PHONE_NUMBER_ID
  - Включить MOCK_MODE = False
"""
import os
import secrets
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
MOCK_MODE = not (WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)


def generate_code() -> str:
    """Генерирует 4-значный код (криптостойкий RNG — аудит 28.08.2026)."""
    return f"{secrets.randbelow(9000) + 1000}"


def send_whatsapp_code(phone: str, code: str) -> dict:
    """
    Отправка кода в WhatsApp.

    MOCK режим: логирует и возвращает код в response (для тестирования UI).
    REAL режим: через Meta WhatsApp Cloud API.
    """
    if MOCK_MODE:
        print(f"[WhatsApp MOCK] → {phone}: код {code}")
        return {
            "success": True,
            "mock": True,
            "phone": phone,
            "code": code,  # В mock режиме возвращаем код в response
            "message": f"[DEMO] Код {code} отправлен в WhatsApp",
        }

    # REAL: Meta WhatsApp Cloud API
    try:
        url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }
        # Шаблон "otp_code" должен быть предварительно одобрен в Meta Business Manager
        payload = {
            "messaging_product": "whatsapp",
            "to": phone.replace("+", ""),
            "type": "template",
            "template": {
                "name": "otp_code",
                "language": {"code": "ru"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": code}],
                    }
                ],
            },
        }
        response = httpx.post(url, headers=headers, json=payload, timeout=10.0)
        response.raise_for_status()
        return {"success": True, "mock": False, "meta_response": response.json()}
    except Exception as e:
        print(f"[WhatsApp ERROR] {e}")
        return {"success": False, "error": str(e)}
