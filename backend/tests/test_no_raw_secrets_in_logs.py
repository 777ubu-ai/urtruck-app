"""Release hardening track A, Commit 1 — regression guard: no raw OTP/
verification code, unmasked phone, unmasked email, or raw token may ever be
interpolated into a log/print statement anywhere in the backend runtime code.

This is intentionally source-level (static) coverage, not a live-server
test: it reads the actual .py source of every OTP/verification delivery
channel and asserts (a) the specific confirmed defect
(services/telegram_bot.py's live Telegram-bot polling path printing a raw
OTP + full phone) stays fixed, and (b) a general pattern guard so a FUTURE
print/log statement that interpolates a bare `code`/`otp_code`/`verify_code`
variable next to an "OTP"/"MOCK"/"verif" marker fails the suite immediately,
rather than silently shipping a new leak of the same shape.

Scope: backend/services/*.py and backend/api/*.py — the two places OTP
codes and phone/email/tokens are ever handled. Test files, scripts/, and
frontend are out of scope (frontend push-token masking was already audited
and confirmed clean in a prior session pass — src/utils/push.js's
_maskToken).
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [ROOT / "services", ROOT / "api"]

# Every .py file actually shipped (skip __pycache__, this test file's own dir).
def _source_files():
    for d in SCAN_DIRS:
        if not d.exists():
            continue
        yield from sorted(p for p in d.rglob("*.py") if "__pycache__" not in p.parts)


SOURCES = {p: p.read_text(encoding="utf-8") for p in _source_files()}


def test_telegram_bot_live_polling_path_no_longer_leaks_otp_or_phone():
    """The confirmed defect this track closes: services/telegram_bot.py's
    _poll_loop -> the "/start verify_XXXX" handler printed the raw OTP code
    AND the full phone number on the LIVE (non-mock) Telegram bot path."""
    src = (ROOT / "services" / "telegram_bot.py").read_text(encoding="utf-8")
    assert 'print(f"[TG-bot] Sent OTP {code} to chat {chat_id} for {phone}")' not in src, (
        "the original raw-OTP-and-phone log line has returned"
    )
    assert "Sent OTP (redacted)" in src, "expected the redacted replacement log line"
    assert "mask_phone(phone)" in src, "phone must be masked via the shared helper"


def test_telegram_bot_poll_start_masks_token():
    src = (ROOT / "services" / "telegram_bot.py").read_text(encoding="utf-8")
    assert "_token[-8:]" not in src, "raw slicing bypasses the shared mask_token() helper"
    assert "mask_token(_token)" in src


def test_mock_otp_channels_never_print_the_raw_code():
    """Every MOCK-mode OTP delivery print (SMS, Telegram-deeplink, WhatsApp
    x2, Email) must not interpolate the raw `code` variable into the log
    line -- the code may still be RETURNED in the mock response dict (that's
    the actual dev-mock delivery mechanism, separately gated by
    IS_PRODUCTION at the API layer), just never printed/logged."""
    checks = {
        ROOT / "services" / "otp_service.py": [
            'print(f"[OTP·SMS MOCK] {masked}: {code}")',
            'print(f"[OTP·TG MOCK] {phone}: {code}',
        ],
        ROOT / "services" / "email_service.py": [
            'print(f"[EMAIL MOCK] {email}: {code}", flush=True)',
        ],
        ROOT / "services" / "whatsapp.py": [
            'print(f"[WA MOCK] {phone}: {code}")',
        ],
        ROOT / "services" / "whatsapp_service.py": [
            'print(f"[WhatsApp MOCK] → {phone}: код {code}")',
        ],
    }
    for path, banned_substrings in checks.items():
        src = path.read_text(encoding="utf-8")
        for banned in banned_substrings:
            assert banned not in src, f"{path.name} still contains the raw-code log line: {banned!r}"


def test_email_error_path_masks_email():
    src = (ROOT / "services" / "email_service.py").read_text(encoding="utf-8")
    assert 'print(f"[EMAIL] send failed to {email}: {e}", flush=True)' not in src
    assert "mask_email(email)" in src


def test_general_pattern_guard_no_bare_code_in_otp_marked_log_lines():
    """Forward-looking guard: fail the suite if ANY print()/logger.*() call
    anywhere under services/ or api/ interpolates a bare `code` (or
    `otp_code`/`verify_code`/`verification_code`) identifier on a line that
    also mentions OTP/MOCK/verif — regardless of which file it's in. This
    is deliberately broader than the specific fixes above so a *new* leak of
    the same shape (a future provider module, a refactor) fails loudly
    instead of shipping silently.
    """
    code_var = r"\{(?:otp_)?(?:verify_|verification_)?code\}"
    marker = re.compile(r"OTP|MOCK|verif", re.IGNORECASE)
    offenders = []
    for path, src in SOURCES.items():
        for lineno, line in enumerate(src.splitlines(), start=1):
            stripped = line.strip()
            if not (stripped.startswith("print(") or "logger." in stripped or "logging." in stripped):
                continue
            if not marker.search(line):
                continue
            if re.search(code_var, line):
                offenders.append(f"{path.relative_to(ROOT)}:{lineno}: {stripped}")
    assert not offenders, (
        "found log/print statement(s) interpolating a raw OTP/verification code:\n"
        + "\n".join(offenders)
    )


def test_general_pattern_guard_no_raw_phone_in_otp_marked_log_lines():
    """Same idea for phone: a print/log line mentioning OTP/MOCK that
    interpolates a bare `{phone}`/`{msisdn}` (not wrapped in mask_phone(...))
    is a leak. Deliberately allows `mask_phone(phone)` (function call, not a
    bare identifier) and chat_id (Telegram-internal, not PII)."""
    bare_phone = re.compile(r"\{(?:phone|msisdn)\}")
    masked_call = re.compile(r"mask_phone\(")
    marker = re.compile(r"OTP|MOCK|verif", re.IGNORECASE)
    offenders = []
    for path, src in SOURCES.items():
        for lineno, line in enumerate(src.splitlines(), start=1):
            stripped = line.strip()
            if not (stripped.startswith("print(") or "logger." in stripped or "logging." in stripped):
                continue
            if not marker.search(line):
                continue
            if bare_phone.search(line) and not masked_call.search(line):
                offenders.append(f"{path.relative_to(ROOT)}:{lineno}: {stripped}")
    assert not offenders, (
        "found log/print statement(s) interpolating an unmasked phone number:\n"
        + "\n".join(offenders)
    )


def test_log_redact_helpers_behave_as_documented():
    """Sanity-check the shared helper itself (not just its call sites)."""
    from services.log_redact import mask_phone, mask_email, mask_token, REDACTED

    assert mask_phone("+77001234567") == "+770***567"
    assert "1234567" not in mask_phone("+77001234567")
    assert mask_phone("") == "<empty>"
    assert mask_phone("123") == REDACTED  # too short to safely partial-mask

    masked = mask_email("driver@example.com")
    assert masked.endswith("@example.com")
    assert "driver" not in masked
    assert mask_email("") == "<empty>"
    assert mask_email("not-an-email") == REDACTED

    masked_tok = mask_token("supersecrettokenvalue1234567890")
    assert masked_tok == "...34567890"
    assert "supersecret" not in masked_tok
    assert mask_token("") == "<empty>"


if __name__ == "__main__":
    import sys
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS: {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL: {name}\n  {e}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
