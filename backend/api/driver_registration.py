"""Driver onboarding wizard — draft auto-save + submit (ТЗ онбординг §0.1, §9).

Монтируется в main.py под prefix '/api/v1/driver/registration'.

  PATCH /draft   — авто-сохранение полей мастера (выход не теряет прогресс)
  POST  /submit  — отправка на проверку: стартовый скоринг + status=pending

Аутентификация — общий Bearer-токен регистрации (как в api/registration.py).
"""
from datetime import datetime

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
    # шаг 2
    "residence_status",
    # шаг 3
    "license_category", "license_issue_date", "license_expiry",
    "license_number", "license_selfie_url",
    # шаг 4
    "vehicle_brand", "vehicle_model", "vehicle_plate", "vehicle_year", "vehicle_vin",
    "vehicle_type",
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


@driver_reg_router.post("/submit")
def submit_registration(driver_id: str = Depends(get_current_driver)):
    """Отправка заявки на проверку: стартовый скоринг + status=pending.
    Красный балл (<40) → manual_review для модератора."""
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    scoring = compute_start_score(driver)
    status = "manual_review" if scoring["color"] == "red" else "pending"
    reg_dal.update_driver(driver_id, {
        "security_score": scoring["score"],
        "security_color": scoring["color"],
        "status": status,
        "role": "driver",
        "submitted_at": datetime.utcnow().isoformat(),
        "manual_review_required": 1 if scoring["color"] == "red" else 0,
    })
    return {
        "ok": True,
        "status": status,
        "scoring": scoring,
    }
