"""Regression lock: services/env_check.py's OTP "real channel" boot guard
must recognize Email (SMTP) as a valid production channel, not just
WhatsApp/SMS/Telegram.

Root cause (§18 hardening audit, 2026-09-14): config.py's own module
docstring for EMAIL_SMTP_* explicitly documents email as "канал для Китая
(WhatsApp/TG заблокированы) + резерв" -- i.e. a legitimate PRIMARY channel
for a real deployment, not merely a backup on top of a required phone
channel. Before this fix, collect_issues() only asked
services/otp_service.py's WhatsApp/SMS/Telegram env vars whether *some*
channel was real; a production deploy whose ONLY configured channel was
SMTP (a fully working, intended configuration for the China market) was
wrongly reported as "no real channel configured" and enforce_production_env()
would refuse to boot -- a false-positive boot block for a legitimate
production shape. Conversely, the message text pointed an operator at
WhatsApp/SMS/Telegram only, never mentioning email as a valid fix.

This test file pins both the "false blocker" case (email-only config must
NOT be flagged) and that the alarm still fires when truly nothing --
including email -- is configured. Structured like the sibling
test_beta_mode_production_boot_gate.py file (isolated env, module reload).
"""
import importlib
import os

import pytest


OTP_ISSUE_MARKER = "OTP: no real channel configured"


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


def _reload_email_service():
    # email_service.py reads its SMTP settings from config.py's module-level
    # constants (set once at config import time from os.getenv), not from
    # os.getenv directly -- config.py must be reloaded first or a changed
    # env var here is invisible to email_service.EMAIL_MOCK.
    import config
    importlib.reload(config)
    from services import email_service
    importlib.reload(email_service)
    return email_service


@pytest.fixture()
def clean_otp_env(monkeypatch):
    """Isolate exactly the vars collect_issues()'s OTP channel check reads."""
    keys = [
        "WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_ID", "WHATSAPP_PHONE_NUMBER_ID",
        "SMS_PROVIDER", "MOBIZON_API_KEY",
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM",
        "TELEGRAM_BOT_TOKEN",
        "EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_SMTP_USER",
        "EMAIL_SMTP_PASSWORD", "EMAIL_FROM", "EMAIL_FROM_NAME", "EMAIL_USE_TLS",
    ]
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    _reload_email_service()
    _reload_env_check()


def test_email_only_channel_is_not_flagged_as_no_real_channel(clean_otp_env):
    """The false-positive this fix closes: email is a real, sufficient
    production OTP channel on its own (China market), must not block boot."""
    os.environ["EMAIL_SMTP_HOST"] = "smtp.resend.com"
    os.environ["EMAIL_SMTP_USER"] = "resend"
    os.environ["EMAIL_SMTP_PASSWORD"] = "a-real-smtp-password"
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    assert not any(OTP_ISSUE_MARKER in i for i in issues), (
        f"email-only OTP config (WhatsApp/SMS/Telegram all unset) must not "
        f"be flagged as 'no real channel' -- email IS a real channel; got: {issues}"
    )


def test_nothing_configured_including_email_is_still_flagged(clean_otp_env):
    """The alarm must still fire when genuinely nothing (not even email) is
    configured -- this fix must not silently disable the guard."""
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    assert any(OTP_ISSUE_MARKER in i for i in issues), (
        f"expected an OTP issue when WhatsApp/SMS/Telegram/Email are all "
        f"unconfigured; got: {issues}"
    )


def test_nothing_configured_message_names_email_as_a_valid_fix(clean_otp_env):
    """The actionable message must tell the operator email is an option --
    previously it named only WhatsApp/SMS/Telegram."""
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    otp_issue = next(i for i in issues if OTP_ISSUE_MARKER in i)
    assert "EMAIL_SMTP" in otp_issue


def test_partial_email_config_is_not_treated_as_real(clean_otp_env):
    """Host alone (no user/password) is still MOCK in email_service.py --
    the boot guard must agree, not treat a half-set SMTP config as real."""
    os.environ["EMAIL_SMTP_HOST"] = "smtp.resend.com"
    # EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD intentionally left unset.
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    assert any(OTP_ISSUE_MARKER in i for i in issues), (
        "a host-only (no user/password) SMTP config is still MOCK in "
        "email_service.EMAIL_MOCK and must not satisfy the OTP boot guard"
    )


def test_whatsapp_alone_still_satisfies_the_guard_unaffected_by_email_check(clean_otp_env):
    """Non-regression: adding the email branch must not change the existing,
    already-correct WhatsApp-only pass case."""
    os.environ["WHATSAPP_TOKEN"] = "a-real-whatsapp-token"
    os.environ["WHATSAPP_PHONE_ID"] = "1234567890"
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    assert not any(OTP_ISSUE_MARKER in i for i in issues)
