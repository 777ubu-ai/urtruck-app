"""Регрессия C1.3: temp-файлы upload-эндпоинтов ВСЕГДА удаляются.

Аудит: /ocr/passport, /biometric/liveness, /biometric/face_match,
/parsers/whatsapp_screenshot (api/routes.py) и license-selfie
(api/registration.py) писали во NamedTemporaryFile(delete=False);
routes.py не удалял файлы никогда, registration.py — только на happy path.
Тест monkeypatch'ит обработчики и проверяет, что temp-файла не остаётся
ни при успехе, ни при исключении обработчика.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _authed_client(router, driver):
    """TestClient, где ВСЕ зависимости маршрутов заменены фиктивным driver.

    Через app.dependency_overrides — канонический механизм FastAPI: работает
    даже когда другие тесты навсегда подменили verification_gate.require_level
    (test_deal_country_guard.py делает plain- assignment без восстановления),
    потому что override навешивается на фактически зарегистрированный call.
    """
    app = FastAPI()
    app.include_router(router)
    for route in app.routes:
        dependant = getattr(route, "dependant", None)
        if dependant is None:
            continue
        for dep in dependant.dependencies:
            if dep.call is not None:
                app.dependency_overrides[dep.call] = lambda: driver
    return TestClient(app, raise_server_exceptions=False)


AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture
def authed_client():
    from api import routes as r

    return _authed_client(
        r.router, {"id": "driver-test-1", "verification_level": 1}
    )


# ---------- /ocr/passport ----------

def test_ocr_passport_removes_temp_on_success(monkeypatch, authed_client):
    from api import routes as r

    seen = {}

    def fake_extract(path):
        seen["path"] = path
        return {"success": True, "confidence": 0.9}

    monkeypatch.setattr(r, "extract_passport_data", fake_extract)
    monkeypatch.setattr(r.db, "save_ocr", lambda *a, **k: None)

    resp = authed_client.post(
        "/ocr/passport?user_id=driver-test-1",
        headers=AUTH,
        files={"file": ("p.jpg", b"jpg-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200
    assert seen, "обработчик не вызван"
    assert not os.path.exists(seen["path"]), "temp-файл остался после успеха"


def test_ocr_passport_removes_temp_on_exception(monkeypatch, authed_client):
    from api import routes as r

    seen = {}

    def fake_extract(path):
        seen["path"] = path
        raise RuntimeError("OCR backend down")

    monkeypatch.setattr(r, "extract_passport_data", fake_extract)
    monkeypatch.setattr(r.db, "save_ocr", lambda *a, **k: None)

    resp = authed_client.post(
        "/ocr/passport?user_id=driver-test-1",
        headers=AUTH,
        files={"file": ("p.jpg", b"jpg-bytes", "image/jpeg")},
    )
    assert resp.status_code == 500
    assert seen, "обработчик не вызван"
    assert not os.path.exists(seen["path"]), "temp-файл остался после исключения"


# ---------- /biometric/liveness ----------

def _liveness_client(monkeypatch, result):
    from api import routes as r
    from biometrics import liveness as live_mod

    seen = {}

    def fake_check(path):
        seen["path"] = path
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(live_mod, "check_liveness", fake_check)
    monkeypatch.setattr(r.db, "log_verification", lambda *a, **k: None)
    return _authed_client(
        r.router, {"id": "driver-test-1", "verification_level": 1}
    ), seen


def test_liveness_removes_temp_on_success(monkeypatch):
    client, seen = _liveness_client(monkeypatch, {"liveness_passed": True})
    resp = client.post(
        "/biometric/liveness?user_id=driver-test-1",
        headers=AUTH,
        files={"file": ("s.jpg", b"selfie", "image/jpeg")},
    )
    assert resp.status_code == 200
    assert seen and not os.path.exists(seen["path"])


def test_liveness_removes_temp_on_exception(monkeypatch):
    client, seen = _liveness_client(monkeypatch, RuntimeError("face lib down"))
    resp = client.post(
        "/biometric/liveness?user_id=driver-test-1",
        headers=AUTH,
        files={"file": ("s.jpg", b"selfie", "image/jpeg")},
    )
    assert resp.status_code == 500
    assert seen and not os.path.exists(seen["path"])


# ---------- /biometric/face_match ----------

def _face_match_client(monkeypatch, result):
    from api import routes as r
    from biometrics import liveness as live_mod

    seen = {}

    def fake_match(p1, p2):
        seen["paths"] = (p1, p2)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(live_mod, "face_match", fake_match)
    monkeypatch.setattr(r.db, "log_verification", lambda *a, **k: None)
    return _authed_client(
        r.router, {"id": "driver-test-1", "verification_level": 1}
    ), seen


def test_face_match_removes_both_temps_on_success(monkeypatch):
    client, seen = _face_match_client(monkeypatch, {"match": True})
    resp = client.post(
        "/biometric/face_match?user_id=driver-test-1",
        headers=AUTH,
        files={
            "selfie": ("s.jpg", b"selfie", "image/jpeg"),
            "document": ("d.jpg", b"doc", "image/jpeg"),
        },
    )
    assert resp.status_code == 200
    assert len(seen["paths"]) == 2
    assert all(not os.path.exists(p) for p in seen["paths"])


def test_face_match_removes_both_temps_on_exception(monkeypatch):
    client, seen = _face_match_client(monkeypatch, RuntimeError("match backend down"))
    resp = client.post(
        "/biometric/face_match?user_id=driver-test-1",
        headers=AUTH,
        files={
            "selfie": ("s.jpg", b"selfie", "image/jpeg"),
            "document": ("d.jpg", b"doc", "image/jpeg"),
        },
    )
    assert resp.status_code == 500
    assert len(seen["paths"]) == 2
    assert all(not os.path.exists(p) for p in seen["paths"])


# ---------- /parsers/whatsapp_screenshot ----------

def _wa_client(monkeypatch, result):
    from api import routes as r
    from parsers import whatsapp_monitor as wa

    seen = {}

    def fake_process(path):
        seen["path"] = path
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(wa, "process_screenshot", fake_process)
    return _authed_client(
        r.router, {"id": "driver-test-1", "verification_level": 1}
    ), seen


def test_whatsapp_screenshot_removes_temp_on_success(monkeypatch):
    client, seen = _wa_client(monkeypatch, {"success": True, "text": "hi"})
    resp = client.post(
        "/parsers/whatsapp_screenshot",
        headers=AUTH,
        files={"file": ("w.jpg", b"shot", "image/jpeg")},
    )
    assert resp.status_code == 200
    assert seen and not os.path.exists(seen["path"])


def test_whatsapp_screenshot_removes_temp_on_exception(monkeypatch):
    client, seen = _wa_client(monkeypatch, RuntimeError("OCR failed"))
    resp = client.post(
        "/parsers/whatsapp_screenshot",
        headers=AUTH,
        files={"file": ("w.jpg", b"shot", "image/jpeg")},
    )
    assert resp.status_code == 500
    assert seen and not os.path.exists(seen["path"])


# ---------- registration /license-selfie ----------

def _reg_client(monkeypatch, liveness_result):
    from api import registration as reg

    seen = {}

    def fake_check(path):
        seen["path"] = path
        if isinstance(liveness_result, Exception):
            raise liveness_result
        return liveness_result

    monkeypatch.setattr(reg, "check_liveness", fake_check)
    monkeypatch.setattr(reg.storage, "save_image", lambda data, cat: f"mock://{cat}/k")
    monkeypatch.setattr(reg.storage, "save_file",
                        lambda data, cat, ext=None, content_type=None: f"mock://{cat}/k.{ext}")
    monkeypatch.setattr(reg.reg_dal, "update_driver", lambda did, fields: None)

    return _authed_client(reg.reg_router, "driver-test-1"), seen


_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def test_license_selfie_removes_temp_when_liveness_raises(monkeypatch):
    """Инфра-ошибка биометрии глушится (fail-open), но temp-файл обязан удалиться."""
    client, seen = _reg_client(monkeypatch, RuntimeError("face lib down"))
    resp = client.post(
        "/license-selfie",
        headers={"Authorization": "Bearer t"},
        files={"file": ("l.jpg", _JPEG, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert seen and not os.path.exists(seen["path"])


def test_license_selfie_removes_temp_on_face_rejected(monkeypatch):
    client, seen = _reg_client(monkeypatch, {"liveness_passed": False, "reason": "Лицо не обнаружено"})
    resp = client.post(
        "/license-selfie",
        headers={"Authorization": "Bearer t"},
        files={"file": ("l.jpg", _JPEG, "image/jpeg")},
    )
    assert resp.status_code == 400
    assert seen and not os.path.exists(seen["path"])


def test_license_selfie_removes_temp_on_success(monkeypatch):
    client, seen = _reg_client(monkeypatch, {"liveness_passed": True})
    resp = client.post(
        "/license-selfie",
        headers={"Authorization": "Bearer t"},
        files={"file": ("l.jpg", _JPEG, "image/jpeg")},
    )
    assert resp.status_code == 200
    assert seen and not os.path.exists(seen["path"])


# ---------- юнит-тест guard ----------

def test_temp_upload_file_removes_on_success():
    from services.tempfile_guard import temp_upload_file

    with temp_upload_file(b"data") as path:
        assert os.path.exists(path)
        assert Path(path).read_bytes() == b"data"
    assert not os.path.exists(path)


def test_temp_upload_file_removes_on_exception():
    from services.tempfile_guard import temp_upload_file

    captured = {}
    with pytest.raises(ValueError):
        with temp_upload_file(b"data") as path:
            captured["path"] = path
            raise ValueError("boom")
    assert not os.path.exists(captured["path"])
