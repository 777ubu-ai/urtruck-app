"""Production-like migration regression suite.

Builds a legacy SQLite database using the pre-audit push/notification schemas,
runs the current migration code, and verifies that startup upgrades are
additive, idempotent, and preserve existing production rows.
"""
import os
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import config

# `config.DB_PATH` is captured before individual test modules can mutate the
# process environment during collection. Using it here keeps the legacy seed
# and the real migration calls on the same isolated database in a shared run.
TEST_DB = config.DB_PATH


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

CREATE TABLE push_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT,
  recipient_user_id TEXT,
  device_registry_id INTEGER,
  device_id TEXT,
  provider TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  provider_response TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  error_code TEXT,
  token_masked TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

# Imported during collection. The module fixture below deliberately rebuilds a
# legacy schema *after* the repository-wide session fixture has initialized its
# clean test DB, then explicitly reruns these real migrations.
import api.push as push_api
import api.notifications as notifications_api
from database.db import get_conn


@pytest.fixture(scope="module", autouse=True)
def _legacy_database_after_session_harness():
    """Seed legacy rows after tests/conftest.py finishes its session reset.

    The global harness intentionally unlinks and recreates the SQLite database
    before the suite starts. Seeding at module-import time therefore loses the
    legacy rows. A module fixture runs later, making this test independent of
    pytest collection/import order while still exercising the real migrations.
    """
    with sqlite3.connect(TEST_DB) as conn:
        conn.executescript("""
            DROP TABLE IF EXISTS push_token_audit;
            DROP TABLE IF EXISTS push_subscriptions;
            DROP TABLE IF EXISTS push_tokens_native;
            DROP TABLE IF EXISTS push_log;
            DROP TABLE IF EXISTS notifications;
            DROP TABLE IF EXISTS push_delivery_log;
        """)
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
        conn.execute(
            """INSERT INTO push_delivery_log(
                event_id, recipient_user_id, provider, status, provider_message_id
            ) VALUES(?,?,?,?,?)""",
            ("legacy-delivery", "legacy-user", "expo", "sent", "legacy-message"),
        )
        conn.commit()
        legacy_notification = conn.execute(
            "SELECT user_id, type, title, url FROM notifications WHERE title=?",
            ("Legacy notification",),
        ).fetchone()
        assert legacy_notification == (
            "legacy-user", "legacy", "Legacy notification", "/cargos/legacy"
        )

    push_api._init_schema()
    notifications_api._init()
    with get_conn() as conn:
        migrated_notification = conn.execute(
            "SELECT user_id, type, title, url, event_key FROM notifications WHERE title=?",
            ("Legacy notification",),
        ).fetchone()
    assert migrated_notification is not None, "notification migration must preserve legacy rows"
    assert migrated_notification[0:4] == (
        "legacy-user", "legacy", "Legacy notification", "/cargos/legacy"
    )
    assert migrated_notification[4] is None
    yield


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


def test_05b_push_gateway_tables_exist():
    with get_conn() as c:
        tables = {
            row["name"]
            for row in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('push_devices','push_outbox','push_delivery_log')"
            ).fetchall()
        }
        indexes = {
            row["name"]
            for row in c.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_push_devices_user','idx_push_outbox_status_next','idx_push_delivery_dedupe')"
            ).fetchall()
        }
    assert {"push_devices", "push_outbox", "push_delivery_log"} <= tables
    assert {"idx_push_devices_user", "idx_push_outbox_status_next", "idx_push_delivery_dedupe"} <= indexes


def test_05c_register_native_writes_unified_device_registry():
    push_api.register_native(
        push_api.NativeTokenIn(
            token="fcm-test-token-production-like",
            provider="fcm",
            platform="android",
            device_name="QA Xiaomi",
            device_id="device-fcm-0001",
            app_version="1.0.7",
            app_id="com.urtruck.app.qa2",
            locale="ru-RU",
            os_version="14",
        ),
        authorization=None,
    )
    with get_conn() as c:
        legacy = c.execute(
            "SELECT provider, platform, device_id FROM push_tokens_native WHERE token=?",
            ("fcm-test-token-production-like",),
        ).fetchone()
        device = c.execute(
            "SELECT push_provider, platform, device_id, app_id, locale, enabled FROM push_devices WHERE push_token=?",
            ("fcm-test-token-production-like",),
        ).fetchone()
    assert legacy["provider"] == "fcm"
    assert legacy["platform"] == "android"
    assert device["push_provider"] == "fcm"
    assert device["app_id"] == "com.urtruck.app.qa2"
    assert device["locale"] == "ru-RU"
    assert device["enabled"] == 1


def test_06_notification_event_key_added_without_data_loss():
    assert "event_key" in _columns("notifications")
    with get_conn() as c:
        row = c.execute("SELECT * FROM notifications WHERE title='Legacy notification'").fetchone()
    assert row is not None
    assert row["user_id"] == "legacy-user"
    assert row["url"] == "/cargos/legacy"
    assert row["event_key"] is None


def test_06b_receipt_checked_at_added_without_data_loss():
    assert "receipt_checked_at" in _columns("push_delivery_log")
    with get_conn() as c:
        row = c.execute(
            "SELECT event_id, recipient_user_id, provider, status, provider_message_id, receipt_checked_at "
            "FROM push_delivery_log WHERE event_id='legacy-delivery'"
        ).fetchone()
    assert row is not None, "push delivery migration must preserve legacy rows"
    assert tuple(row[:5]) == (
        "legacy-delivery",
        "legacy-user",
        "expo",
        "sent",
        "legacy-message",
    )
    assert row["receipt_checked_at"] is None


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


def test_11_border_vehicle_upgrade_preserves_legacy_rows(tmp_path):
    """Upgrade the actual pre-CGR tables in an isolated production-like DB."""
    import subprocess

    db_path = tmp_path / "legacy-border-vehicle.db"
    script = r'''
from database import db, registration_dal
from database.db import get_conn

db.init_db()
registration_dal.init_registration_schema()
import api.marketplace as marketplace

with get_conn() as c:
    for table, column in (
        ("trips", "vehicle_id"),
        ("bids", "vehicle_id"),
        ("deals", "vehicle_id"),
        ("deals", "vehicle_plate_snapshot"),
        ("deals", "vehicle_country_snapshot"),
        ("deals", "vehicle_make_snapshot"),
        ("deals", "vehicle_model_snapshot"),
        ("drivers_registration", "trailer_plate"),
    ):
        c.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
    c.execute("INSERT INTO trips(id,driver_id,from_city,to_city) VALUES('legacy-trip','driver-1','A','B')")
    c.execute("INSERT INTO bids(id,trip_id,bidder_id,amount) VALUES('legacy-bid','legacy-trip','driver-1',100)")
    c.execute("INSERT INTO deals(id,trip_id,bid_id,shipper_id,driver_id,from_city,to_city,amount) VALUES('legacy-deal','legacy-trip','legacy-bid','shipper-1','driver-1','A','B',100)")
    c.execute("INSERT INTO drivers_registration(id,phone,vehicle_plate) VALUES('driver-1','legacy-phone','123ABC02')")
    c.commit()

registration_dal.init_registration_schema()
marketplace._init()
registration_dal.init_registration_schema()
marketplace._init()

required = {
    "trips": {"vehicle_id"},
    "bids": {"vehicle_id"},
    "deals": {"vehicle_id", "vehicle_plate_snapshot", "vehicle_country_snapshot", "vehicle_make_snapshot", "vehicle_model_snapshot"},
    "drivers_registration": {"trailer_plate"},
}
with get_conn() as c:
    for table, expected in required.items():
        actual = {row["name"] for row in c.execute(f"PRAGMA table_info({table})")}
        assert expected <= actual, (table, expected - actual)
    assert c.execute("SELECT COUNT(*) AS n FROM trips WHERE id='legacy-trip'").fetchone()["n"] == 1
    assert c.execute("SELECT COUNT(*) AS n FROM bids WHERE id='legacy-bid'").fetchone()["n"] == 1
    assert c.execute("SELECT COUNT(*) AS n FROM deals WHERE id='legacy-deal'").fetchone()["n"] == 1
    row = c.execute("SELECT vehicle_plate, trailer_plate FROM drivers_registration WHERE id='driver-1'").fetchone()
    assert row["vehicle_plate"] == "123ABC02"
    assert row["trailer_plate"] is None
'''
    env = os.environ.copy()
    env.update({
        "DB_PATH": str(db_path),
        "APP_ENV": "test",
        "URTRUCK_ENV": "test",
        "ENV": "test",
        "CGR_IIN_SALT": "production-like-border-migration-test-salt",
        "PYTHONPATH": str(ROOT.parent) + os.pathsep + str(ROOT),
    })
    completed = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=60,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
