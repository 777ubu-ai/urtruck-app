"""SEC-001: fixed reviewer/default authentication bypass regression tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_reviewer_auth.db")
os.environ.setdefault("URTRUCK_ENV", "production")
os.environ.setdefault("BETA_MODE", "false")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal
from database.db import get_conn

ddb.init_db()
reg_dal.init_registration_schema()

import config
from api import registration
from api.registration import reg_router
from services import env_check

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_auth_state(monkeypatch):
    monkeypatch.setattr(registration, "BETA_MODE", False)
    with get_conn() as c:
        c.execute("DELETE FROM reg_sessions")
        c.execute("DELETE FROM verification_codes")
        c.execute("DELETE FROM drivers_registration")
    yield


def _session_count() -> int:
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) AS n FROM reg_sessions").fetchone()["n"]


def _verify(email: str, code: str):
    return client.post("/api/v1/register/email/verify", json={"email": email, "code": code})


def test_fixed_reviewer_configuration_is_absent_and_cannot_issue_token(monkeypatch):
    assert not hasattr(config, "REVIEWER_DEMO_EMAIL")
    assert not hasattr(config, "REVIEWER_DEMO_CODE")
    monkeypatch.setenv("REVIEWER_DEMO_EMAIL", "reviewer-security-test@example.invalid")
    monkeypatch.setenv("REVIEWER_DEMO_CODE", "4826")

    response = _verify("reviewer-security-test@example.invalid", "4826")

    assert response.status_code == 400
    assert "token" not in response.json()
    assert _session_count() == 0


def test_wrong_code_is_denied_without_token():
    email = "wrong-code@example.invalid"
    reg_dal.save_code(email, "7314")

    response = _verify(email, "7315")

    assert response.status_code == 400
    assert "token" not in response.json()
    assert _session_count() == 0


def test_email_otp_is_one_time_and_replay_is_denied():
    email = "one-time@example.invalid"
    reg_dal.save_code(email, "6418")

    first = _verify(email, "6418")
    replay = _verify(email, "6418")

    assert first.status_code == 200
    assert bool(first.json().get("token"))
    assert replay.status_code == 400
    assert "token" not in replay.json()
    assert _session_count() == 1


def test_expired_code_is_denied_without_token():
    email = "expired-code@example.invalid"
    reg_dal.save_code(email, "9351")
    with get_conn() as c:
        c.execute(
            "UPDATE verification_codes SET expires_at='2000-01-01T00:00:00' WHERE phone=?",
            (email,),
        )

    response = _verify(email, "9351")

    assert response.status_code == 400
    assert "token" not in response.json()
    assert _session_count() == 0


def test_mock_email_delivery_fails_closed_and_removes_code(monkeypatch):
    monkeypatch.setattr(
        registration.otp_service,
        "send_otp",
        lambda *_args, **_kwargs: {"sent": True, "mock": True, "code": "not-returned"},
    )

    response = client.post(
        "/api/v1/register/email/send",
        json={"email": "mock-disabled@example.invalid", "consent": True},
    )

    assert response.status_code == 503
    assert "code" not in response.json()
    assert reg_dal.check_code("mock-disabled@example.invalid", "not-returned") is False
    assert _session_count() == 0


def test_real_email_otp_still_issues_exactly_one_session(monkeypatch):
    generated = []

    def delivered(identifier, code, channel):
        generated.append((identifier, code, channel))
        return {"sent": True, "mock": False, "channel": "email"}

    monkeypatch.setattr(registration.otp_service, "send_otp", delivered)
    email = "normal-email@example.invalid"
    sent = client.post(
        "/api/v1/register/email/send",
        json={"email": email, "consent": True},
    )
    assert sent.status_code == 200
    assert sent.json()["code"] is None
    assert len(generated) == 1

    verified = _verify(email, generated[0][1])
    replay = _verify(email, generated[0][1])
    assert verified.status_code == 200
    assert replay.status_code == 400
    assert _session_count() == 1


@pytest.mark.parametrize(
    ("environment", "beta_value", "expected_env", "env_valid", "beta_enabled"),
    [
        (None, None, "production", True, False),
        ("production", "true", "production", True, False),
        ("prodution", "true", "production", False, False),
        ("development", "true", "development", True, True),
        ("preview", "false", "preview", True, False),
    ],
)
def test_auth_runtime_mode_is_fail_closed(
    environment, beta_value, expected_env, env_valid, beta_enabled
):
    assert config.resolve_auth_runtime(environment, beta_value) == (
        expected_env,
        env_valid,
        beta_enabled,
    )


def test_production_config_rejects_beta_and_legacy_reviewer_variables(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("BETA_MODE", "true")
    monkeypatch.setenv("REVIEWER_DEMO_EMAIL", "legacy-reviewer@example.invalid")
    monkeypatch.setenv("REVIEWER_DEMO_CODE", "legacy-value")

    issues = env_check.collect_issues()

    assert any("BETA_MODE" in issue for issue in issues)
    assert any("REVIEWER_DEMO" in issue for issue in issues)


def test_invalid_environment_is_reported_by_production_guard(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "prodution")
    monkeypatch.setenv("BETA_MODE", "true")
    monkeypatch.delenv("REVIEWER_DEMO_EMAIL", raising=False)
    monkeypatch.delenv("REVIEWER_DEMO_CODE", raising=False)

    issues = env_check.collect_issues()

    assert any("unsupported runtime name" in issue for issue in issues)
    assert config.resolve_auth_runtime("prodution", "true") == ("production", False, False)
    with pytest.raises(RuntimeError, match="Refusing to start in production"):
        env_check.enforce_production_env()
