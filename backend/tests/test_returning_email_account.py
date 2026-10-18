"""Повторный вход и конфликт первичного телефона: только изолированная БД."""
import sqlite3
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import profile, registration, rate_limit
from database import registration_dal as dal


app = FastAPI()
app.include_router(registration.reg_router, prefix="/api/v1/register")
app.include_router(profile.profile_router, prefix="/api/v1/users")
client = TestClient(app)


@pytest.fixture(autouse=True)
def real_email_proof(monkeypatch):
    monkeypatch.setattr(registration, "BETA_MODE", False)
    monkeypatch.setattr(registration, "REVIEWER_DEMO_EMAIL", "")
    rate_limit._store.clear()
    profile._ensure_columns()


def login(email):
    dal.save_code(email.strip().lower(), "8342")
    response = client.post("/api/v1/register/email/verify", json={"email": email, "code": "8342"})
    assert response.status_code == 200
    return response.json()


def new_email():
    return f"returning-{uuid4().hex}@example.com"


def test_same_email_restores_original_driver_and_profile():
    email = new_email()
    driver = dal.get_or_create_driver_by_email(email)
    dal.update_driver(driver["id"], {
        "full_name": "Существующий водитель", "phone": "+77015554321",
        "role": "driver", "status": "basic", "basic_onboarding_completed": 1,
        "vehicle_plate": "QA-EXISTING",
    })
    before = dal.get_driver(driver["id"])
    for identifier in (email, f"  {email.upper()}  "):
        result = login(identifier)
        assert result["user_id"] == driver["id"]
        assert result["driver_id"] == driver["id"]
        assert result["role"] == "driver"
        assert result["status"] == "basic"
        assert result["basic_onboarding_completed"] is True
        me = client.get("/api/v1/register/me", headers={"Authorization": f"Bearer {result['token']}"})
        assert me.status_code == 200
        assert me.json()["id"] == driver["id"]
        assert me.json()["role"] == "driver"
        assert dal.get_driver(driver["id"]) == before


@pytest.mark.parametrize("stored_phone", ["+77015554322", "+7 (701) 555-43-22"])
def test_different_email_never_inherits_existing_profile_or_phone(stored_phone):
    email = new_email()
    owner = dal.get_or_create_driver_by_email(email)
    dal.update_driver(owner["id"], {"phone": stored_phone, "role": "driver", "full_name": "Владелец"})
    before = dal.get_driver(owner["id"])
    other = login(email.replace("@", "888@"))
    assert other["user_id"] != owner["id"]
    assert other["role"] == "guest"
    assert other["basic_onboarding_completed"] is False
    pending_before = dal.get_driver(other["user_id"])
    headers = {"Authorization": f"Bearer {other['token']}"}
    for _ in range(2):
        saved = client.patch("/api/v1/users/me", headers=headers, json={
            "role": "driver", "name": "Новый водитель", "phone": "+77015554322",
        })
        assert saved.status_code == 409
        assert saved.json()["detail"]["error"] == "PHONE_ALREADY_IN_USE"
        assert dal.get_driver(owner["id"]) == before
        assert dal.get_driver(other["user_id"]) == pending_before


def test_first_phone_can_be_saved_and_email_still_restores_same_account():
    email = new_email()
    result = login(email)
    response = client.patch("/api/v1/users/me", headers={"Authorization": f"Bearer {result['token']}"}, json={
        "role": "client", "name": "Новый клиент", "phone": "+77015554323",
    })
    assert response.status_code == 200
    again = login(email.upper())
    assert again["user_id"] == result["user_id"]
    assert again["role"] == "client"
    assert dal.get_driver(result["user_id"])["phone"] == "+77015554323"


def test_racing_phone_claim_is_409_and_rolls_back_profile(monkeypatch):
    row = dal.get_or_create_driver_by_email(new_email())
    owner = dal.get_or_create_driver_by_email(new_email())
    before = dal.get_driver(row["id"])
    original = dal.update_driver

    def claim_then_save(uid, values):
        original(owner["id"], {"phone": values["phone"]})
        original(uid, values)

    monkeypatch.setattr(dal, "update_driver", claim_then_save)
    with pytest.raises(HTTPException) as caught:
        profile.update_profile(profile.UpdateProfileIn(role="driver", name="Гонка", phone="+77015554324"), user={"id": row["id"]})
    assert caught.value.status_code == 409
    assert caught.value.detail["error"] == "PHONE_ALREADY_IN_USE"
    assert dal.get_driver(row["id"]) == before
    assert dal.get_driver(owner["id"])["phone"] == "+77015554324"


def test_other_integrity_failure_is_not_disguised_as_phone_conflict(monkeypatch):
    row = dal.get_or_create_driver_by_email(new_email())

    def unrelated_failure(*_):
        raise sqlite3.IntegrityError("UNIQUE constraint failed: drivers_registration.email")

    monkeypatch.setattr(dal, "update_driver", unrelated_failure)
    with pytest.raises(sqlite3.IntegrityError):
        profile.update_profile(profile.UpdateProfileIn(role="driver", name="Тест", phone="+77015554325"), user={"id": row["id"]})


def test_unverified_email_does_not_issue_session():
    response = client.post("/api/v1/register/email/verify", json={"email": new_email(), "code": "8342"})
    assert response.status_code == 400
    assert "token" not in response.json()
