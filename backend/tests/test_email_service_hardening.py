"""Hardening B (2026-09-14) — SMTP/email OTP channel code-path coverage.

Scope: backend/services/email_service.py, backend/services/env_check.py's
OTP-channel production guard. No real SMTP credentials exist in this repo/CI
— every "REAL mode" scenario below mocks smtplib itself; no network call is
ever attempted. See /tmp/.../hardening_agentB_providers.md for the summary.

Covers:
  1. MOCK mode (no SMTP creds): sent=True/mock=True, raw OTP code never
     printed (regression guard alongside tests/test_no_raw_secrets_in_logs.py).
  2. info()/is_configured(): presence-only diagnostics, never the password.
  3. REAL mode success (port 587 STARTTLS, port 465 implicit SSL).
  4. REAL mode failures: auth rejection (permanent, non-retryable), a
     connect timeout (transient, retryable), and an unclassified provider
     error (non-retryable) — none of them ever prints the SMTP password.
  5. Root-cause regression: services/env_check.py's boot-time OTP-channel
     guard used to be blind to email — (a) a production deployment where
     email is the ONLY configured channel was wrongly refused at boot, and
     (b) "nothing configured, including email" must still refuse to boot,
     with a message that mentions email as a valid fix.

CI contract: top-level `def test_*` (not a class) — matches every other file
in this directory (see test_idor_three_accounts.py's docstring for why).
"""
import importlib
import os

import pytest


# ─────────────────────────── env reload plumbing ───────────────────────────
# config.py and email_service.py both cache their env-derived state at
# import time (see email_service.py's module-level EMAIL_MOCK). Tests that
# vary EMAIL_SMTP_* must reload both, in dependency order, for the change to
# take effect — mirrors tests/test_twilio_env_gate.py and
# tests/test_beta_mode_production_boot_gate.py's existing reload pattern.

_EMAIL_ENV_KEYS = [
    "EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_SMTP_USER",
    "EMAIL_SMTP_PASSWORD", "EMAIL_FROM", "EMAIL_FROM_NAME", "EMAIL_USE_TLS",
]
_CHANNEL_ENV_KEYS = [
    "URTRUCK_ENV", "ENV", "SMS_PROVIDER",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM",
    "MOBIZON_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_ID", "WHATSAPP_PHONE_NUMBER_ID", "TELEGRAM_BOT_TOKEN",
]


@pytest.fixture()
def clean_email_env(monkeypatch):
    keys = _EMAIL_ENV_KEYS + _CHANNEL_ENV_KEYS
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


def _reload_email_service():
    import config
    importlib.reload(config)
    from services import email_service
    importlib.reload(email_service)
    return email_service


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


# ────────────────────────────── 1. MOCK mode ───────────────────────────────

def test_mock_mode_never_prints_raw_code(clean_email_env, capsys):
    svc = _reload_email_service()
    assert svc.is_configured() is False
    assert svc.info()["mode"] == "MOCK"
    assert svc.info()["configured"] is False

    result = svc.send_otp("driver@example.com", "1234")
    assert result == {"sent": True, "mock": True, "channel": "email", "code": "1234"}

    out = capsys.readouterr().out
    assert "1234" not in out, f"raw OTP code leaked into stdout: {out!r}"
    assert "redacted" in out


# ────────────────────────────── 2. info() shape ────────────────────────────

def test_info_reports_presence_never_the_password(clean_email_env, monkeypatch):
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.resend.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_SMTP_USER", "resend")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "super-secret-value-12345")
    monkeypatch.setenv("EMAIL_USE_TLS", "true")
    svc = _reload_email_service()

    info = svc.info()
    assert info["mode"] == "REAL"
    assert info["configured"] is True
    assert info["host_present"] is True
    assert info["port_present"] is True
    assert info["username_present"] is True
    assert info["sender_present"] is True
    assert info["tls_config_valid"] is True
    assert "password" not in {k.lower() for k in info}
    dumped = repr(info)
    assert "super-secret-value-12345" not in dumped, "the raw SMTP password must never appear in info()"


def test_tls_config_flagged_invalid_when_starttls_disabled_on_plaintext_port(clean_email_env, monkeypatch):
    """Port 587 (STARTTLS) with EMAIL_USE_TLS=false means OTP codes and the
    SMTP login would cross the network in plaintext — an operator misconfig
    worth surfacing distinctly from "not configured at all"."""
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_SMTP_USER", "u")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "p")
    monkeypatch.setenv("EMAIL_USE_TLS", "false")
    svc = _reload_email_service()
    assert svc.info()["tls_config_valid"] is False


def test_tls_config_valid_on_implicit_ssl_port_465_regardless_of_use_tls_flag(clean_email_env, monkeypatch):
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "465")
    monkeypatch.setenv("EMAIL_SMTP_USER", "u")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "p")
    monkeypatch.setenv("EMAIL_USE_TLS", "false")
    svc = _reload_email_service()
    assert svc.info()["tls_config_valid"] is True, "port 465 is implicit TLS (SMTP_SSL) regardless of EMAIL_USE_TLS"


# ────────────────────────── 3. REAL mode — success ─────────────────────────

class _FakeSMTP:
    """Records login/send_message calls; used as a context manager, exactly
    like smtplib.SMTP/SMTP_SSL in email_service.send_otp()."""
    instances = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.logged_in = None
        self.sent = None
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def ehlo(self):
        pass

    def starttls(self, context=None):
        pass

    def login(self, user, password):
        self.logged_in = (user, password)

    def send_message(self, msg):
        self.sent = msg


def test_real_mode_starttls_port_587_success(clean_email_env, monkeypatch):
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_SMTP_USER", "u")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "p")
    svc = _reload_email_service()
    _FakeSMTP.instances.clear()
    monkeypatch.setattr(svc.smtplib, "SMTP", _FakeSMTP)

    result = svc.send_otp("shipper@example.com", "5678")
    assert result == {"sent": True, "mock": False, "channel": "email"}
    assert _FakeSMTP.instances[0].logged_in == ("u", "p")
    assert _FakeSMTP.instances[0].sent is not None


def test_real_mode_implicit_ssl_port_465_uses_smtp_ssl(clean_email_env, monkeypatch):
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "465")
    monkeypatch.setenv("EMAIL_SMTP_USER", "u")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "p")
    svc = _reload_email_service()
    _FakeSMTP.instances.clear()
    ssl_calls = []

    class _FakeSMTP_SSL(_FakeSMTP):
        def __init__(self, host, port, context=None, timeout=None):
            ssl_calls.append((host, port))
            super().__init__(host, port, timeout=timeout, context=context)

    monkeypatch.setattr(svc.smtplib, "SMTP_SSL", _FakeSMTP_SSL)
    monkeypatch.setattr(svc.smtplib, "SMTP", lambda *a, **kw: (_ for _ in ()).throw(
        AssertionError("port 465 must use SMTP_SSL, not plaintext SMTP")))

    result = svc.send_otp("shipper@example.com", "5678")
    assert result == {"sent": True, "mock": False, "channel": "email"}
    assert ssl_calls == [("smtp.example.com", 465)]


# ─────────────────────────── 4. REAL mode — failures ───────────────────────

def _real_mode(monkeypatch):
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_SMTP_USER", "u")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "correct-horse-battery-staple")
    return _reload_email_service()


def test_auth_failure_is_permanent_non_retryable_and_never_leaks_password(clean_email_env, monkeypatch, capsys):
    svc = _real_mode(monkeypatch)
    import smtplib

    class _AuthFailSMTP(_FakeSMTP):
        def login(self, user, password):
            raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Authentication failed")

    monkeypatch.setattr(svc.smtplib, "SMTP", _AuthFailSMTP)
    result = svc.send_otp("shipper@example.com", "5678")
    assert result["sent"] is False
    assert result["mock"] is False
    assert result["error"] == "email_auth_failed"
    assert result["retryable"] is False

    out = capsys.readouterr().out
    assert "correct-horse-battery-staple" not in out, "SMTP password must never reach stdout"
    assert "5678" not in out, "OTP code must never reach stdout even on failure"


def test_connect_timeout_is_transient_and_retryable(clean_email_env, monkeypatch, capsys):
    svc = _real_mode(monkeypatch)

    def _raise_timeout(*a, **kw):
        raise TimeoutError("timed out")

    monkeypatch.setattr(svc.smtplib, "SMTP", _raise_timeout)
    result = svc.send_otp("shipper@example.com", "5678")
    assert result["sent"] is False
    assert result["error"] == "email_timeout"
    assert result["retryable"] is True
    out = capsys.readouterr().out
    assert "correct-horse-battery-staple" not in out


def test_server_disconnected_mid_send_is_transient_and_retryable(clean_email_env, monkeypatch):
    svc = _real_mode(monkeypatch)
    import smtplib

    class _DisconnectSMTP(_FakeSMTP):
        def send_message(self, msg):
            raise smtplib.SMTPServerDisconnected("connection lost")

    monkeypatch.setattr(svc.smtplib, "SMTP", _DisconnectSMTP)
    result = svc.send_otp("shipper@example.com", "5678")
    assert result["error"] == "email_timeout"
    assert result["retryable"] is True


def test_unclassified_provider_error_is_non_retryable_and_generic(clean_email_env, monkeypatch, capsys):
    svc = _real_mode(monkeypatch)

    class _WeirdFailureSMTP(_FakeSMTP):
        def login(self, user, password):
            raise ValueError("unexpected provider response: leaked-internal-detail")

    monkeypatch.setattr(svc.smtplib, "SMTP", _WeirdFailureSMTP)
    result = svc.send_otp("shipper@example.com", "5678")
    assert result["error"] == "email_delivery_failed"
    assert result["retryable"] is False
    out = capsys.readouterr().out
    assert "leaked-internal-detail" not in out, "raw exception text must not be printed verbatim"


# ─────────── 5. root-cause regression: env_check must know about email ─────

def test_production_with_only_email_configured_does_not_false_positive(clean_email_env, monkeypatch):
    """The actual bug this track fixes: a China-focused deployment where
    email is the ONLY configured OTP channel (WA/Telegram blocked in China,
    international SMS to +86 unreliable — see email_service.py's module
    docstring) used to be wrongly refused at boot as "no real channel
    configured", even though real OTP delivery via email worked fine."""
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.resend.com")
    monkeypatch.setenv("EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_SMTP_USER", "resend")
    monkeypatch.setenv("EMAIL_SMTP_PASSWORD", "p")
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    otp_issues = [i for i in issues if i.startswith("OTP:")]
    assert not otp_issues, f"email-only production config must not be flagged as 'no real channel': {issues}"


def test_production_with_nothing_configured_including_email_still_fails_closed(clean_email_env, monkeypatch):
    """The other half of the regression: this must NOT become a false
    negative — if truly nothing (including email) is configured in
    production, the boot-time guard must still refuse to start, and its
    message must now name email as one of the valid fixes."""
    monkeypatch.setenv("URTRUCK_ENV", "production")
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    otp_issues = [i for i in issues if i.startswith("OTP:")]
    assert otp_issues, f"nothing configured (incl. email) must still fail closed: {issues}"
    assert "Email" in otp_issues[0] or "EMAIL_SMTP" in otp_issues[0], (
        f"the OTP-channel message should mention email as a valid fix: {otp_issues[0]!r}"
    )


def test_production_with_whatsapp_only_still_passes_unaffected_by_the_email_change(clean_email_env, monkeypatch):
    """Regression guard: adding the email branch must not touch the
    existing WhatsApp/SMS/Telegram-only-configured passing case."""
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("WHATSAPP_TOKEN", "wa-token")
    monkeypatch.setenv("WHATSAPP_PHONE_ID", "12345")
    _reload_email_service()
    env_check = _reload_env_check()

    issues = env_check.collect_issues()
    otp_issues = [i for i in issues if i.startswith("OTP:")]
    assert not otp_issues, f"a real WhatsApp config must still pass: {issues}"
