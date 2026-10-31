import importlib.util
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[2] / 'ops/telegram-feed/source_flow_report.py'
spec = importlib.util.spec_from_file_location('source_flow_report', MODULE_PATH)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class SourceFlowReportTest(unittest.TestCase):
    def test_reports_counts_reasons_and_expired_pending_without_content(self):
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / 'source.sqlite3'
            adapter_path = Path(directory) / 'adapter.sqlite3'
            now = datetime(2026, 10, 30, tzinfo=timezone.utc)
            old_date = (now - timedelta(days=11)).isoformat()
            with sqlite3.connect(source_path) as db:
                db.execute('CREATE TABLE app_messages(id INTEGER PRIMARY KEY, source TEXT, source_date REAL)')
                db.executemany('INSERT INTO app_messages VALUES(?,?,?)',
                               [(1, 'source-A', now.timestamp()), (2, 'source-A', now.timestamp())])
            with sqlite3.connect(adapter_path) as db:
                db.execute('CREATE TABLE incoming_bridge_seen(source_queue_id INTEGER,reason TEXT)')
                db.executemany('INSERT INTO incoming_bridge_seen VALUES(?,?)', [(1, 'accepted'), (2, 'unresolved_direction')])
                db.execute('''CREATE TABLE selected_outbox(source_id TEXT,source_message_id TEXT,segment_id TEXT,
                    payload TEXT,delivered_at TEXT,quarantined_at TEXT)''')
                payload = json.dumps({'origin_source': 'source-A', 'source_published_at': old_date,
                                      'private_text': 'must-not-appear'})
                db.execute('INSERT INTO selected_outbox VALUES(?,?,?,?,?,?)',
                           ('a', '1', '0', payload, None, None))
            result = report.summarize(source_path, adapter_path, now=now)
            self.assertEqual(result['source-A'], {
                'received_total_messages': 2, 'eligible_messages': 2,
                'processed_messages_10d': 2, 'awaiting_processing_10d': 0, 'extracted_listings': 1,
                'delivered': 0, 'remaining': 1, 'quarantined': 0, 'pending_expired': 1,
                'skipped_by_reason': {'unresolved_direction': 1},
            })
            self.assertNotIn('private_text', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
