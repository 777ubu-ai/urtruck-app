"""API карточек машин водителя."""
import math
import re
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.verification_gate import require_active_level, require_role
from database import vehicles_dal
from database.vehicles_dal import VehicleNotOwned

router = APIRouter()

# Vehicle Security & Trip Integrity Repair, Round 2 (2026-09-11), item 5.
# Independent review found a pure shipper/client account could create a
# Vehicle -- api.registration.get_current_driver only checked "is this a
# valid token", never role. Switched every endpoint here from that bare
# dependency to require_active_level(1) (the SAME dependency
# create_cargo/create_trip/create_bid already use -- also closes the
# separate "rejected driver keeps write access" gap for this router, which
# get_current_driver never checked either) plus the SAME require_role()
# used there, instead of inventing a second role mechanism for this
# router. Every endpoint below now takes user: dict (not a bare driver_id
# string) and reads user["id"] where the old driver_id was used.
_VEHICLE_ACTION = "управлять своими машинами"

# Track: Vehicle Security & Trip Integrity Repair (2026-09-11). Единая
# ошибка для "машина не найдена" ИЛИ "чужая машина" -- внешний вызывающий
# не должен уметь отличить одно от другого (existence oracle, закрыт по
# итогам overnight forensic audit). Factory (not a shared instance) so each
# raise gets its own exception object.
def _vehicle_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"error": "VEHICLE_NOT_FOUND", "message": "Машина не найдена"})


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
def get_vehicles(user: dict = Depends(require_active_level(1))):
    require_role(user, ("driver",), _VEHICLE_ACTION)
    return {"ok": True, "vehicles": vehicles_dal.list_vehicles(user["id"])}


@router.put("")
def save_vehicle(body: VehicleBody, vehicle_id: Optional[str] = None, user: dict = Depends(require_active_level(1))):
    """Create (no vehicle_id) or update (vehicle_id) a Vehicle owned by the
    caller. Track: Vehicle Security & Trip Integrity Repair (2026-09-11):

    - Round 2 item 5: caller must actually be a driver, not just
      authenticated -- see require_role() above.
    - vehicle_id supplied for a machine that doesn't exist OR belongs to
      another driver -> 404 VEHICLE_NOT_FOUND, same response either way
      (existence oracle closed -- see vehicles_dal.VehicleNotOwned).
    - No vehicle_id, license_plate already used by this SAME owner for a
      byte-identical payload -> idempotent replay, 200 with the existing
      row (see vehicles_dal.upsert_vehicle). A genuinely different payload
      on the same plate is still a real 409 conflict.
    """
    require_role(user, ("driver",), _VEHICLE_ACTION)
    try:
        vehicle = vehicles_dal.upsert_vehicle(user["id"], body.model_dump(), vehicle_id)
    except VehicleNotOwned:
        raise _vehicle_not_found()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail={
            "error": "LICENSE_PLATE_TAKEN",
            "message": "Машина с этим госномером уже сохранена с другими данными",
        })
    return {"ok": True, "vehicle": vehicle}


@router.get("/{vehicle_id}")
def get_vehicle(vehicle_id: str, user: dict = Depends(require_active_level(1))):
    require_role(user, ("driver",), _VEHICLE_ACTION)
    vehicle = vehicles_dal.get_vehicle(user["id"], vehicle_id)
    if not vehicle:
        raise _vehicle_not_found()
    return {"ok": True, "vehicle": vehicle}
