#!/usr/bin/env python3
"""Read-only aggregate report for Telegram source -> incoming adapter flow."""
import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


def readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


def summarize(source_path, adapter_path, owned_adapter_path=None, *, now=None, retention_days=10):
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=retention_days)).isoformat()
    cutoff_epoch = (now - timedelta(days=retention_days)).timestamp()
    with readonly(source_path) as source:
        received = {r['source']: {'received_total_messages': r['total'],
                                  'eligible_messages': r['eligible']} for r in source.execute('''
            SELECT source,count(*) total,
                   sum(CASE WHEN source_date>=? THEN 1 ELSE 0 END) eligible
            FROM app_messages GROUP BY source
        ''', (cutoff_epoch,))}
        processed, reasons, listings = {}, {}, {}
        adapters = [adapter_path] + ([owned_adapter_path] if owned_adapter_path else [])
        for index, current_path in enumerate(adapters):
            alias = f'adapter_{index}'
            with readonly(current_path) as adapter:
                source.execute(f'ATTACH DATABASE ? AS {alias}',
                               (Path(current_path).resolve().as_uri() + '?mode=ro',))
                # Never load message text, contacts, or raw payload into report output.
                for row in source.execute(f'''
                    SELECT m.source,count(*) n FROM {alias}.incoming_bridge_seen s
                    JOIN app_messages m ON m.id=s.source_queue_id
                    WHERE m.source_date>=? GROUP BY m.source
                ''', (cutoff_epoch,)):
                    processed[row['source']] = processed.get(row['source'], 0) + row['n']
                for row in source.execute(f'''
                    SELECT m.source,s.reason,count(*) n FROM {alias}.incoming_bridge_seen s
                    JOIN app_messages m ON m.id=s.source_queue_id
                    WHERE s.reason<>'accepted' AND m.source_date>=? GROUP BY m.source,s.reason
                ''', (cutoff_epoch,)):
                    reasons.setdefault(row['source'], {})[row['reason']] = (
                        reasons.setdefault(row['source'], {}).get(row['reason'], 0) + row['n'])
                for row in adapter.execute('''
                    SELECT COALESCE(json_extract(payload,'$.origin_source'),'unknown') source,
                           count(*) extracted,
                           sum(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) delivered,
                           sum(CASE WHEN delivered_at IS NULL AND quarantined_at IS NULL THEN 1 ELSE 0 END) pending,
                           sum(CASE WHEN quarantined_at IS NOT NULL AND delivered_at IS NULL THEN 1 ELSE 0 END) quarantined,
                           sum(CASE WHEN delivered_at IS NULL AND quarantined_at IS NULL
                               AND json_extract(payload,'$.source_published_at')<? THEN 1 ELSE 0 END) pending_expired
                    FROM selected_outbox GROUP BY source
                ''', (cutoff,)):
                    target = listings.setdefault(row['source'], {k: 0 for k in
                        ('extracted', 'delivered', 'pending', 'quarantined', 'pending_expired')})
                    for key in target:
                        target[key] += row[key] or 0
                source.execute(f'DETACH DATABASE {alias}')
        result = {}
        for source_name in sorted(set(received) | set(processed) | set(listings) | set(reasons)):
            eligible = received.get(source_name, {}).get('eligible_messages', 0)
            processed_count = processed.get(source_name, 0)
            result[source_name] = {
                **received.get(source_name, {'received_total_messages': 0, 'eligible_messages': 0}),
                'processed_messages_10d': processed_count,
                'awaiting_processing_10d': max(0, eligible - processed_count),
                'extracted_listings': listings.get(source_name, {}).get('extracted', 0),
                'delivered': listings.get(source_name, {}).get('delivered', 0),
                'remaining': listings.get(source_name, {}).get('pending', 0),
                'quarantined': listings.get(source_name, {}).get('quarantined', 0),
                'pending_expired': listings.get(source_name, {}).get('pending_expired', 0),
                'skipped_by_reason': reasons.get(source_name, {}),
            }
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-db', default='/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3')
    parser.add_argument('--adapter-db', default='/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3')
    parser.add_argument('--owned-adapter-db', default='/home/ubuntu/urtruck-qa2/external-feed-owned/adapter.sqlite3')
    parser.add_argument('--retention-days', type=int, default=10)
    args = parser.parse_args()
    print(json.dumps(summarize(args.source_db, args.adapter_db, args.owned_adapter_db,
                               retention_days=args.retention_days), ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
