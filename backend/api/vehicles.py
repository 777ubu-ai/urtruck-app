"""API карточек машин водителя."""
import math
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.registration import get_current_driver
from database import vehicles_dal

router = APIRouter()


class VehicleBody(BaseModel):
    vehicle_registration_country_code: str = Field(min_length=2, max_length=3)
    vehicle_type: str = Field(min_length=1, max_length=80)
    body_type: str = Field(min_length=1, max_length=80)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=120)
    license_plate: str = Field(min_length=1, max_length=32)
    payload_tons: float = Field(gt=0)
    cargo_volume_m3: float = Field(gt=0)
    cargo_length_m: Optional[float] = Field(default=None, gt=0)
    cargo_width_m: Optional[float] = Field(default=None, gt=0)
    cargo_height_m: Optional[float] = Field(default=None, gt=0)

    @field_validator("vehicle_registration_country_code")
    @classmethod
    def normalize_country(cls, value):
        return value.strip().upper()

    @field_validator("license_plate")
    @classmethod
    def normalize_plate(cls, value):
        value = re.sub(r"\s+", " ", value.strip().upper())
        if not value:
            raise ValueError("license_plate is required")
        return value

    @field_validator("payload_tons", "cargo_volume_m3", "cargo_length_m", "cargo_width_m", "cargo_height_m")
    @classmethod
    def finite_number(cls, value):
        if value is not None and not math.isfinite(value):
            raise ValueError("number must be finite")
        return value


@router.get("")
def get_vehicles(driver_id: str = Depends(get_current_driver)):
    return {"ok": True, "vehicles": vehicles_dal.list_vehicles(driver_id)}


@router.put("")
def save_vehicle(body: VehicleBody, vehicle_id: Optional[str] = None, driver_id: str = Depends(get_current_driver)):
    try:
        vehicle = vehicles_dal.upsert_vehicle(driver_id, body.model_dump(), vehicle_id)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Такая машина уже сохранена")
        raise
    return {"ok": True, "vehicle": vehicle}


@router.get("/{vehicle_id}")
def get_vehicle(vehicle_id: str, driver_id: str = Depends(get_current_driver)):
    vehicle = vehicles_dal.get_vehicle(driver_id, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Машина не найдена")
    return {"ok": True, "vehicle": vehicle}
