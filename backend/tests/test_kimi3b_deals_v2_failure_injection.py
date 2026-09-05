import sqlite3

import pytest

from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService


SCHEMA = (
    open("backend/database/marketplace_schema.sql").read()
    + open("backend/database/deals_schema.sql").read()
    + open("backend/database/chat_schema.sql").read()
)


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES ('c1','ship','A','B','x','active')")
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',100,'pending')")
    conn.commit()
    return conn


def context(key):
    return CommandContext("op-" + key, "corr-" + key, key)


def assert_clean(conn):
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "pending"
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "active"
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox").fetchone()[0] == 0


def test_room_factory_failure_rolls_back_everything():
    conn = db()

    def fail_room(*_args):
        raise RuntimeError("room unavailable")

    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(RuntimeError):
        DealsBidsService(conn, room_factory=fail_room).accept_bid("b1", Actor("ship", "client"), context("room-fail"))
    conn.rollback()
    assert_clean(conn)


def test_room_insert_then_participant_failure_rolls_back_room_and_deal():
    conn = db()

    def partial_room(c, *_args):
        c.execute("INSERT INTO chat_rooms(id,participant_1,participant_2,deal_key) VALUES ('orphan','drv','ship','broken')")
        raise RuntimeError("participant insert failed")

    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(RuntimeError):
        DealsBidsService(conn, room_factory=partial_room).accept_bid("b1", Actor("ship", "client"), context("participant-fail"))
    conn.rollback()
    assert_clean(conn)


def test_domain_outbox_failure_rolls_back_accepted_business_state():
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn, room_factory=lambda *_args: "room-ok")
    service._event = lambda *_args: (_ for _ in ()).throw(RuntimeError("outbox unavailable"))
    with pytest.raises(RuntimeError):
        service.accept_bid("b1", Actor("ship", "client"), context("outbox-fail"))
    conn.rollback()
    assert_clean(conn)
