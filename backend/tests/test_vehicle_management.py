from uuid import uuid4

import pytest
from fastapi import HTTPException

from api import vehicles as vehicles_api
from database import vehicles_dal


def _payload(plate: str) -> dict:
    return {
        "vehicle_registration_country_code": "KZ",
        "vehicle_type": "tractor_semitrailer",
        "body_type": "curtain_sider",
        "make": "Volvo",
        "model": "FH",
        "license_plate": plate,
        "payload_tons": 30,
        "cargo_volume_m3": 150,
        "cargo_length_m": None,
        "cargo_width_m": None,
        "cargo_height_m": None,
    }


def test_upsert_vehicle_is_idempotent_for_plate_formatting():
    vehicles_dal.init_vehicles_schema()
    owner_id = f"vehicle-owner-{uuid4().hex}"
    first = vehicles_dal.upsert_vehicle(owner_id, _payload("288 QBB 02"))
    second = vehicles_dal.upsert_vehicle(
        owner_id,
        {**_payload("288-QBB-02"), "cargo_volume_m3": 148},
    )

    assert second["id"] == first["id"]
    assert second["cargo_volume_m3"] == 148
    assert len(vehicles_dal.list_vehicles(owner_id)) == 1


def test_delete_vehicle_returns_not_found_for_another_owner(monkeypatch):
    monkeypatch.setattr(vehicles_api.vehicles_dal, "get_vehicle", lambda *_: None)

    with pytest.raises(HTTPException) as exc:
        vehicles_api.delete_vehicle("vehicle-1", "another-owner")

    assert exc.value.status_code == 404


def test_delete_vehicle_blocks_active_references(monkeypatch):
    monkeypatch.setattr(
        vehicles_api.vehicles_dal,
        "get_vehicle",
        lambda *_: {"id": "vehicle-1"},
    )
    monkeypatch.setattr(
        vehicles_api.vehicles_dal,
        "has_active_references",
        lambda *_: True,
    )

    with pytest.raises(HTTPException) as exc:
        vehicles_api.delete_vehicle("vehicle-1", "owner-1")

    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "VEHICLE_IN_USE"


def test_delete_vehicle_removes_owned_unused_vehicle(monkeypatch):
    monkeypatch.setattr(
        vehicles_api.vehicles_dal,
        "get_vehicle",
        lambda *_: {"id": "vehicle-1"},
    )
    monkeypatch.setattr(
        vehicles_api.vehicles_dal,
        "has_active_references",
        lambda *_: False,
    )
    monkeypatch.setattr(
        vehicles_api.vehicles_dal,
        "delete_vehicle",
        lambda *_: True,
    )

    result = vehicles_api.delete_vehicle("vehicle-1", "owner-1")

    assert result == {"ok": True, "deleted_vehicle_id": "vehicle-1"}
