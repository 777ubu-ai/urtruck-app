"""Regression tests for private, payload-free Telegram-feed health aggregates."""
import importlib.util
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / 'ops/telegram-feed/health.py'
SPEC = importlib.util.spec_from_file_location('urtruck_feed_health', MODULE_PATH)
health = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(health)


def _collector_db(root, now):
    state = root / 'state'
    state.mkdir(parents=True)
    db = sqlite3.connect(state / 'feed.sqlite3')
    db.executescript('''
        CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE queue(status TEXT NOT NULL,published_at REAL);
        CREATE TABLE app_messages(id INTEGER PRIMARY KEY,source_date REAL,received_at REAL);
        CREATE TABLE source_health(source TEXT,checked_at REAL,error TEXT);
    ''')
    db.executemany('INSERT INTO metadata VALUES(?,?)', [
        ('last_tick', datetime.fromtimestamp(now, timezone.utc).isoformat()),
        ('publish_after', '0'),
    ])
    db.executemany('INSERT INTO queue VALUES(?,?)', [
        ('published', now - 120), ('queued', None),
    ])
    db.executemany('INSERT INTO app_messages VALUES(?,?,?)', [
        (1, now - 120, now - 60), (2, now - 120, now - 7200),
    ])
    db.commit()
    db.close()


def _adapter_db(path, now, *, add_terminal_columns=True):
    path.parent.mkdir(parents=True)
    db = sqlite3.connect(path)
    terminal_columns = ', terminal_at TEXT, terminal_reason TEXT' if add_terminal_columns else ''
    db.execute(f'''CREATE TABLE selected_outbox(
        source_id TEXT,source_message_id TEXT,segment_id TEXT,payload TEXT,
        attempts INTEGER,next_attempt_at REAL,delivered_at TEXT,last_http_status INTEGER,
        quarantined_at TEXT,quarantine_reason TEXT{terminal_columns})''')
    db.execute('''CREATE TABLE incoming_bridge_seen(
        source_queue_id INTEGER,source_revision TEXT,processed_at TEXT,reason TEXT,
        PRIMARY KEY(source_queue_id))''')

    def add(identity, published, *, next_attempt=None, delivered=None, quarantined=None, terminal=None):
        payload = json.dumps({'source_published_at': published})
        values = [identity, 'm'+identity, '0', payload, 0,
                  now if next_attempt is None else next_attempt, delivered, None,
                  quarantined, 'test' if quarantined else None]
        if add_terminal_columns:
            values.extend([datetime.fromtimestamp(now, timezone.utc).isoformat() if terminal else None, terminal])
            db.execute('INSERT INTO selected_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', values)
        else:
            db.execute('INSERT INTO selected_outbox VALUES(?,?,?,?,?,?,?,?,?,?)', values)

    iso = lambda seconds: datetime.fromtimestamp(now-seconds, timezone.utc).isoformat()
    add('ready', iso(24*3600))
    add('backoff', iso(2*3600), next_attempt=now+60)
    add('expired', iso(11*24*3600))
    add('delivered', iso(2*3600), delivered=iso(20*60))
    add('quarantined', iso(2*3600), quarantined=iso(10*60))
    if add_terminal_columns:
        add('terminal', iso(11*24*3600), terminal='source_retention_expired')
    db.execute('INSERT INTO incoming_bridge_seen VALUES(?,?,?,?)',
               (1, 'rev', iso(60), 'accepted'))
    db.commit()
    db.close()


def _fixture(tmp_path, now, *, add_terminal_columns=True):
    collector = tmp_path / 'collector'
    qa_root = tmp_path / 'qa2'
    _collector_db(collector, now)
    incoming = qa_root / 'external-feed/adapter.sqlite3'
    owned = qa_root / 'external-feed-owned/adapter.sqlite3'
    _adapter_db(incoming, now, add_terminal_columns=add_terminal_columns)
    _adapter_db(owned, now, add_terminal_columns=add_terminal_columns)
    return collector, qa_root


def test_snapshot_separates_ready_backoff_expired_and_terminal(tmp_path):
    now = datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc).timestamp()
    collector, qa_root = _fixture(tmp_path, now)

    result = health.snapshot(root=collector, qa_root=qa_root, now=now)

    incoming = result['incoming']
    assert incoming['ready'] == 1
    assert incoming['backoff'] == 1
    assert incoming['backlog'] == 2
    assert incoming['pending'] == 3
    assert incoming['expired_pending'] == 1
    assert incoming['terminal_expired'] == 1
    assert incoming['quarantined'] == 1
    assert incoming['confirmed_rows_last_hour'] == 1
    assert incoming['oldest_ready_age_seconds'] == 24 * 3600
    assert incoming['ready_missing_published_at'] == 0
    assert incoming['source_received_messages_last_hour'] == 1
    assert result['telegram']['received_messages_last_hour'] == 1
    assert result['telegram']['published_rows_last_hour'] == 1
    assert incoming['source_waiting'] == 1
    assert incoming['source_progress'] is not None


def test_snapshot_supports_pre_terminal_adapter_schema(tmp_path):
    now = datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc).timestamp()
    collector, qa_root = _fixture(tmp_path, now, add_terminal_columns=False)

    result = health.snapshot(root=collector, qa_root=qa_root, now=now)

    assert result['incoming']['ready'] == 1
    assert result['incoming']['backoff'] == 1
    assert result['incoming']['expired_pending'] == 1
    assert result['incoming']['terminal_expired'] == 0


def test_backlog_growth_alarm_survives_recent_delivery_progress():
    now = 10_000.0
    previous = {'flows': {'incoming': {
        'progress': 'before', 'since': now-1200, 'waiting': True,
        'backlog_baseline': 100, 'backlog_baseline_at': now-900,
    }}}
    current = {'incoming': {'ready': 10, 'backoff': 1, 'backlog': 160,
                            'pending': 171, 'expired_pending': 10,
                            'progress': 'just-delivered', 'paused_until': 0}}

    state = health.evaluate(current, previous, now)

    assert 'incoming_backlog_growing' in state['problems']
    assert 'incoming_delivery_stalled' not in state['problems']


def test_backoff_only_does_not_trigger_delivery_stall():
    now = 10_000.0
    current = {'incoming': {'ready': 0, 'backoff': 1, 'backlog': 1,
                            'pending': 1, 'expired_pending': 0,
                            'progress': 'same', 'paused_until': 0}}

    state = health.evaluate(current, {'flows': {}}, now)

    assert 'incoming_delivery_stalled' not in state['problems']
