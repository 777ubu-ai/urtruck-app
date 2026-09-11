import pytest
from fastapi import HTTPException

from api import driver_registration, registration, verification_gate


def _driver(**overrides):
    value = {
        "id": "basic-driver",
        "role": "guest",
        "status": "pending",
        "verification_level": 1,
        "citizenship_country": "KZ",
        "full_name": "Basic Driver",
        "birth_date": "01.01.1985",
        "iin": "850101123456",
        "vehicle_registration_country": "KZ",
        "truck_kind": "tractor_semitrailer",
        "body_type": "curtain_sider",
        "vehicle_brand": "Volvo",
        "vehicle_plate": "123ABC02",
        "capacity_tons": 20,
        "volume_m3": 86,
    }
    value.update(overrides)
    return value


def test_complete_basic_sets_basic_without_promoting_to_pro(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _driver())
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))
    result = driver_registration.complete_basic_onboarding("basic-driver")
    assert result["status"] == "basic"
    assert result["basic_onboarding_completed"] is True
    assert updates["role"] == "driver"
    assert updates["basic_onboarding_completed"] == 1
    assert "verification_level" not in updates


def test_complete_basic_rejects_incomplete_profile(monkeypatch):
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _driver(iin="123"))
    with pytest.raises(HTTPException) as exc:
        driver_registration.complete_basic_onboarding("basic-driver")
    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "BASIC_ONBOARDING_INCOMPLETE"
    assert "iin" in exc.value.detail["fields"]


def test_publish_gate_accepts_basic_and_rejects_incomplete():
    assert driver_registration.can_publish_driver_trip(_driver(basic_onboarding_completed=1, status="basic"))
    assert not driver_registration.can_publish_driver_trip(_driver())
    assert verification_gate.require_driver_trip_publication


def test_register_me_exposes_completion(monkeypatch):
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _driver(basic_onboarding_completed=1))
    assert registration.get_me("basic-driver")["basic_onboarding_completed"] is True


def test_http_incomplete_driver_is_blocked_and_basic_driver_can_publish(monkeypatch):
    from uuid import uuid4

    # The production app intentionally fails closed by default. This HTTP
    # test runs the real app in the isolated test environment.
    monkeypatch.setenv("URTRUCK_ENV", "test")

    from fastapi.testclient import TestClient
    from database.db import get_conn
    from database import registration_dal
    from main import app

    with TestClient(app) as client:
        def seed(**overrides):
            value = _driver(id=f"http-{uuid4().hex}", phone=f"+7700{uuid4().int % 10**7:07d}")
            value.update(overrides)
            fields = {
                key: value.get(key) for key in (
                    "id", "phone", "role", "status", "verification_level",
                    "citizenship_country", "full_name", "birth_date", "iin",
                    "vehicle_registration_country", "truck_kind", "body_type",
                    "vehicle_brand", "vehicle_plate", "capacity_tons", "volume_m3",
                    "basic_onboarding_completed",
                )
            }
            with get_conn() as conn:
                conn.execute(
                    f"INSERT INTO drivers_registration ({', '.join(fields)}) "
                    f"VALUES ({', '.join('?' for _ in fields)})",
                    tuple(fields.values()),
                )
            return value["id"], registration_dal.create_session(value["id"])

        _, blocked_token = seed(iin="123")
        blocked = client.post(
            "/api/v1/market/trips",
            headers={"Authorization": f"Bearer {blocked_token}"},
            json={"from_city": "Алматы", "to_city": "Урумчи", "departure": "2099-01-01"},
        )
        assert blocked.status_code == 403
        assert blocked.json()["detail"]["error"] == "basic_onboarding_required"

        driver_id, ready_token = seed()
        completed = client.post(
            "/api/v1/driver/registration/complete-basic",
            headers={"Authorization": f"Bearer {ready_token}"},
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == "basic"
        stored = registration_dal.get_driver(driver_id)
        assert stored["status"] == "basic"
        assert int(stored.get("verification_level") or 0) != 3
        published = client.post(
            "/api/v1/market/trips",
            headers={"Authorization": f"Bearer {ready_token}"},
            json={"from_city": "Алматы", "to_city": "Урумчи", "departure": "2099-01-01"},
        )
        assert published.status_code == 200, published.text
