"""Unified OTP service — WhatsApp / SMS / Telegram.

Каждый канал в MOCK если не заданы env.
Для Telegram Deep Link — юзер открывает @UrTruckBot и присылает код, который мы же и сгенерили.
В таком варианте мы показываем код на экране → юзер копирует в бот.
"""
import os
import random
import secrets
import urllib.parse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

# Новый WhatsApp модуль (Meta Cloud API)
from services import whatsapp as wa
# Stage 22: dedicated Mobizon SMS service (production-ready, parses
# response codes, masks phones in logs, retries transient errors).
from services import sms_mobizon
# Email OTP (SMTP) — канал для Китая и резерв. MOCK если нет SMTP-реквизитов.
from services import email_service
from services.log_redact import mask_phone

# BETA bypass
try:
    from config import BETA_MODE, BETA_OTP_CODE, IS_PRODUCTION
except Exception:
    BETA_MODE = False
    BETA_OTP_CODE = "0000"
    IS_PRODUCTION = False

# Совместимость со старыми именами env (на случай если кто ещё пользуется)
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "") or os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "") or os.getenv("WHATSAPP_PHONE_ID", "")
WA_MOCK = not wa.is_configured()

# SMS (Mobizon KZ / Twilio).
# Stage 22 swapped the inline Mobizon call for `sms_mobizon` and made
# the MOCK gate explicit: `SMS_PROVIDER` decides which provider gets
# called, but a missing API key force-falls-through to MOCK so the
# server never silently 500s on /send-otp.
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "mock").lower()  # mobizon | twilio | mock
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_FROM", "")


def _sms_real_configured() -> bool:
    if SMS_PROVIDER == "mobizon":
        return sms_mobizon.is_configured()
    if SMS_PROVIDER == "twilio":
        return bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)
    return False


SMS_MOCK = SMS_PROVIDER == "mock" or not _sms_real_configured()

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "UrTruckbot")
TG_MOCK = not TG_BOT_TOKEN


def generate_code() -> str:
    # Предрелизный аудит 28.08.2026 (P1-security): криптостойкий RNG вместо
    # random (Mersenne Twister предсказуем по нескольким выборкам). Длина 4
    # сохранена — фронт-поле фиксировано CODE_LEN=4 (OtpV2Screen/PremiumOtp);
    # перебор 9000 значений закрыт rate-limit'ом 5 попыток / 10 мин.
    return f"{secrets.randbelow(9000) + 1000}"


# ---------- WhatsApp ----------
def send_whatsapp(phone: str, code: str) -> dict:
    """Делегируем в services/whatsapp.py — там actual Meta Cloud call."""
    return wa.send_otp(phone, code)


# ---------- Email ----------
def send_email(identifier: str, code: str) -> dict:
    """Делегируем в services/email_service.py (SMTP). identifier — это e-mail."""
    return email_service.send_otp(identifier, code)


# ---------- SMS ----------
def send_sms(phone: str, code: str) -> dict:
    """Route OTP to the configured SMS provider.

    Stage 22: Mobizon path delegated to `services.sms_mobizon` which
    parses the JSON envelope and surfaces structured errors. Twilio
    kept inline (rarely used; can be lifted into its own module if
    we ever scale it up). MOCK path logs the code with a masked
    phone — never the real number — so prod logs aren't a privacy
    leak.
    """
    msg = f"UrTruck: {code}. Не сообщайте код никому."
    # Hardening A final repair (2026-09-10), P1: an operator who explicitly
    # set SMS_PROVIDER=twilio but only partially configured the credential
    # triple must NOT silently fall through to SMS_MOCK below in production
    # -- that would "succeed" from the caller's point of view while no SMS
    # is ever sent, and (per the IS_PRODUCTION gate elsewhere, e.g.
    # api/registration.py) the mock code is never even returned to the
    # client either -- the user is locked out with zero visible error.
    # services/env_check.py already refuses to BOOT with this exact config
    # in production (defense layer 1); this is defense layer 2, for any
    # code path that reaches send_sms() without having gone through that
    # boot gate (a script/worker importing this module directly, a hot
    # env-var change without a restart, etc.). Explicit fail-closed error,
    # not a mock, not a generic exception.
    if IS_PRODUCTION and SMS_PROVIDER == "twilio" and not _sms_real_configured():
        missing = [n for n, v in (("TWILIO_ACCOUNT_SID", TWILIO_SID),
                                   ("TWILIO_AUTH_TOKEN", TWILIO_TOKEN),
                                   ("TWILIO_FROM", TWILIO_FROM)) if not v]
        print(f"[OTP·SMS] FAIL-CLOSED: SMS_PROVIDER=twilio incomplete in production "
              f"(missing: {', '.join(missing)}) — refusing to mock-fallback", flush=True)
        return {
            "sent": False, "mock": False, "channel": "sms", "provider": "twilio",
            "error": "twilio_incomplete_config",
        }
    if SMS_MOCK:
        # Release hardening track A (2026-09-10): never print the raw code,
        # even in the mock path — a mock server's stdout still ends up in
        # the same log aggregation as production. The code itself is still
        # returned in the dict below (that's the actual mock-delivery
        # mechanism, gated separately by IS_PRODUCTION at the API layer,
        # e.g. api/registration.py) — this only fixes the LOG line.
        print(f"[OTP·SMS MOCK] {mask_phone(phone)}: (redacted)")
        return {"sent": True, "mock": True, "channel": "sms", "code": code}

    if SMS_PROVIDER == "mobizon":
        return sms_mobizon.send_sms(phone, msg)

    if SMS_PROVIDER == "twilio":
        try:
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
                auth=(TWILIO_SID, TWILIO_TOKEN),
                data={"From": TWILIO_FROM, "To": phone, "Body": msg},
                timeout=10.0,
            )
            r.raise_for_status()
            return {"sent": True, "mock": False, "channel": "sms", "provider": "twilio"}
        except Exception as e:
            print(f"[OTP·SMS·TWILIO ERROR] {e}")
            return {"sent": False, "error": str(e), "channel": "sms", "provider": "twilio"}

    return {"sent": False, "error": "unknown_provider", "channel": "sms"}


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
        # Release hardening track A: `link` itself embeds the raw code
        # (telegram_deeplink() urlencodes "verify_{code}" into the URL) —
        # never print phone, code, OR the deeplink.
        print(f"[OTP·TG MOCK] {mask_phone(phone)}: (redacted, deeplink omitted — contains code)")
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

    # ── Email — отдельный идентификатор (e-mail), без fallback на phone-каналы ──
    if channel == "email":
        # здесь `phone` фактически несёт e-mail (единый строковый идентификатор).
        r = send_email(phone, code)
        r["attempts"] = [{"channel": "email", "sent": r.get("sent"), "mock": r.get("mock", False), "error": r.get("error")}]
        return r

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
    sms_block: dict = {"mode": "MOCK" if SMS_MOCK else SMS_PROVIDER.upper()}
    if SMS_PROVIDER == "mobizon":
        sms_block.update(sms_mobizon.info())
    return {
        "beta_mode": BETA_MODE,
        "priority_chain": ["whatsapp", "telegram", "sms"],
        "whatsapp": wa.info(),
        "sms": sms_block,
        "telegram": {
            "mode": "MOCK" if TG_MOCK else "REAL",
            "bot": TG_BOT_USERNAME,
        },
        "email": email_service.info(),
    }
