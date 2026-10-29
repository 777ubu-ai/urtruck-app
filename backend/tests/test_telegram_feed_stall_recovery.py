import asyncio
import importlib.util
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace


def collector():
    path = Path(__file__).resolve().parents[2] / 'ops/telegram-feed/feed.py'
    spec = importlib.util.spec_from_file_location('stall_recovery_collector', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Reader:
    def __init__(self, messages):
        self.messages = messages

    async def iter_messages(self, target, limit):
        for message in self.messages[:limit]:
            yield message


def make_queue_row(db, m, attempt):
    with db:
        db.execute("""INSERT INTO queue
          (source,source_id,source_message,source_date,text,phones,fingerprint,status,
           random_id,destination_message,published_date,published_at,reason)
          VALUES(?,?,?,?,?,?,?,'sending',?,NULL,'2026-10-29',?,'TimeoutError')""",
          ('source', 101, 9001, attempt, 'Груз Алматы Москва +998901234567',
           json.dumps(['+998901234567']), m.fingerprint('Груз Алматы Москва +998901234567'),
           987654321, attempt))


def telegram_message(m, message_id, text, at):
    return SimpleNamespace(id=message_id, raw_text=text,
                            date=datetime.fromtimestamp(at, timezone.utc))


def test_stale_sending_without_match_is_requeued_only_when_history_covers_attempt(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.sqlite3')
    attempt = time.time()-600
    make_queue_row(db, m, attempt)

    asyncio.run(m.reconcile(Reader([]), db, 'destination'))

    row = db.execute('SELECT status,random_id,published_at,reason FROM queue').fetchone()
    assert row['status'] == 'queued'
    assert row['random_id'] == 987654321
    assert row['published_at'] is None
    assert row['reason'] == 'recovered_absent_from_destination'
    db.close()


def test_stale_sending_matching_destination_is_marked_published_without_resend(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.sqlite3')
    attempt = time.time()-600
    text = 'Груз Алматы Москва +998901234567'
    make_queue_row(db, m, attempt)

    asyncio.run(m.reconcile(Reader([telegram_message(m, 77, text, attempt+5)]), db, 'destination'))

    row = db.execute('SELECT status,destination_message,random_id FROM queue').fetchone()
    assert row['status'] == 'published'
    assert row['destination_message'] == 77
    assert row['random_id'] == 987654321
    db.close()


def test_stale_sending_with_limited_history_remains_blocked_for_manual_review(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.sqlite3')
    attempt = time.time()-600
    make_queue_row(db, m, attempt)
    latest = time.time()
    messages = [telegram_message(m, i, f'другое сообщение {i}', latest-i/100) for i in range(1500)]

    asyncio.run(m.reconcile(Reader(messages), db, 'destination'))

    row = db.execute('SELECT status,random_id FROM queue').fetchone()
    assert row['status'] == 'sending'
    assert row['random_id'] == 987654321
    db.close()


def test_stale_sending_with_duplicate_matches_is_resolved_without_another_send(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.sqlite3')
    attempt = time.time()-600
    text = 'Груз Алматы Москва +998901234567'
    make_queue_row(db, m, attempt)
    messages = [telegram_message(m, 77, text, attempt+5),
                telegram_message(m, 78, text, attempt+7)]

    asyncio.run(m.reconcile(Reader(messages), db, 'destination'))

    row = db.execute('SELECT status,destination_message,random_id FROM queue').fetchone()
    assert row['status'] == 'published'
    assert row['destination_message'] == 77
    assert row['random_id'] == 987654321
    db.close()
