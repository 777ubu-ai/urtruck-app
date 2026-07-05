"""Email OTP — отправка кода на e-mail через SMTP.

Зачем: WhatsApp/Telegram в Китае заблокированы, а международный SMS на +86
доставляется ненадёжно. Email не блокируется в Китае (QQ/163/Gmail) и служит
универсальным каналом + резервом для тех, у кого нет мессенджера. Также удобен
для проверяющих Apple/Google (можно дать демо-доступ по email+код).

Транспорт — SMTP (stdlib smtplib), без сторонних SDK. Подходит под любой
провайдер: Resend/Amazon SES/SendGrid/Zoho/Yandex — у всех есть SMTP-эндпоинт.
Реквизиты берутся из .env (см. config.EMAIL_*). Если не заданы — MOCK-режим:
код логируется и возвращается в ответе (как WhatsApp/SMS в dev), ничего не шлём.

Возвращаемый формат совместим с whatsapp/sms:
  {"sent": bool, "mock": bool, "channel": "email", "code": str?, "error": str?}
"""
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from config import (
        EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER,
        EMAIL_SMTP_PASSWORD, EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_USE_TLS,
    )
except Exception:  # конфиг ещё не подхватил переменные
    EMAIL_SMTP_HOST = EMAIL_SMTP_USER = EMAIL_SMTP_PASSWORD = ""
    EMAIL_SMTP_PORT = 587
    EMAIL_FROM = "no-reply@urtruck.kz"
    EMAIL_FROM_NAME = "UrTruck"
    EMAIL_USE_TLS = True

# MOCK, пока не заданы хост и учётка SMTP.
EMAIL_MOCK = not (EMAIL_SMTP_HOST and EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD)


def is_configured() -> bool:
    return not EMAIL_MOCK


def info() -> dict:
    return {
        "mode": "MOCK" if EMAIL_MOCK else "REAL",
        "host": EMAIL_SMTP_HOST or None,
        "from": EMAIL_FROM,
    }


def _build_message(to_email: str, code: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"UrTruck — код подтверждения {code}"
    msg["From"] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
    msg["To"] = to_email
    msg.set_content(
        f"Ваш код входа в UrTruck: {code}\n"
        f"Код действует 5 минут. Если вы не запрашивали вход — проигнорируйте письмо.\n\n"
        f"Your UrTruck login code: {code} (valid 5 minutes)."
    )
    msg.add_alternative(
        f"""<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
  <h2 style="color:#0C0A09">UrTruck</h2>
  <p>Ваш код входа:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#00A651">{code}</div>
  <p style="color:#666;font-size:13px">Код действует 5 минут. Если вы не запрашивали вход — проигнорируйте письмо.</p>
</div>""",
        subtype="html",
    )
    return msg


def send_otp(email: str, code: str) -> dict:
    """Отправить OTP-код на e-mail.

    В MOCK-режиме (нет SMTP-реквизитов) код печатается в лог и возвращается —
    для локальной разработки. В REAL-режиме шлём письмо через SMTP.
    """
    email = (email or "").strip()
    if EMAIL_MOCK:
        print(f"[EMAIL MOCK] {email}: {code}", flush=True)
        return {"sent": True, "mock": True, "channel": "email", "code": code}

    try:
        msg = _build_message(email, code)
        if int(EMAIL_SMTP_PORT) == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(EMAIL_SMTP_HOST, int(EMAIL_SMTP_PORT), context=ctx, timeout=15) as s:
                s.login(EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(EMAIL_SMTP_HOST, int(EMAIL_SMTP_PORT), timeout=15) as s:
                s.ehlo()
                if EMAIL_USE_TLS:
                    s.starttls(context=ssl.create_default_context())
                    s.ehlo()
                s.login(EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD)
                s.send_message(msg)
        return {"sent": True, "mock": False, "channel": "email"}
    except Exception as e:
        print(f"[EMAIL] send failed to {email}: {e}", flush=True)
        return {"sent": False, "mock": False, "channel": "email", "error": "email_delivery_failed"}
