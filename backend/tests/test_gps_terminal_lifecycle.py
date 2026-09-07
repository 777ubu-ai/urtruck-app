"""Regression coverage for deal/tracking terminal-state convergence."""

import contextvars
from concurrent.futures import ThreadPoolExecutor
import os
import sys
import threading
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ["DB_PATH"] = "/tmp/urtruck_gps_terminal_lifecycle.db"
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api import verification_gate  # noqa: E402

_current_user = contextvars.ContextVar("gps_user", default=None)


def _fake_require_level(_minimum):
    def dependency():
        from fastapi import HTTPException

        user = _current_user.get()
        if not user:
            raise HTTPException(status_code=401, detail="No test user")
        return user

    return dependency


verification_gate.require_level = _fake_require_level

from database import db as ddb  # noqa: E402
from database.db import get_conn, new_id  # noqa: E402

ddb.init_db()

from api import marketplace  # noqa: E402
from api.marketplace import mp_router  # noqa: E402

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)
client_no_raise = TestClient(app, raise_server_exceptions=False)

SHIPPER = "gps-terminal-shipper"
DRIVER = "gps-terminal-driver"
OUTSIDER = "gps-terminal-outsider"


def as_user(user_id):
    _current_user.set({"id": user_id, "full_name": user_id, "phone": "+70000000000", "verification_level": 1})


def seed_deal(status="in_progress", tracking_status="active", international=False):
    cargo_id, bid_id, deal_id = new_id(), new_id(), new_id()
    room_id = new_id()
    from_city, to_city = ("Shanghai", "Almaty") if international else ("Almaty", "Astana")
    from_country, to_country = ("CN", "KZ") if international else ("KZ", "KZ")
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, weight_tons, volume_m3, price, bids_count, status, "
            "from_country, to_country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, SHIPPER, "+700", "Shipper", from_city, to_city, "Cargo", "tent",
             10, 20, 1000, 0, "taken", from_country, to_country),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status, chat_room_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, bid_id, SHIPPER, DRIVER, from_city, to_city, 1000, status, room_id),
        )
        c.execute(
            "INSERT INTO deal_tracking (deal_id, status, requested_by, requested_at, responded_at, locked_at, updated_at) "
            "VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            (deal_id, tracking_status, SHIPPER),
        )
        c.execute(
            "INSERT INTO deal_locations (deal_id, lat, lng, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
            (deal_id, 43.2, 76.9),
        )
    return deal_id


def status(deal_id):
    with get_conn() as c:
        return c.execute("SELECT status FROM deals WHERE id=?", (deal_id,)).fetchone()["status"]


def tracking(deal_id):
    with get_conn() as c:
        return dict(c.execute("SELECT status, stopped_at, completed_at FROM deal_tracking WHERE deal_id=?", (deal_id,)).fetchone())


def transition(deal_id, new_status, actor):
    as_user(actor)
    return client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": new_status})


def test_terminal_transitions_close_tracking_and_preserve_location():
    cases = [
        ("in_progress", "cancelled", DRIVER),
        ("at_border", "delivered", DRIVER),
        ("delivered", "received", SHIPPER),
        ("received", "completed", SHIPPER),
    ]
    for initial, target, actor in cases:
        deal_id = seed_deal(initial, international=initial == "at_border" or target == "at_border")
        response = transition(deal_id, target, actor)
        assert response.status_code == 200, response.text
        assert status(deal_id) == target
        state = tracking(deal_id)
        assert state["status"] == "stopped"
        assert state["stopped_at"]
        assert state["completed_at"]
        with get_conn() as c:
            assert c.execute("SELECT 1 FROM deal_locations WHERE deal_id=?", (deal_id,)).fetchone()


@pytest.mark.parametrize(
    ("initial", "target", "actor"),
    [
        ("accepted", "in_progress", DRIVER),
        ("in_progress", "at_border", DRIVER),
        ("accepted", "cancelled", DRIVER),
        ("in_progress", "cancelled", DRIVER),
        ("at_border", "cancelled", DRIVER),
    ],
)
def test_tracking_state_matches_nonterminal_and_terminal_transitions(initial, target, actor):
    deal_id = seed_deal(initial, international=initial == "at_border" or target == "at_border")
    response = transition(deal_id, target, actor)
    assert response.status_code == 200, response.text
    state = tracking(deal_id)
    if target in ("in_progress", "at_border"):
        assert state["status"] == "active"
        assert state["stopped_at"] is None
    else:
        assert state["status"] == "stopped"
        assert state["stopped_at"]


def test_completed_legacy_active_tracking_is_closed():
    deal_id = seed_deal("received", "active")
    response = transition(deal_id, "completed", SHIPPER)
    assert response.status_code == 200, response.text
    assert tracking(deal_id)["status"] == "stopped"
    assert tracking(deal_id)["stopped_at"]


def test_location_after_completed_is_rejected_without_new_location():
    deal_id = seed_deal("received")
    assert transition(deal_id, "completed", SHIPPER).status_code == 200
    as_user(DRIVER)
    response = client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 44, "lng": 77})
    assert response.status_code == 409, response.text
    with get_conn() as c:
        row = c.execute("SELECT lat, lng FROM deal_locations WHERE deal_id=?", (deal_id,)).fetchone()
        assert (row["lat"], row["lng"]) == (43.2, 76.9)


def test_terminal_transition_rolls_back_if_tracking_stop_fails(monkeypatch):
    deal_id = seed_deal("received")

    def fail_stop(*_args, **_kwargs):
        raise RuntimeError("injected tracking stop failure")

    monkeypatch.setattr(marketplace, "stop_tracking_for_deal", fail_stop)
    as_user(SHIPPER)
    response = client_no_raise.patch(
        f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "completed"}
    )
    assert response.status_code == 500
    assert status(deal_id) == "received"
    assert tracking(deal_id)["status"] == "active"


def test_outsider_cannot_read_or_write_terminal_tracking():
    deal_id = seed_deal("received")
    assert transition(deal_id, "completed", SHIPPER).status_code == 200
    as_user(OUTSIDER)
    assert client.get(f"/api/v1/market/deals/{deal_id}/tracking").status_code == 403
    assert client.get(f"/api/v1/market/deals/{deal_id}/location").status_code == 403
    assert client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 44, "lng": 77}).status_code == 403


def test_stop_operation_is_idempotent():
    deal_id = seed_deal("received")
    with get_conn() as c:
        assert marketplace.stop_tracking_for_deal(c, deal_id) is True
        first = dict(c.execute("SELECT stopped_at FROM deal_tracking WHERE deal_id=?", (deal_id,)).fetchone())
        assert marketplace.stop_tracking_for_deal(c, deal_id) is False
        second = dict(c.execute("SELECT stopped_at FROM deal_tracking WHERE deal_id=?", (deal_id,)).fetchone())
    assert first == second


def test_location_and_terminal_transition_race_cannot_revive_tracking():
    deal_id = seed_deal("in_progress")
    gate = threading.Barrier(2)

    def cancel():
        as_user(DRIVER)
        gate.wait()
        return client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "cancelled"})

    def location():
        as_user(DRIVER)
        gate.wait()
        return client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 44, "lng": 77})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda fn: fn(), (cancel, location)))

    assert sorted(response.status_code for response in responses) in ([200, 200], [200, 409])
    assert status(deal_id) == "cancelled"
    assert tracking(deal_id)["status"] == "stopped"
