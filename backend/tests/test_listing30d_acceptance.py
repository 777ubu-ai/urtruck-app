"""Точные границы UTC, обе роли и атомарность принятия."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
import pytest
from fastapi import HTTPException
from api import marketplace as market
from database import db
from services.bid_expiry import expire_stale_marketplace, listing_deadline

NOW = datetime(2026, 11, 4, 12)
class Clock(datetime):
    @classmethod
    def utcnow(cls):
        return cls(2026, 11, 4, 12)

@pytest.fixture(autouse=True)
def isolated_clock(monkeypatch):
    monkeypatch.setattr(db, "_maybe_expire_marketplace", lambda c: None)
    monkeypatch.setattr(market, "datetime", Clock)
    monkeypatch.setattr(market, "send_to_user", lambda *a, **k: None)

def seed(kind, age=timedelta(days=1), status="active", bid_age=timedelta(hours=1)):
    listing, owner, bidder, bid = [db.new_id() for _ in range(4)]
    table, owner_col, route_col = (("cargos", "owner_id", "pickup_date") if kind == "cargo" else ("trips", "driver_id", "departure"))
    extra_col = ",cargo_desc" if kind == "cargo" else ""
    extra_value = ",'Оборудование'" if kind == "cargo" else ""
    with db.get_conn() as c:
        c.execute(f"INSERT INTO {table}(id,{owner_col},from_city,to_city,{route_col},status,published_at,created_at{extra_col}) VALUES(?,?,'Алматы','Астана','2020-01-01',?,?,?{extra_value})", (listing, owner, status, (NOW-age).isoformat(), (NOW-timedelta(days=90)).isoformat()))
        c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,created_at,updated_at) VALUES(?,?,?,900,'pending',?,?)", (bid, listing, bidder, (NOW-bid_age).isoformat(), (NOW-bid_age).isoformat()))
    return table, listing, owner, bidder, bid

@pytest.mark.parametrize("kind", ["cargo", "trip"])
@pytest.mark.parametrize("offset,active", [(-1, True), (0, False), (1, False)])
@pytest.mark.parametrize("fallback", [False, True])
def test_exact_deadline_in_feed_guard_and_cleanup(kind, offset, active, fallback):
    active = active or kind == "trip"
    table, listing, owner, bidder, bid = seed(kind)
    published = (NOW-timedelta(days=30, microseconds=offset)).isoformat()+"Z"
    with db.get_conn() as c:
        c.execute(f"UPDATE {table} SET published_at=?,created_at=? WHERE id=?", (None if fallback else published, published, listing))
        row = dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (listing,)).fetchone())
        assert market._within_publication_window(row, today=Clock(2026, 11, 4, 12)) is active
        if active:
            market._require_current_bid_listing(row)
        else:
            with pytest.raises(HTTPException): market._require_current_bid_listing(row)
        expire_stale_marketplace(now=NOW, conn=c)
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (listing,)).fetchone()[0] == ("active" if active else "expired")

def test_timezone_and_invalid_publication_fallback():
    assert listing_deadline("2026-10-05T17:00:00+05:00", None) == NOW
    assert listing_deadline("invalid", "2026-10-05 12:00:00") == NOW

@pytest.mark.parametrize("kind", ["cargo", "trip"])
@pytest.mark.parametrize("action", ["create", "update", "counter", "accept", "accept_counter", "reject", "cancel", "cancel_counter", "decline_counter"])
@pytest.mark.parametrize("reason", ["listing_deadline", "listing_closed", "bid_deadline"])
def test_reject_stale_mutation_without_periodic_cleanup(kind, action, reason):
    table, listing, owner, bidder, bid = seed(kind, age=timedelta(days=30) if reason == "listing_deadline" else timedelta(days=1), status="unpublished" if reason == "listing_closed" else "active", bid_age=timedelta(hours=48) if reason == "bid_deadline" else timedelta(hours=1))
    if action in ("accept_counter", "cancel_counter", "decline_counter"):
        with db.get_conn() as c: c.execute("UPDATE bids SET status='countered',counter_amount=950 WHERE id=?", (bid,))
    calls = {
        "create": lambda: market.create_bid(market.BidIn(**{f"{kind}_id": listing}, amount=950), user={"id": db.new_id(), "role": "driver" if kind == "cargo" else "client"}),
        "update": lambda: market.update_bid(bid, market.BidUpdateIn(amount=950), user={"id": bidder}),
        "counter": lambda: market.counter_bid(bid, market.BidCounterIn(amount=950), user={"id": owner}),
        "accept": lambda: market.accept_bid(bid, user={"id": owner}),
        "accept_counter": lambda: market.accept_counter(bid, user={"id": bidder}),
        "reject": lambda: market.reject_bid(bid, user={"id": owner}),
        "cancel": lambda: market.cancel_bid(bid, user={"id": bidder}),
        "cancel_counter": lambda: market.cancel_counter_as_owner(bid, user={"id": owner}),
        "decline_counter": lambda: market.decline_counter(bid, user={"id": bidder}),
    }
    if action == "create" and reason == "bid_deadline":
        assert calls[action]()["ok"]
        return
    if kind == "trip" and reason == "listing_deadline":
        assert calls[action]()["ok"], "Активный собственный рейс продлевается без ручного действия"
        return
    with pytest.raises(HTTPException) as caught: calls[action]()
    assert caught.value.status_code == 409
    with db.get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM deals WHERE bid_id=?", (bid,)).fetchone()[0] == 0
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (listing,)).fetchone()[0] == ("unpublished" if reason == "listing_closed" else "active")

@pytest.mark.parametrize("kind", ["cargo", "trip"])
def test_repeat_accept_has_one_deal_message_and_both_notifications(kind):
    table, listing, owner, bidder, bid = seed(kind)
    result = market.accept_bid(bid, user={"id": owner})
    with pytest.raises(HTTPException): market.accept_bid(bid, user={"id": owner})
    with db.get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM deals WHERE bid_id=?", (bid,)).fetchone()[0] == 1
        assert c.execute("SELECT COUNT(*) FROM chat_messages WHERE room_id=? AND sender_id='system'", (result["chat_room_id"],)).fetchone()[0] == 1
        assert {r[0] for r in c.execute("SELECT user_id FROM notifications WHERE event_key=?", (f"bid:{bid}:accepted",))} == {owner, bidder}
        assert {r[0] for r in c.execute("SELECT recipient_user_id FROM push_outbox WHERE event_id=?", (f"bid:{bid}:accepted",))} == {owner, bidder}
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (listing,)).fetchone()[0] == ("taken" if kind == "cargo" else "booked")

@pytest.mark.parametrize("kind", ["cargo", "trip"])
@pytest.mark.parametrize("failure", ["notification", "message", "event", "price_event"])
def test_failed_accept_rolls_back_all_writes(kind, failure, monkeypatch):
    table, listing, owner, bidder, bid = seed(kind)
    from api import notifications
    from database import deal_room_dal
    def fail(*a, **k): raise RuntimeError("Контрольный сбой транзакции")
    if failure == "notification": monkeypatch.setattr(notifications, "create_notification", fail)
    elif failure == "event": monkeypatch.setattr(deal_room_dal, "create_deal_event", fail)
    elif failure == "price_event": monkeypatch.setattr(market, "_record_price_event", lambda *a, **k: None)
    else:
        with db.get_conn() as c: c.execute("CREATE TRIGGER qa_fail_chat BEFORE INSERT ON chat_messages BEGIN SELECT RAISE(ABORT,'Контрольный сбой'); END")
    try:
        with pytest.raises(Exception): market.accept_bid(bid, user={"id": owner})
    finally:
        if failure == "message":
            with db.get_conn() as c: c.execute("DROP TRIGGER qa_fail_chat")
    with db.get_conn() as c:
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (listing,)).fetchone()[0] == "active"
        assert c.execute("SELECT status FROM bids WHERE id=?", (bid,)).fetchone()[0] == "pending"
        assert c.execute("SELECT COUNT(*) FROM deals WHERE bid_id=?", (bid,)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM notifications WHERE event_key=?", (f"bid:{bid}:accepted",)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM push_outbox WHERE event_id=?", (f"bid:{bid}:accepted",)).fetchone()[0] == 0

@pytest.mark.parametrize("kind", ["cargo", "trip"])
def test_concurrent_accept_has_one_winner(kind):
    table, listing, owner, bidder, bid = seed(kind)
    other = db.new_id()
    with db.get_conn() as c: c.execute(f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status) VALUES(?,?,?,950,'pending')", (other, listing, db.new_id()))
    gate = Barrier(2)
    def run(b):
        gate.wait(timeout=5)
        try: return market.accept_bid(b, user={"id": owner})["ok"]
        except HTTPException as e:
            assert e.status_code == 409
            return False
    with ThreadPoolExecutor(max_workers=2) as pool: assert sorted(pool.map(run, (bid, other))) == [False, True]
    with db.get_conn() as c:
        assert c.execute(f"SELECT COUNT(*) FROM deals WHERE {kind}_id=?", (listing,)).fetchone()[0] == 1
        assert sorted(r[0] for r in c.execute(f"SELECT status FROM bids WHERE {kind}_id=?", (listing,))) == ["accepted", "rejected"]

@pytest.mark.parametrize("kind", ["cargo", "trip"])
def test_explicit_republish_preserves_route_date(kind):
    table, listing, owner, bidder, bid = seed(kind, status="unpublished")
    result = (market.republish_cargo if kind == "cargo" else market.republish_trip)(listing, user={"id": owner})
    assert result["pickup_date" if kind == "cargo" else "departure"] == "2020-01-01"

@pytest.mark.parametrize("kind", ["cargo", "trip"])
@pytest.mark.parametrize("accepted", [False, True])
def test_expired_or_accepted_disappears_from_public_api(kind, accepted):
    table, listing, owner, bidder, bid = seed(kind, age=timedelta(days=1 if accepted else 30))
    if kind == "trip" and not accepted:
        with db.get_conn() as c:
            c.execute("UPDATE trips SET status='expired' WHERE id=?", (listing,))
    if accepted: market.accept_bid(bid, user={"id": owner})
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    app = FastAPI()
    app.include_router(market.mp_router, prefix="/market")
    client = TestClient(app)
    for demo in (False, True):
        response = client.get(f"/market/{table}", params={"show_demo": demo, "limit": 100})
        assert response.status_code == 200
        assert listing not in {r["id"] for r in response.json()[table]}

@pytest.mark.parametrize("kind", ["cargo", "trip"])
def test_ttl_activity_does_not_extend_parent(kind):
    table, listing, owner, bidder, bid = seed(kind, age=timedelta(days=29), bid_age=timedelta(hours=47))
    with db.get_conn() as c:
        before = c.execute(f"SELECT published_at FROM {table} WHERE id=?", (listing,)).fetchone()[0]
    assert market.counter_bid(bid, market.BidCounterIn(amount=950), user={"id": owner})["ok"]
    with db.get_conn() as c:
        assert c.execute(f"SELECT published_at FROM {table} WHERE id=?", (listing,)).fetchone()[0] == before
        activity = c.execute("SELECT updated_at FROM bids WHERE id=?", (bid,)).fetchone()[0]
        assert activity is not None
        # Груз истекает; активный рейс продлевается, ставка сохраняет своё окно.
        expire_stale_marketplace(now=NOW+timedelta(days=1), conn=c)
        assert c.execute("SELECT status FROM bids WHERE id=?", (bid,)).fetchone()[0] == ("countered" if kind == "trip" else "expired")
        assert c.execute(f"SELECT status FROM {table} WHERE id=?", (listing,)).fetchone()[0] == ("active" if kind == "trip" else "expired")

@pytest.mark.parametrize("kind", ["cargo", "trip"])
def test_request_probe_uses_valid_created_at_when_publication_is_invalid(kind):
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE cargos(id,status,published_at,created_at,pickup_date);
        CREATE TABLE trips(id,status,published_at,created_at,departure);
        CREATE TABLE bids(id,status,updated_at,created_at,cargo_id,trip_id);
        CREATE TABLE deals(id,status,cargo_id,trip_id);
    """)
    table = "cargos" if kind == "cargo" else "trips"
    c.execute(f"INSERT INTO {table} VALUES('listing','active','invalid',datetime('now','-30 days'),'2020-01-01')")
    assert db._market_expiry_due(c)
    c.execute(f"UPDATE {table} SET published_at=datetime('now')")
    assert not db._market_expiry_due(c), "Старая дата маршрута не запускает полную очистку при каждом запросе"

def test_accept_locale_read_does_not_open_another_database_connection(monkeypatch):
    table, listing, owner, bidder, bid = seed('cargo')
    def nested_read(*args):
        raise AssertionError('Вложенный get_conn может запустить очистку под write lock')
    monkeypatch.setattr(market.push_gateway, 'get_recipient_locale', nested_read)
    assert market.accept_bid(bid, user={'id': owner})['ok']

@pytest.mark.parametrize('kind', ['cargo', 'trip'])
@pytest.mark.parametrize('counter', [False, True])
def test_legacy_self_bid_cannot_create_a_deal(kind, counter):
    table, listing, owner, bidder, bid = seed(kind)
    with db.get_conn() as c:
        c.execute("UPDATE bids SET bidder_id=?, status=?, counter_amount=950 WHERE id=?", (owner, 'countered' if counter else 'pending', bid))
    with pytest.raises(HTTPException) as caught:
        (market.accept_counter if counter else market.accept_bid)(bid, user={'id':owner})
    assert caught.value.status_code == 403
    with db.get_conn() as c:
        assert c.execute('SELECT COUNT(*) FROM deals WHERE bid_id=?', (bid,)).fetchone()[0] == 0
        assert c.execute(f'SELECT status FROM {table} WHERE id=?', (listing,)).fetchone()[0] == 'active'
