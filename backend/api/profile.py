"""Profile API — обновление и получение профиля."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List

from database import registration_dal as reg_dal
from api.verification_gate import require_level
from services import file_signing

profile_router = APIRouter()

def _normalize_phone(v):
    if v is None:
        return None
    return "".join(ch for ch in str(v) if ch.isdigit() or ch == "+").strip()

def _is_real_phone(v):
    """True only for a user-provided logistics contact number.

    Email/social registrations intentionally carry a non-empty `auth_...`
    placeholder in the legacy NOT-NULL/UNIQUE phone column until ProfileV2
    collects the actual contact. Guest rows similarly use `guest_...`.
    Those internal identifiers, email-shaped legacy values, or arbitrary long
    strings must never satisfy the product's required-phone gate just because
    they happen to contain >=10 digits.
    """
    raw = str(v or "").strip()
    if not raw:
        return False
    lower = raw.lower()
    if lower.startswith(("guest_", "auth_", "deleted_")) or "@" in raw:
        return False
    digits = "".join(ch for ch in raw if ch.isdigit())
    return 10 <= len(digits) <= 15

def _is_real_country(v):
    return bool(v and len(str(v).strip()) >= 2)

class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    about: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    legal_form: Optional[str] = Field(None, description="individual | ip | too")
    china_experience_years: Optional[int] = None
    favorite_borders: Optional[List[str]] = None
    emergency_contact: Optional[str] = None
    passport_intl_url: Optional[str] = None
    tir_book_url: Optional[str] = None
    cmr_insurance_url: Optional[str] = None
    company_name: Optional[str] = None
    bin_inn: Optional[str] = None
    country: Optional[str] = None
    messenger_type: Optional[str] = Field(None, description="wechat|whatsapp|telegram|viber")
    messenger_id: Optional[str] = None

PRO_COLUMNS = [
    "city", "about",
    "legal_form", "china_experience_years",
    "favorite_borders", "emergency_contact",
    "passport_intl_url", "tir_book_url", "cmr_insurance_url",
    "company_name", "bin_inn", "country", "messenger_type", "messenger_id",
]

def _ensure_columns():
    """ALTER TABLE add-if-missing — идемпотентно."""
    from database.db import get_conn
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}
        for col in PRO_COLUMNS:
            if col not in cols:
                col_type = "INTEGER" if col == "china_experience_years" else "TEXT"
                c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {col} {col_type}")
        c.commit()

def _parse_borders(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []

_PRO_DOC_FIELD = {
    "passport_intl": "passport_intl_url",
    "tir": "tir_book_url",
    "cmr": "cmr_insurance_url",
}
_PRO_DOC_MIME = {"image/jpeg", "image/png", "image/webp"}
_PRO_DOC_MAX = 10 * 1024 * 1024

@profile_router.post("/me/pro-documents/{kind}")
async def upload_pro_document(kind: str, file: UploadFile = File(...), user=Depends(require_level(1))):
    field = _PRO_DOC_FIELD.get((kind or "").strip().lower())
    if not field:
        raise HTTPException(status_code=400, detail={"error": "INVALID_DOCUMENT_KIND"})
    mime = (file.content_type or "").lower()
    if mime not in _PRO_DOC_MIME:
        raise HTTPException(status_code=415, detail={"error": "UNSUPPORTED_FILE_TYPE"})
    data = await file.read(_PRO_DOC_MAX + 1)
    if not data:
        raise HTTPException(status_code=400, detail={"error": "EMPTY_FILE"})
    if len(data) > _PRO_DOC_MAX:
        raise HTTPException(status_code=413, detail={"error": "FILE_TOO_LARGE"})
    from services import storage_service
    ext = "png" if mime == "image/png" else ("webp" if mime == "image/webp" else "jpg")
    ref = storage_service.save_image(data, f"pro-{kind}-{user['id']}", ext=ext)
    reg_dal.update_driver(user["id"], {field: ref})
    return {"ok": True, "field": field, "url": file_signing.sign(ref, ttl=3600)}

@profile_router.get("/me")
def get_profile(user=Depends(require_level(1))):
    """Полный профиль текущего юзера."""
    _ensure_columns()
    d = reg_dal.get_driver(user["id"])
    if not d:
        return user
    stored_phone = d.get("phone")
    return {
        "id": d["id"],
        # Internal guest_/auth_ placeholders are implementation details and
        # must never leak into ProfileV2 as if they were user contact data.
        "phone": stored_phone if _is_real_phone(stored_phone) else None,
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
        "legal_form": d.get("legal_form"),
        "china_experience_years": d.get("china_experience_years"),
        "favorite_borders": _parse_borders(d.get("favorite_borders")),
        "emergency_contact": d.get("emergency_contact"),
        "company_name": d.get("company_name"),
        "bin_inn": d.get("bin_inn"),
        "country": d.get("country"),
        "messenger_type": d.get("messenger_type"),
        "messenger_id": d.get("messenger_id"),
        "passport_intl_url": file_signing.sign(d.get("passport_intl_url")),
        "tir_book_url": file_signing.sign(d.get("tir_book_url")),
        "cmr_insurance_url": file_signing.sign(d.get("cmr_insurance_url")),
    }

@profile_router.get("/counterparty/{other_user_id}")
def get_counterparty_profile(other_user_id: str, user=Depends(require_level(1))):
    """Safe identity card for the other participant of a real deal.

    This is deliberately NOT a public arbitrary-user profile endpoint. The
    requester must share a deal with `other_user_id`; phone, documents, BIN/INN,
    messenger ids and other private data are not returned.
    """
    _ensure_columns()
    uid = user["id"]
    if not other_user_id or other_user_id == uid:
        raise HTTPException(status_code=400, detail={"error": "INVALID_COUNTERPARTY"})
    from database.db import get_conn
    with get_conn() as c:
        relation = c.execute(
            """
            SELECT id FROM deals
            WHERE (shipper_id = ? AND driver_id = ?)
               OR (shipper_id = ? AND driver_id = ?)
            ORDER BY created_at DESC LIMIT 1
            """,
            (uid, other_user_id, other_user_id, uid),
        ).fetchone()
        if not relation:
            raise HTTPException(status_code=403, detail={"error": "COUNTERPARTY_FORBIDDEN"})
        row = c.execute(
            """
            SELECT id, full_name, role, city, country, company_name,
                   vehicle_type, vehicle_brand, vehicle_plate, verification_level
            FROM drivers_registration WHERE id = ?
            """,
            (other_user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"error": "COUNTERPARTY_NOT_FOUND"})
    d = dict(row)
    return {
        "id": d.get("id"),
        "name": d.get("full_name") or "",
        "role": d.get("role") or "",
        "city": d.get("city") or "",
        "country": d.get("country") or "",
        "company_name": d.get("company_name") or "",
        "vehicle_type": d.get("vehicle_type") or "",
        "vehicle_brand": d.get("vehicle_brand") or "",
        "vehicle_plate": d.get("vehicle_plate") or "",
        "verified": int(d.get("verification_level") or 0) >= 1,
    }

@profile_router.patch("/me")
def update_profile(body: UpdateProfileIn, user=Depends(require_level(1))):
    """Обновить профиль. Для грузоотправителя имя, страна и телефон обязательны."""
    _ensure_columns()
    updates = {}
    if body.name is not None:
        updates["full_name"] = body.name.strip()
    if body.city is not None:
        updates["city"] = body.city.strip()
    if body.about is not None:
        updates["about"] = body.about.strip()
    if body.legal_form is not None:
        lf = body.legal_form.strip()
        if lf in {"individual", "ip", "too"}:
            updates["legal_form"] = lf
    if body.china_experience_years is not None:
        updates["china_experience_years"] = max(0, min(50, int(body.china_experience_years)))
    if body.favorite_borders is not None:
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
    if body.company_name is not None:
        updates["company_name"] = body.company_name.strip()
    if body.bin_inn is not None:
        updates["bin_inn"] = body.bin_inn.strip()
    if body.country is not None:
        updates["country"] = body.country.strip()
    if body.messenger_type is not None:
        mt = body.messenger_type.strip().lower()
        if mt in {"wechat", "whatsapp", "telegram", "viber", ""}:
            updates["messenger_type"] = mt
    if body.messenger_id is not None:
        updates["messenger_id"] = body.messenger_id.strip()

    if body.role is not None:
        role_norm = body.role.strip().lower()
        if role_norm == "shipper":
            role_norm = "client"
        if role_norm not in ("driver", "client"):
            raise HTTPException(status_code=400, detail={"error": "INVALID_ROLE", "message": "role должен быть driver|client"})

        current = reg_dal.get_driver(user["id"]) or {}
        body_phone = _normalize_phone(body.phone) if body.phone is not None else None
        stored_phone = current.get("phone")
        effective_phone = body_phone or (stored_phone if _is_real_phone(stored_phone) else None)
        if not effective_phone:
            raise HTTPException(status_code=400, detail={"error": "PHONE_REQUIRED", "message": "Для завершения регистрации укажите номер телефона"})

        effective_name = updates.get("full_name") or (current.get("full_name") or "").strip() or None
        if role_norm == "client" and not effective_name:
            raise HTTPException(status_code=400, detail={"error": "NAME_REQUIRED", "message": "Грузоотправитель обязан указать имя"})

        effective_country = updates.get("country") or (current.get("country") or "").strip() or None
        if role_norm == "client" and not _is_real_country(effective_country):
            raise HTTPException(status_code=400, detail={"error": "COUNTRY_REQUIRED", "message": "Грузоотправитель обязан указать страну"})

        updates["role"] = role_norm
        if body_phone:
            if not _is_real_phone(body_phone):
                raise HTTPException(status_code=400, detail={"error": "INVALID_PHONE", "message": "Некорректный номер телефона"})
            updates["phone"] = body_phone
    elif body.phone is not None:
        normalized = _normalize_phone(body.phone)
        if not _is_real_phone(normalized):
            raise HTTPException(status_code=400, detail={"error": "INVALID_PHONE", "message": "Некорректный номер телефона"})
        updates["phone"] = normalized

    if not updates:
        return {"ok": True, "detail": "Нечего обновлять"}

    reg_dal.update_driver(user["id"], updates)
    return {"ok": True}