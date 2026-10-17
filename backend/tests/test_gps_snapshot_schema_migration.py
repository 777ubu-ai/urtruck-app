"""Старая таблица отслеживания обновляется без потери записей."""

import sqlite3

import config
from database import db as ddb
from api import marketplace


def test_legacy_tracking_rows_survive_idempotent_snapshot_migration(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-tracking.sqlite"
    monkeypatch.setattr(config, "DB_PATH", str(db_path))
    ddb.init_db()
    marketplace._init()
    with sqlite3.connect(db_path) as c:
        c.execute("DROP TABLE deal_tracking")
        c.execute("""CREATE TABLE deal_tracking (
            deal_id TEXT PRIMARY KEY, status TEXT NOT NULL,
            requested_by TEXT NOT NULL, requested_at TEXT,
            responded_at TEXT, stopped_at TEXT, locked_at TEXT,
            completed_at TEXT, last_signal_at TEXT, updated_at TEXT
        )""")
        c.execute("INSERT INTO deal_tracking VALUES (?,?,?,?,?,?,?,?,?,?)",
                  ("legacy-deal", "active", "legacy-driver", "2026-10-01 00:00:00",
                   "2026-10-01 00:01:00", None, "2026-10-01 00:01:00", None,
                   "2026-10-01 01:00:00", "2026-10-01 01:00:00"))
        c.execute("INSERT INTO deal_tracking_events (deal_id,event_type,actor_id) VALUES (?,?,?)",
                  ("legacy-deal", "tracking_started_with_trip", "legacy-driver"))
    for _ in range(2):
        marketplace._init()
        with sqlite3.connect(db_path) as c:
            c.row_factory = sqlite3.Row
            rows = c.execute("SELECT * FROM deal_tracking").fetchall()
            events = c.execute("SELECT deal_id,event_type,actor_id FROM deal_tracking_events").fetchall()
            assert len(rows) == len(events) == 1
            assert rows[0]["deal_id"] == events[0]["deal_id"] == "legacy-deal"
            assert rows[0]["requested_by"] == events[0]["actor_id"] == "legacy-driver"
            assert rows[0]["last_signal_at"] == "2026-10-01 01:00:00"
            assert rows[0]["capture_mode"] == "continuous"
