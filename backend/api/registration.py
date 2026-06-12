"""Регистрация водителей — 5 этапов + auto-moderation."""
import sys
import tempfile
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form, Depends, Request
from pydantic import BaseModel
from typing import Optional

from database import registration_dal as reg_dal
from services.whatsapp_service import generate_code, send_whatsapp_code, MOCK_MODE
from services.iin_validator import validate_iin_kz, extract_birthdate_from_iin
from services import storage_service as storage
from services import otp_service
from api.rate_limit import limit_otp_send, limit_otp_verify, limit_guest_create
from ocr.document_reader import extract_passport_data
from biometrics.liveness import check_liveness, face_match
from scoring.engine import calculate_score
from database import db
from config import BETA_MODE, BETA_OTP_CODE
import logging

reg_router = APIRouter()
_beta_log = logging.getLogger("beta_auth")


# ---------- Models ----------
class SendCodeRequest(BaseModel):
    phone: str
    channel: Optional[str] = "whatsapp"  # whatsapp | sms | telegram
    # Stage 24: legal consent — пользователь обязан принять
    # Публичную оферту и Политику конфиденциальности перед
    # отправкой OTP. Frontend выставляет consent=True только
    # если чекбокс отмечен. Backend без явного True блокирует
    # отправку и возвращает 400.
    consent: Optional[bool] = False
    role: Optional[str] = None  # для аудита: driver | client


class VerifyCodeRequest(BaseModel):
    phone: str
    code: str
    guest_token: Optional[str] = None  # для апгрейда гостя → phone-пользователя


class DigitalIDRequest(BaseModel):
    iin: str
    full_name: str


class VehicleRequest(BaseModel):
    vehicle_type: str
    capacity_kg: int
    plate: Optional[str] = None
    brand: Optional[str] = None
    year: Optional[int] = None


# ---------- Auth helper ----------
def get_current_driver(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token = authorization.split(" ", 1)[1]
    driver_id = reg_dal.get_driver_by_token(token)
    if not driver_id:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    return driver_id


# ---------- Lazy registration: ШАГ 0 (guest) ----------
@reg_router.post("/guest")
def create_guest_session(request: Request):
    """Создать анонимную гостевую сессию (verification_level=0).
    Позволяет смотреть ленту без регистрации — как Yandex/inDrive.
    """
    ip = request.client.host if request.client else "unknown"
    limit_guest_create(ip)
    guest = reg_dal.create_guest()
    token = reg_dal.create_session(guest["id"])
    return {
        "token": token,
        "user_id": guest["id"],
        "verification_level": 0,
        "role": "guest",
    }


# ---------- Logout ----------
@reg_router.post("/logout")
def logout(authorization: str = Header(None)):
    """QA-аудит P1-7: серверный revoke токена. Идемпотентен — отсутствие/
    невалидность токена не ошибка (logout всегда «успешен» для клиента)."""
    revoked = False
    if authorization and authorization.startswith("Bearer "):
        try:
            revoked = reg_dal.delete_session(authorization.split(" ", 1)[1])
        except Exception:
            revoked = False
    return {"ok": True, "revoked": revoked}


# ---------- Me endpoint ----------
@reg_router.get("/me")
def get_me(driver_id: str = Depends(get_current_driver)):
    """Возвращает текущего пользователя с уровнем доверия."""
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Не найден")
    return {
        "id": driver["id"],
        "phone": driver.get("phone"),
        "verification_level": driver.get("verification_level", 0) or 0,
        "role": driver.get("role", "guest"),
        "full_name": driver.get("full_name"),
        "status": driver.get("status"),
    }


# ---------- ЭТАП 1: WhatsApp авторизация ----------
@reg_router.post("/whatsapp/send")
def wa_send(req: SendCodeRequest, request: Request = None):
    """Отправка OTP через выбранный канал (whatsapp/sms/telegram).
    Endpoint сохраняет имя для обратной совместимости.

    Stage 24: gate'ит на consent=True и фиксирует audit-запись.
    Без явного согласия SMS не отправляется. Audit сохраняется
    ДО отправки кода — даже если verify не пройдёт, факт принятия
    оферты остаётся.
    """
    phone = req.phone.strip()
    phone_clean = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    if len(phone_clean.replace("+", "")) < 10:
        raise HTTPException(status_code=400, detail="Неверный формат номера")

    # Stage 24: consent gate — ровно тот же текст, что показывает UI.
    if not bool(req.consent):
        raise HTTPException(
            status_code=400,
            detail="Для регистрации необходимо принять условия сервиса.",
        )

    # Rate limit — не чаще 1/мин на phone, 5/час
    limit_otp_send(phone_clean)

    code = generate_code()
    reg_dal.save_code(phone_clean, code)

    # Stage 24: фиксируем согласие до фактической отправки SMS.
    ip = (request.client.host if request and request.client else None) if request else None
    ua = (request.headers.get("user-agent") if request else None) or None
    try:
        from database import consent_dal
        consent_dal.record_consent(
            phone=phone_clean,
            role=req.role,
            ip_address=ip,
            user_agent=ua,
            sms_provider=req.channel,
        )
    except Exception as e:
        # Не блокируем регистрацию из-за audit-сбоя, но логируем.
        print(f"[consent] failed to record audit phone={phone_clean[:5]}***: {e}", flush=True)

    result = otp_service.send_otp(phone_clean, code, channel=req.channel)

    # Stage 48: возвращаем РЕАЛЬНЫЙ статус доставки. Раньше тут стояло
    # `"sent": True` хардкодом — frontend всегда показывал "SMS отправлен",
    # даже если Mobizon отверг отправку (например code=8 при невалидном
    # apiKey или unauthorized sender). Owner на Android не получал SMS,
    # но видел экран ввода кода — отлаживать было невозможно.
    #
    # Теперь sent отражает фактический результат канала (delivered=True
    # ИЛИ mock=True для dev-режимов). Если все каналы упали и реально
    # ничего не ушло — sent=False + error с понятной причиной (не raw
    # backend-detail, а "delivery_failed" чтобы UI показал toast).
    delivered = bool(result.get("sent")) and not result.get("error")
    is_mock = bool(result.get("mock"))
    is_beta = bool(result.get("beta"))
    really_sent = delivered or is_mock or is_beta

    response = {
        "sent": really_sent,
        "phone": phone_clean,
        "channel": result.get("channel", req.channel),
        "mock": is_mock,
        "beta": is_beta,
        "code": result.get("code") if (is_mock or is_beta) else None,
        "deeplink": result.get("deeplink"),
    }
    if not really_sent:
        # Внешняя причина (бренд-нейтральная). Подробности — только в логах
        # сервера, не отдаём пользователю чтобы не светить структуру
        # провайдера. Frontend покажет понятный toast по error="delivery_failed".
        response["error"] = result.get("error") or "delivery_failed"
        try:
            attempts = result.get("attempts") or []
            print(
                f"[OTP] delivery failed phone={phone_clean[:5]}*** "
                f"channel={req.channel} attempts={attempts}",
                flush=True,
            )
        except Exception:
            pass
    return response


@reg_router.post("/otp/send")
def otp_send(req: SendCodeRequest, request: Request = None):
    """Универсальный OTP endpoint — псевдоним /whatsapp/send."""
    return wa_send(req, request=request)


@reg_router.post("/whatsapp/verify")
def wa_verify(req: VerifyCodeRequest, request: Request = None):
    """Проверка кода. Если валидный — создаёт driver + возвращает token.
    BETA_MODE: универсальный BETA_OTP_CODE принимает любой номер,
    auto-создаёт тест-профиль (role=driver, verification_level=2, score=75).
    """
    phone = req.phone.strip()
    phone_clean = "".join(ch for ch in phone if ch.isdigit() or ch == "+")

    # Rate limit — не больше 5 попыток /10 мин
    limit_otp_verify(phone_clean)

    # ── BETA BYPASS ──────────────────────────────────────────
    is_beta_login = BETA_MODE and req.code.strip() == BETA_OTP_CODE
    if not is_beta_login:
        if not reg_dal.check_code(phone_clean, req.code):
            raise HTTPException(status_code=400, detail="Неверный или истёкший код")
        reg_dal.delete_code(phone_clean)

    # Если пришёл guest-токен — апгрейдим существующую сессию
    guest_id = None
    if req.guest_token:
        guest_id = reg_dal.get_driver_by_token(req.guest_token)

    driver = reg_dal.get_or_create_driver(phone_clean, upgrade_guest_id=guest_id)

    # Beta — автозаполняем тест-профиль, чтобы сразу попасть в основной стек
    # (без прохождения селфи / документов / транспорта).
    if is_beta_login:
        last4 = phone_clean[-4:] if len(phone_clean) >= 4 else phone_clean
        tester_name = f"Тестер {last4}"
        updates = {}
        if not driver.get("full_name"):
            updates["full_name"] = tester_name
        if (driver.get("verification_level") or 0) < 2:
            updates["verification_level"] = 2
        if driver.get("role") in (None, "guest", "client"):
            updates["role"] = "driver"
        if not driver.get("security_score"):
            updates["security_score"] = 75
            updates["security_color"] = "green"
        if not driver.get("status") or driver.get("status") == "pending":
            updates["status"] = "approved"
        if updates:
            reg_dal.update_driver(driver["id"], updates)
            driver = reg_dal.get_driver(driver["id"]) or driver

        # Логирование beta-логинов: phone + timestamp + device (из UA)
        ua = (request.headers.get("user-agent") if request else "") or "unknown"
        ip = (request.client.host if (request and request.client) else "unknown")
        _beta_log.warning(f"[BETA] login phone={phone_clean} device={ua[:120]} ip={ip}")

    token = reg_dal.create_session(driver["id"])

    # Stage 24: подвязать user_id к consent-аудиту после успешного verify.
    try:
        from database import consent_dal
        consent_dal.attach_user_after_verify(phone=phone_clean, user_id=driver["id"])
    except Exception as e:
        print(f"[consent] attach_user failed: {e}", flush=True)

    # Welcome push (только при первом успешном логине — нет записей в push_log)
    try:
        from services import push_sender
        from database.db import get_conn
        with get_conn() as c:
            already = c.execute(
                "SELECT 1 FROM push_log WHERE user_id = ? AND kind = 'welcome' LIMIT 1",
                (driver["id"],),
            ).fetchone()
        if not already:
            push_sender.send(
                driver["id"],
                "👋 Добро пожаловать в UrTruck",
                "Опубликуйте первый груз или посмотрите ленту — всё бесплатно в бете.",
                kind="welcome",
                url="/",
            )
    except Exception as e:
        # Не валим регистрацию если push-канал отвалился
        import logging; logging.getLogger("push").warning(f"welcome push: {e}")

    return {
        "token": token,
        "driver_id": driver["id"],
        "user_id": driver["id"],
        "phone": driver["phone"],
        "current_step": driver.get("current_step") or "done",
        "verification_level": driver.get("verification_level", 1) or 1,
        "role": driver.get("role", "client"),
        "status": driver.get("status") or ("approved" if is_beta_login else "pending"),
        "beta": is_beta_login,
    }


# ---------- ЭТАП 2: Digital ID (селфи) ----------
@reg_router.post("/selfie")
async def upload_selfie(
    iin: str = Form(...),
    full_name: str = Form(...),
    file: UploadFile = File(...),
    driver_id: str = Depends(get_current_driver),
):
    """Загрузка селфи + ИИН + ФИО → Liveness + Face check."""
    # Валидация ИИН
    if not validate_iin_kz(iin):
        raise HTTPException(status_code=400, detail="Неверный формат ИИН")

    # Госреестр: проверка ИИН через egov.kz (MOCK или REAL)
    from verification.gov_check import check_iin_kz
    gov = check_iin_kz(iin)
    if not gov.get("valid"):
        raise HTTPException(status_code=400, detail=gov.get("error", "ИИН не прошёл проверку госреестра"))

    # Проверка на дубликат — один ИИН = один approved водитель
    dup = reg_dal.find_approved_by_iin(iin, exclude_id=driver_id)
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Этот ИИН уже зарегистрирован ({dup.get('full_name', '—')}). Обратитесь в поддержку.",
        )

    # Сохраняем фото в persistent storage
    data = await file.read()
    selfie_url = storage.save_image(data, "selfies")
    selfie_path = storage.get_local_path(selfie_url)

    # Liveness
    live = check_liveness(selfie_path)
    if not live.get("liveness_passed"):
        raise HTTPException(
            status_code=400,
            detail=f"Не удалось подтвердить живость: {live.get('reason', 'плохое фото')}",
        )

    birthdate = extract_birthdate_from_iin(iin)

    reg_dal.update_driver(driver_id, {
        "iin": iin,
        "full_name": full_name.strip(),
        "selfie_url": selfie_url,
        "face_verified": 1 if live.get("liveness_passed") else 0,
        "face_quality": live.get("confidence", 0),
        "current_step": 3,
        "verification_level": 2,  # identity verified
    })

    db.log_verification(driver_id, "biometric", "liveness",
                         "pass" if live.get("liveness_passed") else "fail",
                         live, 10 if live.get("liveness_passed") else -5)

    return {
        "step": 3,
        "face_verified": True,
        "liveness_confidence": live.get("confidence", 0),
        "birthdate": birthdate,
        "next": "documents",
    }


# ---------- Личное фото (Personal Info, шаг 1) ----------
@reg_router.post("/photo")
async def upload_personal_photo(
    file: UploadFile = File(...),
    driver_id: str = Depends(get_current_driver),
):
    """Личное фото водителя из IdentityStep. Сохраняем файл в storage
    (local/supabase/s3), в БД пишем ТОЛЬКО ключ/URL (не raw base64). Это
    портрет профиля — liveness/face здесь НЕ проверяем (биометрия — отдельный
    шаг /selfie). raw-картинку и ИИН не логируем; возвращаем только публичный
    ключ файла (не приватный signed URL)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    photo_url = storage.save_image(data, "personal_photos")
    reg_dal.update_driver(driver_id, {"personal_photo_url": photo_url})
    return {"personal_photo_key": photo_url}


# ---------- ЭТАП 3: Документы (права + техпаспорт) ----------
@reg_router.post("/license-selfie")
async def upload_license_selfie(
    file: UploadFile = File(...),
    driver_id: str = Depends(get_current_driver),
):
    """Селфи с водительскими правами в руках — антифрод-артефакт для модерации.
    Сохраняем файл в storage, в БД пишем ТОЛЬКО ключ/URL (не raw base64).
    Liveness/face здесь НЕ проверяем (это не биометрия-гейт). raw/ИИН не
    логируем; возвращаем публичный ключ файла (не приватный signed URL)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    url = storage.save_image(data, "license_selfies")
    reg_dal.update_driver(driver_id, {"license_selfie_url": url})
    return {"license_selfie_key": url}


# ---------- ЭТАП 6: Фото авто (снаружи) + салона/кабины ----------
@reg_router.post("/vehicle-photo")
async def upload_vehicle_photo(
    file: UploadFile = File(...),
    driver_id: str = Depends(get_current_driver),
):
    """Фото авто снаружи. Store-only: файл в storage, в БД ТОЛЬКО ключ
    vehicle_photo_url (не raw base64). Отдельно от legacy /vehicle (там
    plate-dedup 409). raw/ИИН не логируем; возвращаем публичный ключ файла
    (не приватный signed URL)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    url = storage.save_image(data, "vehicle_photos")
    reg_dal.update_driver(driver_id, {"vehicle_photo_url": url})
    return {"vehicle_photo_key": url}


@reg_router.post("/cabin-photo")
async def upload_cabin_photo(
    file: UploadFile = File(...),
    driver_id: str = Depends(get_current_driver),
):
    """Фото салона/кабины. Store-only: файл в storage, в БД ТОЛЬКО ключ
    cabin_photo_url (не raw base64). raw/ИИН не логируем; возвращаем публичный
    ключ файла."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    url = storage.save_image(data, "cabin_photos")
    reg_dal.update_driver(driver_id, {"cabin_photo_url": url})
    return {"cabin_photo_key": url}


@reg_router.post("/documents/license")
async def upload_license(
    file: UploadFile = File(...),
    lang: Optional[str] = Form(None),
    driver_id: str = Depends(get_current_driver),
):
    """Фото водительских прав → OCR (KZ/RU/CN/UZ шаблоны)."""
    data = await file.read()
    license_url = storage.save_image(data, "licenses")
    path = storage.get_local_path(license_url)

    from ocr.license_reader import extract_license_data
    lic = extract_license_data(path)  # license_reader пока без ui_lang — Step 2
    license_data = {
        "license_number": lic.get("license_number"),
        "categories": lic.get("categories", []),
        "has_c_ce": lic.get("has_c_ce", False),
        "issue_date": lic.get("issue_date"),
        "expiry_date": lic.get("expiry_date"),
        "birth_date": lic.get("birth_date"),
        "fio": lic.get("fio"),
        "experience_years": lic.get("experience_years"),
        "expired": lic.get("expired"),
        "ocr_confidence": lic.get("confidence", 0),
        "raw_text": (lic.get("raw_text") or "")[:500],
    }
    categories = license_data["categories"]

    # Face match: сравниваем лицо на правах с селфи
    face_match_result = None
    manual_review = False
    driver_rec = reg_dal.get_driver(driver_id)
    selfie_url = driver_rec.get("selfie_url") if driver_rec else None
    if selfie_url:
        selfie_local = storage.get_local_path(selfie_url)
        if selfie_local:
            try:
                face_match_result = face_match(selfie_local, path)
                if face_match_result.get("error"):
                    raise RuntimeError(face_match_result["error"])
            except Exception as e:
                print(f"[Face match] Ошибка сравнения лиц: {e}")
                face_match_result = {"match": None, "score": 0, "status": "manual_review_required", "error": str(e)}
                manual_review = True

    update = {
        "license_url": license_url,
        "license_ocr": license_data,
        "license_verified": 1 if len(categories) > 0 else 0,
    }
    if face_match_result:
        update["face_match_score"] = face_match_result.get("score", 0)
    if manual_review:
        update["manual_review_required"] = 1
    reg_dal.update_driver(driver_id, update)

    return {
        "verified": len(categories) > 0,
        "categories": license_data["categories"],
        "has_c_ce": license_data["has_c_ce"],
        "experience_years": license_data["experience_years"],
        # PR-V4: отдаём распознанные даты/номер, чтобы клиент сохранил их в
        # draft (license_issue_date / license_expiry участвуют в submit-скоринге;
        # без них водитель уходит в red/manual_review). raw_text НЕ отдаём.
        "issue_date": license_data["issue_date"],
        "expiry_date": license_data["expiry_date"],
        "license_number": license_data["license_number"],
        "face_match": face_match_result,
        "manual_review": manual_review,
    }


@reg_router.post("/documents/passport")
async def upload_passport(
    file: UploadFile = File(...),
    lang: Optional[str] = Form(None),
    driver_id: str = Depends(get_current_driver),
):
    """Фото техпаспорта → Tesseract OCR (RU/KZ/CN/UZ/EN)."""
    raw = await file.read()
    passport_url = storage.save_image(raw, "passports")
    path = storage.get_local_path(passport_url)

    data = extract_passport_data(path, ui_lang=lang)
    ocr_result = {
        "plate_number": data.get("plate_number"),
        "vin": data.get("vin"),
        "year": data.get("year"),
        "brand": data.get("brand"),
        "model": data.get("model"),
        "confidence": data.get("confidence", 0),
    }

    reg_dal.update_driver(driver_id, {
        "passport_url": passport_url,
        "passport_ocr": ocr_result,
        "passport_verified": 1 if data.get("confidence", 0) >= 0.3 else 0,
        "current_step": 4,
    })

    return {
        "verified": ocr_result["confidence"] >= 0.3,
        "extracted": ocr_result,
        "next": "vehicle",
    }


# ---------- ЭТАП 4: Транспорт ----------
@reg_router.post("/vehicle")
async def save_vehicle(
    vehicle_type: str = Form(...),
    capacity_kg: int = Form(...),
    plate: str = Form(""),
    brand: str = Form(""),
    year: int = Form(0),
    photo: Optional[UploadFile] = File(None),
    driver_id: str = Depends(get_current_driver),
):
    """Сохранение данных ТС + фото."""
    # Дубль plate — один номер = один approved водитель
    if plate:
        dup = reg_dal.find_approved_by_plate(plate, exclude_id=driver_id)
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Этот госномер уже зарегистрирован ({dup.get('full_name', '—')}).",
            )
    photo_url = None
    if photo:
        raw = await photo.read()
        photo_url = storage.save_image(raw, "vehicles")

    reg_dal.update_driver(driver_id, {
        "vehicle_type": vehicle_type,
        "vehicle_capacity_kg": capacity_kg,
        "vehicle_plate": plate or None,
        "vehicle_brand": brand or None,
        "vehicle_year": year or None,
        "vehicle_photo_url": photo_url,
        "current_step": 5,
    })

    return {"step": 5, "next": "moderation"}


# ---------- ЭТАП 5: Автомодерация + итоговый скоринг ----------
@reg_router.post("/moderate")
def run_moderation(driver_id: str = Depends(get_current_driver)):
    """
    Автоматическая модерация:
    - Проверка всех этапов
    - Запуск скоринга 0-100
    - Auto-approve если все проверки пройдены
    """
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    # Считаем quality score модерации (0-1)
    score_parts = {
        "whatsapp": 1.0 if driver["whatsapp_verified"] else 0.0,
        "face": float(driver["face_quality"] or 0),
        "iin": 1.0 if driver["iin"] and validate_iin_kz(driver["iin"]) else 0.0,
        "license": 1.0 if driver["license_verified"] else 0.4,
        "passport": 1.0 if driver["passport_verified"] else 0.4,
        "vehicle": 1.0 if driver["vehicle_type"] else 0.0,
    }
    moderation_score = sum(score_parts.values()) / len(score_parts)
    auto_approve_threshold = 0.75

    # Запускаем полный скоринг безопасности
    passport_ocr = {}
    try:
        passport_ocr = json.loads(driver["passport_ocr"] or "{}")
    except Exception:
        pass

    license_ocr = {}
    try:
        license_ocr = json.loads(driver["license_ocr"] or "{}")
    except Exception:
        pass

    # Компоненты скоринга
    identity = 40 + (25 if driver["license_verified"] else 0) + (20 if driver["face_verified"] else 0)
    experience = 30 + (license_ocr.get("experience_years", 0) or 0) * 5
    vehicle_age = None
    if passport_ocr.get("year"):
        from datetime import datetime
        vehicle_age = datetime.now().year - passport_ocr["year"]
    vehicle_score = 80 - (max(0, (vehicle_age or 0) - 10) * 3)

    # Blacklist check
    from database.db import blacklist_check
    bl = blacklist_check(phone=driver["phone"], plate=passport_ocr.get("plate_number"),
                          name=driver["full_name"])
    if bl:
        status = "rejected"
        total_score = 0
        color = "black"
        rejected_reason = f"В blacklist: {bl[0].get('reason', 'unknown')}"
        auto_approved = False
    else:
        scoring_result = calculate_score(driver_id, {
            "identity": min(100, identity),
            "reputation": 50,
            "social": 60,
            "experience": min(100, experience),
            "vehicle": max(20, min(100, vehicle_score)),
            "financial": 60,
            "bonus": 10,
            "phone": driver["phone"],
            "plate": passport_ocr.get("plate_number"),
        })
        total_score = scoring_result["total_score"]
        color = scoring_result["color_code"]
        status = "approved" if moderation_score >= auto_approve_threshold else "under_review"
        rejected_reason = None
        auto_approved = status == "approved"

    # Если был manual_review_required от face_match — не auto-approve
    if driver.get("manual_review_required"):
        status = "manual_review"
        auto_approved = False

    update_fields = {
        "moderation_score": moderation_score,
        "security_score": total_score,
        "security_color": color,
        "status": status,
        "auto_approved": 1 if auto_approved else 0,
        "rejected_reason": rejected_reason,
        "approved_at": "CURRENT_TIMESTAMP" if auto_approved else None,
    }
    # Уровень 3 — полноценный водитель — только при auto_approve
    if auto_approved:
        update_fields["verification_level"] = 3
        update_fields["role"] = "driver"
    reg_dal.update_driver(driver_id, update_fields)

    # Push-триггер
    try:
        from api.push import send_to_user
        if auto_approved:
            send_to_user(driver_id, "🎉 UrTruck", "Регистрация завершена! Можно начинать работать.", url="/")
        elif status == "manual_review":
            send_to_user(driver_id, "⏳ UrTruck", "Документы на ручной проверке. Ответ в течение часа.", url="/profile")
        elif status == "rejected":
            send_to_user(driver_id, "⛔ UrTruck", f"Регистрация отклонена: {rejected_reason}", url="/profile")
    except Exception as e:
        print(f"[push] moderate failed: {e}")

    return {
        "status": status,
        "moderation_score": round(moderation_score, 2),
        "auto_approved": auto_approved,
        "security_score": total_score,
        "security_color": color,
        "breakdown": score_parts,
        "rejected_reason": rejected_reason,
        "manual_review_required": bool(driver.get("manual_review_required")),
    }


# ---------- Status endpoint ----------
@reg_router.get("/status")
def get_status(driver_id: str = Depends(get_current_driver)):
    """Получить текущий статус регистрации."""
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Не найден")
    # Очищаем пути файлов (безопасность)
    safe = {k: v for k, v in driver.items() if not k.endswith("_url")}
    safe["has_selfie"] = bool(driver.get("selfie_url"))
    safe["has_license"] = bool(driver.get("license_url"))
    safe["has_passport"] = bool(driver.get("passport_url"))
    safe["has_vehicle_photo"] = bool(driver.get("vehicle_photo_url"))
    return safe


@reg_router.get("/online")
def online_count():
    """Число активных сессий за последние 15 минут (для social proof)."""
    from database.db import get_conn
    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(minutes=15)).isoformat()
    with get_conn() as c:
        # Сессии, обновлённые за последние 15 минут
        row = c.execute(
            "SELECT COUNT(DISTINCT driver_id) AS cnt FROM reg_sessions WHERE created_at > ?",
            (cutoff,),
        ).fetchone()
        # Плюс общее кол-во approved водителей (показываем как "всего доверенных")
        row2 = c.execute(
            "SELECT COUNT(*) AS cnt FROM drivers_registration WHERE status = 'approved'",
        ).fetchone()
    online = row["cnt"] if row else 0
    approved = row2["cnt"] if row2 else 0
    # Для демки: базовый floor 450+ + реальные живые
    display_online = max(online, 47 + (online % 20))  # demo base + variance
    display_total = max(approved, 520)
    return {
        "online_now": display_online,
        "total_approved": display_total,
        "real_online": online,
        "real_approved": approved,
    }


@reg_router.get("/info")
def info():
    """Информация о режиме сервиса."""
    return {
        "service": "Driver Registration",
        "whatsapp_mode": "MOCK" if MOCK_MODE else "REAL (Meta Cloud API)",
        "steps": ["whatsapp_auth", "digital_id", "documents", "vehicle", "moderation"],
        "auto_approve_threshold": 0.75,
    }
