"""Profile API — обновление и получение профиля."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from database import registration_dal as reg_dal
from api.verification_gate import require_level

profile_router = APIRouter()


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    about: Optional[str] = None


@profile_router.get("/me")
def get_profile(user=Depends(require_level(1))):
    """Полный профиль текущего юзера."""
    d = reg_dal.get_driver(user["id"])
    if not d:
        return user
    return {
        "id": d["id"],
        "phone": d.get("phone"),
        "name": d.get("full_name") or "",
        "city": d.get("city") or "",
        "about": d.get("about") or "",
        "role": d.get("role", "guest"),
        "verification_level": d.get("verification_level", 0),
        "vehicle_type": d.get("vehicle_type"),
        "vehicle_brand": d.get("vehicle_brand"),
        "vehicle_plate": d.get("vehicle_plate"),
        "security_score": d.get("security_score"),
        "security_color": d.get("security_color"),
        "status": d.get("status"),
        "created_at": d.get("created_at"),
    }


@profile_router.patch("/me")
def update_profile(body: UpdateProfileIn, user=Depends(require_level(1))):
    """Обновить имя/город/описание."""
    updates = {}
    if body.name is not None:
        updates["full_name"] = body.name.strip()
    if body.city is not None:
        updates["city"] = body.city.strip()
    if body.about is not None:
        updates["about"] = body.about.strip()

    if not updates:
        return {"ok": True, "detail": "Нечего обновлять"}

    # Добавляем колонки если нет
    from database.db import get_conn
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}
        for col in ["city", "about"]:
            if col not in cols:
                c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {col} TEXT")
        c.commit()

    reg_dal.update_driver(user["id"], updates)
    return {"ok": True}
