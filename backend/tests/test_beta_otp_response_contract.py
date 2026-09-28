"""FINAL 10/10 AUTH CANON CLOSURE (2026-09-14) — BETA_MODE OTP response
contract must be truthful.

Root cause: otp_service.send_otp()'s BETA bypass hardcoded `mock: False`
while never actually using any real channel (WhatsApp/Telegram/SMS/email) —
it returns before the per-channel dispatch even runs. That falsehood had a
REAL, reproduced consequence on the isolated audit backend: api/registration.
py's email_send() only returns `code` to the caller when `mock` is true (the
QA/dev convenience so the OTP can be read without a real inbox); with
`mock: False` in BETA_MODE, `email_send()` returned `code: null` even though
BETA_OTP_CODE was the actual code the frontend needed to show, silently
forcing a direct DB read to recover it. The whatsapp/sms channel endpoint
(register/whatsapp/send) already read `beta` separately and worked around
this; email_send() did not.

Fixed at the root (otp_service.send_otp's BETA branch: `mock: True`, `beta:
True` stays a more specific sub-classification) and, for parity with the
whatsapp/sms endpoint's own pattern, api/registration.py's email_send() now
also surfaces `beta` and gates `code` on `is_mock or is_beta`.
"""
import pytest

from api import registration
from services import otp_service


@pytest.fixture(autouse=True)
def isolate_registration_side_effects(monkeypatch):
    monkeypatch.setattr(registration, "limit_otp_send", lambda *_a, **_k: None)
    monkeypatch.setattr(registration, "limit_otp_send_ip", lambda *_a, **_k: None)
    monkeypatch.setattr(registration.reg_dal, "save_code", lambda *_a, **_k: None)
    monkeypatch.setattr(registration, "generate_code", lambda: "1234")
    monkeypatch.setattr(registration, "REVIEWER_DEMO_EMAIL", "")


def test_otp_service_beta_branch_reports_mock_true():
    """The service-level contract: BETA_MODE never used a real channel, so
    `mock` must say so truthfully. `beta` stays the finer-grained flag."""
    monkeypatch_beta = otp_service.BETA_MODE
    try:
        otp_service.BETA_MODE = True
        result = otp_service.send_otp("someone@example.com", "0000", channel="email")
        assert result["mock"] is True
        assert result["beta"] is True
        assert result["sent"] is True
        assert result["code"] == otp_service.BETA_OTP_CODE
    finally:
        otp_service.BETA_MODE = monkeypatch_beta


def test_email_send_returns_the_beta_code_not_null(monkeypatch):
    """Live reproduction of the audit finding, at the HTTP-handler level:
    a real POST /register/email/send in BETA_MODE must return a usable
    `code`, not `code: null` while silently substituting BETA_OTP_CODE
    server-side with no way for the caller to know it."""
    monkeypatch.setattr(otp_service, "BETA_MODE", True)
    monkeypatch.setattr(registration, "IS_PRODUCTION", False)

    body = registration.EmailSendRequest(email="qa-beta-otp@example.com", consent=True)
    result = registration.email_send(body, request=None)

    assert result["sent"] is True
    assert result["mock"] is True
    assert result["beta"] is True
    assert result["code"] == otp_service.BETA_OTP_CODE, (
        "the caller must be able to read the actual code the backend expects "
        "back, not null -- this was the reproduced bug"
    )
    assert result["error"] is None


def test_email_send_never_leaks_beta_code_in_production(monkeypatch):
    """The existing not-in-production gate on `code` must still hold for
    the beta branch, same as it already does for the plain-mock branch."""
    monkeypatch.setattr(otp_service, "BETA_MODE", True)
    monkeypatch.setattr(registration, "IS_PRODUCTION", True)

    body = registration.EmailSendRequest(email="qa-beta-otp-prod@example.com", consent=True)
    result = registration.email_send(body, request=None)

    assert result["sent"] is True
    assert result["mock"] is True
    assert result["beta"] is True
    assert result["code"] is None
