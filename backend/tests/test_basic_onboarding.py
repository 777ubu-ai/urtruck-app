import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from uuid import uuid4

from api import driver_registration, registration, verification_gate
from api.marketplace import TripIn, create_trip
from database import registration_dal


def _basic_driver(**overrides):
    driver = {
        "id": "basic-driver",
        "role": "driver",
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
    driver.update(overrides)
    return driver


def test_complete_basic_sets_basic_status_without_promoting_to_pro(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _basic_driver())
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))

    result = driver_registration.complete_basic_onboarding("basic-driver")

    assert result["status"] == "basic"
    assert result["basic_onboarding_completed"] is True
    assert updates["role"] == "driver"
    assert updates["status"] == "basic"
    assert updates["basic_onboarding_completed"] == 1
    assert "verification_level" not in updates
    assert result["verification_level"] == 1


def test_complete_basic_rejects_incomplete_profile(monkeypatch):
    monkeypatch.setattr(
        driver_registration.reg_dal,
        "get_driver",
        lambda _: _basic_driver(iin="123", vehicle_brand=""),
    )

    with pytest.raises(HTTPException) as exc:
        driver_registration.complete_basic_onboarding("basic-driver")

    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "BASIC_ONBOARDING_INCOMPLETE"
    assert set(exc.value.detail["fields"]) == {"iin", "vehicle_brand"}


def test_basic_driver_is_allowed_to_publish_but_incomplete_driver_is_not():
    complete = _basic_driver(basic_onboarding_completed=1, status="basic")
    incomplete = _basic_driver()
    assert driver_registration.can_publish_driver_trip(complete)
    assert not driver_registration.can_publish_driver_trip(incomplete)

    from api import verification_gate as gate_module
    original = gate_module._extract_driver
    try:
        gate_module._extract_driver = lambda _: complete
        assert verification_gate.require_driver_trip_publication("Bearer test") is complete
        gate_module._extract_driver = lambda _: incomplete
        with pytest.raises(HTTPException) as exc:
            verification_gate.require_driver_trip_publication("Bearer test")
        assert exc.value.status_code == 403
        assert exc.value.detail["error"] == "basic_onboarding_required"
    finally:
        gate_module._extract_driver = original


def test_complete_basic_driver_can_create_trip():
    driver = _basic_driver(basic_onboarding_completed=1, status="basic")
    result = create_trip(
        TripIn(from_city="Алматы", to_city="Урумчи", departure="2099-01-01"),
        user=driver,
    )
    assert result["ok"] is True


def test_basic_endpoint_never_promotes_approved_or_level_three(monkeypatch):
    updates = {}
    approved = _basic_driver(status="approved", verification_level=3)
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: approved)
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))

    result = driver_registration.complete_basic_onboarding("basic-driver")

    assert result["status"] == "approved"
    assert result["verification_level"] == 3
    assert updates == {}


def test_register_me_exposes_basic_completion(monkeypatch):
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _basic_driver(basic_onboarding_completed=1))

    result = registration.get_me("basic-driver")

    assert result["basic_onboarding_completed"] is True


def _http_driver(**overrides):
    from database.db import get_conn

    driver_id = "http-basic-driver-" + uuid4().hex[:8]
    driver = _basic_driver(id=driver_id, phone=driver_id, **overrides)
    fields = {
        "id": driver["id"], "phone": driver["phone"], "role": driver["role"],
        "status": driver["status"], "verification_level": driver["verification_level"],
        "citizenship_country": driver["citizenship_country"], "full_name": driver["full_name"],
        "birth_date": driver["birth_date"], "iin": driver["iin"],
        "vehicle_registration_country": driver["vehicle_registration_country"],
        "truck_kind": driver["truck_kind"], "body_type": driver["body_type"],
        "vehicle_brand": driver["vehicle_brand"], "vehicle_plate": driver["vehicle_plate"],
        "capacity_tons": driver["capacity_tons"], "volume_m3": driver["volume_m3"],
        "basic_onboarding_completed": driver.get("basic_onboarding_completed", 0),
    }
    columns = ", ".join(fields)
    placeholders = ", ".join("?" for _ in fields)
    with get_conn() as conn:
        conn.execute(f"INSERT INTO drivers_registration ({columns}) VALUES ({placeholders})", tuple(fields.values()))
    token = registration_dal.create_session(driver_id)
    return driver_id, token


def test_http_complete_basic_and_trip_publication_contract():
    from main import app

    client = TestClient(app)
    _, incomplete_token = _http_driver(iin="123")
    incomplete = client.post(
        "/api/v1/driver/registration/complete-basic",
        headers={"Authorization": f"Bearer {incomplete_token}"},
    )
    assert incomplete.status_code == 400
    assert incomplete.json()["detail"]["error"] == "BASIC_ONBOARDING_INCOMPLETE"

    _, blocked_token = _http_driver(basic_onboarding_completed=0)
    blocked = client.post(
        "/api/v1/market/trips",
        headers={"Authorization": f"Bearer {blocked_token}"},
        json={"from_city": "Алматы", "to_city": "Урумчи", "departure": "2099-01-01"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["error"] == "basic_onboarding_required"

    _, ready_token = _http_driver(basic_onboarding_completed=0)
    completed = client.post(
        "/api/v1/driver/registration/complete-basic",
        headers={"Authorization": f"Bearer {ready_token}"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "basic"
    assert completed.json()["verification_level"] != 3
    ready = client.post(
        "/api/v1/market/trips",
        headers={"Authorization": f"Bearer {ready_token}"},
        json={"from_city": "Алматы", "to_city": "Урумчи", "departure": "2099-01-01"},
    )
    assert ready.status_code == 200, ready.text


def test_http_basic_completion_never_promotes_status_or_level():
    from main import app

    client = TestClient(app)
    driver_id, token = _http_driver(status="pending", verification_level=1)
    response = client.post(
        "/api/v1/driver/registration/complete-basic",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    stored = registration_dal.get_driver(driver_id)
    assert stored["status"] == "basic"
    assert stored["verification_level"] == 1
