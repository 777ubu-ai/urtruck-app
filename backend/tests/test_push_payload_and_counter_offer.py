"""Push/badge audit gaps (2026-08-29) — closes exactly the coverage holes a
code audit found in test_live_deal_push_lifecycle.py / test_unread_badge.py:

  1. bid_created / bid_accepted / bid_countered / accept_counter / deal_status
     push `data=` payloads must carry explicit bid_id/cargo_id/trip_id/deal_id
     (not only inside the human-readable `url` string) — the app should not
     have to regex-parse a URL to know the exact target of a push.
  2. Counter-offer flow (owner counters -> bidder notified; bidder accepts
     counter -> deal created, both sides notified) was never exercised by any
     existing test.
  3. `in_progress -> at_border` push/notification content (title) was
     transitioned but never asserted — only the HTTP 200 was checked.

Uses the REAL production code path (api/marketplace.py), same pattern as
test_live_deal_push_lifecycle.py (own throwaway DB, fake require_level,
TestClient). `send_to_user` is monkeypatched at the `api.marketplace` import
site (a plain module-level name binding — `from api.push import
send_to_user`) so calls are captured SYNCHRONOUSLY, without needing to wait
on the real background-thread/HTTP-to-Expo path that `api.push.send_to_user`
normally spawns.

RUN THIS FILE ON ITS OWN (`pytest tests/test_push_payload_and_counter_offer.py`),
same pre-existing constraint as test_live_deal_push_lifecycle.py (see its
docstring): `config.DB_PATH`/`database.db` read `DB_PATH` ONCE at
module-import time for the whole process, so batching several of these
"live" test files into one `pytest tests/` run makes them silently share
whichever DB_PATH the FIRST-imported one already set — a pre-existing test-
suite isolation gap (confirmed identical on a clean origin/main checkout,
unrelated to this file), not something this file can fix on its own.
"""
import os
import uuid
from pathlib import Path

import pytest

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_payload.db")
Path(TEST_DB).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn, new_id

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

import api.marketplace as marketplace
from api.marketplace import mp_router
from api.notifications import notif_router

_notif_schema = Path(__file__).resolve().parent.parent / "database" / "notifications_schema.sql"
if _notif_schema.exists():
    with get_conn() as c:
        c.executescript(_notif_schema.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(notif_router, prefix="/api/v1/notifications")
client = TestClient(app)


def as_user(uid, name="Test User", phone="+70000000000"):
    _current_user.set({"id": uid, "full_name": name, "phone": phone, "verification_level": 1})


def seed_cargo(owner_id, price=1234):
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Shipper", "Almaty", "Astana",
             "KZ", "KZ",  # domestic route — skips the at_border requirement
             "Payload test cargo", "tent", price, 0, "active"),
        )
    return cargo_id


@pytest.fixture
def captured_pushes(monkeypatch):
    """Capture every send_to_user(...) call made from api.marketplace,
    synchronously — no background thread, no real HTTP to Expo/web push."""
    calls = []

    def _fake_send_to_user(user_id, title, body, url="/", kind="info", data=None):
        calls.append({"user_id": user_id, "title": title, "body": body, "url": url, "kind": kind, "data": data or {}})
        return 0

    monkeypatch.setattr(marketplace, "send_to_user", _fake_send_to_user)
    return calls


def test_bid_created_push_data_has_explicit_ids(captured_pushes):
    shipper = f"shp_{uuid.uuid4().hex[:8]}"
    driver = f"drv_{uuid.uuid4().hex[:8]}"
    cargo_id = seed_cargo(shipper)

    as_user(driver, "Driver")
    res = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 900, "message": "hi"})
    assert res.status_code == 200, res.text
    bid_id = res.json()["id"]

    pushes_to_shipper = [p for p in captured_pushes if p["user_id"] == shipper]
    assert pushes_to_shipper, "shipper must receive a bid_created push"
    data = pushes_to_shipper[0]["data"]
    assert data.get("bid_id") == bid_id, f"push data must carry bid_id, got {data}"
    assert data.get("cargo_id") == cargo_id, f"push data must carry cargo_id, got {data}"


def test_bid_accepted_push_data_has_explicit_ids(captured_pushes):
    shipper = f"shp_{uuid.uuid4().hex[:8]}"
    driver = f"drv_{uuid.uuid4().hex[:8]}"
    cargo_id = seed_cargo(shipper)

    as_user(driver, "Driver")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 900}).json()["id"]

    as_user(shipper, "Shipper")
    captured_pushes.clear()
    accept_res = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert accept_res.status_code == 200, accept_res.text
    deal_id = accept_res.json()["deal_id"]

    pushes_to_driver = [p for p in captured_pushes if p["user_id"] == driver]
    assert pushes_to_driver, "driver must receive a bid_accepted push"
    data = pushes_to_driver[0]["data"]
    assert data.get("bid_id") == bid_id
    assert data.get("cargo_id") == cargo_id
    assert data.get("deal_id") == deal_id, f"push data must carry deal_id, got {data}"


def test_counter_offer_push_and_accept_counter(captured_pushes):
    """Full counter-offer round-trip, never exercised by any prior test:
    owner counters -> bidder gets bid_countered push (right recipient, right
    data) -> bidder accepts the counter -> deal created, BOTH sides notified
    with explicit ids in the data payload."""
    shipper = f"shp_{uuid.uuid4().hex[:8]}"
    driver = f"drv_{uuid.uuid4().hex[:8]}"
    cargo_id = seed_cargo(shipper, price=1000)

    as_user(driver, "Driver")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 800}).json()["id"]

    # Owner counters — recipient must be the BIDDER (driver), never the owner.
    as_user(shipper, "Shipper")
    captured_pushes.clear()
    counter_res = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 900, "message": "meet me halfway"})
    assert counter_res.status_code == 200, counter_res.text

    counter_pushes = [p for p in captured_pushes if p["user_id"] == driver]
    assert counter_pushes, "bidder (driver) must receive the bid_countered push"
    assert not any(p["user_id"] == shipper for p in captured_pushes), \
        "the owner who just countered must NOT get a push about their own action (no self-push)"
    cdata = counter_pushes[0]["data"]
    assert cdata.get("bid_id") == bid_id
    assert cdata.get("cargo_id") == cargo_id

    # Bidder accepts the counter -> deal created, BOTH sides notified.
    as_user(driver, "Driver")
    captured_pushes.clear()
    accept_counter_res = client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
    assert accept_counter_res.status_code == 200, accept_counter_res.text
    deal_id = accept_counter_res.json()["deal_id"]

    recipients = {p["user_id"] for p in captured_pushes}
    assert recipients == {shipper, driver}, f"both sides of the deal must be notified, got {recipients}"
    for p in captured_pushes:
        assert p["data"].get("deal_id") == deal_id, f"accept_counter push data must carry deal_id, got {p['data']}"
        assert p["data"].get("bid_id") == bid_id


def test_deal_status_at_border_content_and_data(captured_pushes):
    """in_progress -> at_border was only ever asserted as HTTP 200 in the
    existing lifecycle test — never its title/body/data content."""
    shipper = f"shp_{uuid.uuid4().hex[:8]}"
    driver = f"drv_{uuid.uuid4().hex[:8]}"
    # International route so at_border is actually reachable/required.
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, shipper, "+700", "Shipper", "Almaty", "Moscow", "KZ", "RU",
             "Border test cargo", "tent", 1500, 0, "active"),
        )
    as_user(driver, "Driver")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1400}).json()["id"]
    as_user(shipper, "Shipper")
    deal_id = client.post(f"/api/v1/market/bids/{bid_id}/accept").json()["deal_id"]

    as_user(driver, "Driver")
    client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "in_progress"})
    captured_pushes.clear()
    border_res = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "at_border"})
    assert border_res.status_code == 200, border_res.text

    pushes_to_shipper = [p for p in captured_pushes if p["user_id"] == shipper]
    assert pushes_to_shipper, "shipper must be notified when the deal reaches the border"
    assert "границе" in pushes_to_shipper[0]["title"], \
        f"at_border push title must mention the border, got {pushes_to_shipper[0]['title']!r}"
    data = pushes_to_shipper[0]["data"]
    assert data.get("deal_id") == deal_id
    assert data.get("status") == "at_border", f"push data must carry the new status, got {data}"


def test_deal_status_never_notifies_the_actor_themselves(captured_pushes):
    """No-self-push, explicitly for every deal_status transition (not just
    the happy-path recipient list already covered by the lifecycle test)."""
    shipper = f"shp_{uuid.uuid4().hex[:8]}"
    driver = f"drv_{uuid.uuid4().hex[:8]}"
    cargo_id = seed_cargo(shipper)
    as_user(driver, "Driver")
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 900}).json()["id"]
    as_user(shipper, "Shipper")
    deal_id = client.post(f"/api/v1/market/bids/{bid_id}/accept").json()["deal_id"]

    for actor, status in ((driver, "in_progress"), (driver, "delivered"), (shipper, "received")):
        as_user(actor, "Actor")
        captured_pushes.clear()
        res = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": status})
        assert res.status_code == 200, res.text
        assert not any(p["user_id"] == actor for p in captured_pushes), (
            f"actor {actor} triggered status={status} and must not push themselves, "
            f"got recipients {[p['user_id'] for p in captured_pushes]}"
        )
