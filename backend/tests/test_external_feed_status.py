"""Счётчики этапов, часовой пояс, отсутствие PII и неизменность рабочих БД.

Включено в штатный backend pytest; изолированный запуск возможен через unittest.
"""
import hashlib
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2]/'scripts/qa/external_feed_status.py'
spec = importlib.util.spec_from_file_location('feed_status', MODULE)
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)


class FeedStatusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.qa = self.root/'urtruck-qa2'
        self.collector = self.root/'urtruck-telegram-feed'
        for path in [self.qa/'backend', self.qa/'runtime', self.qa/'external-feed', self.collector/'state']:
            path.mkdir(parents=True, exist_ok=True)
        self.now = datetime(2026,10,25,10,0,tzinfo=timezone.utc).timestamp()
        self.iso = status.iso(self.now)
        (self.qa/'backend/.qa-source-sha').write_text('a'*40)
        (self.qa/'external-feed-bridge.env').write_text('EXTERNAL_FREIGHT_SOURCE_MODE=incoming\nIMPORTER_KEY=SECRET_MARKER_DO_NOT_PRINT\n')
        self.source = self.collector/'state/feed.sqlite3'
        with sqlite3.connect(self.source) as db:
            db.executescript('''
                CREATE TABLE queue(status TEXT, source_date REAL, published_at REAL, reason TEXT);
                CREATE TABLE app_messages(received_at REAL);
                CREATE TABLE source_health(checked_at REAL,error TEXT);
            ''')
            db.execute('INSERT INTO queue VALUES(?,?,?,?)', ('published',self.now-300,self.now-200,None))
            db.execute('INSERT INTO queue VALUES(?,?,?,?)', ('rejected',self.now-200,None,'Телефон +77771112233 PRIVATE_TEXT'))
            db.execute('INSERT INTO app_messages VALUES(?)', (self.now-300,))
            db.execute('INSERT INTO app_messages VALUES(?)', (self.now+50,))
            db.execute('INSERT INTO source_health VALUES(?,NULL)',(self.now-10,))
        self.adapter = self.qa/'external-feed/adapter.sqlite3'
        with sqlite3.connect(self.adapter) as db:
            db.executescript('''
                CREATE TABLE selected_outbox(payload TEXT, delivered_at REAL, quarantined_at TEXT,
                    quarantine_reason TEXT,last_http_status INTEGER,attempts INTEGER);
                CREATE TABLE incoming_bridge_seen(reason TEXT,processed_at REAL);
            ''')
            payload=json.dumps({'kind':'cargo','status':'active','source_published_at':status.iso(self.now-300),
                                'original_text':'PRIVATE_TEXT','contacts':['+77771112233']})
            db.executemany('INSERT INTO selected_outbox VALUES(?,?,NULL,NULL,200,1)',[(payload,self.now-100)]*3)
            db.execute('INSERT INTO selected_outbox VALUES(?,NULL,NULL,NULL,503,2)',(payload,))
            db.execute('INSERT INTO incoming_bridge_seen VALUES(?,?)',('accepted',self.now-200))
        self.feed=self.qa/'runtime/external-freight.sqlite3'
        with sqlite3.connect(self.feed) as db:
            db.executescript('''
                CREATE TABLE external_freight_items(kind TEXT,status TEXT,expires_at TEXT,
                    source_published_at TEXT,ingested_at TEXT);
                CREATE TABLE external_freight_audit(action TEXT,created_at TEXT);
            ''')
            db.executemany('INSERT INTO external_freight_items VALUES(?,?,?,?,?)',[
                ('cargo','active',status.iso(self.now+100),status.iso(self.now-431900),status.iso(self.now-20)),
                ('vehicle','active',status.iso(self.now+500),status.iso(self.now-431500),status.iso(self.now-30)),
                ('cargo','active',status.iso(self.now-1),status.iso(self.now-432001),status.iso(self.now-40)),
                ('cargo','review',status.iso(self.now+100),status.iso(self.now-431900),status.iso(self.now-50)),
            ])
            db.execute('INSERT INTO external_freight_audit VALUES(?,?)',('created',status.iso(self.now-20)))

    def report(self):
        return status.build_report(self.root,now=self.now,services=False)

    def test_distinguishes_receipts_new_cards_and_active_cards(self):
        result=self.report()
        self.assertEqual(result['windows']['today']['publisher_confirmed_messages'],1)
        self.assertEqual(result['windows']['today']['collected_messages'],1)
        self.assertEqual(result['windows']['today']['latest_delivery_acks'][0]['records'],3)
        self.assertEqual(result['cards']['active'],{'cargo':1,'vehicle':1})
        self.assertEqual(result['cards']['hidden_by_clock'],1)
        self.assertEqual(result['goal']['missing'],9998)
        self.assertIsNone(result['windows']['today']['channel_total_messages'])
        self.assertEqual(result['delivery']['pending'],1)
        self.assertEqual(result['delivery']['retry_records'],1)

    def test_day_is_almaty_and_delivery_latency_is_not_queue_wait(self):
        result=self.report()
        self.assertEqual(result['windows']['today']['start'],'2026-10-24T19:00:00+00:00')
        self.assertEqual(result['delivery']['oldest_pending_source_age_seconds'],300)
        self.assertIn('publication_to_first_ingest_seconds',result['windows']['today'])

    def test_does_not_write_databases_or_leak_payload_secrets_or_unknown_reasons(self):
        before={p:hashlib.sha256(p.read_bytes()).digest() for p in [self.source,self.adapter,self.feed]}
        encoded=json.dumps(self.report(),ensure_ascii=False)
        for secret in ['PRIVATE_TEXT','77771112233','SECRET_MARKER_DO_NOT_PRINT']:
            self.assertNotIn(secret,encoded)
        for p,digest in before.items():self.assertEqual(hashlib.sha256(p.read_bytes()).digest(),digest)
        self.assertIn('other_redacted',encoded)

    def test_missing_and_outside_paths_are_not_created_or_read(self):
        self.source.unlink()
        outside=self.root/'external.sqlite3'
        outside.write_text('PRIVATE_TEXT')
        (self.qa/'external-feed-bridge.env').write_text('EXTERNAL_FREIGHT_ADAPTER_DB='+str(outside)+'\n')
        result=self.report()
        self.assertFalse(self.source.exists())
        self.assertIn('collector_database_missing_or_outside_root',result['errors'])
        self.assertIn('adapter_database_missing_or_outside_root',result['errors'])
        self.assertEqual(result['status'],'incomplete')

    def test_reports_architecture_and_retention_blockers(self):
        result=self.report()
        self.assertIn('required_channel_chain_not_verified',result['blockers'])
        self.assertIn('seven_day_ttl_not_deployed',result['blockers'])
        self.assertEqual(result['source_sha'],'a'*40)
        self.assertIsNone(result['temporary_cleanup']['eligible_records'])

    def test_delivery_windows_handle_real_affinity_iso_acks_and_old_records(self):
        with sqlite3.connect(self.adapter) as db:
            db.execute('UPDATE selected_outbox SET delivered_at=? WHERE delivered_at IS NOT NULL', (status.iso(self.now-100),))
            payload=json.dumps({'kind':'vehicle','status':'active'})
            db.execute('INSERT INTO selected_outbox VALUES(?,?,NULL,NULL,200,1)',(payload,status.iso(self.now-90000)))
        result=self.report()
        self.assertEqual(result['windows']['today']['latest_delivery_acks'],[{'kind':'cargo','status':'active','records':3}])
        self.assertEqual(result['windows']['last_24h']['latest_delivery_acks'],result['windows']['today']['latest_delivery_acks'])

    def test_unknown_labels_in_database_do_not_expose_personal_data(self):
        with sqlite3.connect(self.source) as db:
            db.execute('INSERT INTO queue VALUES(?,?,NULL,NULL)',('PRIVATE_TEXT',self.now-10))
        with sqlite3.connect(self.feed) as db:
            db.execute('INSERT INTO external_freight_audit VALUES(?,?)',('PRIVATE_TEXT',status.iso(self.now-10)))
            db.execute('INSERT INTO external_freight_items VALUES(?,?,?,?,?)',('PRIVATE_TEXT','active',self.iso,self.iso,self.iso))
        self.assertNotIn('PRIVATE_TEXT',json.dumps(self.report()))


if __name__ == '__main__':
    unittest.main()
