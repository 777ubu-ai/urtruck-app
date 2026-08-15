"""SEC-004: CGR booking/watch identity and ownership regression tests."""
from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_cgr_identity_security.db")
os.environ.setdefault("CGR_IIN_SALT", "test-cgr-identity-salt-32-bytes-min")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import cgr_dal
from database import registration_dal as reg_dal
from database.db import get_conn
from api import marketplace
from api.borders import borders_router
from cgr import queue_watch
from cgr.settings import cgr_settings


ddb.init_db()
reg_dal.init_registration_schema()
cgr_dal.init_cgr_schema()
marketplace._init()
queue_watch.init_schema()
app = FastAPI()
app.include_router(borders_router, prefix="/api/v1/borders")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)
    queue_watch.init_schema()
    with get_conn() as c:
        c.execute("DELETE FROM queue_watches")
        c.execute("DELETE FROM cgr_booking_poll_log")
        c.execute("DELETE FROM cgr_booking_status")
        c.execute("DELETE FROM trips")
        c.execute("DELETE FROM reg_sessions")
        c.execute("DELETE FROM drivers_registration")


def _user(phone: str, role: str = "driver") -> tuple[str, str]:
    user = reg_dal.get_or_create_driver(phone)
    reg_dal.update_driver(user["id"], {"role": role})
    return user["id"], reg_dal.create_session(user["id"])


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _trip(trip_id: str, driver_id: str):
    with get_conn() as c:
        c.execute(
            "INSERT INTO trips(id, driver_id, from_city, to_city, status) VALUES (?, ?, ?, ?, 'active')",
            (trip_id, driver_id, "Алматы", "Хоргос"),
        )


@pytest.mark.parametrize("path,method", [
    ("/api/v1/borders/bookings/active", "get"),
    ("/api/v1/borders/watch", "get"),
])
def test_fake_and_missing_bearer_fail_closed(path, method):
    request = getattr(client, method)
    assert request(path).status_code == 401
    assert request(path, headers=_headers("fake-token")).status_code == 401


def test_revoked_and_expired_sessions_fail_closed():
    _, revoked = _user("+77010000001")
    reg_dal.delete_session(revoked)
    assert client.get("/api/v1/borders/bookings/active", headers=_headers(revoked)).status_code == 401

    _, expired = _user("+77010000002")
    with get_conn() as c:
        c.execute("UPDATE reg_sessions SET expires_at='2000-01-01T00:00:00' WHERE token=?", (expired,))
    assert client.get("/api/v1/borders/watch", headers=_headers(expired)).status_code == 401


def test_booking_stores_session_user_id_and_enforces_trip_owner():
    owner_id, owner_token = _user("+77010000003")
    other_id, other_token = _user("+77010000004")
    _trip("trip-owner", owner_id)
    _trip("trip-other", other_id)

    foreign = client.post(
        "/api/v1/borders/bookings",
        headers=_headers(owner_token),
        json={"trip_id": "trip-other", "booking_number": "CGR-FOREIGN"},
    )
    assert foreign.status_code == 404

    created = client.post(
        "/api/v1/borders/bookings",
        headers=_headers(owner_token),
        json={"trip_id": "trip-owner", "booking_number": "CGR-OWNED"},
    )
    assert created.status_code == 201
    booking_id = created.json()["booking_id"]
    row = cgr_dal.get_booking(booking_id)
    assert row["urtruck_user_id"] == owner_id
    assert row["urtruck_user_id"] != owner_token
    assert row["urtruck_trip_id"] == "trip-owner"

    assert client.get(
        f"/api/v1/borders/bookings/{booking_id}", headers=_headers(other_token)
    ).status_code == 404
    assert client.get(
        "/api/v1/borders/bookings/active", headers=_headers(other_token)
    ).json()["bookings"] == []
    mine = client.get(
        "/api/v1/borders/bookings/active", headers=_headers(owner_token)
    ).json()["bookings"]
    assert [item["id"] for item in mine] == [booking_id]


def test_non_driver_cannot_create_booking_or_manage_watch():
    _, token = _user("shipper-cgr@example.invalid", role="client")
    create = client.post(
        "/api/v1/borders/bookings",
        headers=_headers(token),
        json={"booking_number": "CGR-CLIENT"},
    )
    watch = client.post(
        "/api/v1/borders/watch", headers=_headers(token), json={"plate": "A123BC"}
    )
    assert create.status_code == 403
    assert watch.status_code == 403


def test_watch_is_owned_by_session_user_and_other_user_cannot_remove_it():
    owner_id, owner_token = _user("+77010000005")
    _, other_token = _user("+77010000006")
    added = client.post(
        "/api/v1/borders/watch", headers=_headers(owner_token), json={"plate": "A 123 BC"}
    )
    assert added.status_code == 200
    with get_conn() as c:
        row = c.execute("SELECT user_id, plate FROM queue_watches").fetchone()
    assert row["user_id"] == owner_id
    assert row["user_id"] != owner_token
    assert row["plate"] == "A123BC"

    assert client.get("/api/v1/borders/watch", headers=_headers(other_token)).json()["watches"] == []
    assert client.delete(
        "/api/v1/borders/watch", headers=_headers(other_token), params={"plate": "A123BC"}
    ).status_code == 200
    assert len(client.get("/api/v1/borders/watch", headers=_headers(owner_token)).json()["watches"]) == 1
    assert client.delete(
        "/api/v1/borders/watch", headers=_headers(owner_token), params={"plate": "A123BC"}
    ).status_code == 200
    assert client.get("/api/v1/borders/watch", headers=_headers(owner_token)).json()["watches"] == []


def test_legacy_token_identities_are_mapped_or_quarantined_without_token_storage():
    owner_id, live_token = _user("+77010000007")
    second_live_token = reg_dal.create_session(owner_id)
    orphan_token = secrets.token_urlsafe(32)
    with get_conn() as c:
        c.execute(
            "INSERT INTO cgr_booking_status(urtruck_user_id, cgr_booking_number) VALUES (?, ?)",
            (live_token, "CGR-LEGACY-LIVE"),
        )
        c.execute(
            "INSERT INTO cgr_booking_status(urtruck_user_id, cgr_booking_number) VALUES (?, ?)",
            (orphan_token, "CGR-LEGACY-ORPHAN"),
        )
        c.execute(
            "INSERT INTO cgr_booking_status(urtruck_user_id, cgr_booking_number) VALUES (?, ?)",
            (second_live_token, "CGR-LEGACY-LIVE"),
        )
        c.execute("INSERT INTO queue_watches(user_id, plate) VALUES (?, ?)", (live_token, "LIVE123"))
        c.execute("INSERT INTO queue_watches(user_id, plate) VALUES (?, ?)", (second_live_token, "LIVE123"))
        c.execute("INSERT INTO queue_watches(user_id, plate) VALUES (?, ?)", (orphan_token, "ORPH123"))

    cgr_dal.init_cgr_schema()
    queue_watch.init_schema()
    with get_conn() as c:
        booking_ids = [r[0] for r in c.execute(
            "SELECT urtruck_user_id FROM cgr_booking_status ORDER BY cgr_booking_number"
        ).fetchall()]
        watch_ids = [r[0] for r in c.execute("SELECT user_id FROM queue_watches ORDER BY plate").fetchall()]
        serialized = " ".join(booking_ids + watch_ids)
    assert owner_id in booking_ids and owner_id in watch_ids
    assert any(value.startswith("legacy-orphan-") for value in booking_ids)
    assert any(value.startswith("legacy-orphan-") for value in watch_ids)
    assert live_token not in serialized
    assert second_live_token not in serialized
    assert orphan_token not in serialized


def test_dal_rejects_bearer_shaped_identity():
    token = secrets.token_urlsafe(32)
    with pytest.raises(ValueError, match="stable user identity"):
        cgr_dal.create_booking(token, None, "CGR-TOKEN-ID")
    assert queue_watch.add_watch(token, "A123BC") is False
