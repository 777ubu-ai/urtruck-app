"""Shared PII-safe logging helpers.

Release Hardening Track A (2026-09-10): centralizes phone/email masking used
across every OTP/verification-code delivery path (telegram_bot.py,
otp_service.py, email_service.py, whatsapp.py, whatsapp_service.py) so there
is exactly one place that defines "masked enough to log", instead of several
slightly-different inline implementations (the confirmed defect this track
closes: services/telegram_bot.py:101 printed a raw OTP code AND a raw phone
number on the live, non-mock Telegram-bot polling path -- see
tests/test_no_raw_secrets_in_logs.py for the regression guard).

Verification codes are NEVER passed through a masking function here -- the
fix is to stop interpolating the raw code into any log/print statement at
all, full stop. Use REDACTED as the literal placeholder instead.
"""

REDACTED = "***"


def mask_phone(phone) -> str:
    """Keep the first 4 and last 3 digits (enough to correlate a support
    ticket with a user without printing the full number), mask the rest.
    Matches the convention already used in services/sms_mobizon.py's
    `_mask_phone` and api/registration.py's consent-audit logging."""
    if not phone:
        return "<empty>"
    raw = str(phone)
    if len(raw) < 8:
        return REDACTED
    return f"{raw[:4]}***{raw[-3:]}"


def mask_email(email) -> str:
    """user@domain.com -> u***r@domain.com. Domain is kept (useful for
    spotting a misconfigured provider/typo domain in logs); the local part
    is hinted, not shown in full."""
    if not email:
        return "<empty>"
    raw = str(email)
    if "@" not in raw:
        return REDACTED
    local, _, domain = raw.partition("@")
    if len(local) <= 2:
        hint = "*" * len(local)
    else:
        hint = f"{local[0]}***{local[-1]}"
    return f"{hint}@{domain}"


def mask_token(token) -> str:
    """Show only the last 8 characters -- enough to distinguish which token
    rotated without ever printing something a log-reader could replay.
    Matches the convention already used by telegram_bot.py's own polling-
    start log line and src/utils/push.js's `_maskToken`."""
    if not token:
        return "<empty>"
    raw = str(token)
    if len(raw) <= 8:
        return REDACTED
    return f"...{raw[-8:]}"
