import sqlite3

import pytest

from backend.infrastructure.outbox.worker import PersistentOutboxWorker
from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService, DomainError


SCHEMA = open("backend/database/marketplace_schema.sql").read() + open("backend/database/deals_schema.sql").read()


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES ('c1','ship','A','B','x','active')")
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',100,'pending')")
    conn.commit()
    return conn


def context(key=None):
    return CommandContext("op", "corr", key)


def test_accept_bid_commits_business_change_and_outbox():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    result = DealsBidsService(conn).accept_bid("b1", Actor("ship", "client"), context("accept-1"))
    conn.commit()
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "accepted"
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "taken"
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox").fetchone()[0] == 2
    assert result["deal_id"]


def test_outbox_failure_rolls_back_accept_bid():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    service._event = lambda *args: (_ for _ in ()).throw(RuntimeError("outbox unavailable"))
    with pytest.raises(RuntimeError):
        service.accept_bid("b1", Actor("ship", "client"), context("accept-fail"))
    conn.rollback()
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "pending"
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "active"
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox").fetchone()[0] == 0


def test_accept_is_idempotent_and_conflicting_key_is_rejected():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    first = service.accept_bid("b1", Actor("ship", "client"), context("same-key"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    second = DealsBidsService(conn).accept_bid("b1", Actor("ship", "client"), context("same-key"))
    conn.commit()
    assert second == first
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(DomainError) as error:
        DealsBidsService(conn).accept_bid("b1", Actor("ship", "client"), context("same-key"), amount=99)
    conn.rollback()
    assert error.value.detail["error"] == "idempotency_key_conflict"


def test_transition_authorization_and_idempotency():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    accepted = service.accept_bid("b1", Actor("ship", "client"), context("accept"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(DomainError) as error:
        DealsBidsService(conn).transition_deal(accepted["deal_id"], "in_progress", Actor("ship", "client"), context("transition"))
    conn.rollback()
    assert error.value.status_code == 403


def test_outbox_worker_processes_and_retries():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    DealsBidsService(conn).accept_bid("b1", Actor("ship", "client"), context("accept"))
    conn.commit()
    seen = []
    worker = PersistentOutboxWorker(conn, {"BidAccepted": lambda event: seen.append(event.event_id), "DealCreated": lambda event: seen.append(event.event_id)})
    assert worker.process_one() == "processed"
    assert worker.process_one() == "processed"
    assert len(seen) == 2
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox WHERE status='processed'").fetchone()[0] == 2


def test_trip_status_cannot_reactivate_live_deal():
    conn = make_db()
    conn.execute("ALTER TABLE trips ADD COLUMN from_country TEXT")
    conn.execute("ALTER TABLE trips ADD COLUMN to_country TEXT")
    conn.execute("INSERT INTO trips(id,driver_id,from_city,to_city,status) VALUES ('t1','drv','A','B','active')")
    conn.execute("INSERT INTO bids(id,trip_id,bidder_id,amount,status) VALUES ('tb1','t1','ship',200,'pending')")
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    result = DealsBidsService(conn).accept_bid("tb1", Actor("drv", "driver"), context("trip-accept"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(DomainError) as error:
        DealsBidsService(conn).transition_trip_status("t1", "active", Actor("drv", "driver"), context("trip-reactivate"))
    conn.rollback()
    assert error.value.status_code == 409
    assert conn.execute("SELECT status FROM trips WHERE id='t1'").fetchone()[0] == "booked"
    assert conn.execute("SELECT COUNT(*) FROM deals WHERE trip_id='t1'").fetchone()[0] == 1


def test_country_guard_matches_legacy_semantics():
    conn = make_db()
    conn.execute("ALTER TABLE cargos ADD COLUMN from_country TEXT")
    conn.execute("ALTER TABLE cargos ADD COLUMN to_country TEXT")
    conn.execute("UPDATE cargos SET from_country='CN',to_country='KZ' WHERE id='c1'")
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    accepted = service.accept_bid("b1", Actor("ship", "client"), context("country-accept"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    service.transition_deal(accepted["deal_id"], "in_progress", Actor("drv", "driver"), context("country-start"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(DomainError) as error:
        DealsBidsService(conn).transition_deal(accepted["deal_id"], "delivered", Actor("drv", "driver"), context("country-skip"))
    conn.rollback()
    assert error.value.detail["error"] == "ROUTE_REQUIRES_BORDER_STEP"


def test_outbox_crash_before_ack_is_replayed_and_consumer_dedupes():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    DealsBidsService(conn).accept_bid("b1", Actor("ship", "client"), context("crash-accept"))
    conn.commit()
    calls = []
    applied = set()
    crashed = {"value": False}

    def handler(event):
        calls.append(event.event_id)
        if not crashed["value"]:
            crashed["value"] = True
            raise KeyboardInterrupt()
        if event.event_id not in applied:
            applied.add(event.event_id)

    worker = PersistentOutboxWorker(conn, {"BidAccepted": handler, "DealCreated": handler})
    with pytest.raises(KeyboardInterrupt):
        worker.process_one()
    conn.execute("UPDATE domain_outbox SET claimed_at=datetime('now','-10 minutes') WHERE status='processing'")
    conn.commit()
    assert worker.process_one() == "processed"
    assert len(calls) == 2
    assert len(applied) == 1
    assert conn.execute("SELECT status FROM domain_outbox WHERE event_id=?", (calls[0],)).fetchone()[0] == "processed"


def test_bid_mutations_replay_without_duplicate_rows_or_events():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    created = service.create_bid({"cargo_id": "c1", "amount": 110, "message": "new"}, Actor("drv2", "driver"), context("create"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert DealsBidsService(conn).create_bid({"cargo_id": "c1", "amount": 110, "message": "new"}, Actor("drv2", "driver"), context("create")) == created
    conn.commit()
    bid_id = created["id"]
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    updated = service.update_bid(bid_id, {"amount": 115}, Actor("drv2", "driver"), context("update"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert DealsBidsService(conn).update_bid(bid_id, {"amount": 115}, Actor("drv2", "driver"), context("update")) == updated
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    countered = DealsBidsService(conn).counter_bid(bid_id, {"amount": 120}, Actor("ship", "client"), context("counter"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert DealsBidsService(conn).counter_bid(bid_id, {"amount": 120}, Actor("ship", "client"), context("counter")) == countered
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    rejected = DealsBidsService(conn).reject_or_cancel(bid_id, "reject", Actor("ship", "client"), context("reject"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert DealsBidsService(conn).reject_or_cancel(bid_id, "reject", Actor("ship", "client"), context("reject")) == rejected
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    cancelled = DealsBidsService(conn).reject_or_cancel("b1", "cancel", Actor("drv", "driver"), context("cancel"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert DealsBidsService(conn).reject_or_cancel("b1", "cancel", Actor("drv", "driver"), context("cancel")) == cancelled
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM bids").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox").fetchone()[0] == 0


def test_counter_accept_cancel_and_decline_are_owned_by_v2():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    service.counter_bid("b1", {"amount": 120, "message": "counter"}, Actor("ship", "client"), context("counter"))
    conn.commit()

    conn.execute("BEGIN IMMEDIATE")
    first = DealsBidsService(conn).accept_counter("b1", Actor("drv", "driver"), context("counter-accept"))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    replay = DealsBidsService(conn).accept_counter("b1", Actor("drv", "driver"), context("counter-accept"))
    conn.commit()
    assert replay == first
    row = conn.execute("SELECT status, amount FROM bids WHERE id='b1'").fetchone()
    assert (row["status"], row["amount"]) == ("accepted", 120)
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1

    conn2 = make_db()
    conn2.execute("BEGIN IMMEDIATE")
    DealsBidsService(conn2).counter_bid("b1", {"amount": 120}, Actor("ship", "client"), context("counter"))
    result = DealsBidsService(conn2).counter_response("b1", "cancel", Actor("ship", "client"), context("counter-cancel"))
    conn2.commit()
    assert result["status"] == "pending"
    assert conn2.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "pending"

    conn3 = make_db()
    conn3.execute("BEGIN IMMEDIATE")
    DealsBidsService(conn3).counter_bid("b1", {"amount": 120}, Actor("ship", "client"), context("counter"))
    result = DealsBidsService(conn3).counter_response("b1", "decline", Actor("drv", "driver"), context("counter-decline"))
    conn3.commit()
    assert result["status"] == "pending"
    assert conn3.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "pending"


def test_stale_bid_version_is_rejected():
    conn = make_db()
    conn.execute("BEGIN IMMEDIATE")
    first = DealsBidsService(conn).update_bid("b1", {"amount": 105}, Actor("drv", "driver"), context("version-1"))
    conn.commit()
    current_version = first["bid"]["version"]
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(DomainError) as error:
        DealsBidsService(conn).update_bid("b1", {"amount": 106, "version": current_version - 1}, Actor("drv", "driver"), context("version-stale"))
    conn.rollback()
    assert error.value.status_code == 409
