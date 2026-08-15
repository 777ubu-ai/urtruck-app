"""Production environment guard.

Stage 21 (App Store cleanup) — when the backend boots in production
mode (`URTRUCK_ENV=production`) we must not silently fall back to
mock OTP / mock storage / default admin password. Real users would
either get OTP codes only the operator can see (logs) or upload
photos to a local FS that disappears on the next deploy.

The guard refuses an unsafe production configuration at startup, so
the process supervisor surfaces the problem instead of quietly running
with mock or insecure user-data settings.

Outside production (explicitly set to `development` / `preview` /
`test`) the guard only logs warnings — local dev shouldn't require a
real WhatsApp account. Missing or unknown environment names fail closed
as production.
"""
from __future__ import annotations

import os
from typing import List

from services.qa_token_guard import is_compromised_qa_agent_token
from config import VALID_RUNTIME_ENVIRONMENTS


def _is_unsafe_password(value: str) -> bool:
    if not value:
        return True
    bad = {"change_me", "change_me_in_production", "admin", "password", "123456"}
    return value.lower() in bad


def collect_issues() -> List[str]:
    """Return a list of human-readable production-config problems."""
    issues: List[str] = []

    raw_env = (os.getenv("URTRUCK_ENV") or os.getenv("ENV") or "production").strip().lower()
    if raw_env not in VALID_RUNTIME_ENVIRONMENTS:
        issues.append(
            f"Environment: unsupported runtime name {raw_env!r}; fail-closed mode is production. "
            f"Use one of: {', '.join(sorted(VALID_RUNTIME_ENVIRONMENTS))}."
        )

    # SEC-001: fixed reviewer credentials were removed from the auth path.
    # Treat stale production variables as a configuration error so operators do
    # not assume the old bypass still exists or accidentally reintroduce it.
    if os.getenv("REVIEWER_DEMO_EMAIL") or os.getenv("REVIEWER_DEMO_CODE"):
        issues.append(
            "Auth: legacy REVIEWER_DEMO_* credentials are forbidden; App Review must use normal email OTP."
        )

    # OTP — at least one real channel must be configured.
    wa_token = os.getenv("WHATSAPP_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN")
    wa_phone = os.getenv("WHATSAPP_PHONE_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    sms_provider = (os.getenv("SMS_PROVIDER") or "mock").lower()
    sms_real = sms_provider != "mock" and (
        os.getenv("MOBIZON_API_KEY") or os.getenv("TWILIO_ACCOUNT_SID")
    )
    tg_real = bool(os.getenv("TELEGRAM_BOT_TOKEN"))
    email_real = bool(
        os.getenv("EMAIL_SMTP_HOST")
        and os.getenv("EMAIL_SMTP_USER")
        and os.getenv("EMAIL_SMTP_PASSWORD")
    )
    if not (wa_token and wa_phone) and not sms_real and not tg_real and not email_real:
        issues.append(
            "OTP: no real channel configured (WhatsApp / SMS / Telegram / Email all in MOCK). "
            "Real users will not receive codes. Set WHATSAPP_TOKEN+WHATSAPP_PHONE_ID, "
            "SMS_PROVIDER=mobizon|twilio with credentials, TELEGRAM_BOT_TOKEN, "
            "or EMAIL_SMTP_HOST+EMAIL_SMTP_USER+EMAIL_SMTP_PASSWORD."
        )

    # Stage 22: BETA_MODE in production is a security hole — anyone
    # could log in with the universal `0000` code. config.py defaults
    # it to false in production, but if someone explicitly flips it
    # back on we still want the operator to see a loud warning.
    if (os.getenv("BETA_MODE") or "").lower() in ("1", "true", "yes"):
        issues.append(
            "BETA_MODE: enabled in production env — universal OTP code (BETA_OTP_CODE) "
            "would let anyone log in with any phone. Unset BETA_MODE or set BETA_MODE=false."
        )

    # Documents and chat attachments use a different HMAC key from the API
    # secret. Reusing an API key widens the blast radius; an absent/short key
    # previously resulted in HMAC signatures made with an empty string.
    signing_key = os.getenv("FILE_SIGNING_KEY", "")
    if len(signing_key.encode("utf-8")) < 32:
        issues.append(
            "Files: FILE_SIGNING_KEY is missing or shorter than 32 bytes. "
            "Generate a separate key with `openssl rand -hex 32`."
        )

    # Stage 22: Mobizon-specific config sanity. If SMS_PROVIDER says
    # mobizon, the key must be there; otherwise sms calls would
    # silently 500 in prod the moment WhatsApp throttles.
    if sms_provider == "mobizon" and not os.getenv("MOBIZON_API_KEY"):
        issues.append(
            "Mobizon: SMS_PROVIDER=mobizon but MOBIZON_API_KEY is empty. "
            "Set the API key from https://mobizon.kz → API."
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
    # Fix (B3): admin.py reads URTRUCK_ADMIN_PASS, not ADMIN_PASSWORD — the old
    # check looked at the wrong var and never fired. Check the real var (with
    # legacy ADMIN_PASSWORD as fallback) and reject the committed default too.
    admin_pass = os.getenv("URTRUCK_ADMIN_PASS") or os.getenv("ADMIN_PASSWORD", "")
    if _is_unsafe_password(admin_pass) or admin_pass == "urtruck-admin-2026":
        issues.append(
            "Admin: URTRUCK_ADMIN_PASS is empty or a default placeholder "
            "(urtruck-admin-2026 / admin / password / 123456). Set a strong unique value."
        )

    # API key / admin token — committed defaults in api/auth.py. In prod they
    # must be overridden or the /blacklist/add & /report endpoints are wide open.
    if (os.getenv("URTRUCK_API_KEY") or "demo-api-key-change-me") == "demo-api-key-change-me":
        issues.append("API: URTRUCK_API_KEY still the demo default — set a real key.")
    if (os.getenv("URTRUCK_ADMIN_TOKEN") or "demo-admin-change-me") == "demo-admin-change-me":
        issues.append("API: URTRUCK_ADMIN_TOKEN still the demo default — set a real token.")

    # A Maestro runner accidentally committed this privileged QA endpoint key.
    # The source contains only its SHA-256 fingerprint; the old value must be
    # replaced in the server secret store before the app can boot safely.
    if is_compromised_qa_agent_token(os.getenv("QA_AGENT_TOKEN")):
        issues.append("QA: QA_AGENT_TOKEN is compromised — rotate it in the secret store.")

    # CORS — production should not allow http://localhost or wildcard.
    cors = os.getenv("CORS_ORIGINS", "")
    if "*" in cors.split(","):
        issues.append("CORS: wildcard '*' in CORS_ORIGINS — restrict to known frontends.")

    return issues


def enforce_production_env() -> None:
    """Block startup when a production environment is unsafe."""
    # An omitted environment name is production for a deployed service. This
    # avoids the dangerous historical behaviour where forgetting one variable
    # silently selected permissive development defaults on a public server.
    raw_env = (os.getenv("URTRUCK_ENV") or os.getenv("ENV") or "production").strip().lower()
    # A typo must never route startup through the permissive non-production
    # branch. Treat unsupported names exactly like production, then let
    # collect_issues() report the invalid value alongside other unsafe config.
    env = raw_env if raw_env in VALID_RUNTIME_ENVIRONMENTS else "production"
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

    # In production the listed problems expose authentication or users' files;
    # do not allow a deployment to continue merely because an optional flag
    # was forgotten. Dev/preview is intentionally unaffected above.
    if issues:
        raise RuntimeError(
            "Refusing to start in production with unsafe configuration. "
            "See [env-check] log lines above and configure the missing values."
        )
