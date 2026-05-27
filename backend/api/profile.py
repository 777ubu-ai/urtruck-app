"""Profile API — обновление и получение профиля."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional, List

from database import registration_dal as reg_dal
from api.verification_gate import require_level

profile_router = APIRouter()

# PR-D1: PRO-поля водителя (Fast-Track + PRO согласно
# driver_onboarding.md §2). Хранятся в той же таблице
# drivers_registration через ALTER TABLE add-if-missing —
# отдельная таблица оверкилл для 7 колонок.
#
# favorite_borders — массив, сериализуем в JSON-строку
# (SQLite не имеет нативного array type).
# *_url — public URL'ы из Supabase Storage, не сами файлы.

class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    about: Optional[str] = None
    # PRO fields
    legal_form: Optional[str] = Field(None, description="individual | ip | too")
    china_experience_years: Optional[int] = None
    favorite_borders: Optional[List[str]] = None
    emergency_contact: Optional[str] = None
    passport_intl_url: Optional[str] = None
    tir_book_url: Optional[str] = None
    cmr_insurance_url: Optional[str] = None


# Колонки, добавляемые на лету в drivers_registration
PRO_COLUMNS = [
    "city", "about",
    "legal_form", "china_experience_years",
    "favorite_borders", "emergency_contact",
    "passport_intl_url", "tir_book_url", "cmr_insurance_url",
]


def _ensure_columns():
    """ALTER TABLE add-if-missing — идемпотентно. SQLite не умеет
    IF NOT EXISTS для колонок, поэтому проверяем через PRAGMA."""
    from database.db import get_conn
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}
        for col in PRO_COLUMNS:
            if col not in cols:
                # china_experience_years — целое, остальное TEXT
                col_type = "INTEGER" if col == "china_experience_years" else "TEXT"
                c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {col} {col_type}")
        c.commit()


def _parse_borders(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []


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
        # PR-D1: PRO-поля
        "legal_form": d.get("legal_form"),
        "china_experience_years": d.get("china_experience_years"),
        "favorite_borders": _parse_borders(d.get("favorite_borders")),
        "emergency_contact": d.get("emergency_contact"),
        "passport_intl_url": d.get("passport_intl_url"),
        "tir_book_url": d.get("tir_book_url"),
        "cmr_insurance_url": d.get("cmr_insurance_url"),
    }


@profile_router.patch("/me")
def update_profile(body: UpdateProfileIn, user=Depends(require_level(1))):
    """Обновить имя/город/описание + PRO-поля."""
    updates = {}
    if body.name is not None:
        updates["full_name"] = body.name.strip()
    if body.city is not None:
        updates["city"] = body.city.strip()
    if body.about is not None:
        updates["about"] = body.about.strip()
    if body.legal_form is not None:
        # whitelist чтобы не ловить мусор от клиента
        lf = body.legal_form.strip()
        if lf in {"individual", "ip", "too"}:
            updates["legal_form"] = lf
    if body.china_experience_years is not None:
        # clamp 0..50 — больше 50 лет водительского стажа в Китае не бывает
        updates["china_experience_years"] = max(0, min(50, int(body.china_experience_years)))
    if body.favorite_borders is not None:
        # массив → JSON-строка; trim каждое имя
        clean = [str(x).strip() for x in body.favorite_borders if str(x).strip()]
        updates["favorite_borders"] = json.dumps(clean, ensure_ascii=False)
    if body.emergency_contact is not None:
        updates["emergency_contact"] = body.emergency_contact.strip()
    if body.passport_intl_url is not None:
        updates["passport_intl_url"] = body.passport_intl_url.strip()
    if body.tir_book_url is not None:
        updates["tir_book_url"] = body.tir_book_url.strip()
    if body.cmr_insurance_url is not None:
        updates["cmr_insurance_url"] = body.cmr_insurance_url.strip()

    if not updates:
        return {"ok": True, "detail": "Нечего обновлять"}

    _ensure_columns()
    reg_dal.update_driver(user["id"], updates)
    return {"ok": True}

