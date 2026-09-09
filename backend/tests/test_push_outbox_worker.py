import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def test_scheduler_owns_the_only_outbox_worker():
    source = (ROOT / 'scheduler' / 'jobs.py').read_text(encoding='utf-8')
    assert 'def push_outbox_job()' in source
    assert 'push_gateway.process_pending_once(push_sender._send_expo_detailed)' in source
    assert 'id="push_outbox"' in source
    assert source.count('process_pending_once(') == 1


def test_outbox_worker_delivers_pending_row_once(tmp_path, monkeypatch):
    db_path = tmp_path / 'outbox.db'
    monkeypatch.setenv('DB_PATH', str(db_path))
    from database.db import get_conn
    from services import push_gateway

    with get_conn() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS push_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT,
          event_type TEXT, recipient_user_id TEXT, payload TEXT,
          priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'pending',
          attempt_count INTEGER DEFAULT 0, next_attempt_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP, sent_at TEXT,
          failed_at TEXT, last_error TEXT)''')
        conn.execute("INSERT INTO push_outbox(event_id,event_type,recipient_user_id,payload,priority) VALUES(?,?,?,?,?)",
                     ('evt-1', 'new_bid', 'u-1', '{"title":"Bid","body":"new"}', 'critical'))

    calls = []
    monkeypatch.setattr(push_gateway, 'send_to_devices',
                        lambda *args, **kwargs: (calls.append(args) or {'sent': 1}))
    first = push_gateway.process_pending_once(lambda *args, **kwargs: {'status': 'sent'})
    second = push_gateway.process_pending_once(lambda *args, **kwargs: {'status': 'sent'})

    assert first['picked'] == 1
    assert first['sent'] == 1
    assert second['picked'] == 0
    assert len(calls) == 1
    with get_conn() as conn:
        assert conn.execute("SELECT status FROM push_outbox WHERE event_id='evt-1'").fetchone()[0] == 'sent'
