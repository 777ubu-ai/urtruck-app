"""Автопродление собственного рейса без восстановления архива и продления ставок."""
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import marketplace as market
from database import db
from services import bid_expiry, notification_policy, scheduled_notifications

NOW = datetime(2026, 11, 7, 12)


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    class Clock(datetime):
        @classmethod
        def utcnow(cls):
            return cls(2026, 11, 7, 12)
    monkeypatch.setattr(db, "_maybe_expire_marketplace", lambda c: None)
    monkeypatch.setattr(market, "datetime", Clock)
    monkeypatch.setattr(market, "send_to_user", lambda *a, **k: None)


def seed(age=30, status="active", published=None):
    tid, owner = db.new_id(), db.new_id()
    stamp = published or (NOW - timedelta(days=age)).isoformat()
    with db.get_conn() as c:
        c.execute("INSERT INTO trips(id,driver_id,from_city,to_city,departure,status,published_at,created_at) VALUES(?,?,'Алматы','Астана','2020-01-01',?,?,?)", (tid, owner, status, stamp, stamp))
    return tid, owner, stamp


@pytest.mark.parametrize("age", [30, 31, 60, 95])
def test_renewal_is_cyclic_idempotent_and_keeps_identity(age):
    tid, owner, original = seed(age)
    with db.get_conn() as c:
        first = bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        second = bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        row = dict(c.execute("SELECT * FROM trips WHERE id=?", (tid,)).fetchone())
        assert row["status"] == "active"
        assert row["driver_id"] == owner and row["created_at"] == original
        assert row["departure"] == "2020-01-01"
        deadline = bid_expiry.listing_deadline(row["published_at"], row["created_at"])
        assert NOW < deadline <= NOW + timedelta(days=30)
        assert first["renewed_trips"] == [tid] and second["renewed_trips"] == []
        assert c.execute("SELECT count(*) FROM trips WHERE id=?", (tid,)).fetchone()[0] == 1


@pytest.mark.parametrize("published", ["2026-10-08T12:00:00Z", "2026-10-08T17:00:00+05:00"])
def test_exact_utc_boundary_and_microsecond_before(published):
    tid, _, _ = seed(published=published)
    with db.get_conn() as c:
        assert bid_expiry.expire_stale_marketplace(now=NOW-timedelta(microseconds=1), conn=c)["renewed_trips"] == []
        assert bid_expiry.expire_stale_marketplace(now=NOW, conn=c)["renewed_trips"] == [tid]


@pytest.mark.parametrize("status", ["expired", "unpublished", "cancelled", "rejected", "booked", "completed"])
def test_archive_and_manually_closed_trip_are_unchanged(status):
    tid, _, original = seed(status=status)
    with db.get_conn() as c:
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert tuple(c.execute("SELECT status,published_at FROM trips WHERE id=?", (tid,)).fetchone()) == (status, original)


def test_active_deal_is_unchanged_and_bid_keeps_48h_ttl():
    tid, _, original = seed()
    with db.get_conn() as c:
        c.execute("INSERT INTO deals(id,bid_id,shipper_id,driver_id,trip_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,'Алматы','Астана',100,'in_progress')", (db.new_id(), db.new_id(), db.new_id(), db.new_id(), tid))
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert c.execute("SELECT published_at FROM trips WHERE id=?", (tid,)).fetchone()[0] == original
    tid, _, _ = seed()
    bid = db.new_id()
    with db.get_conn() as c:
        c.execute("INSERT INTO bids(id,trip_id,bidder_id,amount,status,created_at,updated_at) VALUES(?,?,?,100,'pending',?,?)", (bid, tid, db.new_id(), (NOW-timedelta(hours=48)).isoformat(), (NOW-timedelta(hours=48)).isoformat()))
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert c.execute("SELECT status FROM bids WHERE id=?", (bid,)).fetchone()[0] == "expired"
        assert c.execute("SELECT status FROM trips WHERE id=?", (tid,)).fetchone()[0] == "active"


def test_stale_snapshot_visible_and_actionable_before_cleanup():
    tid, owner, _ = seed(95)
    with db.get_conn() as c:
        row = dict(c.execute("SELECT * FROM trips WHERE id=?", (tid,)).fetchone())
    assert market._public_trip_ok(row)
    assert notification_policy.active_listing(row, NOW)
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    for demo in (False, True):
        response = TestClient(app).get("/market/trips", params={"show_demo": demo, "limit": 200})
        assert tid in {r["id"] for r in response.json()["trips"]}
    result = market.create_bid(market.BidIn(trip_id=tid, amount=100), user={"id": db.new_id(), "role": "client"})
    assert result["ok"]
    with db.get_conn() as c:
        bid = c.execute("SELECT id FROM bids WHERE trip_id=?", (tid,)).fetchone()[0]
    assert market.accept_bid(bid, user={"id": owner})["ok"]


def test_renewing_trip_never_emits_manual_extension_reminder():
    tid, owner, _ = seed(29.5)
    with db.get_conn() as c:
        c.execute("INSERT INTO notification_preferences(user_id,listing_lifecycle) VALUES(?,1)", (owner,))
    scheduled_notifications.lifecycle_job(now=NOW)
    with db.get_conn() as c:
        assert c.execute("SELECT count(*) FROM notifications WHERE user_id=? AND type='listing_lifecycle'", (owner,)).fetchone()[0] == 0


def test_concurrent_housekeeping_renews_once():
    tid, _, _ = seed(60)
    barrier = Barrier(2)
    def run(_):
        with db.get_conn() as c:
            barrier.wait(timeout=5)
            return bid_expiry.expire_stale_marketplace(now=NOW, conn=c)["renewed_trips"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum((r for r in pool.map(run, range(2))), []) == [tid]


def test_failed_bid_notification_rolls_back_renewal(monkeypatch):
    tid, _, original = seed()
    with db.get_conn() as c:
        stamp = (NOW-timedelta(hours=48)).isoformat()
        c.execute("INSERT INTO bids(id,trip_id,bidder_id,amount,status,created_at,updated_at) VALUES(?,?,?,100,'pending',?,?)", (db.new_id(), tid, db.new_id(), stamp, stamp))
    def fail(*args):
        raise RuntimeError("Контрольный отказ очереди")
    monkeypatch.setattr(bid_expiry, "_queue_expired_bid_notifications", fail)
    with pytest.raises(RuntimeError):
        bid_expiry.expire_stale_marketplace(now=NOW)
    with db.get_conn() as c:
        assert tuple(c.execute("SELECT status,published_at FROM trips WHERE id=?", (tid,)).fetchone()) == ("active", original)
        assert c.execute("SELECT status FROM bids WHERE trip_id=?", (tid,)).fetchone()[0] == "pending"
