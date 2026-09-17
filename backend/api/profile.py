"""Profile API — обновление и получение профиля."""
import sys
import json
import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from pydantic import BaseModel, Field
from typing import Optional, List

from database import registration_dal as reg_dal
from api.verification_gate import require_level
from services import file_signing
from services import otp_service
from services.log_redact import mask_phone
from api.rate_limit import limit_phone_change_request, limit_phone_change_verify

profile_router = APIRouter()

def _normalize_phone(v):
    if v is None:
        return None
    return "".join(ch for ch in str(v) if ch.isdigit() or ch == "+").strip()


def _canonical_phone(v):
    """Normalize a user-entered phone without storing formatting variants."""
    raw = str(v or "").strip()
    if not raw or not re.fullmatch(r"\+?[\d\s().-]+", raw):
        return ""
    normalized = _normalize_phone(v)
    digits = "".join(ch for ch in normalized if ch.isdigit())
    return f"+{digits}" if digits else ""

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
    messenger_type: Optional[str] = Field(None, description="wechat|whatsapp|telegram|viber|other")
    messenger_id: Optional[str] = None


class PhoneChangeRequestIn(BaseModel):
    phone: Optional[str] = None
    new_phone: Optional[str] = None
    channel: Optional[str] = "whatsapp"


class PhoneChangeConfirmIn(BaseModel):
    phone: Optional[str] = None
    new_phone: Optional[str] = None
    code: str

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


def _phone_change_digest(code: str) -> str:
    # Prefer an operator-provided secret; FILE_SIGNING_KEY is already a
    # deployment secret in this application. The final fallback is only for
    # local development and never appears in responses or logs.
    secret = (
        os.getenv("PHONE_CHANGE_OTP_SECRET")
        or os.getenv("FILE_SIGNING_KEY")
        or "urtruck-phone-change-development-secret"
    )
    return hmac.new(secret.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


def _phone_change_error(error: str, message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"error": error, "message": message})

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
    data = await file.read(_PRO_DOC_MAX + 1)
    if not data:
        raise HTTPException(status_code=400, detail={"error": "EMPTY_FILE"})
    if len(data) > _PRO_DOC_MAX:
        raise HTTPException(status_code=413, detail={"error": "FILE_TOO_LARGE"})
    # Magic bytes are authoritative — the declared content_type is
    # client-controlled and previously was the ONLY check (a renamed binary
    # would pass as "image/jpeg" and get served with an image MIME).
    from services import upload_validation
    sniffed = upload_validation.sniff_pro_doc_mime(data)
    if sniffed is None or sniffed not in _PRO_DOC_MIME:
        raise HTTPException(status_code=415, detail={"error": "UNSUPPORTED_FILE_TYPE"})
    if upload_validation.declared_contradicts_sniffed(file.content_type, sniffed):
        raise HTTPException(status_code=415, detail={"error": "MIME_MISMATCH"})
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[sniffed]
    from services import storage_service
    ref = storage_service.save_file(data, f"pro-{kind}-{user['id']}", ext=ext, content_type=sniffed)
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


@profile_router.post("/me/phone-change/request")
def request_phone_change(
    body: PhoneChangeRequestIn,
    request: Request,
    user=Depends(require_level(1)),
):
    """Create an authenticated, single-purpose challenge for a new phone."""
    _ensure_columns()
    if body.phone and body.new_phone and _canonical_phone(body.phone) != _canonical_phone(body.new_phone):
        _phone_change_error("PHONE_CHANGE_PHONE_MISMATCH", "Номер указан неоднозначно")
    new_phone = _canonical_phone(body.new_phone or body.phone)
    if not _is_real_phone(new_phone):
        _phone_change_error("INVALID_PHONE", "Некорректный номер телефона")

    current = reg_dal.get_driver(user["id"]) or {}
    current_phone = (
        _canonical_phone(current.get("phone"))
        if _is_real_phone(current.get("phone"))
        else ""
    )
    if current_phone and current_phone == new_phone:
        _phone_change_error("PHONE_UNCHANGED", "Новый номер совпадает с текущим")

    # Compare canonical digits against every stored variant. This also covers
    # legacy rows where a phone was saved with spaces or punctuation.
    from database.db import get_conn, new_id
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, phone FROM drivers_registration WHERE phone IS NOT NULL"
        ).fetchall()
    for row in rows:
        if (
            row["id"] != user["id"]
            and _is_real_phone(row["phone"])
            and _canonical_phone(row["phone"]) == new_phone
        ):
            _phone_change_error("PHONE_ALREADY_IN_USE", "Этот номер уже принадлежит другому аккаунту", 409)

    ip = request.client.host if request.client else "unknown"
    limit_phone_change_request(user["id"], new_phone, ip)
    code = otp_service.generate_code()
    expires_at = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    challenge_id = new_id()
    digest = _phone_change_digest(code)

    with get_conn() as c:
        # A new request invalidates an older outstanding challenge for the same
        # account/purpose, so only one code can be confirmed.
        c.execute(
            "UPDATE phone_change_challenges SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP) "
            "WHERE user_id = ? AND purpose = 'phone_change' AND consumed_at IS NULL",
            (user["id"],),
        )
        c.execute(
            "INSERT INTO phone_change_challenges "
            "(id, user_id, new_phone, purpose, code_digest, expires_at) "
            "VALUES (?, ?, ?, 'phone_change', ?, ?)",
            (challenge_id, user["id"], new_phone, digest, expires_at),
        )

    try:
        delivery = otp_service.send_otp(new_phone, code, channel=body.channel or "whatsapp") or {}
    except Exception:
        delivery = {"sent": False}
    if not delivery.get("sent"):
        with get_conn() as c:
            c.execute("DELETE FROM phone_change_challenges WHERE id = ?", (challenge_id,))
        _phone_change_error("PHONE_CHANGE_OTP_DELIVERY_FAILED", "Не удалось отправить код", 503)

    response = {
        "ok": True,
        "challenge_id": challenge_id,
        "phone_masked": mask_phone(new_phone),
        "expires_in": 600,
    }
    # Keep the existing non-production mock contract useful for local QA,
    # while never returning a real production OTP.
    if not otp_service.IS_PRODUCTION and (delivery.get("mock") or delivery.get("beta")) and delivery.get("code"):
        response["code"] = delivery["code"]
    return response


@profile_router.post("/me/phone-change/confirm")
def confirm_phone_change(
    body: PhoneChangeConfirmIn,
    request: Request,
    user=Depends(require_level(1)),
):
    """Verify the challenge and rotate all sessions before returning a token."""
    _ensure_columns()
    if body.phone and body.new_phone and _canonical_phone(body.phone) != _canonical_phone(body.new_phone):
        _phone_change_error("PHONE_CHANGE_PHONE_MISMATCH", "Номер указан неоднозначно")
    new_phone = _canonical_phone(body.new_phone or body.phone)
    code = str(body.code or "").strip()
    if not _is_real_phone(new_phone):
        _phone_change_error("INVALID_PHONE", "Некорректный номер телефона")
    if not code or len(code) != 4 or not code.isdigit():
        _phone_change_error("PHONE_CHANGE_OTP_INVALID", "Введите четырёхзначный код")
    limit_phone_change_verify(user["id"], new_phone)

    from database.db import get_conn, new_id
    now = datetime.utcnow().isoformat()
    with get_conn() as c:
        challenge = c.execute(
            "SELECT * FROM phone_change_challenges "
            "WHERE user_id = ? AND new_phone = ? AND purpose = 'phone_change' "
            "AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
            (user["id"], new_phone),
        ).fetchone()
        if not challenge:
            _phone_change_error("PHONE_CHANGE_OTP_NOT_FOUND", "Сначала запросите новый код")
        if challenge["expires_at"] < now:
            _phone_change_error("PHONE_CHANGE_OTP_EXPIRED", "Срок действия кода истёк")
        if int(challenge["attempts"] or 0) >= int(challenge["max_attempts"] or 5):
            _phone_change_error("PHONE_CHANGE_OTP_ATTEMPTS_EXCEEDED", "Превышено число попыток", 429)

        attempts = int(challenge["attempts"] or 0) + 1
        c.execute(
            "UPDATE phone_change_challenges SET attempts = ? WHERE id = ? AND consumed_at IS NULL",
            (attempts, challenge["id"]),
        )
        if not hmac.compare_digest(challenge["code_digest"], _phone_change_digest(code)):
            if attempts >= int(challenge["max_attempts"] or 5):
                _phone_change_error("PHONE_CHANGE_OTP_ATTEMPTS_EXCEEDED", "Превышено число попыток", 429)
            _phone_change_error("PHONE_CHANGE_OTP_INVALID", "Неверный код")

        duplicate = c.execute(
            "SELECT id, phone FROM drivers_registration WHERE id != ? AND phone IS NOT NULL",
            (user["id"],),
        ).fetchall()
        if any(
            _is_real_phone(row["phone"]) and _canonical_phone(row["phone"]) == new_phone
            for row in duplicate
        ):
            _phone_change_error("PHONE_ALREADY_IN_USE", "Этот номер уже принадлежит другому аккаунту", 409)

        c.execute(
            "UPDATE drivers_registration SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_phone, user["id"]),
        )
        c.execute(
            "UPDATE phone_change_challenges SET consumed_at = ? WHERE id = ?",
            (now, challenge["id"]),
        )
        c.execute(
            "INSERT INTO phone_change_audit (id, user_id, event_type, phone_masked) VALUES (?, ?, ?, ?)",
            (new_id(), user["id"], "phone_changed", mask_phone(new_phone)),
        )

    old_authorization = request.headers.get("authorization", "")
    old_token = old_authorization.split(" ", 1)[1] if old_authorization.startswith("Bearer ") else ""
    reg_dal.revoke_sessions_for_driver(user["id"])
    new_token = reg_dal.create_session(user["id"])
    return {
        "ok": True,
        "phone_masked": mask_phone(new_phone),
        "token": new_token,
        "session_rotated": True,
        "old_session_revoked": bool(old_token),
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
    """Обновить профиль. В basic onboarding водитель может оставить компанию пустой."""
    _ensure_columns()
    current = reg_dal.get_driver(user["id"]) or {}
    body_phone = _canonical_phone(body.phone) if body.phone is not None else None
    if body.phone is not None and not _is_real_phone(body_phone):
        _phone_change_error("INVALID_PHONE", "Некорректный номер телефона")
    if body.phone is not None and _is_real_phone(current.get("phone")):
        if _canonical_phone(current.get("phone")) != body_phone:
            _phone_change_error(
                "PHONE_CHANGE_OTP_REQUIRED",
                "Для изменения номера подтвердите его кодом",
                400,
            )
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
        if mt not in {"wechat", "whatsapp", "telegram", "viber", "other", ""}:
            raise HTTPException(status_code=400, detail={"error": "INVALID_MESSENGER_TYPE", "message": "Неподдерживаемый мессенджер"})
        updates["messenger_type"] = mt
    if body.messenger_id is not None:
        updates["messenger_id"] = body.messenger_id.strip()

    if body.role is not None:
        role_norm = body.role.strip().lower()
        if role_norm == "shipper":
            role_norm = "client"
        if role_norm not in ("driver", "client"):
            raise HTTPException(status_code=400, detail={"error": "INVALID_ROLE", "message": "role должен быть driver|client"})

        stored_phone = current.get("phone")
        effective_phone = body_phone or (stored_phone if _is_real_phone(stored_phone) else None)
        if not effective_phone:
            raise HTTPException(status_code=400, detail={"error": "PHONE_REQUIRED", "message": "Для завершения регистрации укажите номер телефона"})

        effective_name = updates.get("full_name") or (current.get("full_name") or "").strip() or None
        if not effective_name:
            raise HTTPException(status_code=400, detail={"error": "NAME_REQUIRED", "message": "Для завершения регистрации укажите имя"})

        effective_company = updates.get("company_name") or (current.get("company_name") or "").strip() or None
        if role_norm == "client" and (not effective_company or len(effective_company) < 2):
            raise HTTPException(status_code=400, detail={"error": "COMPANY_REQUIRED", "message": "Для завершения регистрации укажите компанию или ИП"})

        # Messenger is optional for the basic driver path. For clients, once a
        # channel is selected its address is required at the authoritative API
        # boundary, preventing old clients from storing e.g. `wechat` empty.
        selected_messenger = updates.get("messenger_type")
        if selected_messenger and role_norm != "driver":
            effective_messenger_id = updates.get("messenger_id") or (current.get("messenger_id") or "").strip()
            if len(effective_messenger_id) < 2:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "MESSENGER_CONTACT_REQUIRED",
                        "message": "Для выбранного мессенджера укажите контакт",
                    },
                )

        updates["role"] = role_norm
        # A real existing phone is immutable through this generic endpoint.
        # The only allowed phone write here is the first contact assignment to
        # a legacy auth_/guest_ placeholder during onboarding.
        if body_phone and not _is_real_phone(stored_phone):
            updates["phone"] = body_phone
    elif body.phone is not None:
        # No role assignment means this cannot be the initial onboarding
        # contact binding, so direct phone mutation is never accepted.
        _phone_change_error(
            "PHONE_CHANGE_OTP_REQUIRED",
            "Для изменения номера подтвердите его кодом",
            400,
        )

    if not updates:
        return {"ok": True, "detail": "Нечего обновлять"}

    reg_dal.update_driver(user["id"], updates)
    return {"ok": True}
