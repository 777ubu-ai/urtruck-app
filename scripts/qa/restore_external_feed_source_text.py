"""Восстановление полных исходников существующих QA2-карточек через importer API.

По умолчанию только план. --apply сохраняет приватный rollback JSONL и отправляет
существующие идентичности через штатный API; исходная Telegram-БД read-only.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

QA_ROOT = Path('/home/ubuntu/urtruck-qa2')
sys.path.insert(0, str(QA_ROOT/'backend'))
from services.external_freight_classifier import classify_message
from services.external_freight_parser import _single_post_footer_contact


def env(path):
    result = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def read_db(path):
    db = sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--limit', type=int, default=20000)
    args = parser.parse_args()
    cfg = env(QA_ROOT/'.env') | env(QA_ROOT/'backend/.env')
    bridge = env(QA_ROOT/'external-feed-bridge.env')
    api = bridge.get('EXTERNAL_FREIGHT_API_URL', '').rstrip('/')
    if api != 'https://qa2.urtruck.kz':
        raise RuntimeError('qa2_target_required')
    path = Path(cfg.get('EXTERNAL_FREIGHT_DB_PATH') or
                Path(cfg['DB_PATH']).with_name('external-freight.sqlite3'))
    if not path.resolve().is_relative_to(QA_ROOT):
        raise RuntimeError('qa2_database_required')
    source_path = Path(bridge.get('EXTERNAL_FREIGHT_SOURCE_DB') or
                       '/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3')
    db, source = read_db(path), read_db(source_path)
    rows = db.execute("SELECT * FROM external_freight_items WHERE status='active' AND expires_at>? "
                      "ORDER BY source_published_at DESC LIMIT ?",
                      (datetime.now(timezone.utc).isoformat(), max(1, min(args.limit, 50000)))).fetchall()
    plan, skipped, common_contacts = [], 0, 0
    for row in rows:
        original = source.execute('SELECT text FROM app_messages WHERE source_id=? AND source_message=?',
                                  (row['source_id'], row['source_message_id'])).fetchone()
        if not original or not isinstance(original['text'], str):
            continue
        full = original['text']
        if len(full) <= len(row['original_text']) or len(full) > 20000:
            continue
        classification = classify_message(row['original_text'])
        if classification.get('status') != 'active' or classification.get('kind') != row['kind']:
            skipped += 1
            continue
        record = dict(row)
        for key in ('contacts', 'body_types'):
            record[key] = json.loads(record[key] or '[]')
        before = dict(record)
        record['source_text'] = full
        record['source_revision'] = 'full-post-v10:' + hashlib.sha256(full.encode()).hexdigest()
        if not record['contacts']:
            common = _single_post_footer_contact(full)
            if common:
                record['contacts'] = [common]
                common_contacts += 1
        plan.append((before, record))
    db.close()
    source.close()
    summary = {'mode': 'apply' if args.apply else 'dry_run', 'scanned': len(rows),
               'restore_full_text': len(plan), 'restore_common_contact': common_contacts,
               'skip_changed_classification': skipped}
    if args.apply and plan:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        backup = QA_ROOT/'backups'/f'full-source-before-{stamp}.jsonl'
        backup.parent.mkdir(parents=True, exist_ok=True)
        with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as saved:
            for before, record in plan:
                saved.write(json.dumps({'before': before, 'after': record}, ensure_ascii=False)+'\n')
        summary['backup'] = str(backup)
        key = bridge.get('EXTERNAL_FREIGHT_IMPORTER_KEY')
        if not key:
            raise RuntimeError('importer_key_required')
        sent = 0
        for offset in range(0, len(plan), 50):
            batch = [record for _, record in plan[offset:offset+50]]
            request = urllib.request.Request(api+'/api/v1/external-freight/import', method='POST',
                data=json.dumps({'records': batch}, ensure_ascii=False).encode(),
                headers={'Content-Type': 'application/json', 'X-External-Importer-Key': key})
            with urllib.request.urlopen(request, timeout=30) as response:
                results = json.load(response)['results']
            if len(results) != len(batch) or any(row['status'] != 'active' or
                    row['result'] not in {'updated', 'replayed'} for row in results):
                raise RuntimeError('unexpected_restore_ack')
            sent += len(results)
            print(json.dumps({'restored': sent, 'total': len(plan)}), flush=True)
        summary['restored'] = sent
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
