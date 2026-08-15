"""P1-3/P1-4: GPS quality, ordering, lifecycle and truthful freshness."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_gps_quality.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.marketplace import mp_router, _init
from database import db, registration_dal as reg_dal
from database.db import get_conn

db.init_db(); reg_dal.init_registration_schema(); _init()
app = FastAPI(); app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    db.init_db(); reg_dal.init_registration_schema(); _init()
    with get_conn() as c:
        for table in ("deal_locations", "deal_tracking", "deals", "cargos", "reg_sessions", "drivers_registration"):
            c.execute(f"DELETE FROM {table}")


def _seed(status="in_progress"):
    shipper = reg_dal.get_or_create_driver("+77016660101")
    driver = reg_dal.get_or_create_driver("+77016660102")
    reg_dal.update_driver(shipper["id"], {"role": "client", "verification_level": 1})
    reg_dal.update_driver(driver["id"], {"role": "driver", "verification_level": 1})
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,from_country,to_country) "
            "VALUES ('gps-cargo',?,'Алматы','Урумчи','Тестовый груз','KZ','CN')",
            (shipper["id"],),
        )
        c.execute(
            "INSERT INTO deals(id,bid_id,cargo_id,shipper_id,driver_id,from_city,to_city,amount,status) "
            "VALUES ('gps-deal','gps-bid','gps-cargo',?,?,'Алматы','Урумчи',1000,?)",
            (shipper["id"], driver["id"], status),
        )
        c.execute(
            "INSERT INTO deal_tracking(deal_id,status,requested_by,locked_at) "
            "VALUES ('gps-deal','active',?,CURRENT_TIMESTAMP)",
            (driver["id"],),
        )
    return {
        "driver": {"Authorization": f"Bearer {reg_dal.create_session(driver['id'])}"},
        "shipper": {"Authorization": f"Bearer {reg_dal.create_session(shipper['id'])}"},
    }


def _iso(delta_seconds=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=delta_seconds)).isoformat()


@pytest.mark.parametrize("patch", [
    {"lat": 91}, {"lat": -91}, {"lng": 181}, {"lng": -181},
    {"heading": -1}, {"heading": 361}, {"speed": -0.1}, {"speed": 70.1},
    {"accuracy": -1}, {"accuracy": 5001},
])
def test_numeric_bounds_fail_without_write(patch):
    auth = _seed()["driver"]
    payload = {"lat": 43.2, "lng": 76.9, "captured_at": _iso(), **patch}
    response = client.post("/api/v1/market/deals/gps-deal/location", headers=auth, json=payload)
    assert response.status_code == 422, response.text
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM deal_locations").fetchone()["n"] == 0


def test_non_finite_coordinates_fail_closed():
    auth = _seed()["driver"]
    response = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={**auth, "Content-Type": "application/json"},
        content='{"lat":NaN,"lng":76.9,"captured_at":"2099-01-01T00:00:00Z"}',
    )
    # Starlette/Pydantic versions differ on whether NaN is rejected by JSON
    # parsing or by the explicit finite guard; both must be a client error.
    assert 400 <= response.status_code < 500


def test_capture_timestamp_is_mandatory():
    auth = _seed()["driver"]
    response = client.post(
        "/api/v1/market/deals/gps-deal/location", headers=auth,
        json={"lat": 43.2, "lng": 76.9},
    )
    assert response.status_code == 422
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM deal_locations").fetchone()["n"] == 0


def test_valid_point_persists_capture_and_receive_timestamps():
    auth = _seed()
    captured = _iso(-20)
    sent = client.post(
        "/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
        json={"lat": 43.2, "lng": 76.9, "heading": 180, "speed": 12.5,
              "accuracy": 8.0, "captured_at": captured},
    )
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert sent.status_code == 200, sent.text
    assert sent.json()["captured_at"] and sent.json()["received_at"]
    assert read.status_code == 200
    body = read.json()
    assert body["is_live"] is True and body["freshness"] == "live"
    assert body["location"]["captured_at"] and body["location"]["received_at"]
    assert body["location"]["accuracy"] == 8.0


def test_stale_future_replay_and_out_of_order_are_rejected():
    auth = _seed()["driver"]
    stale = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                        json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-601)})
    future = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                         json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(121)})
    first_at = _iso(-30)
    first = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                        json={"lat": 43.2, "lng": 76.9, "captured_at": first_at})
    replay = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                         json={"lat": 43.2, "lng": 76.9, "captured_at": first_at})
    older = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                        json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-31)})
    assert stale.status_code == future.status_code == 422
    assert first.status_code == 200
    assert replay.status_code == older.status_code == 409
    assert replay.json()["detail"]["error"] == "GPS_OUT_OF_ORDER"


def test_impossible_jump_is_rejected_without_overwrite():
    auth = _seed()["driver"]
    assert client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                       json={"lat": 43.2, "lng": 76.9, "accuracy": 5, "captured_at": _iso(-30)}).status_code == 200
    jump = client.post("/api/v1/market/deals/gps-deal/location", headers=auth,
                       json={"lat": 55.7, "lng": 37.6, "accuracy": 5, "captured_at": _iso()})
    assert jump.status_code == 422
    assert jump.json()["detail"]["error"] == "GPS_IMPOSSIBLE_JUMP"
    with get_conn() as c:
        row = c.execute("SELECT lat,lng FROM deal_locations WHERE deal_id='gps-deal'").fetchone()
    assert (row["lat"], row["lng"]) == (43.2, 76.9)


def test_terminal_last_point_is_retained_but_never_live_and_ingestion_stops():
    auth = _seed()
    assert client.post("/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
                       json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-10)}).status_code == 200
    at_border = client.patch(
        "/api/v1/market/deals/gps-deal/status?new_status=at_border",
        headers=auth["driver"],
    )
    assert at_border.status_code == 200, at_border.text
    delivered = client.patch(
        "/api/v1/market/deals/gps-deal/status?new_status=awaiting_confirmation",
        headers=auth["driver"],
    )
    assert delivered.status_code == 200, delivered.text
    blocked = client.post("/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
                          json={"lat": 43.21, "lng": 76.91, "captured_at": _iso()})
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert blocked.status_code == 409
    assert read.status_code == 200
    assert read.json()["has_location"] is True
    assert read.json()["is_live"] is False
    assert read.json()["freshness"] == "stopped"
    with get_conn() as c:
        row = c.execute(
            "SELECT retention_expires_at FROM deal_locations WHERE deal_id='gps-deal'"
        ).fetchone()
    expiry_raw = row["retention_expires_at"]
    assert expiry_raw is not None
    expiry = datetime.fromisoformat(expiry_raw).replace(tzinfo=timezone.utc)
    assert timedelta(days=29) < expiry - datetime.now(timezone.utc) <= timedelta(days=30)
    completed = client.patch(
        "/api/v1/market/deals/gps-deal/status?new_status=completed",
        headers=auth["shipper"],
    )
    assert completed.status_code == 200, completed.text
    with get_conn() as c:
        after = c.execute(
            "SELECT retention_expires_at FROM deal_locations WHERE deal_id='gps-deal'"
        ).fetchone()["retention_expires_at"]
    assert after == expiry_raw, "terminal confirmation must not extend GPS retention"


def test_at_border_does_not_start_retention_window():
    auth = _seed()
    assert client.post(
        "/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
        json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-10)},
    ).status_code == 200
    moved = client.patch(
        "/api/v1/market/deals/gps-deal/status?new_status=at_border",
        headers=auth["driver"],
    )
    assert moved.status_code == 200, moved.text
    with get_conn() as c:
        expiry = c.execute(
            "SELECT retention_expires_at FROM deal_locations WHERE deal_id='gps-deal'"
        ).fetchone()["retention_expires_at"]
    assert expiry is None


def test_expired_terminal_location_is_not_returned_and_startup_purges_it():
    auth = _seed()
    assert client.post(
        "/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
        json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-10)},
    ).status_code == 200
    with get_conn() as c:
        c.execute("UPDATE deals SET status='awaiting_confirmation' WHERE id='gps-deal'")
        c.execute("UPDATE deal_tracking SET status='stopped' WHERE deal_id='gps-deal'")
        c.execute(
            "UPDATE deal_locations SET retention_expires_at='2000-01-01 00:00:00' WHERE deal_id='gps-deal'"
        )
    hidden = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert hidden.status_code == 200
    assert hidden.json()["has_location"] is False
    _init()
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM deal_locations WHERE deal_id='gps-deal'").fetchone()["n"] == 0


def test_old_received_point_is_stale_not_live():
    auth = _seed()
    assert client.post("/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
                       json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-10)}).status_code == 200
    with get_conn() as c:
        c.execute(
            "UPDATE deal_locations SET received_at='2000-01-01T00:00:00Z', updated_at='2000-01-01T00:00:00Z' "
            "WHERE deal_id='gps-deal'"
        )
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert read.json()["has_location"] is True
    assert read.json()["is_live"] is False
    assert read.json()["freshness"] == "stale"
