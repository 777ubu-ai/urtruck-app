"""Hardening A final repair, P1 — Twilio must be treated as configured only
with the complete credential triple, and an incomplete production config
must fail closed rather than silently falling back to mock OTP.

Confirmed defect: services/env_check.py's `collect_issues()` treated Twilio
as "a real OTP channel" the moment TWILIO_ACCOUNT_SID alone was set,
without checking TWILIO_AUTH_TOKEN or TWILIO_FROM -- the boot-time gate
would report "production env OK" with a Twilio config that could never
actually send an SMS (services/otp_service.py's real Twilio call needs all
three). Worse: services/otp_service.py's own `SMS_MOCK` derivation already
force-falls-through to mock the moment the chosen provider isn't fully
configured -- so a partial Twilio config in production didn't even reach a
visible error at send time, it silently mocked every OTP send (printing a
now-redacted code to logs instead of texting the user, and never returning
the code to the client either, per the separate IS_PRODUCTION gate at the
API layer) -- a user requesting an OTP would get a "sent" response and then
simply never receive a code, anywhere.

Two independent fixes, tested at both layers:
1. services/env_check.py: `sms_real`/`twilio_real` now require the complete
   triple, plus a dedicated Twilio-specific issue message (symmetric to the
   existing Mobizon one) when the provider is chosen but incomplete.
2. services/otp_service.py's send_sms(): in production specifically, an
   incomplete Twilio config now returns an explicit
   {"sent": False, "error": "twilio_incomplete_config"} BEFORE reaching the
   SMS_MOCK fallback -- defense-in-depth for any code path that calls this
   function without having gone through the boot gate.
"""
import importlib
import os

import pytest


# ── layer 1: services/env_check.py boot-time gate ──────────────────────

@pytest.fixture()
def clean_env(monkeypatch):
    keys = [
        "URTRUCK_ENV", "ENV", "SMS_PROVIDER",
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM",
        "MOBIZON_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_ID", "WHATSAPP_PHONE_NUMBER_ID", "TELEGRAM_BOT_TOKEN",
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


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


def test_sid_only_twilio_is_flagged_incomplete(clean_env):
    import re

    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    # TWILIO_AUTH_TOKEN and TWILIO_FROM deliberately left unset.
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    twilio_issues = [i for i in issues if i.startswith("Twilio:")]
    assert twilio_issues, f"expected a Twilio-specific issue; got: {issues}"
    missing_list = re.search(r"\(missing: ([^)]+)\)", twilio_issues[0]).group(1)
    assert "TWILIO_AUTH_TOKEN" in missing_list
    assert "TWILIO_FROM" in missing_list
    assert "TWILIO_ACCOUNT_SID" not in missing_list, (
        f"the SID (which IS set) must not appear in the missing list: {missing_list!r}"
    )


def test_sid_and_token_but_no_from_is_flagged_incomplete(clean_env):
    import re

    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    os.environ["TWILIO_AUTH_TOKEN"] = "atoken123"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    twilio_issues = [i for i in issues if i.startswith("Twilio:")]
    assert twilio_issues
    missing_list = re.search(r"\(missing: ([^)]+)\)", twilio_issues[0]).group(1)
    assert "TWILIO_FROM" in missing_list
    assert "TWILIO_AUTH_TOKEN" not in missing_list
    assert "TWILIO_ACCOUNT_SID" not in missing_list


def test_complete_twilio_triple_is_not_flagged(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    os.environ["TWILIO_AUTH_TOKEN"] = "atoken123"
    os.environ["TWILIO_FROM"] = "+15551234567"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not [i for i in issues if i.startswith("Twilio:")], f"complete config must not be flagged: {issues}"
    assert not [i for i in issues if i.startswith("OTP: no real channel")], (
        f"a complete Twilio config must satisfy the generic OTP-channel check too: {issues}"
    )


def test_incomplete_twilio_also_fails_the_generic_otp_channel_check_if_nothing_else_configured(clean_env):
    """The Twilio-specific message is additive, not a replacement -- if
    Twilio is the ONLY channel attempted and it's incomplete, the generic
    "no real OTP channel configured" issue must still fire too (sms_real
    must be False for an incomplete Twilio config, not just partially so)."""
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(i.startswith("Twilio:") for i in issues)
    assert any(i.startswith("OTP: no real channel") for i in issues), (
        f"expected the generic OTP-channel issue too, since no complete channel exists: {issues}"
    )


def test_mobizon_provider_is_unaffected_by_the_twilio_fix(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "mobizon"
    os.environ["MOBIZON_API_KEY"] = "a-real-key"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not [i for i in issues if i.startswith("Twilio:")]
    assert not [i for i in issues if i.startswith("Mobizon:")]


# ── layer 2: services/otp_service.py runtime fail-closed ───────────────

@pytest.fixture()
def clean_otp_env(monkeypatch):
    keys = [
        "URTRUCK_ENV", "ENV", "SMS_PROVIDER",
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM",
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
    import config
    importlib.reload(config)
    from services import otp_service
    importlib.reload(otp_service)


def _reload_otp_service():
    import config
    importlib.reload(config)
    from services import otp_service
    importlib.reload(otp_service)
    return otp_service


def test_production_incomplete_twilio_returns_explicit_failure_not_mock(clean_otp_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    # TWILIO_AUTH_TOKEN / TWILIO_FROM left unset -- production, chosen
    # provider, incomplete credentials.
    otp_service = _reload_otp_service()
    assert otp_service.IS_PRODUCTION is True
    assert otp_service.SMS_PROVIDER == "twilio"

    result = otp_service.send_sms("+77001234567", "1234")
    assert result["sent"] is False
    assert result.get("mock") is not True, "must NOT silently report a mock success"
    assert result["error"] == "twilio_incomplete_config"


def test_production_complete_twilio_does_not_hit_the_fail_closed_path(clean_otp_env, monkeypatch):
    """Confirm the fix doesn't over-trigger: a COMPLETE Twilio config in
    production must still attempt the real Twilio call (not fail-closed,
    not mock) -- verified by monkeypatching httpx.post to a stub instead of
    hitting the network, and confirming it's actually called."""
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    os.environ["TWILIO_AUTH_TOKEN"] = "atoken123"
    os.environ["TWILIO_FROM"] = "+15551234567"
    otp_service = _reload_otp_service()
    assert otp_service.SMS_MOCK is False, "a complete Twilio config must not be SMS_MOCK"

    calls = []

    class _FakeResponse:
        def raise_for_status(self):
            return None

    def _fake_post(*args, **kwargs):
        calls.append((args, kwargs))
        return _FakeResponse()

    monkeypatch.setattr(otp_service.httpx, "post", _fake_post)
    result = otp_service.send_sms("+77001234567", "1234")
    assert len(calls) == 1, "the real Twilio HTTP call must be attempted, not skipped"
    assert result["sent"] is True
    assert result["mock"] is False


def test_dev_env_incomplete_twilio_still_falls_back_to_mock(clean_otp_env):
    """The fail-closed behavior is production-specific by design -- local
    development must keep working without a real Twilio account. Outside
    production, an incomplete Twilio config must still degrade to the
    existing SMS_MOCK convenience path, not suddenly start refusing to
    send OTPs to developers."""
    os.environ["URTRUCK_ENV"] = "development"
    os.environ["SMS_PROVIDER"] = "twilio"
    os.environ["TWILIO_ACCOUNT_SID"] = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    otp_service = _reload_otp_service()
    assert otp_service.IS_PRODUCTION is False
    assert otp_service.SMS_MOCK is True

    result = otp_service.send_sms("+77001234567", "1234")
    assert result["sent"] is True
    assert result["mock"] is True
    assert result.get("error") != "twilio_incomplete_config"


if __name__ == "__main__":
    import subprocess
    import sys
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
