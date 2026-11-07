"""Автопродление собственных грузов/рейсов без восстановления архива и продления ставок."""
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import marketplace as market
from database import db, registration_dal
from services import bid_expiry

NOW = datetime(2026, 11, 7, 12)


@pytest.fixture(params=["cargo", "trip"])
def kind(request):
    return request.param


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    class Clock(datetime):
        @classmethod
        def utcnow(cls):
            return cls(2026, 11, 7, 12)
    monkeypatch.setattr(db, "_maybe_expire_marketplace", lambda c: None)
    monkeypatch.setattr(market, "datetime", Clock)
    monkeypatch.setattr(market, "send_to_user", lambda *a, **k: None)


def seed(kind, age=30, status="active", published=None):
    table, owner_col, date_col = (("cargos", "owner_id", "pickup_date") if kind == "cargo"
                                  else ("trips", "driver_id", "departure"))
    iid, owner = db.new_id(), db.new_id()
    stamp = published or (NOW - timedelta(days=age)).isoformat()
    extra_col, extra_value = (",cargo_desc", ",'Оборудование'") if kind == "cargo" else ("", "")
    with db.get_conn() as c:
        c.execute(f"INSERT INTO {table}(id,{owner_col},from_city,to_city,{date_col},status,published_at,created_at{extra_col}) VALUES(?,?,'Алматы','Астана','2020-01-01',?,?,?{extra_value})", (iid, owner, status, stamp, stamp))
    return table, iid, owner, stamp


def renewed(result, table):
    return result["renewed_" + table]


@pytest.mark.parametrize("age", [30, 31, 60, 95])
def test_renewal_is_cyclic_idempotent_and_keeps_identity(kind, age):
    table, iid, owner, original = seed(kind, age)
    with db.get_conn() as c:
        first = bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        second = bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        row = dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (iid,)).fetchone())
        assert row["status"] == "active"
        assert row["owner_id" if kind == "cargo" else "driver_id"] == owner
        assert row["created_at"] == original
        assert row["pickup_date" if kind == "cargo" else "departure"] == "2020-01-01"
        deadline = bid_expiry.listing_deadline(row["published_at"], row["created_at"])
        assert NOW < deadline <= NOW + timedelta(days=30)
        assert renewed(first, table).count(iid) == 1 and iid not in renewed(second, table)
        assert c.execute(f"SELECT count(*) FROM {table} WHERE id=?", (iid,)).fetchone()[0] == 1


@pytest.mark.parametrize("published", ["2026-10-08T12:00:00Z", "2026-10-08T17:00:00+05:00"])
def test_exact_utc_boundary_and_microsecond_before(kind, published):
    table, iid, _, _ = seed(kind, published=published)
    with db.get_conn() as c:
        assert iid not in renewed(bid_expiry.expire_stale_marketplace(now=NOW-timedelta(microseconds=1), conn=c), table)
        assert renewed(bid_expiry.expire_stale_marketplace(now=NOW, conn=c), table).count(iid) == 1


@pytest.mark.parametrize("status", ["expired", "unpublished", "cancelled", "rejected", "occupied", "completed"])
def test_archive_and_manually_closed_listing_are_unchanged(kind, status):
    status = ("taken" if kind == "cargo" else "booked") if status == "occupied" else status
    table, iid, _, original = seed(kind, status=status)
    with db.get_conn() as c:
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert tuple(c.execute(f"SELECT status,published_at FROM {table} WHERE id=?", (iid,)).fetchone()) == (status, original)


def test_active_deal_is_unchanged_and_bid_keeps_48h_ttl(kind):
    table, iid, _, original = seed(kind)
    with db.get_conn() as c:
        c.execute(f"INSERT INTO deals(id,bid_id,shipper_id,driver_id,{kind}_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,'Алматы','Астана',100,'in_progress')", (db.new_id(), db.new_id(), db.new_id(), db.new_id(), iid))
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert c.execute(f"SELECT published_at FROM {table} WHERE id=?", (iid,)).fetchone()[0] == original
    table, iid, _, _ = seed(kind)
    bid = db.new_id()
    with db.get_conn() as c:
        stamp = (NOW-timedelta(hours=48)).isoformat()
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at) VALUES(?,?,?,100,'pending',?,?)", (bid, iid, db.new_id(), stamp, stamp))
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert c.execute("SELECT status FROM bids WHERE id=?", (bid,)).fetchone()[0] == "expired"
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (iid,)).fetchone()[0] == "active"



@pytest.mark.parametrize("kind", ["cargo", "trip"])
@pytest.mark.parametrize("counter", [False, True])
def test_legacy_accept_and_counter_keep_working_after_route_date_passed(kind, counter):
    table, iid, owner, _ = seed(kind, age=60)
    bidder, bid = db.new_id(), db.new_id()
    with db.get_conn() as c:
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at,counter_amount) VALUES(?,?,?,100,?,?,?,120)",
                  (bid, iid, bidder, 'countered' if counter else 'pending', NOW.isoformat(), NOW.isoformat()))
    result = (market.accept_counter if counter else market.accept_bid)(bid, user={'id': bidder if counter else owner})
    assert result['ok']
    with db.get_conn() as c:
        assert c.execute('SELECT COUNT(*) FROM deals WHERE bid_id=?', (bid,)).fetchone()[0] == 1
        assert c.execute('SELECT status FROM bids WHERE id=?', (bid,)).fetchone()[0] == 'accepted'
        assert c.execute(f'SELECT status FROM {table} WHERE id=?', (iid,)).fetchone()[0] == ('taken' if kind == 'cargo' else 'booked')
