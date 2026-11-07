"""Автопродление собственных грузов/рейсов без восстановления архива и продления ставок."""
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import marketplace as market
from database import db, registration_dal
from services import bid_expiry, notification_policy, scheduled_notifications

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


def seed_busy_listing(kind, busy, age=95):
    table, iid, owner, original = seed(kind, age)
    participant = db.new_id()
    with db.get_conn() as c:
        if busy in ("pointer", "both"):
            occupied = "taken_by" if kind == "cargo" else "booked_by"
            c.execute(f"UPDATE {table} SET {occupied}=? WHERE id=?", (participant, iid))
        if busy in ("deal", "both"):
            accepted_bid = db.new_id()
            c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status) VALUES(?,?,?,100,'accepted')", (accepted_bid, iid, participant))
            c.execute(f"INSERT INTO deals(id,bid_id,shipper_id,driver_id,{kind}_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,'Алматы','Астана',100,'in_progress')", (db.new_id(), accepted_bid, owner if kind == "cargo" else participant, participant if kind == "cargo" else owner, iid))
    return table, iid, owner, original, participant


def listing_snapshot(table, kind, iid):
    with db.get_conn() as c:
        return {
            "listing": dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (iid,)).fetchone()),
            "bids": [dict(row) for row in c.execute(f"SELECT * FROM bids WHERE {kind}_id=? ORDER BY id", (iid,))],
            "deals": [dict(row) for row in c.execute(f"SELECT * FROM deals WHERE {kind}_id=? ORDER BY id", (iid,))],
        }


@pytest.mark.parametrize("busy", ["deal", "pointer", "both"])
@pytest.mark.parametrize("age", [1, 95])
def test_occupied_listing_never_renews_is_private_and_rejects_new_bid(kind, busy, age, monkeypatch):
    from tests.auth_harness import override_require_level

    table, iid, owner, _, participant = seed_busy_listing(kind, busy, age)
    before = listing_snapshot(table, kind, iid)
    with db.get_conn() as c:
        assert notification_policy.delivery_block_reason(
            db.new_id(), {kind + "_id": iid, "notification_category": "saved_search"}, conn=c, now=NOW
        ) == "listing_inactive"
        assert iid not in renewed(bid_expiry.expire_stale_marketplace(now=NOW, conn=c), table)
    assert listing_snapshot(table, kind, iid) == before

    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    bidder = {"id": db.new_id(), "role": "driver" if kind == "cargo" else "client"}
    override_require_level(app, lambda: bidder)
    client = TestClient(app)
    for demo in (False, True):
        response = client.get("/market/" + table, params={"show_demo": demo, "limit": 200})
        assert response.status_code == 200
        assert iid not in {row["id"] for row in response.json()[table]}

    monkeypatch.setattr(market, "_maybe_user", lambda token: {"id": owner if token == "owner" else participant if token == "participant" else "outsider"} if token else None)
    endpoint = "/market/" + table + "/" + iid
    assert client.get(endpoint).status_code == 404
    assert client.get(endpoint, headers={"Authorization": "outsider"}).status_code == 404
    assert client.get(endpoint, headers={"Authorization": "owner"}).status_code == 200
    if busy in ("deal", "both"):
        assert client.get(endpoint, headers={"Authorization": "participant"}).status_code == 200
    response = client.post("/market/bids", json={kind + "_id": iid, "amount": 200})
    assert response.status_code == 409, response.text
    assert listing_snapshot(table, kind, iid) == before


@pytest.mark.parametrize("busy", ["deal", "pointer"])
@pytest.mark.parametrize("action", ["update", "counter", "accept", "accept_counter"])
def test_occupied_listing_blocks_existing_bid_mutations_without_side_effects(kind, busy, action):
    table, iid, owner, _, _ = seed_busy_listing(kind, busy)
    bidder, bid = db.new_id(), db.new_id()
    state = "countered" if action == "accept_counter" else "pending"
    with db.get_conn() as c:
        stamp = (NOW - timedelta(hours=1)).isoformat()
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at,counter_amount) VALUES(?,?,?,100,?,?,?,150)", (bid, iid, bidder, state, stamp, stamp))
    before = listing_snapshot(table, kind, iid)
    calls = {
        "update": lambda: market.update_bid(bid, market.BidUpdateIn(amount=150), user={"id": bidder}),
        "counter": lambda: market.counter_bid(bid, market.BidCounterIn(amount=150), user={"id": owner}),
        "accept": lambda: market.accept_bid(bid, user={"id": owner}),
        "accept_counter": lambda: market.accept_counter(bid, user={"id": bidder}),
    }
    with pytest.raises(HTTPException) as caught:
        calls[action]()
    assert caught.value.status_code == 409
    assert listing_snapshot(table, kind, iid) == before


@pytest.mark.parametrize("status", ["completed", "cancelled"])
def test_old_terminal_deal_does_not_block_current_free_listing(kind, status):
    table, iid, owner, _ = seed(kind, 95)
    with db.get_conn() as c:
        c.execute(f"INSERT INTO deals(id,bid_id,shipper_id,driver_id,{kind}_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,'Алматы','Астана',100,?)", (db.new_id(), db.new_id(), owner if kind == "cargo" else db.new_id(), owner if kind == "trip" else db.new_id(), iid, status))
        assert iid in renewed(bid_expiry.expire_stale_marketplace(now=NOW, conn=c), table)
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    response = TestClient(app).get("/market/" + table, params={"limit": 200})
    assert iid in {row["id"] for row in response.json()[table]}
    result = market.create_bid(market.BidIn(**{kind + "_id": iid}, amount=100), user={"id": db.new_id(), "role": "driver" if kind == "cargo" else "client"})
    assert result["ok"]


def test_stale_snapshot_visible_and_actionable_before_cleanup(kind):
    table, iid, owner, _ = seed(kind, 95)
    with db.get_conn() as c:
        row = dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (iid,)).fetchone())
    assert (market._public_cargo_ok if kind == "cargo" else market._public_trip_ok)(row)
    assert notification_policy.active_listing(row, NOW)
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    for demo in (False, True):
        response = TestClient(app).get("/market/" + table, params={"show_demo": demo, "limit": 200})
        assert [r["id"] for r in response.json()[table]].count(iid) == 1
    result = market.create_bid(market.BidIn(**{kind + "_id": iid}, amount=100), user={"id": db.new_id(), "role": "driver" if kind == "cargo" else "client"})
    assert result["ok"]
    with db.get_conn() as c:
        bid = c.execute(f"SELECT id FROM bids WHERE {kind}_id=?", (iid,)).fetchone()[0]
    assert market.accept_bid(bid, user={"id": owner})["ok"]


def test_renewing_listing_never_emits_manual_extension_reminder(kind):
    table, iid, owner, original = seed(kind, 29.5)
    with db.get_conn() as c:
        c.execute("INSERT INTO notification_preferences(user_id,listing_lifecycle) VALUES(?,1)", (owner,))
    scheduled_notifications.lifecycle_job(now=NOW)
    with db.get_conn() as c:
        assert c.execute("SELECT count(*) FROM notifications WHERE user_id=? AND type='listing_lifecycle'", (owner,)).fetchone()[0] == 0
        data = {kind + "_id": iid, "notification_category": "listing_lifecycle", "publication_at": original, "lifecycle_stage": "expiring"}
        assert notification_policy.delivery_block_reason(owner, data, conn=c, now=NOW) == "listing_auto_renewed"


def test_concurrent_housekeeping_renews_once(kind):
    table, iid, _, _ = seed(kind, 60)
    barrier = Barrier(2)
    def run(_):
        with db.get_conn() as c:
            barrier.wait(timeout=5)
            return renewed(bid_expiry.expire_stale_marketplace(now=NOW, conn=c), table)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum((r for r in pool.map(run, range(2))), []).count(iid) == 1


def test_failed_bid_notification_rolls_back_renewal(kind, monkeypatch):
    table, iid, _, original = seed(kind)
    with db.get_conn() as c:
        stamp = (NOW-timedelta(hours=48)).isoformat()
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at) VALUES(?,?,?,100,'pending',?,?)", (db.new_id(), iid, db.new_id(), stamp, stamp))
    def fail(*args):
        raise RuntimeError("Контрольный отказ очереди")
    monkeypatch.setattr(bid_expiry, "_queue_expired_bid_notifications", fail)
    with pytest.raises(RuntimeError):
        bid_expiry.expire_stale_marketplace(now=NOW)
    with db.get_conn() as c:
        assert tuple(c.execute(f"SELECT status,published_at FROM {table} WHERE id=?", (iid,)).fetchone()) == ("active", original)
        assert c.execute(f"SELECT status FROM bids WHERE {kind}_id=?", (iid,)).fetchone()[0] == "pending"


def test_renewal_does_not_replay_no_bids(kind):
    table, iid, owner, _ = seed(kind, age=1)
    with db.get_conn() as c:
        c.execute("INSERT INTO notification_preferences(user_id,no_bids) VALUES(?,1)", (owner,))
    assert scheduled_notifications.queue_no_bids(kind, iid, now=NOW)
    with db.get_conn() as c:
        bid_expiry.expire_stale_marketplace(now=NOW+timedelta(days=31), conn=c)
    assert not scheduled_notifications.queue_no_bids(kind, iid, now=NOW+timedelta(days=31))
    with db.get_conn() as c:
        assert c.execute("SELECT count(*) FROM notification_event_claims WHERE event_key=?", (f"no_bids:{kind}:{iid}",)).fetchone()[0] == 1


def deleted_listing(kind, age=95):
    table, iid, owner, original = seed(kind, age)
    with db.get_conn() as c:
        c.execute("INSERT INTO drivers_registration(id,phone,full_name,role,status) VALUES(?,?,?,?,?)", (owner, owner, "Владелец fixture", "client" if kind == "cargo" else "driver", "approved"))
    assert registration_dal.delete_account(owner)
    return table, iid, owner, original


@pytest.mark.parametrize("age", [1, 95])
def test_deleted_owner_never_renews_or_appears_public(kind, age):
    table, iid, owner, original = deleted_listing(kind, age)
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    client = TestClient(app)
    # Проверяем до housekeeping: ни задержка, ни show_demo не раскрывают запись.
    for demo in (False, True):
        response = client.get("/market/" + table, params={"show_demo": demo, "limit": 200})
        assert response.status_code == 200
        assert iid not in {r["id"] for r in response.json()[table]}
    assert client.get("/market/" + table + "/" + iid).status_code == 404
    with pytest.raises(HTTPException) as caught:
        market.create_bid(market.BidIn(**{kind + "_id": iid}, amount=100), user={"id": db.new_id(), "role": "driver" if kind == "cargo" else "client"})
    assert caught.value.status_code == 409
    with db.get_conn() as c:
        assert notification_policy.listing(c, kind, iid) is None
        result = bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert iid not in renewed(result, table)
        assert tuple(c.execute(f"SELECT status,published_at FROM {table} WHERE id=?", (iid,)).fetchone()) == ("expired" if age >= 30 else "active", original)
        assert c.execute(f"SELECT count(*) FROM {table} WHERE id=?", (iid,)).fetchone()[0] == 1


def test_deleted_owner_keeps_existing_deal_participant_history(kind, monkeypatch):
    table, iid, owner, original = deleted_listing(kind)
    participant = db.new_id()
    with db.get_conn() as c:
        c.execute(f"INSERT INTO deals(id,bid_id,shipper_id,driver_id,{kind}_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,'Алматы','Астана',100,'in_progress')", (db.new_id(), db.new_id(), owner if kind == "cargo" else participant, participant if kind == "cargo" else owner, iid))
        bid_expiry.expire_stale_marketplace(now=NOW, conn=c)
        assert tuple(c.execute(f"SELECT status,published_at FROM {table} WHERE id=?", (iid,)).fetchone()) == ("active", original)
        assert notification_policy.delivery_block_reason(participant, {"event": "deal.status.in_progress"}, conn=c, now=NOW) is None
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    monkeypatch.setattr(market, "_maybe_user", lambda token: {"id": participant} if token == "participant" else {"id": "outsider"})
    client = TestClient(app)
    endpoint = "/market/" + table + "/" + iid
    assert client.get(endpoint, headers={"Authorization": "outsider"}).status_code == 404
    assert client.get(endpoint, headers={"Authorization": "participant"}).status_code == 200


@pytest.mark.parametrize("action", ["update", "counter", "accept", "accept_counter"])
def test_deleted_owner_blocks_existing_bid_mutations_without_side_effects(kind, action):
    table, iid, owner, original = deleted_listing(kind, age=1)
    bidder, bid = db.new_id(), db.new_id()
    state = "countered" if action == "accept_counter" else "pending"
    with db.get_conn() as c:
        stamp=(NOW-timedelta(hours=1)).isoformat()
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at,counter_amount) VALUES(?,?,?,100,?,?,?,150)", (bid, iid, bidder, state, stamp, stamp))
    calls = {
        "update": lambda: market.update_bid(bid, market.BidUpdateIn(amount=150), user={"id": bidder}),
        "counter": lambda: market.counter_bid(bid, market.BidCounterIn(amount=150), user={"id": owner}),
        "accept": lambda: market.accept_bid(bid, user={"id": owner}),
        "accept_counter": lambda: market.accept_counter(bid, user={"id": bidder}),
    }
    with pytest.raises(HTTPException) as caught:
        calls[action]()
    assert caught.value.status_code == 409
    with db.get_conn() as c:
        assert c.execute(f"SELECT count(*) FROM deals WHERE {kind}_id=?", (iid,)).fetchone()[0] == 0
        assert c.execute("SELECT status FROM bids WHERE id=?", (bid,)).fetchone()[0] == state
        assert c.execute(f"SELECT published_at FROM {table} WHERE id=?", (iid,)).fetchone()[0] == original
