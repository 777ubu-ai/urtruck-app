"""Regression tests for Google/Apple -> Supabase -> UrTruck token exchange."""
import os
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_social_auth.db")
Path(TEST_DB).unlink(missing_ok=True)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import db as ddb
from database import registration_dal as reg_dal
from database import consent_dal
from api import social_auth


ddb.init_db()
reg_dal.init_registration_schema()
consent_dal.init_consent_schema()

app = FastAPI()
app.include_router(social_auth.social_auth_router, prefix="/api/v1/register/social")
client = TestClient(app)


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def social_user(provider="google", email="owner@example.com", name="Owner"):
    return {
        "id": "supabase-user-1",
        "aud": "authenticated",
        "email": email,
        "app_metadata": {
            "provider": provider,
            "providers": [provider],
        },
        "user_metadata": {"full_name": name},
    }


def post(payload=None):
    body = {
        "access_token": "valid-social-access-token",
        "consent": True,
    }
    if payload:
        body.update(payload)
    return client.post("/api/v1/register/social/verify", json=body)


def test_consent_is_required(monkeypatch):
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(200, social_user()),
    )
    r = post({"consent": False})
    assert r.status_code == 400, r.text


def test_invalid_supabase_token_is_rejected(monkeypatch):
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(401, {}),
    )
    r = post()
    assert r.status_code == 401, r.text


def test_non_google_apple_provider_is_rejected(monkeypatch):
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(200, social_user(provider="email")),
    )
    r = post()
    assert r.status_code == 401, r.text


def test_google_identity_creates_normal_urtruck_session(monkeypatch):
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(
            200,
            social_user(provider="google", email="google.user@example.com", name="Google User"),
        ),
    )
    r = post()
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["provider"] == "google"
    assert data["email"] == "google.user@example.com"
    assert data["token"]
    assert reg_dal.get_driver_by_token(data["token"]) == data["user_id"]
    driver = reg_dal.get_driver(data["user_id"])
    assert driver["full_name"] == "Google User"


def test_apple_private_relay_identity_is_supported(monkeypatch):
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(
            200,
            social_user(
                provider="apple",
                email="private_relay@privaterelay.appleid.com",
                name="Apple User",
            ),
        ),
    )
    r = post()
    assert r.status_code == 200, r.text
    assert r.json()["provider"] == "apple"


def test_guest_session_is_upgraded_not_duplicated(monkeypatch):
    guest = reg_dal.create_guest()
    guest_token = reg_dal.create_session(guest["id"])
    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(
            200,
            social_user(provider="google", email="guest.upgrade@example.com"),
        ),
    )
    r = post({"guest_token": guest_token})
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == guest["id"]
