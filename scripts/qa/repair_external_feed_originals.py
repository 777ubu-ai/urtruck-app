#!/usr/bin/env python3
"""QA2: dry-run по умолчанию; --apply с backup/journal; --rollback JOURNAL."""
import argparse
import json
import os
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/ubuntu/urtruck-qa2')
sys.path.insert(0, str(ROOT/'backend'))
from services.external_freight_source_repair import repair_original, rollback_original


def config(path):
    result = {}
    for line in path.read_text().splitlines() if path.exists() else []:
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    cfg = config(ROOT/'.env') | config(ROOT/'backend/.env')
    bridge = config(ROOT/'external-feed-bridge.env')
    if bridge.get('EXTERNAL_FREIGHT_API_URL') != 'https://qa2.urtruck.kz':
        raise ValueError('qa2_target_required')
    path = Path(cfg.get('EXTERNAL_FREIGHT_DB_PATH') or Path(cfg['DB_PATH']).with_name('external-freight.sqlite3')).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError('qa2_database_required')
    os.umask(0o077)
    db = sqlite3.connect(path.as_uri()+('?mode=rw' if args.apply or args.rollback else '?mode=ro'), uri=True, timeout=15)
    db.row_factory = sqlite3.Row
    if args.rollback:
        if not args.rollback.resolve().is_relative_to(ROOT/'backups'):
            raise ValueError('qa2_journal_required')
        result = Counter()
        for line in reversed(args.rollback.read_text().splitlines()):
            result['rolled_back' if rollback_original(db, json.loads(line)) else 'skipped_changed'] += 1
        print(json.dumps(dict(result)))
        return
    source_path = Path(bridge['EXTERNAL_FREIGHT_SOURCE_DB']).resolve()
    if source_path != Path('/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3'):
        raise ValueError('known_source_required')
    source = sqlite3.connect(source_path.as_uri()+'?mode=ro', uri=True, timeout=5)
    rows = db.execute("SELECT * FROM external_freight_items WHERE status='active' AND expires_at>?",
                      (datetime.now(timezone.utc).isoformat(),)).fetchall()
    journal = None
    result = Counter()
    if args.apply:
        backup = ROOT/'backups'/('feed-originals-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        backup.mkdir(mode=0o700, parents=True)
        target = sqlite3.connect(backup/'before.sqlite3')
        db.backup(target)
        target.close()
        journal = (backup/'changes.jsonl').open('x')
        print(json.dumps({'backup': str(backup)}), flush=True)
    try:
        for row in rows:
            found = source.execute('SELECT text FROM app_messages WHERE source_id=? AND source_message=?',
                                   (row['source_id'], row['source_message_id'])).fetchone()
            result[repair_original(db, row, found[0], journal, apply=args.apply) if found else 'source_missing'] += 1
    finally:
        if journal:
            journal.close()
        source.close()
        db.close()
    print(json.dumps({'mode': 'apply' if args.apply else 'dry_run', 'scanned': len(rows), **result}), flush=True)


if __name__ == '__main__':
    main()
