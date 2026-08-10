"""Regression tests for the production-release security gates."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin import check_admin
from api.metrics import metrics_router
from services import file_signing
from services import env_check
from services import storage_service
from services.qa_token_guard import (
    COMPROMISED_QA_AGENT_TOKEN_SHA256,
    is_compromised_qa_agent_token,
)


def test_file_signing_never_uses_empty_or_api_secret(monkeypatch):
    monkeypatch.delenv("FILE_SIGNING_KEY", raising=False)
    monkeypatch.setenv("URTRUCK_API_SECRET", "an-api-secret-must-not-sign-files")

    assert file_signing.is_configured() is False
    assert file_signing.verify("licenses/a.jpg", 4102444800, "any-signature") is False


def test_production_env_requires_separate_file_signing_key(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.delenv("FILE_SIGNING_KEY", raising=False)

    assert any("FILE_SIGNING_KEY" in issue for issue in env_check.collect_issues())


def test_compromised_qa_token_fingerprint_is_not_a_plaintext_secret():
    assert len(COMPROMISED_QA_AGENT_TOKEN_SHA256) == 64
    assert is_compromised_qa_agent_token("") is False
    assert is_compromised_qa_agent_token("a-new-random-qa-token") is False


def test_local_storage_is_not_a_production_fallback(monkeypatch):
    monkeypatch.setattr(storage_service, "PROVIDER", "local")
    monkeypatch.setattr(storage_service, "_PROD", True)

    try:
        storage_service.save_image(b"document", "licenses", "jpg")
    except RuntimeError as exc:
        assert "disabled in production" in str(exc)
    else:
        raise AssertionError("production upload must not fall back to the VPS disk")


def test_operator_routes_do_not_expose_metrics_or_error_logs_anonymously():
    app = FastAPI()
    app.include_router(metrics_router)
    client = TestClient(app)

    assert client.get("/metrics").status_code == 401
    assert client.get("/api/v1/errors/recent").status_code == 401

    # The dependency override represents a properly authenticated operator;
    # it proves the endpoints remain usable after access control was added.
    app.dependency_overrides[check_admin] = lambda: "operator"
    assert client.get("/metrics").status_code == 200
    assert client.get("/api/v1/errors/recent").status_code == 200
