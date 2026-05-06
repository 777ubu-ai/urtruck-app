"""Smoke tests for the Mobizon SMS service.

We don't make real network calls in CI — Mobizon would charge per
message and rate-limit the test account. Instead we monkey-patch
`httpx.post` and assert that:

  * is_configured() reflects MOBIZON_API_KEY presence
  * phone normalisation drops `+`
  * a successful Mobizon envelope (`code: 0`) returns sent=True
  * a Mobizon error envelope (`code: 101`) returns sent=False with details
  * a timeout returns sent=False with error="timeout"
  * info() exposes the right mode

Run: cd backend && python -m pytest tests/test_sms_mobizon.py -v
"""
from __future__ import annotations

import importlib
import os
from unittest.mock import patch

import httpx
import pytest


@pytest.fixture
def mob():
    """Reload sms_mobizon for each test so env-driven state is fresh."""
    import sys
    if "services.sms_mobizon" in sys.modules:
        del sys.modules["services.sms_mobizon"]
    return importlib.import_module("services.sms_mobizon")


def test_is_configured_reads_env(mob):
    with patch.dict(os.environ, {"MOBIZON_API_KEY": ""}, clear=False):
        assert mob.is_configured() is False
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy"}, clear=False):
        assert mob.is_configured() is True


def test_normalize_phone_drops_plus(mob):
    assert mob._normalize_phone("+77001234567") == "77001234567"
    assert mob._normalize_phone("7 (700) 123-45-67") == "77001234567"
    assert mob._normalize_phone("invalid") == ""


def test_send_returns_not_configured_without_key(mob):
    with patch.dict(os.environ, {"MOBIZON_API_KEY": ""}, clear=False):
        r = mob.send_sms("+77001234567", "test")
    assert r["sent"] is False
    assert r["error"] == "not_configured"


def test_send_rejects_short_phone(mob):
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy"}, clear=False):
        r = mob.send_sms("+1234", "test")
    assert r["sent"] is False
    assert r["error"] == "phone_invalid"


def test_send_success_envelope(mob):
    fake_response = httpx.Response(
        200,
        json={"code": 0, "data": {"campaignId": 12345, "messageId": "abc-1"}, "message": "Success"},
        request=httpx.Request("POST", "https://api.mobizon.kz/test"),
    )
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy"}, clear=False), \
         patch("services.sms_mobizon.httpx.post", return_value=fake_response):
        r = mob.send_sms("+77001234567", "UrTruck: 1234")
    assert r["sent"] is True
    assert r["provider"] == "mobizon"
    assert r["message_id"] in (12345, "abc-1")


def test_send_returns_mobizon_error_code(mob):
    fake_response = httpx.Response(
        200,
        json={"code": 101, "message": "Invalid api key"},
        request=httpx.Request("POST", "https://api.mobizon.kz/test"),
    )
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "bad_key"}, clear=False), \
         patch("services.sms_mobizon.httpx.post", return_value=fake_response):
        r = mob.send_sms("+77001234567", "UrTruck: 1234")
    assert r["sent"] is False
    assert r["code"] == 101
    assert "api key" in (r.get("detail") or "").lower()


def test_send_handles_timeout(mob):
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy", "MOBIZON_TIMEOUT": "1"}, clear=False), \
         patch("services.sms_mobizon.httpx.post", side_effect=httpx.TimeoutException("slow")):
        r = mob.send_sms("+77001234567", "UrTruck: 1234")
    assert r["sent"] is False
    assert r["error"] == "timeout"


def test_send_retries_once_on_timeout(mob):
    fake_ok = httpx.Response(
        200,
        json={"code": 0, "data": {"messageId": "retry-ok"}},
        request=httpx.Request("POST", "https://api.mobizon.kz/test"),
    )
    calls = []

    def flaky(*args, **kwargs):
        calls.append(kwargs.get("data", {}).get("recipient"))
        if len(calls) == 1:
            raise httpx.TimeoutException("first slow")
        return fake_ok

    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy"}, clear=False), \
         patch("services.sms_mobizon.httpx.post", side_effect=flaky):
        r = mob.send_sms("+77001234567", "UrTruck: 1234", retries=1)
    assert r["sent"] is True
    assert len(calls) == 2  # one timeout + one retry


def test_info_exposes_mode(mob):
    with patch.dict(os.environ, {"MOBIZON_API_KEY": ""}, clear=False):
        info = mob.info()
    assert info["mode"] == "MOCK"
    assert info["configured"] is False
    with patch.dict(os.environ, {"MOBIZON_API_KEY": "kz_dummy", "MOBIZON_SENDER": "UrTruck"}, clear=False):
        info = mob.info()
    assert info["mode"] == "REAL"
    assert info["sender"] == "UrTruck"
