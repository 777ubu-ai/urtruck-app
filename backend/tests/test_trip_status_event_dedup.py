"""Регрессия P1: canonical deal event не дублируется legacy trip emission."""
import pytest
from fastapi import HTTPException
from api import marketplace
from database.db import get_conn, new_id
from services import push_gateway
from tests.test_deal_status_actor_fsm import seed_deal, deal_status, DRIVER, SHIPPER, STRANGER


def seed_trip(deal_id=None, status="booked"):
    trip_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO trips (id,driver_id,from_city,to_city,status,booked_by) VALUES (?,?,?,?,?,?)",
            (trip_id, DRIVER, "Almaty", "Astana", status, SHIPPER),
        )
        if deal_id:
            c.execute("UPDATE deals SET trip_id=? WHERE id=?", (trip_id, deal_id))
    return trip_id


def event_counts(deal_id, trip_id, target):
    event_key = f"deal:{deal_id}:status:{target}"
    with get_conn() as c:
        return (
            c.execute("SELECT count(*) FROM notifications WHERE event_key=? OR url=?",
                      (event_key, f"/trips/{trip_id}")).fetchone()[0],
            c.execute("SELECT count(*) FROM push_outbox WHERE event_id=?", (event_key,)).fetchone()[0],
            c.execute("SELECT count(*) FROM deal_events WHERE deal_id=? AND event_type='deal.status_changed'",
                      (deal_id,)).fetchone()[0],
        )


@pytest.mark.parametrize("initial,new_status,target", [
    ("accepted", "in_transit", "in_progress"),
    ("in_progress", "delivered", "delivered"),
])
def test_linked_trip_emits_one_canonical_event_and_no_legacy_repeat(monkeypatch, initial, new_status, target):
    d = seed_deal(initial, from_country="KZ", to_country="KZ")
    trip = seed_trip(d)
    legacy = []
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: legacy.append(a))
    for _ in range(2):
        assert marketplace.update_trip_status(trip, new_status, {"id": DRIVER})["ok"]
        assert deal_status(d) == target
        assert event_counts(d, trip, target) == (1, 1, 1)
        assert legacy == [], "Canonical outbox владеет доставкой, второй legacy push запрещён"


def test_delivered_deal_repeat_does_not_resurrect_legacy_notification(monkeypatch):
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    trip = seed_trip(d, "delivered")
    legacy = []
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: legacy.append(a))
    assert marketplace.update_trip_status(trip, "delivered", {"id": DRIVER})["ok"]
    assert event_counts(d, trip, "delivered") == (0, 0, 0)
    assert legacy == []


@pytest.mark.parametrize("status", ["booked", "in_transit", "delivered"])
def test_standalone_trip_keeps_legacy_emission(monkeypatch, status):
    trip = seed_trip()
    legacy = []
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: legacy.append(a))
    assert marketplace.update_trip_status(trip, status, {"id": DRIVER})["ok"]
    assert len(legacy) == 1 and legacy[0][0] == SHIPPER
    with get_conn() as c:
        rows = c.execute("SELECT type,event_key FROM notifications WHERE url=?", (f"/trips/{trip}",)).fetchall()
    assert len(rows) == 1 and rows[0]["type"] == "trip_status" and rows[0]["event_key"] is None


def test_other_user_cannot_change_trip_or_emit_event(monkeypatch):
    d = seed_deal("accepted", from_country="KZ", to_country="KZ")
    trip = seed_trip(d)
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: pytest.fail("Неавторизованный push"))
    with pytest.raises(HTTPException) as e:
        marketplace.update_trip_status(trip, "in_transit", {"id": STRANGER})
    assert e.value.status_code == 403
    assert deal_status(d) == "accepted"
    assert event_counts(d, trip, "in_progress") == (0, 0, 0)
    with get_conn() as c:
        assert c.execute("SELECT status FROM trips WHERE id=?", (trip,)).fetchone()[0] == "booked"


@pytest.mark.parametrize("initial,from_country", [("accepted", "KZ"), ("in_progress", "CN")])
def test_rejected_canonical_sync_keeps_existing_best_effort_contract(monkeypatch, initial, from_country):
    d = seed_deal(initial, from_country=from_country, to_country="KZ")
    trip = seed_trip(d)
    legacy = []
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: legacy.append(a))
    assert marketplace.update_trip_status(trip, "delivered", {"id": DRIVER})["ok"]
    assert deal_status(d) == initial, "Actor/FSM/country gates не обходятся"
    assert event_counts(d, trip, "delivered") == (1, 0, 0)
    assert len(legacy) == 1


def test_queue_failure_rolls_back_linked_trip_and_deal(monkeypatch):
    d = seed_deal("accepted", from_country="KZ", to_country="KZ")
    trip = seed_trip(d)
    def failed(*args, **kwargs):
        raise RuntimeError("QA injected outbox failure")
    monkeypatch.setattr(push_gateway, "enqueue_event", failed)
    monkeypatch.setattr(marketplace, "send_to_user", lambda *a, **kw: pytest.fail("Не коммитить legacy push"))
    with pytest.raises(RuntimeError, match="QA injected outbox failure"):
        marketplace.update_trip_status(trip, "in_transit", {"id": DRIVER})
    assert deal_status(d) == "accepted"
    assert event_counts(d, trip, "in_progress") == (0, 0, 0)
    with get_conn() as c:
        assert c.execute("SELECT status FROM trips WHERE id=?", (trip,)).fetchone()[0] == "booked"
