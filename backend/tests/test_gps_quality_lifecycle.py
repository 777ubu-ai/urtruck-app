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

import api.marketplace as marketplace
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
        for table in ("gps_ingest_metrics", "deal_locations", "deal_tracking", "deals", "cargos", "reg_sessions", "drivers_registration"):
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


@pytest.mark.parametrize("headers", [
    {},
    {"X-UrTruck-GPS-Contract": "legacy-v0"},
    {"X-UrTruck-GPS-Contract": "legacy-v0", "X-UrTruck-App-Version": "1.0.6"},
    {"X-UrTruck-GPS-Contract": "captured-at-v1", "X-UrTruck-App-Version": "1.0.6"},
])
def test_missing_capture_requires_exact_legacy_marker_and_allowlisted_version(headers):
    auth = _seed()["driver"]
    response = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={**auth, **headers}, json={"lat": 43.2, "lng": 76.9},
    )
    assert response.status_code == 422
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM deal_locations").fetchone()["n"] == 0


def test_explicit_legacy_point_is_server_timestamped_observable_short_lived_and_not_live(monkeypatch):
    monkeypatch.setattr(marketplace, "_GPS_LEGACY_COMPAT_UNTIL", datetime.now(timezone.utc) + timedelta(days=1))
    auth = _seed()
    sent = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth["driver"],
            "X-UrTruck-GPS-Contract": "legacy-v0",
            "X-UrTruck-App-Version": "1.0.5",
        },
        json={"lat": 43.2, "lng": 76.9},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["captured_at"] == sent.json()["received_at"]
    assert sent.json()["timestamp_quality"] == "server_received_legacy"
    assert sent.json()["is_legacy"] is True
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert read.status_code == 200
    assert read.json()["is_live"] is False
    assert read.json()["freshness"] == "stale"
    assert read.json()["location"]["is_legacy"] is True
    repeated = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth["driver"],
            "X-UrTruck-GPS-Contract": "legacy-v0",
            "X-UrTruck-App-Version": "1.0.5",
        },
        json={"lat": 43.2, "lng": 76.9},
    )
    assert repeated.status_code == 200
    with get_conn() as c:
        row = c.execute(
            "SELECT timestamp_quality,is_legacy,retention_expires_at FROM deal_locations WHERE deal_id='gps-deal'"
        ).fetchone()
        metric = c.execute("SELECT * FROM gps_ingest_metrics").fetchone()
        metric_columns = {r["name"] for r in c.execute("PRAGMA table_info(gps_ingest_metrics)")}
    assert row["timestamp_quality"] == "server_received_legacy" and row["is_legacy"] == 1
    expiry = datetime.fromisoformat(row["retention_expires_at"].replace("Z", "+00:00"))
    assert timedelta(hours=23) < expiry - datetime.now(timezone.utc) <= timedelta(hours=24)
    assert metric["app_version"] == "1.0.5" and metric["accepted_count"] == 2
    assert not ({"user_id", "deal_id", "lat", "lng"} & metric_columns)


def test_legacy_compatibility_expires_fail_closed(monkeypatch):
    monkeypatch.setattr(marketplace, "_GPS_LEGACY_COMPAT_UNTIL", datetime.now(timezone.utc) - timedelta(seconds=1))
    auth = _seed()["driver"]
    response = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth,
            "X-UrTruck-GPS-Contract": "legacy-v0",
            "X-UrTruck-App-Version": "1.0.5",
        },
        json={"lat": 43.2, "lng": 76.9},
    )
    assert response.status_code == 410
    assert response.json()["detail"]["error"] == "GPS_LEGACY_COMPAT_EXPIRED"


def test_legacy_point_can_upgrade_to_strict_without_ordering_deadlock(monkeypatch):
    monkeypatch.setattr(marketplace, "_GPS_LEGACY_COMPAT_UNTIL", datetime.now(timezone.utc) + timedelta(days=1))
    auth = _seed()
    legacy = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth["driver"],
            "X-UrTruck-GPS-Contract": "legacy-v0",
            "X-UrTruck-App-Version": "1.0.5",
        },
        json={"lat": 43.2, "lng": 76.9},
    )
    assert legacy.status_code == 200
    strict = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth["driver"],
            "X-UrTruck-GPS-Contract": "captured-at-v1",
            "X-UrTruck-App-Version": "1.0.6",
        },
        json={"lat": 43.2, "lng": 76.9, "captured_at": _iso(-5)},
    )
    assert strict.status_code == 200, strict.text
    assert strict.json()["timestamp_quality"] == "client_captured"
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert read.json()["is_live"] is True
    assert read.json()["location"]["is_legacy"] is False
    assert read.json()["location"]["retention_expires_at"] is None


def test_malformed_capture_and_non_driver_legacy_request_do_not_write(monkeypatch):
    monkeypatch.setattr(marketplace, "_GPS_LEGACY_COMPAT_UNTIL", datetime.now(timezone.utc) + timedelta(days=1))
    auth = _seed()
    malformed = client.post(
        "/api/v1/market/deals/gps-deal/location", headers=auth["driver"],
        json={"lat": 43.2, "lng": 76.9, "captured_at": "not-a-timestamp"},
    )
    forbidden = client.post(
        "/api/v1/market/deals/gps-deal/location",
        headers={
            **auth["shipper"],
            "X-UrTruck-GPS-Contract": "legacy-v0",
            "X-UrTruck-App-Version": "1.0.5",
        },
        json={"lat": 43.2, "lng": 76.9},
    )
    assert malformed.status_code == 422
    assert forbidden.status_code == 403
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM deal_locations").fetchone()["n"] == 0
        assert c.execute("SELECT COUNT(*) AS n FROM gps_ingest_metrics").fetchone()["n"] == 0


def test_pre_contract_row_is_never_reported_live():
    auth = _seed()
    now = _iso()
    with get_conn() as c:
        c.execute(
            "INSERT INTO deal_locations(deal_id,lat,lng,captured_at,received_at,updated_at) VALUES(?,?,?,?,?,?)",
            ("gps-deal", 43.2, 76.9, now, now, now),
        )
    read = client.get("/api/v1/market/deals/gps-deal/location", headers=auth["shipper"])
    assert read.status_code == 200
    assert read.json()["is_live"] is False
    assert read.json()["freshness"] == "stale"
    assert read.json()["location"]["timestamp_quality"] == "pre_contract_unknown"


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
