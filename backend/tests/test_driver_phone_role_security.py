"""P1-2: driver role and operations require a server-verified phone."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_driver_phone_role.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.marketplace import mp_router
from api.registration import reg_router
from database import db as ddb
from database import registration_dal as reg_dal
from database.db import get_conn

ddb.init_db()
reg_dal.init_registration_schema()

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_state():
    with get_conn() as c:
        c.execute("DELETE FROM reg_sessions")
        c.execute("DELETE FROM verification_codes")
        c.execute("DELETE FROM drivers_registration")
        c.execute("DELETE FROM trips")
    yield


def _email_session(email="driver-email@example.invalid"):
    user = reg_dal.get_or_create_email_user(email)
    token = reg_dal.create_session(user["id"])
    return user, {"Authorization": f"Bearer {token}"}


def test_email_identity_cannot_activate_driver_but_client_role_is_preserved():
    user, headers = _email_session()

    denied = client.post("/api/v1/register/role", headers=headers, json={"role": "driver"})
    assert denied.status_code == 409
    assert denied.json()["detail"]["error"] == "phone_verification_required"
    assert reg_dal.get_driver(user["id"])["role"] == "guest"

    allowed = client.post("/api/v1/register/role", headers=headers, json={"role": "client"})
    assert allowed.status_code == 200
    assert allowed.json() == {"ok": True, "role": "client", "phone_verified": False}
    assert reg_dal.get_driver(user["id"])["role"] == "client"


def test_role_target_is_always_authenticated_self_and_invalid_role_is_closed():
    actor, headers = _email_session("actor@example.invalid")
    victim = reg_dal.get_or_create_email_user("victim@example.invalid")

    response = client.post(
        "/api/v1/register/role",
        headers=headers,
        json={"role": "client", "user_id": victim["id"]},
    )
    invalid = client.post("/api/v1/register/role", headers=headers, json={"role": "admin"})

    assert response.status_code == 200
    assert reg_dal.get_driver(actor["id"])["role"] == "client"
    assert reg_dal.get_driver(victim["id"])["role"] == "guest"
    assert invalid.status_code == 422


def test_bound_phone_unlocks_driver_role_and_trip_creation_once():
    user, headers = _email_session()
    phone = "+77010000001"
    reg_dal.save_code(phone, "4826")

    wrong = client.post(
        "/api/v1/register/phone/bind/verify", headers=headers,
        json={"phone": phone, "code": "4825"},
    )
    assert wrong.status_code == 400
    assert reg_dal.has_verified_phone(reg_dal.get_driver(user["id"])) is False

    bound = client.post(
        "/api/v1/register/phone/bind/verify", headers=headers,
        json={"phone": phone, "code": "4826"},
    )
    replay = client.post(
        "/api/v1/register/phone/bind/verify", headers=headers,
        json={"phone": phone, "code": "4826"},
    )
    selected = client.post("/api/v1/register/role", headers=headers, json={"role": "driver"})
    trip = client.post(
        "/api/v1/market/trips", headers=headers,
        json={"from_city": "Алматы", "to_city": "Астана", "departure": "2099-01-01"},
    )

    assert bound.status_code == 200
    assert bound.json()["phone_verified"] is True
    assert replay.status_code == 400
    assert selected.status_code == 200
    assert selected.json()["role"] == "driver"
    assert trip.status_code == 200


def test_legacy_or_forged_driver_role_is_blocked_from_driver_operations():
    user, headers = _email_session()
    reg_dal.update_driver(user["id"], {"role": "driver", "verification_level": 3})

    response = client.post(
        "/api/v1/market/trips", headers=headers,
        json={"from_city": "Алматы", "to_city": "Астана", "departure": "2099-01-01"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "phone_verification_required"
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM trips").fetchone()["n"] == 0


def test_client_cannot_publish_driver_trip_even_with_verified_phone():
    user = reg_dal.get_or_create_driver("+77010000002")
    token = reg_dal.create_session(user["id"])
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/v1/register/role", headers=headers, json={"role": "client"}).status_code == 200

    response = client.post(
        "/api/v1/market/trips", headers=headers,
        json={"from_city": "Алматы", "to_city": "Астана", "departure": "2099-01-01"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "operational_driver_required"


def test_phone_collision_cannot_move_phone_between_accounts():
    owner = reg_dal.get_or_create_driver("+77010000003")
    actor, headers = _email_session()
    reg_dal.save_code(owner["phone"], "7731")

    response = client.post(
        "/api/v1/register/phone/bind/verify", headers=headers,
        json={"phone": owner["phone"], "code": "7731"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "phone_already_in_use"
    assert reg_dal.has_verified_phone(reg_dal.get_driver(actor["id"])) is False
    assert reg_dal.get_driver(owner["id"])["phone"] == "+77010000003"


def test_legitimate_phone_otp_user_can_select_driver_role():
    user = reg_dal.get_or_create_driver("+77010000004")
    headers = {"Authorization": f"Bearer {reg_dal.create_session(user['id'])}"}

    response = client.post("/api/v1/register/role", headers=headers, json={"role": "driver"})

    assert response.status_code == 200
    assert response.json()["phone_verified"] is True

