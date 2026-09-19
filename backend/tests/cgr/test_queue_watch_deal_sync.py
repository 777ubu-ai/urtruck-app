import sqlite3
from contextlib import contextmanager

from api import marketplace
from cgr import queue_watch


def test_crossed_sync_uses_canonical_deal_fsm(monkeypatch):
    calls = []

    def fake_update(deal_id, new_status, user):
        calls.append((deal_id, new_status, user))
        return {"ok": True, "status": new_status}

    monkeypatch.setattr(marketplace, "update_deal_status", fake_update)
    queue_watch._sync_crossed_to_deal({"id": "deal-1", "status": "in_progress", "driver_id": "driver-1"})
    assert calls == [("deal-1", "at_border", {"id": "driver-1"})]


def test_crossed_sync_never_skips_fsm_from_non_in_progress(monkeypatch):
    calls = []
    monkeypatch.setattr(marketplace, "update_deal_status", lambda *args, **kwargs: calls.append((args, kwargs)))
    queue_watch._sync_crossed_to_deal({"id": "deal-1", "status": "accepted", "driver_id": "driver-1"})
    queue_watch._sync_crossed_to_deal({"id": "deal-2", "status": "at_border", "driver_id": "driver-1"})
    assert calls == []


def test_active_deals_match_canonical_vehicle_plate(monkeypatch):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
      CREATE TABLE trips (id TEXT PRIMARY KEY, vehicle_id TEXT);
      CREATE TABLE vehicles (
        id TEXT PRIMARY KEY, owner_user_id TEXT, license_plate TEXT
      );
      CREATE TABLE deals (
        id TEXT PRIMARY KEY, driver_id TEXT, shipper_id TEXT, trip_id TEXT,
        vehicle_id TEXT, vehicle_plate_snapshot TEXT, status TEXT
      );
    """)
    db.execute("INSERT INTO vehicles VALUES ('v1','driver-1','123 ABC-02')")
    db.execute("INSERT INTO trips VALUES ('trip-1','v1')")
    db.execute("INSERT INTO deals VALUES ('deal-1','driver-1','shipper-1','trip-1',NULL,NULL,'in_progress')")
    db.execute("INSERT INTO deals VALUES ('deal-2','driver-1','shipper-1',NULL,NULL,'777ZZZ02','accepted')")
    db.commit()

    @contextmanager
    def fake_conn():
        yield db

    monkeypatch.setattr(queue_watch, "get_conn", fake_conn)
    first = queue_watch._active_deals_for_plate("driver-1", "123ABC02")
    second = queue_watch._active_deals_for_plate("driver-1", "777 ZZZ-02")
    assert [d["id"] for d in first] == ["deal-1"]
    assert [d["id"] for d in second] == ["deal-2"]
