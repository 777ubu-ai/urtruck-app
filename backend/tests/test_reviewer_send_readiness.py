"""Исполняемый контракт send: нельзя обещать вход, отвергнутый verify."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import registration as reg


def test_reviewer_send_fails_closed_when_production_bypass_is_disabled(monkeypatch):
    monkeypatch.setattr(reg, "IS_PRODUCTION", True)
    monkeypatch.setattr(reg, "REVIEWER_DEMO_CODE_IS_DEFAULT", True)
    monkeypatch.setattr(reg, "REVIEWER_DEMO_EMAIL", "review-fixture@example.com")
    monkeypatch.setattr(reg.otp_service, "send_otp", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("no delivery expected")))
    app = FastAPI()
    app.include_router(reg.reg_router, prefix="/register")
    response = TestClient(app).post("/register/email/send", json={"email": "review-fixture@example.com", "consent": True})
    assert response.json()["sent"] is False
    assert response.json()["error"] == "reviewer_login_unavailable"
    assert response.json()["code"] is None


def test_configured_reviewer_login_keeps_existing_send_contract(monkeypatch):
    monkeypatch.setattr(reg, "IS_PRODUCTION", True)
    monkeypatch.setattr(reg, "REVIEWER_DEMO_CODE_IS_DEFAULT", False)
    monkeypatch.setattr(reg, "REVIEWER_DEMO_EMAIL", "review-fixture@example.com")
    app = FastAPI()
    app.include_router(reg.reg_router, prefix="/register")
    response = TestClient(app).post("/register/email/send", json={"email": "review-fixture@example.com", "consent": True})
    assert response.json()["sent"] is True
    assert response.json()["code"] is None
