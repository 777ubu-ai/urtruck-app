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

from services.log_redact import mask_email

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
    """Preflight/diagnostics snapshot for GET /api/v1/system/info.

    Hardening B (2026-09-14): callers (ops dashboards, deploy health-checks)
    need to tell "provider not configured" apart from "provider configured
    but the port/host looks wrong" WITHOUT a real send attempt and WITHOUT
    ever exposing EMAIL_SMTP_PASSWORD (not even its length/presence in a way
    that could be brute-forced) — only presence booleans for the
    non-secret fields, matching translate_service.get_info()'s
    "openai_key_exists" pattern (fact-of-existence only, never the value).
    """
    port = int(EMAIL_SMTP_PORT) if str(EMAIL_SMTP_PORT).strip() else 0
    # Port 465 is implicit-TLS (SMTP_SSL) regardless of EMAIL_USE_TLS — the
    # connection is encrypted from the first byte. Any other port relies on
    # EMAIL_USE_TLS (STARTTLS) being on; if it's off, credentials/OTP codes
    # would cross the network in plaintext — that's an invalid TLS config,
    # not just a stylistic choice.
    uses_implicit_tls = port == 465
    tls_config_valid = uses_implicit_tls or bool(EMAIL_USE_TLS)
    return {
        "mode": "MOCK" if EMAIL_MOCK else "REAL",
        "configured": not EMAIL_MOCK,
        "host": EMAIL_SMTP_HOST or None,
        "host_present": bool(EMAIL_SMTP_HOST),
        "port_present": bool(port),
        "username_present": bool(EMAIL_SMTP_USER),
        "sender_present": bool(EMAIL_FROM),
        "tls_config_valid": tls_config_valid,
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

    Hardening B (2026-09-14): the exception branch used to collapse every
    failure — a wrong password, an unreachable host, a 15s connect timeout —
    into the same generic "email_delivery_failed", indistinguishable from a
    caller's point of view. That matters for two reasons: (1) an
    authentication failure is a permanent operator misconfiguration (retrying
    the same OTP send will never succeed until the credential is fixed),
    while a timeout/connection failure is transient (retrying, or falling
    back to another channel, may well succeed) — mirrors the `retryable`
    contract already used by speech_to_text_service.SpeechToTextError and
    translate_service.TranslationError; (2) never print/return anything that
    could contain the SMTP password (smtplib exceptions sometimes echo the
    server's own response line, which does not include the submitted
    password, but out of caution the log line here stays fixed-text with the
    exception TYPE only, not the raw message body).
    """
    email = (email or "").strip()
    if EMAIL_MOCK:
        # Release hardening track A: never print the raw code, even in mock.
        print(f"[EMAIL MOCK] {mask_email(email)}: (redacted)", flush=True)
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
    except smtplib.SMTPAuthenticationError as e:
        # Wrong EMAIL_SMTP_USER/PASSWORD — permanent, an operator config
        # issue. Retrying the exact same send will keep failing; this is a
        # startup/health-check signal, not something to fall back-and-retry.
        print(f"[EMAIL] auth rejected by SMTP host for {mask_email(email)} "
              f"(check EMAIL_SMTP_USER/EMAIL_SMTP_PASSWORD): {type(e).__name__}", flush=True)
        return {
            "sent": False, "mock": False, "channel": "email",
            "error": "email_auth_failed", "retryable": False,
        }
    except (TimeoutError, smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, OSError) as e:
        # Host unreachable / connection dropped / 15s connect timeout —
        # transient network condition, safe to retry or fall back to another
        # OTP channel (see services/otp_service.py's fallback chain).
        print(f"[EMAIL] transient delivery failure to {mask_email(email)}: {type(e).__name__}", flush=True)
        return {
            "sent": False, "mock": False, "channel": "email",
            "error": "email_timeout", "retryable": True,
        }
    except Exception as e:
        print(f"[EMAIL] send failed to {mask_email(email)}: {type(e).__name__}", flush=True)
        return {
            "sent": False, "mock": False, "channel": "email",
            "error": "email_delivery_failed", "retryable": False,
        }
