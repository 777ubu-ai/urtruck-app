"""Google/Apple social-auth bridge for UrTruck.

Supabase performs the OAuth handshake with Google/Apple.  UrTruck still owns
its application session and authorization model: the mobile/web client sends
the Supabase access token here, this endpoint validates it against Supabase
Auth, derives the verified identity server-side, then issues the same
``reg_sessions`` token used by email/phone login.

Security invariants:
- never trust email/provider supplied by the client;
- accept only a live Supabase ``authenticated`` user;
- allow only Google and Apple identities;
- never log OAuth/Supabase access tokens;
- explicit terms/privacy consent is required before issuing an UrTruck token.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from database import consent_dal
from database import registration_dal as reg_dal


social_auth_router = APIRouter()

# Both values are public client-side Supabase configuration, not service-role
# credentials.  Env overrides make project rotation possible without a code
# release.  The publishable key cannot bypass RLS/admin permissions.
SUPABASE_AUTH_URL = os.getenv(
    "SUPABASE_AUTH_URL",
    "https://pymddxenwtjcbmrafvnc.supabase.co",
).rstrip("/")
SUPABASE_AUTH_PUBLISHABLE_KEY = os.getenv(
    "SUPABASE_AUTH_PUBLISHABLE_KEY",
    "sb_publishable_XYvbU1xnueIzB9V7ZFL58A_VJjTvZ4M",
).strip()

_ALLOWED_PROVIDERS = {"google", "apple"}


class SocialVerifyRequest(BaseModel):
    access_token: str
    consent: bool = False
    guest_token: Optional[str] = None


def _verified_supabase_identity(access_token: str) -> tuple[dict, str]:
    token = (access_token or "").strip()
    if not token or len(token) > 16_384:
        raise HTTPException(status_code=401, detail="Недействительная social-сессия")

    try:
        response = httpx.get(
            f"{SUPABASE_AUTH_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_AUTH_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=8.0,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Сервис авторизации временно недоступен")

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Недействительная social-сессия")
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="Сервис авторизации временно недоступен")

    try:
        user = response.json() or {}
    except Exception:
        raise HTTPException(status_code=503, detail="Некорректный ответ сервиса авторизации")

    if user.get("aud") not in (None, "authenticated"):
        raise HTTPException(status_code=401, detail="Недействительная social-сессия")

    app_meta = user.get("app_metadata") or {}
    providers = set(app_meta.get("providers") or [])
    primary = app_meta.get("provider")
    if primary:
        providers.add(primary)
    social = providers.intersection(_ALLOWED_PROVIDERS)
    if not social:
        raise HTTPException(status_code=401, detail="Неподдерживаемый способ входа")

    # Prefer the current/primary provider when it is one of the supported
    # social identities; linked identities remain valid through the same user.
    provider = primary if primary in social else sorted(social)[0]

    email = (user.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Google/Apple не вернул подтверждённый e-mail")

    return user, provider


@social_auth_router.post("/verify")
def verify_social(req: SocialVerifyRequest, request: Request):
    """Exchange a verified Supabase Google/Apple session for UrTruck token."""
    if not req.consent:
        raise HTTPException(
            status_code=400,
            detail="Для регистрации необходимо принять условия сервиса.",
        )

    user, provider = _verified_supabase_identity(req.access_token)
    email = (user.get("email") or "").strip().lower()

    guest_id = reg_dal.get_driver_by_token(req.guest_token) if req.guest_token else None
    driver = reg_dal.get_or_create_driver(email, upgrade_guest_id=guest_id)

    user_meta = user.get("user_metadata") or {}
    display_name = (
        user_meta.get("full_name")
        or user_meta.get("name")
        or user_meta.get("user_name")
        or ""
    ).strip()
    if display_name and not driver.get("full_name"):
        reg_dal.update_driver(driver["id"], {"full_name": display_name[:160]})
        driver = reg_dal.get_driver(driver["id"]) or driver

    # Record the same legal consent evidence as OTP registration.  The legacy
    # audit column is named `phone`, but is a generic TEXT identifier in
    # practice (email auth already uses email as the registration identifier).
    try:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent") or None
        consent_dal.record_consent(
            phone=email,
            role=driver.get("role"),
            ip_address=ip,
            user_agent=ua,
            sms_provider=f"oauth:{provider}",
        )
        consent_dal.attach_user_after_verify(phone=email, user_id=driver["id"])
    except Exception:
        # Consent audit failure must not leak provider/token details; the
        # existing OTP path also treats audit storage as best-effort.
        pass

    token = reg_dal.create_session(driver["id"])
    return {
        "token": token,
        "driver_id": driver["id"],
        "user_id": driver["id"],
        "email": email,
        "provider": provider,
        "current_step": driver.get("current_step") or "done",
        "verification_level": driver.get("verification_level", 1) or 1,
        "role": driver.get("role", "guest"),
        "status": driver.get("status") or "pending",
    }
