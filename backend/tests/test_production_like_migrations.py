"""Production-like migration regression suite.

Builds a legacy SQLite database using the pre-audit push/notification schemas,
imports the current migration code, and verifies that startup upgrades are
additive, idempotent, and preserve existing production rows.
"""
import os
import sqlite3
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_production_like_migrations.db")
for suffix in ("", "-wal", "-shm"):
    Path(TEST_DB + suffix).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


LEGACY_SCHEMA = """
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);

CREATE TABLE push_tokens_native (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  token TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'expo',
  platform TEXT,
  device_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_push_native_user ON push_tokens_native(user_id);

CREATE TABLE push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  body TEXT,
  data_json TEXT,
  web_sent INTEGER DEFAULT 0,
  native_sent INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  icon TEXT DEFAULT '🔔',
  url TEXT DEFAULT '/',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

with sqlite3.connect(TEST_DB) as conn:
    conn.executescript(LEGACY_SCHEMA)
    conn.execute(
        "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) VALUES(?,?,?,?,?)",
        ("legacy-user", "https://legacy.example/sub", "legacy-p", "legacy-a", "legacy-browser"),
    )
    conn.execute(
        "INSERT INTO push_tokens_native(user_id,token,provider,platform,device_name) VALUES(?,?,?,?,?)",
        ("legacy-user", "ExponentPushToken[legacy-row]", "expo", "android", "Legacy Phone"),
    )
    conn.execute(
        "INSERT INTO notifications(user_id,type,title,url) VALUES(?,?,?,?)",
        ("legacy-user", "legacy", "Legacy notification", "/cargos/legacy"),
    )
    conn.commit()

# Importing these modules executes the real startup migrations.
import api.push as push_api
import api.notifications as notifications_api
from database.db import get_conn


def _columns(table):
    with get_conn() as c:
        return {row["name"] for row in c.execute(f"PRAGMA table_info({table})").fetchall()}


def _count(table):
    with get_conn() as c:
        return c.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]


def test_01_web_push_columns_added():
    required = {"device_id", "active", "invalidated_at", "invalidated_reason", "platform", "app_version"}
    assert required <= _columns("push_subscriptions")


def test_02_native_push_columns_added():
    required = {"device_id", "active", "invalidated_at", "invalidated_reason", "app_version"}
    assert required <= _columns("push_tokens_native")


def test_03_existing_web_row_preserved_and_active():
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_subscriptions WHERE endpoint=?", ("https://legacy.example/sub",)).fetchone()
    assert row is not None
    assert row["user_id"] == "legacy-user"
    assert row["p256dh"] == "legacy-p"
    assert row["auth"] == "legacy-a"
    assert row["active"] == 1


def test_04_existing_native_row_preserved_and_active():
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_tokens_native WHERE token=?", ("ExponentPushToken[legacy-row]",)).fetchone()
    assert row is not None
    assert row["user_id"] == "legacy-user"
    assert row["provider"] == "expo"
    assert row["platform"] == "android"
    assert row["active"] == 1


def test_05_push_audit_table_and_index_exist():
    with get_conn() as c:
        table = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='push_token_audit'").fetchone()
        index = c.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_push_audit_token'").fetchone()
    assert table is not None
    assert index is not None


def test_06_notification_event_key_added_without_data_loss():
    assert "event_key" in _columns("notifications")
    with get_conn() as c:
        row = c.execute("SELECT * FROM notifications WHERE title='Legacy notification'").fetchone()
    assert row is not None
    assert row["user_id"] == "legacy-user"
    assert row["url"] == "/cargos/legacy"
    assert row["event_key"] is None


def test_07_notification_unique_partial_index_exists():
    with get_conn() as c:
        index = c.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_notif_event_key'").fetchone()
    assert index is not None


def test_08_migrations_are_idempotent():
    before = {
        "web": _count("push_subscriptions"),
        "native": _count("push_tokens_native"),
        "notifications": _count("notifications"),
    }
    push_api._migrate_ownership_columns()
    push_api._migrate_ownership_columns()
    notifications_api._migrate_event_key()
    notifications_api._migrate_event_key()
    after = {
        "web": _count("push_subscriptions"),
        "native": _count("push_tokens_native"),
        "notifications": _count("notifications"),
    }
    assert after == before


def test_09_new_rows_receive_active_default():
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_tokens_native(user_id,token,provider) VALUES(?,?,?)",
            ("new-user", "ExponentPushToken[new-after-migration]", "expo"),
        )
        row = c.execute("SELECT active FROM push_tokens_native WHERE token=?", ("ExponentPushToken[new-after-migration]",)).fetchone()
    assert row["active"] == 1


def test_10_event_key_deduplicates_per_user_only():
    notifications_api.create_notification("u-a", "test", "A", event_key="same-key")
    notifications_api.create_notification("u-a", "test", "A duplicate", event_key="same-key")
    notifications_api.create_notification("u-b", "test", "B", event_key="same-key")
    with get_conn() as c:
        a = c.execute("SELECT COUNT(*) c FROM notifications WHERE user_id='u-a' AND event_key='same-key'").fetchone()["c"]
        b = c.execute("SELECT COUNT(*) c FROM notifications WHERE user_id='u-b' AND event_key='same-key'").fetchone()["c"]
    assert a == 1
    assert b == 1
