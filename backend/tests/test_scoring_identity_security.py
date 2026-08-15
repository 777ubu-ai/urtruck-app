"""SEC-003: scoring, OCR and biometric subject-binding regressions."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_scoring_identity_security.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import marketplace
from api import registration
from api import routes
from api.routes import router
from biometrics import liveness as liveness_module
from database import db as ddb
from database import registration_dal as reg_dal
from database import reviews_dal
from database.db import get_conn
from scoring.engine import calculate_score


ddb.init_db()
reg_dal.init_registration_schema()
reviews_dal.init_reviews_schema()
marketplace._init()

app = FastAPI()
app.include_router(router, prefix="/api/v1")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_state():
    ddb.init_db()
    reg_dal.init_registration_schema()
    reviews_dal.init_reviews_schema()
    marketplace._init()
    with get_conn() as c:
        for table in (
            "ocr_results", "verification_logs", "driver_scores", "reviews",
            "deals", "reg_sessions", "drivers_registration", "telegram_mentions",
        ):
            c.execute(f"DELETE FROM {table}")


def _user(phone: str, role: str = "driver", **updates) -> tuple[str, str]:
    user = reg_dal.get_or_create_driver(phone)
    reg_dal.update_driver(user["id"], {"role": role, "verification_level": 1, **updates})
    return user["id"], reg_dal.create_session(user["id"])


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _image_part(name: str = "image.jpg") -> dict:
    return {"file": (name, b"not-a-real-image", "image/jpeg")}


def test_check_full_rejects_victim_user_id_without_writing_score():
    _, attacker_token = _user("sec003-attacker@example.invalid")
    victim_id, _ = _user("sec003-victim@example.invalid")

    response = client.post(
        "/api/v1/check/full",
        headers=_headers(attacker_token),
        json={"user_id": victim_id},
    )

    assert response.status_code == 403
    assert ddb.get_score(victim_id) is None
    assert ddb.get_logs(victim_id) == []


@pytest.mark.parametrize(
    "untrusted_fact",
    [
        {"positive_reviews": 1000},
        {"negative_reviews": -1000},
        {"completed_trips": 1000},
        {"experience_years": 50},
        {"phone": "+70000000000"},
        {"plate": "FAKE777"},
    ],
)
def test_check_full_forbids_client_supplied_scoring_facts(untrusted_fact):
    user_id, token = _user("sec003-self@example.invalid")
    response = client.post(
        "/api/v1/check/full",
        headers=_headers(token),
        json={"user_id": user_id, **untrusted_fact},
    )
    assert response.status_code == 422
    assert ddb.get_score(user_id) is None


def test_self_scoring_uses_server_profile_deals_and_reviews():
    driver_id, token = _user(
        "sec003-profile@example.invalid",
        vehicle_plate="SERVER123",
        vehicle_year=2022,
        passport_verified=1,
        face_verified=1,
        license_ocr={"experience_years": 8},
    )
    shipper_id, _ = _user("sec003-shipper@example.invalid", role="client")
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals(id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
                "VALUES ('sec003-deal', 'sec003-bid', ?, ?, 'A', 'B', 100, 'completed')",
            (shipper_id, driver_id),
        )
        c.execute(
            "INSERT INTO reviews(id, trip_id, author_id, author_role, target_id, target_role, rating) "
            "VALUES ('sec003-review', 'sec003-deal', ?, 'client', ?, 'driver', 5)",
            (shipper_id, driver_id),
        )

    response = client.post("/api/v1/check/full", headers=_headers(token), json={})

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == driver_id
    assert body["components"]["identity"] == 85
    assert body["components"]["experience"] == 88
    assert body["components"]["bonus"] == 5
    assert body["components"]["reputation"] == 81
    assert ddb.get_score(driver_id)["user_id"] == driver_id


def test_admin_can_target_existing_user_and_registration_service_still_works():
    victim_id, _ = _user(
        "sec003-admin-target@example.invalid",
        face_quality=0.9,
        face_verified=1,
        license_verified=1,
        passport_verified=1,
        vehicle_type="truck",
        license_ocr={"experience_years": 7},
        passport_ocr={"year": 2021, "plate_number": "SERVER777"},
    )
    _, admin_token = _user("sec003-admin@example.invalid", role="admin")

    response = client.post(
        "/api/v1/check/full",
        headers=_headers(admin_token),
        json={"user_id": victim_id},
    )
    assert response.status_code == 200
    assert response.json()["user_id"] == victim_id

    internal = registration.run_moderation(victim_id)
    assert internal["security_score"] > 0
    assert ddb.get_score(victim_id)["check_count"] == 1


def test_score_read_is_self_or_privileged_only():
    self_id, self_token = _user("sec003-score-self@example.invalid")
    victim_id, _ = _user("sec003-score-victim@example.invalid")
    _, admin_token = _user("sec003-score-admin@example.invalid", role="support")
    calculate_score(victim_id, {"identity": 70})

    assert client.get(
        f"/api/v1/score/{victim_id}", headers=_headers(self_token)
    ).status_code == 403
    own = client.get(f"/api/v1/score/{self_id}", headers=_headers(self_token))
    assert own.status_code == 200 and own.json()["user_id"] == self_id
    privileged = client.get(
        f"/api/v1/score/{victim_id}", headers=_headers(admin_token)
    )
    assert privileged.status_code == 200


def test_ocr_rejects_victim_and_self_success_is_bound_to_session(monkeypatch):
    self_id, token = _user("sec003-ocr-self@example.invalid")
    victim_id, _ = _user("sec003-ocr-victim@example.invalid")
    monkeypatch.setattr(routes, "extract_passport_data", lambda _path: {
        "success": True, "raw_text": "", "plate_number": "SERVER123", "confidence": 0.9,
    })

    denied = client.post(
        f"/api/v1/ocr/passport?user_id={victim_id}",
        headers=_headers(token),
        files=_image_part(),
    )
    assert denied.status_code == 403
    assert not any(row["user_id"] == victim_id for row in _ocr_rows())

    accepted = client.post(
        "/api/v1/ocr/passport",
        headers=_headers(token),
        files=_image_part(),
    )
    assert accepted.status_code == 200
    assert [row["user_id"] for row in _ocr_rows()] == [self_id]


def _ocr_rows() -> list[dict]:
    with get_conn() as c:
        return [dict(row) for row in c.execute("SELECT * FROM ocr_results").fetchall()]


def test_biometrics_reject_victim_and_bind_self_and_admin(monkeypatch):
    self_id, token = _user("sec003-bio-self@example.invalid")
    victim_id, _ = _user("sec003-bio-victim@example.invalid")
    _, admin_token = _user("sec003-bio-admin@example.invalid", role="admin")
    monkeypatch.setattr(
        liveness_module, "check_liveness",
        lambda _path: {"liveness_passed": True, "confidence": 0.99},
    )
    monkeypatch.setattr(
        liveness_module, "face_match",
        lambda _selfie, _document: {"match": True, "score": 0.99},
    )

    denied_liveness = client.post(
        f"/api/v1/biometric/liveness?user_id={victim_id}",
        headers=_headers(token),
        files=_image_part(),
    )
    denied_face = client.post(
        f"/api/v1/biometric/face_match?user_id={victim_id}",
        headers=_headers(token),
        files={
            "selfie": ("selfie.jpg", b"selfie", "image/jpeg"),
            "document": ("document.jpg", b"document", "image/jpeg"),
        },
    )
    assert denied_liveness.status_code == 403
    assert denied_face.status_code == 403
    assert ddb.get_logs(victim_id) == []

    self_ok = client.post(
        "/api/v1/biometric/liveness", headers=_headers(token), files=_image_part()
    )
    admin_ok = client.post(
        f"/api/v1/biometric/face_match?user_id={victim_id}",
        headers=_headers(admin_token),
        files={
            "selfie": ("selfie.jpg", b"selfie", "image/jpeg"),
            "document": ("document.jpg", b"document", "image/jpeg"),
        },
    )
    assert self_ok.status_code == 200
    assert admin_ok.status_code == 200
    assert [row["check_source"] for row in ddb.get_logs(self_id)] == ["liveness"]
    assert [row["check_source"] for row in ddb.get_logs(victim_id)] == ["face_match"]
