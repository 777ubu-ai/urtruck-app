import json
import sqlite3
from datetime import datetime

from backend.infrastructure.outbox.deals_handlers import enqueue_acceptance_push
from backend.infrastructure.outbox.model import OutboxEvent
from backend.infrastructure.outbox.worker import PersistentOutboxWorker


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(open("backend/database/push_schema.sql").read())
    conn.execute("""CREATE TABLE domain_outbox (
        event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL, payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, processed_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, claimed_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending')""")
    return conn


def add_event(conn, event_id, event_type="BidAccepted", created_at="2026-01-01 00:00:00"):
    payload = {"deal_id": "d1", "chat_room_id": "r1", "recipient_user_ids": ["drv"], "url": "/cargos/c1"}
    conn.execute("INSERT INTO domain_outbox(event_id,event_type,aggregate_type,aggregate_id,payload,created_at) VALUES (?,?,?,?,?,?)", (event_id, event_type, "bid", "b1", json.dumps(payload), created_at))
    conn.commit()


def event_from(row):
    return OutboxEvent(row["event_id"], row["event_type"], row["aggregate_type"], row["aggregate_id"], json.loads(row["payload"]), datetime.fromisoformat(row["created_at"]))


def make_handler(conn, fail_once=False):
    state = {"failed": False}

    def handler(event):
        if fail_once and not state["failed"]:
            state["failed"] = True
            raise RuntimeError("temporary provider outage")
        enqueue_acceptance_push(conn, event)

    return handler


def make_due(conn):
    conn.execute("UPDATE domain_outbox SET next_attempt_at=datetime('now','-1 minute')")
    conn.commit()


def test_transient_failure_retries_then_persists_one_push():
    conn = db()
    add_event(conn, "evt-transient")
    worker = PersistentOutboxWorker(conn, {"BidAccepted": make_handler(conn, fail_once=True)})
    assert worker.process_one() == "retry"
    row = conn.execute("SELECT status,attempts FROM domain_outbox").fetchone()
    assert row["status"] == "pending" and row["attempts"] == 1
    make_due(conn)
    # The first handler instance has the failure state; retry uses the same worker.
    assert worker.process_one() == "processed"
    assert conn.execute("SELECT status,attempts FROM domain_outbox").fetchone()[:2] == ("processed", 2)
    assert conn.execute("SELECT COUNT(*) FROM push_outbox").fetchone()[0] == 1
    assert enqueue_acceptance_push(conn, event_from(conn.execute("SELECT * FROM domain_outbox").fetchone())) == 0


def test_permanent_failure_is_bounded_and_observable():
    conn = db()
    add_event(conn, "evt-permanent")
    worker = PersistentOutboxWorker(conn, {"BidAccepted": lambda _event: (_ for _ in ()).throw(RuntimeError("poison"))}, max_attempts=2)
    assert worker.process_one() == "retry"
    make_due(conn)
    assert worker.process_one() == "failed"
    row = conn.execute("SELECT status,attempts FROM domain_outbox").fetchone()
    assert (row["status"], row["attempts"]) == ("failed", 2)


def test_poison_event_does_not_block_next_event():
    conn = db()
    add_event(conn, "evt-poison", created_at="2026-01-01 00:00:00")
    add_event(conn, "evt-good", event_type="BidAccepted", created_at="2026-01-01 00:00:01")
    worker = PersistentOutboxWorker(conn, {"BidAccepted": lambda event: (_ for _ in ()).throw(RuntimeError("poison"))}, max_attempts=1)
    assert worker.process_one() == "failed"
    # Replace the handler after the poison event is terminal; the next event is independent.
    worker.handlers["BidAccepted"] = make_handler(conn)
    assert worker.process_one() == "processed"
    assert conn.execute("SELECT COUNT(*) FROM domain_outbox WHERE status='processed'").fetchone()[0] == 1


def test_duplicate_event_processing_is_push_deduplicated():
    conn = db()
    add_event(conn, "evt-replay")
    row = conn.execute("SELECT * FROM domain_outbox").fetchone()
    event = event_from(row)
    conn.execute("BEGIN")
    assert enqueue_acceptance_push(conn, event) == 1
    conn.commit()
    conn.execute("BEGIN")
    assert enqueue_acceptance_push(conn, event) == 0
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM push_outbox").fetchone()[0] == 1
