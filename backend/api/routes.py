"""API маршруты UrTruck Security — все endpoints кроме public требуют авторизацию."""
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from fastapi.responses import JSONResponse

import config
from api.models import (
    CheckFullRequest, CheckQuickRequest, BlacklistAddRequest,
    ScoreResponse, OCRResponse,
)
from api.verification_gate import require_level, get_user, require_admin
from scoring.engine import calculate_score, quick_check
from scoring.color_code import color_from_score, label_from_color
from scoring.weights import apply_penalties_and_bonuses
from blacklist import manager as blacklist_mgr
from ocr.document_reader import extract_passport_data
from database import db
from database import registration_dal as reg_dal
from database.db import get_conn

router = APIRouter()

_PRIVILEGED_SCORING_ROLES = {"admin", "support"}


def _resolve_verification_subject(user: dict, requested_user_id: str | None) -> str:
    """Привязывает user-scoped pipeline к проверенной сессии.

    Обычный пользователь может работать только со своими данными. Admin и
    support могут явно выбрать существующего пользователя для модерации.
    Внутренние registration/scheduler jobs вызывают scoring engine напрямую и
    не зависят от этого HTTP-контракта.
    """
    actor_id = user["id"]
    subject_id = requested_user_id or actor_id
    if subject_id == actor_id:
        return actor_id
    if user.get("role") not in _PRIVILEGED_SCORING_ROLES:
        raise HTTPException(status_code=403, detail="Доступ только к своей верификации")
    if not reg_dal.get_driver(subject_id):
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return subject_id


def _completed_trips(user_id: str) -> int:
    """Считает завершённые рейсы из БД; отсутствие legacy-схемы = 0."""
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT COUNT(*) AS n FROM deals "
                "WHERE driver_id = ? AND status = 'completed'",
                (user_id,),
            ).fetchone()
            return int(row["n"] if row else 0)
    except sqlite3.OperationalError:
        return 0


def _server_scoring_components(user_id: str) -> dict:
    """Формирует компоненты только из серверного профиля/сделок/отзывов."""
    from verification.vehicle_checker import check_vehicle, check_financial, check_identity

    driver = reg_dal.get_driver(user_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    phone = driver.get("phone")
    plate = driver.get("vehicle_plate")
    vehicle = check_vehicle(
        plate or "",
        year=driver.get("vehicle_year"),
        has_insurance=bool(driver.get("cmr_insurance_url")),
    )
    financial = check_financial(user_id)
    identity = check_identity(
        user_id,
        plate_verified=bool(driver.get("passport_verified")),
        selfie_verified=bool(driver.get("face_verified")),
    )

    mentions = db.get_mentions(phone=phone, plate=plate) if phone or plate else []
    negative = sum(1 for mention in mentions if mention.get("sentiment") == "negative")
    positive = sum(1 for mention in mentions if mention.get("sentiment") == "positive")
    social = max(0, min(100, 70 - negative * 15 + positive * 5))

    license_ocr = {}
    try:
        license_ocr = json.loads(driver.get("license_ocr") or "{}")
    except (TypeError, ValueError, json.JSONDecodeError):
        license_ocr = {}
    if not isinstance(license_ocr, dict):
        license_ocr = {}
    try:
        experience_years = max(0, int(license_ocr.get("experience_years") or 0))
    except (TypeError, ValueError):
        experience_years = 0
    completed_trips = _completed_trips(user_id)

    return {
        "identity": identity["score"],
        # reputation намеренно не передаётся: engine получает её из reviews DAL.
        "social": social,
        "experience": min(100, 30 + experience_years * 7 + completed_trips * 2),
        "vehicle": vehicle["score"],
        "financial": financial["score"],
        "bonus": min(100, completed_trips * 5),
        "phone": phone,
        "plate": plate,
    }


@router.get("/")
def root():
    return {
        "service": "UrTruck Security API",
        "version": "1.0",
        "status": "ok",
        "endpoints": [
            "POST /check/full", "POST /check/quick",
            "GET /score/{user_id}", "POST /ocr/passport",
            "POST /blacklist/check", "POST /blacklist/add",
            "GET /alerts/active", "GET /report/{user_id}",
            "GET /stats", "GET /mentions",
        ],
    }


@router.get("/stats")
def stats(user=Depends(require_level(1))):
    """Общая статистика системы."""
    from database.db import get_conn
    with get_conn() as c:
        scores = c.execute("SELECT color_code, COUNT(*) as n FROM driver_scores GROUP BY color_code").fetchall()
        bl_count = c.execute("SELECT COUNT(*) as n FROM blacklist WHERE is_active = 1").fetchone()["n"]
        mentions = c.execute("SELECT COUNT(*) as n FROM telegram_mentions").fetchone()["n"]
        alerts = c.execute("SELECT COUNT(*) as n FROM security_alerts WHERE is_resolved = 0").fetchone()["n"]
    return {
        "scores_by_color": {row["color_code"]: row["n"] for row in scores},
        "blacklist_size": bl_count,
        "telegram_mentions": mentions,
        "active_alerts": alerts,
    }


@router.post("/check/full", response_model=ScoreResponse)
def check_full(req: CheckFullRequest, user=Depends(require_level(1))):
    """Полная проверка: self-only либо явный admin/support target."""
    subject_id = _resolve_verification_subject(user, req.user_id)
    return calculate_score(subject_id, _server_scoring_components(subject_id))


@router.post("/check/quick")
def check_quick(req: CheckQuickRequest, user=Depends(require_level(1))):
    """Быстрая проверка только по blacklist + Telegram."""
    return quick_check(phone=req.phone, plate=req.plate, name=req.name)


@router.get("/score/{user_id}")
def get_score(user_id: str, user=Depends(require_level(1))):
    """Получить текущий скоринг водителя."""
    subject_id = _resolve_verification_subject(user, user_id)
    score = db.get_score(subject_id)
    if not score:
        return {"user_id": subject_id, "total_score": 50, "color_code": "yellow",
                "message": "Водитель не проверен"}
    score["color_label"] = label_from_color(score["color_code"])
    return score


@router.post("/ocr/passport", response_model=OCRResponse)
async def ocr_passport(file: UploadFile = File(...), user_id: str | None = Query(default=None),
                       user=Depends(require_level(1))):
    """OCR техпаспорта — извлекает марку, номер, VIN, год."""
    subject_id = _resolve_verification_subject(user, user_id)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    result = extract_passport_data(tmp_path)
    if result.get("success"):
        db.save_ocr(subject_id, "tech_passport", result, result.get("confidence", 0.0))
    return result


@router.post("/blacklist/check")
def blacklist_check_endpoint(req: CheckQuickRequest, user=Depends(require_level(1))):
    entries = blacklist_mgr.check_blacklist(phone=req.phone, plate=req.plate, name=req.name)
    return {"found": len(entries), "entries": entries}


@router.post("/blacklist/add")
def blacklist_add_endpoint(req: BlacklistAddRequest, user=Depends(require_admin)):
    entry = blacklist_mgr.add_to_blacklist(
        phone=req.phone, plate=req.plate, name=req.name,
        reason=req.reason, source=req.source, severity=req.severity,
    )
    return {"ok": True, "entry": entry}


@router.get("/alerts/active")
def active_alerts(user=Depends(require_admin)):
    return {"alerts": db.get_active_alerts()}


@router.get("/report/{user_id}")
def full_report(user_id: str, user=Depends(require_admin)):
    score = db.get_score(user_id) or {}
    logs = db.get_logs(user_id, limit=20)
    return {
        "user_id": user_id,
        "score": score,
        "color_label": label_from_color(score.get("color_code", "yellow")),
        "verification_history": logs,
    }


@router.get("/mentions")
def mentions(phone: str = None, plate: str = None, user=Depends(require_level(1))):
    return {"mentions": db.get_mentions(phone=phone, plate=plate)}


@router.post("/report/driver")
def report_driver(req: BlacklistAddRequest, user=Depends(require_level(1))):
    """Пользовательская жалоба на водителя.

    I2 (anti-abuse): раньше жалоба СРАЗУ писалась в активный blacklist
    (source=user_report), а blacklist_check при регистрации блокирует по
    совпадению телефона/номера. То есть любой залогиненный юзер мог заранее
    «зачернить» телефон конкурента/жертвы и заблокировать ему регистрацию.
    Теперь жалоба идёт ТОЛЬКО в модерационную очередь (alerts) — попадёт в
    blacklist лишь после ручного решения модератора через /blacklist/add
    (require_admin). Плюс rate-limit 5/час на пользователя.
    """
    from api.rate_limit import limit_report_create
    limit_report_create(user["id"])
    db.add_alert(
        "user_report", "medium",
        req.phone or req.plate or "unknown",
        f"Жалоба от {user['id']}: {req.reason} "
        f"(phone={req.phone or '-'}, plate={req.plate or '-'}, name={req.name or '-'})",
    )
    return {"ok": True, "queued": True, "message": "Жалоба отправлена на модерацию"}


@router.get("/verification/{user_id}/history")
def verification_history(user_id: str, user=Depends(require_level(1))):
    """История всех проверок водителя.

    I1 (IDOR): раньше любой залогиненный юзер мог прочитать историю
    верификации/биометрии ЛЮБОГО водителя по id (в логах — результаты
    liveness/face_match, score_impact). Теперь доступ только к своей истории
    или для роли admin/support.
    """
    if user_id != user["id"] and user.get("role") not in ("admin", "support"):
        raise HTTPException(status_code=403, detail="Доступ только к своей истории проверок")
    return {"logs": db.get_logs(user_id, limit=50)}


@router.post("/gov/check")
def gov_check(req: CheckQuickRequest, user=Depends(require_level(1))):
    """Трансграничная проверка по 5 странам СНГ."""
    from verification.gov_checkers import cross_check_all
    return cross_check_all(phone=req.phone, plate=req.plate)


@router.post("/biometric/liveness")
async def biometric_liveness(file: UploadFile = File(...), user_id: str | None = Query(default=None),
                             user=Depends(require_level(1))):
    """Liveness check — проверка что на фото живой человек."""
    subject_id = _resolve_verification_subject(user, user_id)
    import tempfile
    from biometrics.liveness import check_liveness
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    r = check_liveness(tmp_path)
    db.log_verification(subject_id, "biometric", "liveness",
                         "pass" if r.get("liveness_passed") else "fail",
                         r, 10 if r.get("liveness_passed") else -5)
    return r


@router.post("/biometric/face_match")
async def biometric_face_match(selfie: UploadFile = File(...), document: UploadFile = File(...),
                                user_id: str | None = Query(default=None),
                                user=Depends(require_level(1))):
    """Сверка лица на селфи с фото документа."""
    subject_id = _resolve_verification_subject(user, user_id)
    import tempfile
    from biometrics.liveness import face_match
    p1 = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    p2 = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    p1.write(await selfie.read()); p1.close()
    p2.write(await document.read()); p2.close()
    r = face_match(p1.name, p2.name)
    db.log_verification(subject_id, "biometric", "face_match",
                         "pass" if r.get("match") else "fail",
                         r, 15 if r.get("match") else -10)
    return r


@router.post("/parsers/whatsapp_screenshot")
async def whatsapp_screenshot(file: UploadFile = File(...), user=Depends(require_level(1))):
    """Импорт скриншота WhatsApp чата — OCR + анализ."""
    import tempfile
    from parsers.whatsapp_monitor import process_screenshot
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    return process_screenshot(tmp_path)


@router.get("/gov/{country}")
def gov_single(country: str, phone: str = None, plate: str = None, user=Depends(require_level(1))):
    """Проверка по конкретной стране: kz/ru/uz/kg/tj."""
    from verification import gov_checkers
    fn = {
        "kz": gov_checkers.check_kz, "ru": gov_checkers.check_ru,
        "uz": gov_checkers.check_uz, "kg": gov_checkers.check_kg,
        "tj": gov_checkers.check_tj,
    }.get(country.lower())
    if not fn:
        raise HTTPException(status_code=404, detail="Country not supported")
    return fn(phone=phone, plate=plate)
