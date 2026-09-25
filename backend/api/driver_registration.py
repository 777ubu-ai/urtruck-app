"""Driver onboarding wizard — draft auto-save + submit (ТЗ онбординг §0.1, §9).

Монтируется в main.py под prefix '/api/v1/driver/registration'.

  PATCH /draft   — авто-сохранение полей мастера (выход не теряет прогресс)
  POST  /submit  — отправка на проверку: стартовый скоринг + status=pending

Аутентификация — общий Bearer-токен регистрации (как в api/registration.py).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import registration_dal as reg_dal
from api.registration import get_current_driver

driver_reg_router = APIRouter()

# Whitelist колонок, которые мастер может писать в черновик. КРИТИЧНО:
# update_driver() строит SQL из ключей dict — произвольные ключи нельзя
# пускать в БД (SQL-инъекция через имя столбца). Принимаем только эти.
DRAFT_FIELDS = {
    # шаг 1
    "full_name", "birth_date", "iin", "personal_photo_url",
    # новый порядок: гражданство (шаг 1) + удостоверение личности (шаг 2)
    "citizenship_country", "driver_citizenship_country_code", "vehicle_registration_country_code", "vehicle_registration_country", "id_doc_type", "id_front_url", "id_back_url",
    # шаг 2
    "residence_status",
    # шаг 3
    "license_category", "license_issue_date", "license_expiry",
    "license_number", "license_selfie_url",
    # шаг 4
    "vehicle_brand", "vehicle_model", "vehicle_plate", "trailer_plate", "vehicle_year", "vehicle_vin",
    "vehicle_type", "vehicle_color",
    # шаг 5
    "truck_kind", "body_type", "capacity_tons", "volume_m3",
    "dims_l_m", "dims_w_m", "dims_h_m", "adr", "has_straps",
    # прочее
    "city",
}


class DraftBody(BaseModel):
    # Свободная форма — берём только whitelisted ключи (extra игнорируем).
    model_config = {"extra": "allow"}


def _years_since(ddmmyyyy: str):
    """Количество полных лет от даты (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД) до сегодня."""
    if not ddmmyyyy:
        return None
    s = str(ddmmyyyy).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s, fmt)
            now = datetime.utcnow()
            return now.year - d.year - ((now.month, now.day) < (d.month, d.day))
        except ValueError:
            continue
    return None


def _experience_points(license_issue_date) -> int:
    """Стаж от даты выдачи прав → 0..100 (ТЗ §3 скоринг)."""
    y = _years_since(license_issue_date)
    if y is None:
        return 0
    if y < 1:
        return 0      # gate — стаж < 1 года не допускаем
    if y < 2:
        return 30
    if y < 5:
        return 50
    if y < 10:
        return 80
    return 100


def _machine_points(vehicle_year) -> int:
    """Возраст машины → 0..100 (ТЗ §5 скоринг)."""
    try:
        year = int(vehicle_year)
    except (TypeError, ValueError):
        return 0
    age = datetime.utcnow().year - year
    if age < 0:
        return 0
    if age < 3:
        return 100
    if age < 7:
        return 80
    if age < 12:
        return 50
    return 20


def compute_start_score(driver: dict) -> dict:
    """Стартовый балл при submit (ТЗ §8/§9).

    В онбординге доступны только два весовых фактора — стаж (15%) и возраст
    машины (10%). Нормируем их на доступную сумму весов (25%), чтобы балл мог
    достигать 🟢-зоны, и добавляем +5 за полноту профиля (ADR/параметры).
    """
    exp = _experience_points(driver.get("license_issue_date"))
    mach = _machine_points(driver.get("vehicle_year"))
    completeness = 5 if (
        driver.get("adr")
        or (driver.get("capacity_tons") and driver.get("volume_m3"))
    ) else 0

    base = round((exp * 15 + mach * 10) / 25)
    score = max(0, min(100, base + completeness))
    color = "green" if score >= 70 else "yellow" if score >= 40 else "red"
    return {
        "score": score, "color": color,
        "experience_points": exp, "machine_points": mach,
        "completeness_bonus": completeness,
        "license_too_new": exp == 0 and driver.get("license_issue_date"),
    }


@driver_reg_router.patch("/draft")
def save_draft(body: DraftBody, driver_id: str = Depends(get_current_driver)):
    """Авто-сохранение шага мастера. Принимает любое подмножество полей,
    пишет только whitelisted; неизвестные ключи игнорируются."""
    raw = body.model_dump()
    updates = {}
    for k, v in raw.items():
        if k not in DRAFT_FIELDS:
            continue
        if k in ("adr", "has_straps"):
            updates[k] = 1 if v in (True, 1, "1", "true", "yes") else 0
        else:
            updates[k] = v
    if updates:
        reg_dal.update_driver(driver_id, updates)
    return {"ok": True, "saved": sorted(updates.keys())}


_BASIC_REQUIRED_FIELDS = ("full_name", "birth_date")


def _basic_onboarding_missing(driver: dict) -> list[str]:
    return [
        field for field in _BASIC_REQUIRED_FIELDS
        if not str(driver.get(field) or "").strip()
    ]


def can_publish_driver_trip(driver: dict) -> bool:
    """Базовая публикация доступна после минимального онбординга."""
    return bool(driver.get("basic_onboarding_completed")) or (
        driver.get("status") == "approved"
        or int(driver.get("verification_level") or 0) >= 3
    )


def reconcile_basic_onboarding(driver: dict) -> dict:
    """Признаёт старый полный basic-профиль без запуска Pro-гейта.

    До появления отдельного флага legacy-аккаунты могли иметь все личные и
    транспортные поля, но ``basic_onboarding_completed`` оставался пустым.
    Reconciliation меняет только derived-флаг публикации, не роль и не
    moderation-статус.
    """
    if not driver or driver.get("role") != "driver":
        return driver
    if can_publish_driver_trip(driver) or _basic_onboarding_missing(driver):
        return driver
    reg_dal.update_driver(driver["id"], {"basic_onboarding_completed": 1})
    return {**driver, "basic_onboarding_completed": 1}


@driver_reg_router.post("/complete-basic")
def complete_basic_onboarding(driver_id: str = Depends(get_current_driver)):
    """Закрыть базовый водительский онбординг без Pro-верификации."""
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    # P0 fix (2026-09-13, registration/roles audit): second role-mutation
    # vector alongside PATCH /users/me (see api/profile.py). /draft accepts
    # any whitelisted driver field with no role check (by design — it must
    # work before a role exists), so an already-registered CLIENT account
    # could fill the driver fields via /draft and then call this endpoint to
    # get role silently flipped to "driver" (confirmed live: client -> driver
    # via draft+complete-basic, bypassing the PATCH /users/me role lock
    # entirely). Fail closed the same way: an account that already chose
    # "client" cannot complete driver onboarding into a different role.
    if (driver.get("role") or "").strip().lower() == "client":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "ROLE_ALREADY_SET",
                "message": "Роль уже выбрана и не может быть изменена",
            },
        )

    missing = _basic_onboarding_missing(driver)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"error": "BASIC_ONBOARDING_INCOMPLETE", "fields": missing},
        )

    # Повторный вызов не понижает уже подтверждённый legacy-аккаунт.
    if driver.get("status") == "approved" or int(driver.get("verification_level") or 0) >= 3:
        return {
            "ok": True,
            "role": driver.get("role") or "driver",
            "status": driver.get("status"),
            "verification_level": int(driver.get("verification_level") or 0),
            "basic_onboarding_completed": True,
        }

    completed_at = datetime.now(timezone.utc).isoformat()
    reg_dal.update_driver(driver_id, {
        "role": "driver",
        "status": "basic",
        "basic_onboarding_completed": 1,
        "basic_onboarding_completed_at": completed_at,
    })
    return {
        "ok": True,
        "role": "driver",
        "status": "basic",
        "verification_level": int(driver.get("verification_level") or 0),
        "basic_onboarding_completed": True,
        "basic_onboarding_completed_at": completed_at,
    }


@driver_reg_router.post("/submit")
def submit_registration(driver_id: str = Depends(get_current_driver)):
    """Отправка заявки.

    Отправка формы только создаёт заявку на проверку. Скоринг и наличие
    документов не являются решением верификации: trusted level 3 может быть
    выдан только отдельным trusted_real/admin-путём. Чёрный список — жёсткий
    гейт: заблокированного не пускаем даже в manual review.
    """
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    # P0 fix (2026-09-13, registration/roles audit): third occurrence of the
    # same role-mutation gap (see /complete-basic above and PATCH /users/me
    # in api/profile.py) — /submit also unconditionally wrote role="driver"
    # with no check, and does not even require /complete-basic or any
    # driver-field completeness first. Confirmed live: a client-role account
    # could call this endpoint directly (no draft, no fields) and have its
    # role flipped to "driver" on an empty/zero-score profile. Fail closed
    # the same way as the other two vectors.
    if (driver.get("role") or "").strip().lower() == "client":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "ROLE_ALREADY_SET",
                "message": "Роль уже выбрана и не может быть изменена",
            },
        )

    scoring = compute_start_score(driver)

    # Blacklist-гейт: даже при авто-одобрении не пускаем тех, кто в ЧС
    # (по телефону / госномеру / ФИО). Это реальная проверка (SQL к blacklist).
    from blacklist import manager as blacklist_mgr
    hits = blacklist_mgr.check_blacklist(
        phone=driver.get("phone"),
        plate=driver.get("vehicle_plate"),
        name=driver.get("full_name"),
    )
    if hits:
        reg_dal.update_driver(driver_id, {
            "security_score": scoring["score"],
            "security_color": scoring["color"],
            "status": "rejected",
            "role": "driver",
            "submitted_at": datetime.utcnow().isoformat(),
            "manual_review_required": 1,
        })
        return {"ok": False, "status": "rejected", "reason": "blacklist", "scoring": scoring}

    # Обычная отправка формы не является верификацией. Сохраняем pending и
    # оставляем максимум identity-level; level 3/status=approved принадлежат
    # только trusted_real moderation или явно авторизованному admin action.
    existing_approved = driver.get("status") == "approved" and (driver.get("verification_level") or 0) >= 3
    reg_dal.update_driver(driver_id, {
        "security_score": scoring["score"],
        "security_color": scoring["color"],
        "status": "approved" if existing_approved else "pending",
        "verification_level": 3 if existing_approved else min(int(driver.get("verification_level") or 0), 2),
        "role": "driver",
        "submitted_at": datetime.utcnow().isoformat(),
        "manual_review_required": 0 if existing_approved else 1,
    })
    return {
        "ok": True,
        "status": "approved" if existing_approved else "pending",
        "manual_review": not existing_approved,
        "scoring": scoring,
    }
