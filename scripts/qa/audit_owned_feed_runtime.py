"""Read-only aggregate evidence for the owned Telegram QA2 cutover; no PII/secrets."""
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

QA_ROOT = Path('/home/ubuntu/urtruck-qa2')
COLLECTOR_ROOT = Path('/home/ubuntu/urtruck-telegram-feed')
OWNED_SOURCE = 'urtruck_obyavleniya'


def env_values(path):
    if not path.is_file():
        return {}
    result = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def db_counts(path, queries):
    if not path.is_file():
        return {'available': False}
    result = {'available': True}
    try:
        with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True, timeout=2)) as db:
            db.execute('PRAGMA query_only=ON')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            for name, table, query, args in queries:
                if table in tables:
                    result[name] = db.execute(query, args).fetchone()[0]
    except sqlite3.Error as exc:
        result['error'] = type(exc).__name__
    return result


def main():
    collector = env_values(COLLECTOR_ROOT/'.env')
    bridge = env_values(QA_ROOT/'external-feed-bridge.env')
    backend = env_values(QA_ROOT/'backend/.env')
    report = {'audit_mode': 'read_only', 'runtime_enabled_not_proven_by_files': True}
    report['collector'] = {key: collector.get(key, 'unset') if collector.get(key) in
                           {'true', 'false', '1', '0', 'yes', 'no'} else 'unset_or_other'
                           for key in ('PUBLISH_ENABLED', 'OWNED_FEED_ENABLED', 'OWNED_TELEGRAM_CTA_ENABLED')}
    report['collector']['bot_token_present'] = bool(collector.get('TELEGRAM_BOT_TOKEN'))
    report['bridge'] = {
        'source_mode': bridge.get('EXTERNAL_FREIGHT_SOURCE_MODE') if bridge.get('EXTERNAL_FREIGHT_SOURCE_MODE')
                       in {'owned', 'incoming', 'published'} else 'unset_or_other',
        'api_is_qa2': bridge.get('EXTERNAL_FREIGHT_API_URL', '').rstrip('/') == 'https://qa2.urtruck.kz',
        'importer_key_present': bool(bridge.get('EXTERNAL_FREIGHT_IMPORTER_KEY')),
        'import_enabled': bridge.get('EXTERNAL_FREIGHT_IMPORT_ENABLED', '').lower() in {'true', '1', 'yes'},
    }
    files = {'collector': COLLECTOR_ROOT/'feed.py'}
    for name in ('owned_telegram_feed', 'external_freight_queue_bridge', 'external_freight_parser',
                 'external_freight_classifier', 'external_freight_import_adapter'):
        files[name] = QA_ROOT/'backend/services'/f'{name}.py'
    report['code_sha256'] = {name: hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
                             for name, path in files.items()}
    source = Path(bridge.get('EXTERNAL_FREIGHT_SOURCE_DB') or COLLECTOR_ROOT/'state/feed.sqlite3')
    if source.resolve().is_relative_to(COLLECTOR_ROOT.resolve()):
        report['intake'] = db_counts(source, [
            ('own_messages', 'app_messages', 'SELECT count(*) FROM app_messages WHERE lower(source)=?', (OWNED_SOURCE,)),
            ('own_messages_120h', 'app_messages', "SELECT count(*) FROM app_messages WHERE lower(source)=? AND source_date>=strftime('%s','now')-432000", (OWNED_SOURCE,)),
            ('queue_pending', 'queue', "SELECT count(*) FROM queue WHERE status IN ('queued','sending','uncertain')", ()),
        ])
    else:
        report['intake'] = {'error': 'source_path_outside_expected_root'}
    adapter_path = bridge.get('EXTERNAL_FREIGHT_ADAPTER_DB')
    if adapter_path and Path(adapter_path).resolve().is_relative_to((QA_ROOT/'external-feed').resolve()):
        report['adapter'] = db_counts(Path(adapter_path), [
            ('total', 'selected_outbox', 'SELECT count(*) FROM selected_outbox', ()),
            ('pending', 'selected_outbox', 'SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL', ()),
            ('quarantined', 'selected_outbox', 'SELECT count(*) FROM selected_outbox WHERE quarantined_at IS NOT NULL', ()),
        ])
    else:
        report['adapter'] = {'error': 'adapter_path_unavailable_or_outside_qa2'}
    report['backend_feed_flag'] = backend.get('EXTERNAL_FREIGHT_FEED_ENABLED', '').lower() in {'true', '1', 'yes'}
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
