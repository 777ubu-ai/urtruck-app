"""Автоудаление Ленты грузов (Telegram) старше 10 дней — backend-v1.1.0."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from database import external_freight_dal as dal
from database.external_freight_connection import get_conn


@pytest.fixture(autouse=True)
def _feed_db(monkeypatch, tmp_path):
    monkeypatch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(tmp_path / "external.sqlite3"))
    dal.init_schema()
    yield


def _record(*, days_old=0, message=None):
    return {
        "source_id": "telegram-test", "source_message_id": message or uuid.uuid4().hex, "segment_id": "0",
        "kind": "cargo", "original_text": "Ищу машину Ташкент — Алматы",
        "source_published_at": (datetime.now(timezone.utc) - timedelta(days=days_old)).isoformat(),
        "origin": "Ташкент", "destination": "Алматы", "body_types": ["tent"],
        "contacts": ["+7 777 000 00 00"], "status": "active",
    }


def _count(table):
    with get_conn() as c:
        return c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def _age_item(message, days):
    """Состарить уже импортированную карточку (импорт старше 10 дней запрещён)."""
    published = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET source_published_at=? WHERE source_message_id=?",
                  (published, message))


def test_purge_removes_only_older_than_10_days_with_dependents():
    old, fresh = "old-1", "fresh-1"
    dal.import_records([_record(message=old), _record(message=fresh, days_old=1)])
    _age_item(old, 11)
    with get_conn() as c:
        old_id = c.execute("SELECT id FROM external_freight_items WHERE source_message_id=?", (old,)).fetchone()[0]
        c.execute("INSERT INTO external_freight_bookmarks(owner_id,item_id,saved_at) VALUES('u1',?,?)",
                  (old_id, datetime.now(timezone.utc).isoformat()))
    assert dal.purge_expired_items() == 1
    with get_conn() as c:
        left = [r[0] for r in c.execute("SELECT source_message_id FROM external_freight_items")]
        assert left == [fresh]
        for table in ("external_freight_item_body_types", "external_freight_audit", "external_freight_bookmarks"):
            assert c.execute(f"SELECT COUNT(*) FROM {table} WHERE item_id=?", (old_id,)).fetchone()[0] == 0
    assert _count("external_freight_expired_sources") == 1
    assert dal.purge_expired_items() == 0


def test_purged_message_is_not_reimported():
    dal.import_records([_record(message="m-1")])
    _age_item("m-1", 11)
    assert dal.purge_expired_items() == 1
    # Тот же пост Telegram пришёл повторно (свежая дата) — не возвращается.
    result = dal.import_records([_record(message="m-1")])
    assert result[0]["result"] == "expired"
    assert _count("external_freight_items") == 0


def test_import_older_than_10_days_is_rejected():
    result = dal.import_records([_record(days_old=11)])
    assert result[0]["result"] == "expired"
    assert _count("external_freight_items") == 0
    assert dal.import_records([_record(days_old=9)])[0]["result"] == "created"


def test_purge_batch_is_bounded():
    messages = [f"b-{i}" for i in range(dal.PURGE_BATCH_SIZE + 5)]
    for start in range(0, len(messages), dal.MAX_BATCH):
        dal.import_records([_record(message=m) for m in messages[start:start + dal.MAX_BATCH]])
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET source_published_at=?",
                  ((datetime.now(timezone.utc) - timedelta(days=12)).isoformat(),))
    assert dal.purge_expired_items() == dal.PURGE_BATCH_SIZE
    assert dal.purge_expired_items() == 5


def test_retention_job_reads_path_from_env_file_and_skips_missing_db(monkeypatch, tmp_path):
    from scheduler import jobs
    monkeypatch.delenv("EXTERNAL_FREIGHT_DB_PATH", raising=False)
    env_file = tmp_path / ".env"
    target = tmp_path / "missing-feed.sqlite3"
    env_file.write_text(f'OTHER=1\nEXTERNAL_FREIGHT_DB_PATH="{target}"\n', encoding="utf-8")
    monkeypatch.setattr(jobs, "Path", lambda *_: type("P", (), {"resolve": lambda self: type("Q", (), {
        "parent": type("R", (), {"parent": tmp_path})()})()})())
    jobs.external_freight_retention_job()
    assert os.environ["EXTERNAL_FREIGHT_DB_PATH"] == str(target)
    assert not target.exists()  # пустую базу не создаём


def test_retention_job_purges_real_feed(monkeypatch):
    from scheduler import jobs
    dal.import_records([_record(message="j-1")])
    _age_item("j-1", 11)
    monkeypatch.setattr(jobs, "_external_feed_schema_ready", False)
    jobs.external_freight_retention_job()
    assert _count("external_freight_items") == 0
