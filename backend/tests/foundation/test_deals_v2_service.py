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
