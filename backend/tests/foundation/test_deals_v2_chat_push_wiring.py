import json
import sqlite3

from backend.infrastructure.outbox.deals_handlers import enqueue_acceptance_push
from backend.infrastructure.outbox.worker import PersistentOutboxWorker
from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService
from backend.infrastructure.outbox.model import OutboxEvent


SCHEMA = (
    open("backend/database/marketplace_schema.sql").read()
    + open("backend/database/deals_schema.sql").read()
    + open("backend/database/chat_schema.sql").read()
    + open("backend/database/push_schema.sql").read()
)


def room_factory(conn, shipper_id, driver_id, cargo_id, trip_id, bid_id):
    p1, p2 = sorted((shipper_id, driver_id))
    key = f"c:{cargo_id}:{p1}:{p2}" if cargo_id else f"t:{trip_id}:{p1}:{p2}"
    conn.execute(
        "INSERT INTO chat_rooms(id,participant_1,participant_2,owner_id,bidder_id,bid_id,cargo_id,trip_id,deal_key) "
        "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(deal_key) DO NOTHING",
        (f"room-{cargo_id or trip_id}", p1, p2, shipper_id, driver_id, bid_id, cargo_id, trip_id, key),
    )
    return conn.execute("SELECT id FROM chat_rooms WHERE deal_key=?", (key,)).fetchone()[0]


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES ('c1','ship','CN','KZ','x','active')")
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',100,'pending')")
    conn.commit()
    return conn


def ctx(key):
    return CommandContext("op-" + key, "corr-" + key, key)


def accept(conn, key="accept"):
    conn.execute("BEGIN IMMEDIATE")
    result = DealsBidsService(conn, room_factory=room_factory).accept_bid("b1", Actor("ship", "client"), ctx(key))
    conn.commit()
    return result


def test_v2_accept_creates_one_deal_room_and_only_two_participants():
    conn = db()
    result = accept(conn)
    assert result["chat_room_id"]
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1
    room = conn.execute("SELECT * FROM chat_rooms").fetchone()
    assert {room["participant_1"], room["participant_2"]} == {"ship", "drv"}
    assert conn.execute("SELECT chat_room_id FROM deals").fetchone()[0] == result["chat_room_id"]


def test_v2_accept_retry_replays_without_second_room_or_deal():
    conn = db()
    first = accept(conn, "same")
    conn.execute("BEGIN IMMEDIATE")
    second = DealsBidsService(conn, room_factory=room_factory).accept_bid("b1", Actor("ship", "client"), ctx("same"))
    conn.commit()
    assert second == first
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox").fetchone()[0] == 2


def test_v2_accept_event_is_adapted_to_existing_push_outbox_once():
    conn = db()
    result = accept(conn)
    event_row = conn.execute("SELECT * FROM domain_outbox WHERE event_type='BidAccepted'").fetchone()
    event = OutboxEvent(event_row["event_id"], event_row["event_type"], event_row["aggregate_type"], event_row["aggregate_id"], json.loads(event_row["payload"]), None)
    conn.execute("BEGIN IMMEDIATE")
    assert enqueue_acceptance_push(conn, event) == 1
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    assert enqueue_acceptance_push(conn, event) == 0
    conn.commit()
    push = conn.execute("SELECT * FROM push_outbox").fetchone()
    assert push["recipient_user_id"] == "drv"
    payload = json.loads(push["payload"])
    assert payload["data"]["deal_id"] == result["deal_id"]
    assert payload["data"]["chat_room_id"] == result["chat_room_id"]
    assert conn.execute("SELECT COUNT(*) FROM push_outbox").fetchone()[0] == 1


def test_v2_outbox_worker_ack_and_retry_are_idempotent():
    conn = db()
    accept(conn)
    row = conn.execute("SELECT * FROM domain_outbox WHERE event_type='BidAccepted'").fetchone()
    calls = []

    def handler(event):
        calls.append(event.event_id)
        enqueue_acceptance_push(conn, event)

    worker = PersistentOutboxWorker(conn, {"BidAccepted": handler, "DealCreated": lambda event: None})
    assert worker.process_one() == "processed"
    assert worker.process_one() == "processed"
    assert worker.process_one() is None
    assert calls == [row["event_id"]]
    assert conn.execute("SELECT COUNT(*) FROM push_outbox").fetchone()[0] == 1
