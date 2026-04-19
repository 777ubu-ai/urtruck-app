"""API маршруты UrTruck Security — все endpoints кроме public требуют авторизацию."""
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
from api.verification_gate import require_level, get_user
from scoring.engine import calculate_score, quick_check
from scoring.color_code import color_from_score, label_from_color
from scoring.weights import apply_penalties_and_bonuses
from blacklist import manager as blacklist_mgr
from ocr.document_reader import extract_passport_data
from database import db

router = APIRouter()


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
    """Полная проверка водителя — скоринг по 6 компонентам."""
    # Компоненты
    from verification.vehicle_checker import check_vehicle, check_financial, check_identity
    vehicle = check_vehicle(req.plate or "", year=req.vehicle_year, has_insurance=req.has_insurance)
    financial = check_financial(req.user_id)
    identity = check_identity(req.user_id, plate_verified=bool(req.plate), selfie_verified=False)

    # Репутация по telegram упоминаниям
    mentions = db.get_mentions(phone=req.phone, plate=req.plate)
    negative = sum(1 for m in mentions if m.get("sentiment") == "negative")
    positive = sum(1 for m in mentions if m.get("sentiment") == "positive")
    social = max(0, 70 - negative * 15 + positive * 5)

    # Репутация = реальная оценка пользователей
    reputation = 50 + (req.positive_reviews * 5) - (req.negative_reviews * 10)
    reputation = max(0, min(100, reputation))

    # Опыт
    exp_years = req.experience_years or 1
    experience = min(100, 30 + exp_years * 7 + req.completed_trips * 2)

    # Бонус
    bonus = min(100, req.completed_trips * 5)

    components = {
        "identity": identity["score"],
        "reputation": reputation,
        "social": social,
        "experience": experience,
        "vehicle": vehicle["score"],
        "financial": financial["score"],
        "bonus": bonus,
        "phone": req.phone,
        "plate": req.plate,
    }
    result = calculate_score(req.user_id, components)
    return result


@router.post("/check/quick")
def check_quick(req: CheckQuickRequest, user=Depends(require_level(1))):
    """Быстрая проверка только по blacklist + Telegram."""
    return quick_check(phone=req.phone, plate=req.plate, name=req.name)


@router.get("/score/{user_id}")
def get_score(user_id: str, user=Depends(require_level(1))):
    """Получить текущий скоринг водителя."""
    score = db.get_score(user_id)
    if not score:
        return {"user_id": user_id, "total_score": 50, "color_code": "yellow",
                "message": "Водитель не проверен"}
    score["color_label"] = label_from_color(score["color_code"])
    return score


@router.post("/ocr/passport", response_model=OCRResponse)
async def ocr_passport(file: UploadFile = File(...), user_id: str = Query(...), user=Depends(require_level(1))):
    """OCR техпаспорта — извлекает марку, номер, VIN, год."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    result = extract_passport_data(tmp_path)
    if result.get("success"):
        db.save_ocr(user_id, "tech_passport", result, result.get("confidence", 0.0))
    return result


@router.post("/blacklist/check")
def blacklist_check_endpoint(req: CheckQuickRequest, user=Depends(require_level(1))):
    entries = blacklist_mgr.check_blacklist(phone=req.phone, plate=req.plate, name=req.name)
    return {"found": len(entries), "entries": entries}


@router.post("/blacklist/add")
def blacklist_add_endpoint(req: BlacklistAddRequest, user=Depends(require_level(1))):
    entry = blacklist_mgr.add_to_blacklist(
        phone=req.phone, plate=req.plate, name=req.name,
        reason=req.reason, source=req.source, severity=req.severity,
    )
    return {"ok": True, "entry": entry}


@router.get("/alerts/active")
def active_alerts(user=Depends(require_level(1))):
    return {"alerts": db.get_active_alerts()}


@router.get("/report/{user_id}")
def full_report(user_id: str, user=Depends(require_level(1))):
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
    """Пользовательская жалоба на водителя."""
    entry = blacklist_mgr.add_to_blacklist(
        phone=req.phone, plate=req.plate, name=req.name,
        reason=f"[USER REPORT by {user['id']}] {req.reason}",
        source="user_report",
        severity=req.severity or "medium",
    )
    db.add_alert(
        "user_report", "medium",
        req.phone or req.plate or "unknown",
        f"Пользовательская жалоба: {req.reason}",
    )
    return {"ok": True, "entry": entry}


@router.get("/verification/{user_id}/history")
def verification_history(user_id: str, user=Depends(require_level(1))):
    """История всех проверок водителя."""
    return {"logs": db.get_logs(user_id, limit=50)}


@router.post("/gov/check")
def gov_check(req: CheckQuickRequest, user=Depends(require_level(1))):
    """Трансграничная проверка по 5 странам СНГ."""
    from verification.gov_checkers import cross_check_all
    return cross_check_all(phone=req.phone, plate=req.plate)


@router.post("/biometric/liveness")
async def biometric_liveness(file: UploadFile = File(...), user_id: str = Query(...), user=Depends(require_level(1))):
    """Liveness check — проверка что на фото живой человек."""
    import tempfile
    from biometrics.liveness import check_liveness
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    r = check_liveness(tmp_path)
    db.log_verification(user_id, "biometric", "liveness",
                         "pass" if r.get("liveness_passed") else "fail",
                         r, 10 if r.get("liveness_passed") else -5)
    return r


@router.post("/biometric/face_match")
async def biometric_face_match(selfie: UploadFile = File(...), document: UploadFile = File(...),
                                user_id: str = Query(...), user=Depends(require_level(1))):
    """Сверка лица на селфи с фото документа."""
    import tempfile
    from biometrics.liveness import face_match
    p1 = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    p2 = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    p1.write(await selfie.read()); p1.close()
    p2.write(await document.read()); p2.close()
    r = face_match(p1.name, p2.name)
    db.log_verification(user_id, "biometric", "face_match",
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
