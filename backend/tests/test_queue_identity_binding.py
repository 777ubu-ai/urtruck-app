"""Regression coverage for stable ownership of border queue state."""

import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def queue_client(tmp_path, monkeypatch):
    from config import DB_PATH as _unused  # noqa: F401
    import config
    from database import db
    from database import cgr_dal
    from database import registration_dal
    from cgr import queue_watch

    db_path = tmp_path / "queue-identity.db"
    monkeypatch.setattr(config, "DB_PATH", str(db_path))
    db.init_db()
    registration_dal.init_registration_schema()
    cgr_dal.init_cgr_schema()
    cgr_dal.seed_border_checkpoints_from_legacy()
    queue_watch.init_schema()

    from api.borders import borders_router

    app = FastAPI()
    app.include_router(borders_router, prefix="/api/v1/borders")
    return TestClient(app), registration_dal, db_path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _new_account(registration_dal, phone):
    user = registration_dal.get_or_create_driver(phone)
    token = registration_dal.create_session(user["id"])
    return user["id"], token


def test_queue_state_survives_session_rotation_and_is_not_an_id_token(queue_client):
    client, reg_dal, db_path = queue_client
    user_id, token_a = _new_account(reg_dal, "+77001110001")

    watch = client.post("/api/v1/borders/watch", headers=_auth(token_a), json={"plate": "ABC-123"})
    assert watch.status_code == 200, watch.text
    booking = client.post(
        "/api/v1/borders/bookings",
        headers=_auth(token_a),
        json={"booking_number": "QUEUE-ROTATION-1", "checkpoint_code": "khorgos"},
    )
    assert booking.status_code == 201, booking.text

    token_b = reg_dal.create_session(user_id)
    active = client.get("/api/v1/borders/bookings/active", headers=_auth(token_b))
    watches = client.get("/api/v1/borders/watch", headers=_auth(token_b))
    assert active.status_code == 200 and len(active.json()["bookings"]) == 1
    assert watches.status_code == 200
    assert watches.json()["watches"] == [{
        "plate": "ABC123",
        "last_status": None,
        "updated_at": watches.json()["watches"][0]["updated_at"],
    }]

    with sqlite3.connect(db_path) as conn:
        raw_values = [
            row[0]
            for row in conn.execute("SELECT user_id FROM queue_watches")
        ] + [
            row[0]
            for row in conn.execute("SELECT urtruck_user_id FROM cgr_booking_status")
        ]
    assert raw_values == [user_id, user_id]
    assert token_a not in raw_values
    assert token_b not in raw_values


def test_queue_state_isolation_and_invalid_sessions(queue_client):
    client, reg_dal, _db_path = queue_client
    user_a, token_a = _new_account(reg_dal, "+77001110002")
    user_b, token_b = _new_account(reg_dal, "+77001110003")

    assert client.post(
        "/api/v1/borders/watch", headers=_auth(token_a), json={"plate": "DEF-456"}
    ).status_code == 200
    assert client.get("/api/v1/borders/watch", headers=_auth(token_b)).json()["watches"] == []
    assert client.delete(
        "/api/v1/borders/watch", params={"plate": "DEF-456"}, headers=_auth(token_b)
    ).status_code == 200
    assert client.get("/api/v1/borders/watch", headers=_auth(token_a)).json()["watches"]

    assert client.get(
        "/api/v1/borders/watch", headers=_auth("expired-or-invalid-token")
    ).status_code == 401
    assert client.get("/api/v1/borders/watch").status_code == 401

    # A valid session for B cannot read A's booking by id.
    booking = client.post(
        "/api/v1/borders/bookings",
        headers=_auth(token_a),
        json={"booking_number": "QUEUE-IDOR-1", "checkpoint_code": "khorgos"},
    )
    assert booking.status_code == 201, booking.text
    booking_id = booking.json()["booking_id"]
    assert client.get(
        f"/api/v1/borders/bookings/{booking_id}", headers=_auth(token_b)
    ).status_code == 404
