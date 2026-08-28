"""OTP auth endpoints (публичное имя /api/auth/*).

Единая точка для фронта:
  POST /api/auth/send-otp     { phone, channel? }
  POST /api/auth/verify-otp   { phone, code, guest_token? }
  GET  /api/auth/info         diag: каналы / BETA_MODE

Внутри — переиспользуем реализацию из api/registration.py и services/otp_service.py.
Приоритет каналов при отсутствии channel: WhatsApp → Telegram → SMS.
BETA: возвращаем код в ответе, без отправки.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

from database import registration_dal as reg_dal
from services import otp_service
from services.whatsapp_service import generate_code
from api.rate_limit import limit_otp_send, limit_otp_send_ip
from config import IS_PRODUCTION as _IS_PRODUCTION

# Переиспользуем логику verify — это тот же код, что и в wa_verify в registration.py.
from api.registration import wa_verify, VerifyCodeRequest

auth_otp_router = APIRouter()


class SendOtpRequest(BaseModel):
    phone: str
    channel: Optional[str] = "whatsapp"  # whatsapp | telegram | sms
    # Stage 24: legal consent — без явного согласия OTP не отправляется.
    consent: Optional[bool] = False
    role: Optional[str] = None


def _clean_phone(phone: str) -> str:
    return "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")


@auth_otp_router.post("/send-otp")
def send_otp(req: SendOtpRequest, request: Request):
    """Отправить OTP с автоматическим fallback WhatsApp → Telegram → SMS.
    В BETA возвращаем код и не шлём ничего.
    """
    phone = _clean_phone(req.phone)
    if len(phone.replace("+", "")) < 10:
        return {"sent": False, "error": "phone_invalid", "detail": "Неверный формат номера"}

    # Stage 24: consent gate.
    if not bool(req.consent):
        return {
            "sent": False,
            "error": "consent_required",
            "detail": "Для регистрации необходимо принять условия сервиса.",
        }

    limit_otp_send(phone)
    limit_otp_send_ip(request.client.host if (request and request.client) else None)

    code = generate_code()
    reg_dal.save_code(phone, code)

    # Stage 24: audit consent ДО отправки.
    try:
        from database import consent_dal
        ip = (request.client.host if request and request.client else None) if request else None
        ua = (request.headers.get("user-agent") if request else None) or None
        consent_dal.record_consent(
            phone=phone, role=req.role, ip_address=ip, user_agent=ua,
            sms_provider=req.channel,
        )
    except Exception as e:
        print(f"[consent] audit failed: {e}", flush=True)

    result = otp_service.send_otp(phone, code, channel=req.channel or "whatsapp")

    # Единый формат для фронта: sent / channel / mock / code? / deeplink? / attempts
    return {
        "sent": bool(result.get("sent")),
        "channel": result.get("channel", req.channel),
        "mock": result.get("mock", False),
        "beta": result.get("beta", False),
        "fallback": result.get("fallback", False),
        "original_channel": result.get("original_channel"),
        # Код возвращаем только в MOCK/BETA — в реальной отправке его нет.
        "code": (result.get("code") if (result.get("mock") or result.get("beta")) else None) if not _IS_PRODUCTION else None,
        "deeplink": result.get("deeplink"),
        "attempts": result.get("attempts"),
        "error": result.get("error"),
    }


@auth_otp_router.post("/verify-otp")
def verify_otp(req: VerifyCodeRequest, request: Request):
    """Делегируем в wa_verify — та же логика, включая BETA-bypass."""
    return wa_verify(req, request=request)


@auth_otp_router.get("/info")
def info():
    return otp_service.info()
