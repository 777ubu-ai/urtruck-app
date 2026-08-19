import sqlite3
from datetime import datetime

from services.bid_expiry import expire_stale_marketplace


NOW = datetime(2026, 8, 20, 12, 0, 0)


def _db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE cargos (
            id TEXT PRIMARY KEY,
            status TEXT,
            pickup_date TEXT,
            updated_at TEXT,
            bids_count INTEGER DEFAULT 0
        );
        CREATE TABLE trips (
            id TEXT PRIMARY KEY,
            status TEXT,
            departure TEXT,
            updated_at TEXT
        );
        CREATE TABLE bids (
            id TEXT PRIMARY KEY,
            cargo_id TEXT,
            trip_id TEXT,
            amount INTEGER,
            status TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE deals (
            id TEXT PRIMARY KEY,
            cargo_id TEXT,
            trip_id TEXT,
            status TEXT
        );
        CREATE TABLE price_events (
            id TEXT PRIMARY KEY,
            bid_id TEXT NOT NULL,
            actor_id TEXT,
            actor_role TEXT,
            amount INTEGER,
            kind TEXT NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    return conn


def test_bid_expires_after_48_hours_but_parent_stays_active():
    conn = _db()
    conn.execute("INSERT INTO cargos VALUES ('c1','active','2026-08-25',NULL,1)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1','c1',NULL,12400,'pending','2026-08-18 10:00:00','2026-08-18 10:00:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_bids"] == ["b1"]
    assert result["reasons"]["b1"] == "bid_ttl_48h"
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "expired"
    cargo = conn.execute("SELECT status, bids_count FROM cargos WHERE id='c1'").fetchone()
    assert cargo["status"] == "active"
    assert cargo["bids_count"] == 0
    event = conn.execute("SELECT kind, comment FROM price_events WHERE bid_id='b1'").fetchone()
    assert tuple(event) == ("expired", "bid_ttl_48h")


def test_recent_activity_resets_48_hour_window():
    conn = _db()
    conn.execute("INSERT INTO cargos VALUES ('c1','active','2026-08-25',NULL,1)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1','c1',NULL,12400,'countered','2026-08-15 10:00:00','2026-08-20 11:00:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_bids"] == []
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "countered"


def test_past_cargo_date_expires_listing_and_open_bid_immediately():
    conn = _db()
    conn.execute("INSERT INTO cargos VALUES ('c1','active','2026-08-19',NULL,1)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1','c1',NULL,12400,'pending','2026-08-20 11:30:00','2026-08-20 11:30:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_cargos"] == ["c1"]
    assert result["expired_bids"] == ["b1"]
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "expired"
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "expired"


def test_past_trip_date_expires_trip_and_open_bid():
    conn = _db()
    conn.execute("INSERT INTO trips VALUES ('t1','active','2026-08-19',NULL)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1',NULL,'t1',4500,'pending','2026-08-20 11:30:00','2026-08-20 11:30:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_trips"] == ["t1"]
    assert result["expired_bids"] == ["b1"]
    assert conn.execute("SELECT status FROM trips WHERE id='t1'").fetchone()[0] == "expired"


def test_departure_today_remains_actionable():
    conn = _db()
    conn.execute("INSERT INTO trips VALUES ('t1','active','2026-08-20',NULL)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1',NULL,'t1',4500,'pending','2026-08-20 11:30:00','2026-08-20 11:30:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_trips"] == []
    assert result["expired_bids"] == []
    assert conn.execute("SELECT status FROM trips WHERE id='t1'").fetchone()[0] == "active"


def test_accepted_deal_is_never_auto_expired_or_cancelled():
    conn = _db()
    conn.execute("INSERT INTO cargos VALUES ('c1','active','2026-08-19',NULL,0)")
    conn.execute("INSERT INTO deals VALUES ('d1','c1',NULL,'accepted')")
    conn.execute(
        "INSERT INTO bids VALUES ('winner','c1',NULL,12400,'accepted','2026-08-10 10:00:00','2026-08-10 10:00:00')"
    )

    result = expire_stale_marketplace(now=NOW, conn=conn)

    assert result["expired_cargos"] == []
    assert result["expired_bids"] == []
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "active"
    assert conn.execute("SELECT status FROM deals WHERE id='d1'").fetchone()[0] == "accepted"
    assert conn.execute("SELECT status FROM bids WHERE id='winner'").fetchone()[0] == "accepted"


def test_expiry_is_idempotent_and_does_not_duplicate_audit_event():
    conn = _db()
    conn.execute("INSERT INTO cargos VALUES ('c1','active','2026-08-25',NULL,1)")
    conn.execute(
        "INSERT INTO bids VALUES ('b1','c1',NULL,12400,'pending','2026-08-18 10:00:00','2026-08-18 10:00:00')"
    )

    expire_stale_marketplace(now=NOW, conn=conn)
    second = expire_stale_marketplace(now=NOW, conn=conn)

    assert second["expired_bids"] == []
    assert conn.execute("SELECT COUNT(*) FROM price_events WHERE bid_id='b1' AND kind='expired'").fetchone()[0] == 1
