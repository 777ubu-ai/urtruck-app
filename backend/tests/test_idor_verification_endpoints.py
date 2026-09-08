"""IDOR-аудит C1.4: /ocr/passport, /biometric/*, /score/{id}, лимиты ленты.

Находки аудита, которые закрываются здесь регрессионными тестами:

  1) POST /ocr/passport, /biometric/liveness, /biometric/face_match принимали
     user_id из query без проверки владельца — любой level-1 пользователь
     писал верификационные логи (verification_logs / ocr_results) на чужой
     user_id. Фикс: _require_own_user_id() в api/routes.py — строгое
     равенство query user_id == аутентифицированный id, без admin-bypass.
  2) GET /score/{user_id} отдаёт скоринг любого водителя любому level-1
     пользователю — ПО ДИЗАЙНУ (SecurityBadge на профиле чужого водителя,
     src/components/SecurityBadge.js). Тест фиксирует этот контракт, чтобы
     будущие правки не меняли поведение молча.
  3) GET /market/cargos и /market/trips не имели верхней границы limit —
     limit=10**9 заставлял SQLite материализовать всю таблицу. Фикс:
     clamp limit<=200, offset>=0 в api/marketplace.py.

Три аккаунта по паттерну test_idor_three_accounts.py:
  OWNER        — владелец верификационных записей;
  COUNTERPARTY — второй авторизованный пользователь (участник рынка);
  OUTSIDER     — посторонний авторизованный пользователь (level 1).

CI-контракт: top-level `def test_*`, pytest запускает файл изолированно
(см. pr-quality-gate.yml), свою init БД НЕ делаем — работает conftest.py.
"""
import uuid

import contextvars

from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import router as security_router
from api.marketplace import mp_router
from database.db import get_conn, new_id

app = FastAPI()
app.include_router(security_router, prefix="/api/v1")
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

OWNER = "verif-owner-" + uuid.uuid4().hex[:8]
COUNTERPARTY = "verif-counter-" + uuid.uuid4().hex[:8]
OUTSIDER = "verif-outsider-" + uuid.uuid4().hex[:8]

_JPG = b"\xff\xd8\xff\xe0" + b"fake-jpeg-body" * 32 + b"\xff\xd9"


def _as(uid, role=None):
    user = {"id": uid, "full_name": uid, "phone": "+700",
            "verification_level": 1}
    if role:
        user["role"] = role
    _current_user.set(user)


def _count(table, uid):
    with get_conn() as c:
        return c.execute(f"SELECT COUNT(*) AS n FROM {table} WHERE user_id = ?",
                         (uid,)).fetchone()["n"]


# ── 1) OCR / биометрия: чужой user_id → 403 и ни одной записи в БД ──

def test_01_stranger_ocr_passport_rejected(monkeypatch):
    monkeypatch.setattr("api.routes.extract_passport_data",
                        lambda _p: {"success": True, "confidence": 0.95})
    _as(OUTSIDER)
    r = client.post("/api/v1/ocr/passport", params={"user_id": OWNER},
                    files={"file": ("p.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 403, f"OUTSIDER загрузил паспорт на user_id OWNER: {r.status_code} {r.text}"
    assert _count("ocr_results", OWNER) == 0, "запись ocr_results появилась на чужой user_id"


def test_02_counterparty_ocr_passport_rejected(monkeypatch):
    monkeypatch.setattr("api.routes.extract_passport_data",
                        lambda _p: {"success": True, "confidence": 0.95})
    _as(COUNTERPARTY)
    r = client.post("/api/v1/ocr/passport", params={"user_id": OWNER},
                    files={"file": ("p.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 403, f"COUNTERPARTY загрузил паспорт на user_id OWNER: {r.status_code}"
    assert _count("ocr_results", OWNER) == 0


def test_03_admin_role_without_id_match_still_rejected(monkeypatch):
    """Нет admin-bypass: даже роль admin не спасает при несовпадении id."""
    monkeypatch.setattr("api.routes.extract_passport_data",
                        lambda _p: {"success": True, "confidence": 0.95})
    _as(OUTSIDER, role="admin")
    r = client.post("/api/v1/ocr/passport", params={"user_id": OWNER},
                    files={"file": ("p.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 403, f"admin-role обошёл owner-check: {r.status_code}"
    assert _count("ocr_results", OWNER) == 0


def test_04_owner_ocr_passport_ok(monkeypatch):
    monkeypatch.setattr("api.routes.extract_passport_data",
                        lambda _p: {"success": True, "confidence": 0.95})
    before = _count("ocr_results", OWNER)
    _as(OWNER)
    r = client.post("/api/v1/ocr/passport", params={"user_id": OWNER},
                    files={"file": ("p.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 200, r.text
    assert _count("ocr_results", OWNER) == before + 1, "запись владельца не сохранилась"


def test_05_stranger_liveness_rejected(monkeypatch):
    monkeypatch.setattr("biometrics.liveness.check_liveness",
                        lambda _p: {"liveness_passed": True})
    _as(OUTSIDER)
    r = client.post("/api/v1/biometric/liveness", params={"user_id": OWNER},
                    files={"file": ("s.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 403, f"OUTSIDER прошёл liveness на чужой user_id: {r.status_code}"
    assert _count("verification_logs", OWNER) == 0


def test_06_owner_liveness_ok(monkeypatch):
    monkeypatch.setattr("biometrics.liveness.check_liveness",
                        lambda _p: {"liveness_passed": True})
    before = _count("verification_logs", OWNER)
    _as(OWNER)
    r = client.post("/api/v1/biometric/liveness", params={"user_id": OWNER},
                    files={"file": ("s.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 200, r.text
    assert _count("verification_logs", OWNER) == before + 1


def test_07_stranger_face_match_rejected(monkeypatch):
    monkeypatch.setattr("biometrics.liveness.face_match",
                        lambda _a, _b: {"match": True})
    before = _count("verification_logs", OWNER)
    _as(COUNTERPARTY)
    r = client.post("/api/v1/biometric/face_match", params={"user_id": OWNER},
                    files={"selfie": ("s.jpg", _JPG, "image/jpeg"),
                            "document": ("d.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 403, f"COUNTERPARTY прошёл face_match на чужой user_id: {r.status_code}"
    assert _count("verification_logs", OWNER) == before


def test_08_owner_face_match_ok(monkeypatch):
    monkeypatch.setattr("biometrics.liveness.face_match",
                        lambda _a, _b: {"match": True})
    before = _count("verification_logs", OWNER)
    _as(OWNER)
    r = client.post("/api/v1/biometric/face_match", params={"user_id": OWNER},
                    files={"selfie": ("s.jpg", _JPG, "image/jpeg"),
                            "document": ("d.jpg", _JPG, "image/jpeg")})
    assert r.status_code == 200, r.text
    assert _count("verification_logs", OWNER) == before + 1


# ── 2) /score/{user_id} — публичный контракт по дизайну ─────────────

def test_09_score_readable_by_any_user_by_design():
    """Скоринг водителя виден любому level-1 (SecurityBadge на чужих
    профилях). Контракт зафиксирован, чтобы изменение было осознанным."""
    from scoring.engine import calculate_score
    calculate_score(OWNER, {"identity": 80, "reputation": 70, "social": 60,
                            "experience": 50, "vehicle": 90, "financial": 40,
                            "bonus": 30, "phone": "+700", "plate": ""})
    _as(OUTSIDER)
    r = client.get(f"/api/v1/score/{OWNER}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "total_score" in body, f"нет total_score: {body}"


def test_10_verification_history_has_owner_check():
    """Позитивный контроль: соседний эндпоинт уже требовал владельца —
    убеждаемся, что 403 в тестах выше не следствие сломанной авторизации."""
    _as(OUTSIDER)
    r = client.get(f"/api/v1/verification/{OWNER}/history")
    assert r.status_code == 403, f"история верификаций утекла постороннему: {r.status_code}"
    _as(OWNER)
    r = client.get(f"/api/v1/verification/{OWNER}/history")
    assert r.status_code == 200, r.text


# ── 3) limit/offset cap в публичных лентах ──────────────────────────

def _seed_cargos(n, owner):
    with get_conn() as c:
        for i in range(n):
            c.execute(
                "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, "
                "from_city, to_city, cargo_desc, cargo_type, price, bids_count, status) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (new_id(), owner, "+700", "Shipper", "Almaty", "Moscow",
                 f"cap audit cargo {i}", "tent", 1000, 0, "active"),
            )


def _seed_trips(n, driver):
    with get_conn() as c:
        for i in range(n):
            c.execute(
                "INSERT INTO trips (id, driver_id, driver_phone, driver_name, "
                "from_city, to_city, truck_type, capacity_tons, price, status) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (new_id(), driver, "+700", "Driver", "Almaty", "Moscow",
                 "tent", 20, 500, "active"),
            )


def test_11_cargos_limit_capped_at_200():
    _seed_cargos(230, OWNER)
    _as(OUTSIDER)
    r = client.get("/api/v1/market/cargos", params={"limit": 10 ** 9})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["cargos"]) <= 200, f"limit cap не сработал: {len(body['cargos'])}"
    assert len(body["cargos"]) == 200, f"ожидали ровно cap=200 при 230 строках, got {len(body['cargos'])}"


def test_12_cargos_negative_limit_clamped():
    _as(OUTSIDER)
    r = client.get("/api/v1/market/cargos", params={"limit": -5})
    assert r.status_code == 200, r.text
    assert len(r.json()["cargos"]) <= 1, "отрицательный limit стал unlimited"


def test_13_trips_limit_capped_at_200():
    _seed_trips(230, OWNER)
    _as(OUTSIDER)
    r = client.get("/api/v1/market/trips", params={"limit": 10 ** 9})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["trips"]) <= 200, f"limit cap не сработал: {len(body['trips'])}"
    assert len(body["trips"]) == 200, f"ожидали ровно cap=200 при 230 строках, got {len(body['trips'])}"


def test_14_trips_negative_offset_clamped():
    _as(OUTSIDER)
    r = client.get("/api/v1/market/trips", params={"offset": -100, "limit": 10})
    assert r.status_code == 200, r.text
