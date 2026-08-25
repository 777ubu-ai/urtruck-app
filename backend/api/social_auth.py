"""Google/Apple social-auth bridge for UrTruck.

Supabase performs the OAuth handshake with Google/Apple. UrTruck still owns
its application session and authorization model: the client sends the
Supabase access token here, this endpoint validates it against Supabase Auth,
derives the verified identity server-side, then issues the same
``reg_sessions`` token used by email/phone login.

Security invariants:
- never trust email/provider supplied by the client;
- accept only a live Supabase ``authenticated`` user;
- allow only Google and Apple identities;
- never log OAuth/Supabase access tokens;
- explicit terms/privacy consent is required before issuing an UrTruck token;
- if legal consent evidence cannot be persisted, do not issue a session.
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

SUPABASE_AUTH_URL = os.getenv(
    "SUPABASE_AUTH_URL",
    "https://pymddxenwtjcbmrafvnc.supabase.co",
).rstrip("/")
# Use the same confirmed-live public anon key as the UrTruck frontend client.
# This is intentionally NOT a service-role credential and cannot bypass RLS.
# Env override keeps project/key rotation possible without a code release.
SUPABASE_AUTH_ANON_KEY = os.getenv(
    "SUPABASE_AUTH_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRkeGVud3RqY2JtcmFmdm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTk1NzMsImV4cCI6MjA5MTU3NTU3M30.hXS6gND9ChXeJ9MxGrsgfi1frOqsc-kQpwP5ZglcBQs",
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
                "apikey": SUPABASE_AUTH_ANON_KEY,
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
    try:
        driver = reg_dal.get_or_create_driver_by_email(email, upgrade_guest_id=guest_id)
    except reg_dal.AmbiguousEmailIdentityError:
        # Fail closed (security audit 25.08.2026): never guess which of
        # several accounts sharing this canonical email is "the" one — no
        # UrTruck session/token is issued for an ambiguous identity.
        #
        # Contract fix (owner review round 4, 25.08.2026): `detail` is a
        # STABLE MACHINE-READABLE code, not a hardcoded Russian sentence —
        # otherwise a ZH/EN/KK client renders raw Russian backend text, the
        # exact mixed-language hole the P0-B error-taxonomy work closed for
        # social OAuth errors. The UI owns the localized RU/ZH/EN/KK copy
        # for this code; `message` here is English and log-facing only,
        # never rendered verbatim to an end user.
        raise HTTPException(
            status_code=409,
            detail={
                "error": "AMBIGUOUS_EMAIL_IDENTITY",
                "message": "Multiple accounts match this canonical email; refusing to guess.",
            },
        )

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

    try:
        # Startup normally creates this schema, but social auth is a security
        # boundary and must stay fail-safe under isolated routers, recovery
        # workers or partial startup. The DDL is idempotent.
        consent_dal.init_consent_schema()
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
    except Exception as exc:
        print(
            f"[social-auth] consent audit failed: {type(exc).__name__}: {exc}",
            flush=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Не удалось сохранить подтверждение условий. Повторите вход.",
        )

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
