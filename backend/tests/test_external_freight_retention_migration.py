"""Изолированная проверка семидневного TTL без доступа к рабочей базе."""
import importlib.util
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/qa/extend_external_freight_retention.py"
SPEC = importlib.util.spec_from_file_location("external_freight_retention_migration", SCRIPT)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def _database(path, now):
    connection = sqlite3.connect(path)
    connection.executescript("""
        CREATE TABLE external_freight_items (
          id TEXT PRIMARY KEY, kind TEXT, status TEXT, source_published_at TEXT,
          expires_at TEXT, updated_at TEXT
        );
        CREATE TABLE external_freight_audit (
          id TEXT PRIMARY KEY, item_id TEXT, actor TEXT, action TEXT,
          created_at TEXT, details TEXT
        );
    """)
    recent = (now - timedelta(days=6)).isoformat()
    old = (now - timedelta(days=8)).isoformat()
    for item_id, status, published in (
        ("active-recent", "active", recent), ("expired-recent", "expired", recent),
        ("active-old", "active", old), ("review-recent", "review", recent),
        ("closed-recent", "closed", recent), ("hidden-recent", "hidden", recent),
    ):
        old_expiry = (datetime.fromisoformat(published) + timedelta(hours=120)).isoformat()
        connection.execute("INSERT INTO external_freight_items VALUES(?,?,?,?,?,?)",
                           (item_id, "cargo", status, published, old_expiry, now.isoformat()))
    connection.commit()
    connection.close()


def test_dry_run_is_read_only_and_apply_only_revives_expired_by_old_ttl(tmp_path):
    now = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
    path = tmp_path / "feed.sqlite3"
    _database(path, now)

    preview = MIGRATION.migrate(path, now=now)
    assert preview == {
        "mode": "dry_run", "updated": 3,
        "changes": {"cargo:active->active": 1, "cargo:active->expired": 1, "cargo:expired->active": 1},
    }
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM external_freight_audit").fetchone()[0] == 0
        assert connection.execute("SELECT status FROM external_freight_items WHERE id='expired-recent'").fetchone()[0] == "expired"

    applied = MIGRATION.migrate(path, apply=True, now=now)
    assert applied == {"mode": "apply", "updated": 3, "changes": preview["changes"]}
    with sqlite3.connect(path) as connection:
        rows = dict(connection.execute("SELECT id,status FROM external_freight_items"))
        assert rows["active-recent"] == "active"
        assert rows["expired-recent"] == "active"
        assert rows["active-old"] == "expired"
        assert rows["review-recent"] == "review"
        assert rows["closed-recent"] == "closed"
        assert rows["hidden-recent"] == "hidden"
        assert connection.execute("SELECT COUNT(*) FROM external_freight_audit").fetchone()[0] == 3
    assert MIGRATION.migrate(path, apply=True, now=now) == {"mode": "apply", "updated": 0, "changes": {}}
