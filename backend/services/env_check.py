"""Production environment guard.

Stage 21 (App Store cleanup) — when the backend boots in production
mode (`URTRUCK_ENV=production`) we must not silently fall back to
mock OTP / mock storage / default admin password. Real users would
either get OTP codes only the operator can see (logs) or upload
photos to a local FS that disappears on the next deploy.

This guard is best-effort: it logs a clear list of missing /
unsafe values at startup and (when `URTRUCK_FAIL_ON_BAD_ENV=1`)
raises so the process supervisor refuses to bring the service up.
PM2 / systemd / docker-compose will surface the failure instead of
quietly running in mock mode.

Outside production (env not set, or set to `development` /
`preview`) the guard only logs warnings — local dev shouldn't
require a real WhatsApp account.
"""
from __future__ import annotations

import os
from typing import List


def _is_unsafe_password(value: str) -> bool:
    if not value:
        return True
    bad = {"change_me", "change_me_in_production", "admin", "password", "123456"}
    return value.lower() in bad


def collect_issues() -> List[str]:
    """Return a list of human-readable production-config problems."""
    issues: List[str] = []

    # OTP — at least one real channel must be configured.
    wa_token = os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")
    wa_phone = os.getenv("WHATSAPP_PHONE_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    sms_provider = (os.getenv("SMS_PROVIDER") or "mock").lower()
    sms_real = sms_provider != "mock" and (
        os.getenv("MOBIZON_API_KEY") or os.getenv("TWILIO_ACCOUNT_SID")
    )
    tg_real = bool(os.getenv("TELEGRAM_BOT_TOKEN"))
    if not (wa_token and wa_phone) and not sms_real and not tg_real:
        issues.append(
            "OTP: no real channel configured (WhatsApp / SMS / Telegram all in MOCK). "
            "Real users will not receive codes. Set WHATSAPP_TOKEN+WHATSAPP_PHONE_ID, "
            "or SMS_PROVIDER=mobizon|twilio with credentials, or TELEGRAM_BOT_TOKEN."
        )

    # Storage — local FS in production loses uploads on redeploy.
    provider = (os.getenv("STORAGE_PROVIDER") or "local").lower()
    if provider == "local":
        issues.append(
            "Storage: STORAGE_PROVIDER=local — uploads land on the VPS disk and "
            "disappear on redeploy. Switch to STORAGE_PROVIDER=supabase (with "
            "SUPABASE_URL + SUPABASE_SERVICE_KEY + SUPABASE_BUCKET) or s3 (with "
            "S3_BUCKET)."
        )
    elif provider == "supabase":
        if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY")):
            issues.append("Storage: STORAGE_PROVIDER=supabase but SUPABASE_URL/SUPABASE_SERVICE_KEY missing.")
    elif provider == "s3":
        if not os.getenv("S3_BUCKET"):
            issues.append("Storage: STORAGE_PROVIDER=s3 but S3_BUCKET missing.")
    else:
        issues.append(f"Storage: unknown STORAGE_PROVIDER={provider!r} (must be local|supabase|s3).")

    # Admin auth — never ship the placeholder password to production.
    if _is_unsafe_password(os.getenv("ADMIN_PASSWORD", "")):
        issues.append(
            "Admin: ADMIN_PASSWORD is empty or matches a default placeholder "
            "(change_me, admin, password, 123456). Set a strong unique value."
        )

    # CORS — production should not allow http://localhost or wildcard.
    cors = os.getenv("CORS_ORIGINS", "")
    if "*" in cors.split(","):
        issues.append("CORS: wildcard '*' in CORS_ORIGINS — restrict to known frontends.")

    return issues


def enforce_production_env() -> None:
    """Call from FastAPI startup. Logs warnings; raises on `URTRUCK_FAIL_ON_BAD_ENV=1`.

    The guard only blocks the app when the operator explicitly
    opts in (the env var) — this keeps existing single-server
    deployments running while making the misconfiguration loud
    in logs and in a `/healthz` style check.
    """
    env = (os.getenv("URTRUCK_ENV") or "").lower()
    if env != "production":
        # Don't fail dev / preview boots; just trace what's mock.
        provider = (os.getenv("STORAGE_PROVIDER") or "local").lower()
        wa = "REAL" if (os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")) else "MOCK"
        print(f"[env-check] env={env or '<unset>'} storage={provider} whatsapp={wa}", flush=True)
        return

    issues = collect_issues()
    if not issues:
        print("[env-check] production env OK (OTP/Storage/Admin/CORS all configured)", flush=True)
        return

    print("[env-check] PRODUCTION CONFIG ISSUES:", flush=True)
    for i in issues:
        print(f"  - {i}", flush=True)

    if os.getenv("URTRUCK_FAIL_ON_BAD_ENV") == "1":
        raise RuntimeError(
            "Refusing to start in production with bad config. "
            "See [env-check] log lines above. Unset URTRUCK_FAIL_ON_BAD_ENV "
            "to start anyway (not recommended)."
        )
