#!/usr/bin/env python3
"""Агрегированный аудит QA2: только чтение, без текстов, контактов и секретов."""
import argparse
import hashlib
import json
import re
import shlex
import sqlite3
import subprocess
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import urllib.request


def iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def config(path, keys):
    result = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                if key.strip() in keys:
                    result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def safe_reason(value):
    # Неизвестный ответ провайдера может содержать текст объявления/телефон.
    known = {'accepted', 'ambiguous_kind', 'mixed_intents', 'unrecognized_intent',
             'unresolved_direction', 'promotional_content', 'exact_content_duplicate',
             'invalid_source_record', 'already_in_destination', 'older_than_24_hours',
             'deleted_closed_or_expired', 'import_validation_422', 'missing_delivery_receipt',
             'invalid_owned_record', 'missing_contact', 'missing_direction'}
    return value if value in known else 'other_redacted'


def grouped_reasons(rows):
    result = {}
    for reason, count in rows:
        key = safe_reason(reason)
        result[key] = result.get(key, 0) + count
    return result


@contextmanager
def readonly(path):
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        yield connection
    finally:
        connection.close()


def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def counts(db, query, args=(), allowed=None):
    result = {}
    for key, count in db.execute(query, args):
        if allowed is not None and key not in allowed:
            key = 'other_redacted'
        if allowed is None and not (isinstance(key, int) and 100 <= key <= 599):
            key = 'unknown'
        key = str(key)
        result[key] = result.get(key, 0) + count
    return result


def confined(path, root):
    return path.is_file() and path.resolve().is_relative_to(root.resolve())


def service_state(unit):
    try:
        process = subprocess.run(['systemctl', 'show', unit, '-p', 'LoadState', '-p', 'ActiveState',
                                  '-p', 'SubState', '-p', 'Result'], capture_output=True, text=True, timeout=5)
        return {key: value for line in process.stdout.splitlines() if '=' in line
                for key, value in [line.split('=', 1)] if re.fullmatch(r'[a-z-]+', value)}
    except (OSError, subprocess.TimeoutExpired):
        return {'available': False}


def unit_mode():
    try:
        result = subprocess.run(['systemctl', 'show', 'urtruck-qa2-feed-bridge.service',
                                 '-p', 'Environment', '--value'], capture_output=True, text=True, timeout=5)
        return dict(part.split('=', 1) for part in shlex.split(result.stdout) if '=' in part).get(
            'EXTERNAL_FREIGHT_SOURCE_MODE', 'published')
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def api_state():
    result = {}
    for name, path in [('health', '/health'), ('version', '/api/version')]:
        try:
            with urllib.request.urlopen('http://127.0.0.1:8002'+path, timeout=5) as response:
                result[name+'_http'] = response.status
                body = json.loads(response.read(65536))
                if name == 'version' and isinstance(body, dict):
                    version = body.get('version')
                    if isinstance(version, str) and re.fullmatch(r'[0-9.]{1,40}', version):
                        result['version'] = version
        except (OSError, ValueError):
            result[name+'_http'] = None
    return result


def build_report(root=Path('/home/ubuntu'), *, now=None, services=True):
    root = Path(root)
    now = time.time() if now is None else now
    local = datetime.fromtimestamp(now, ZoneInfo('Asia/Almaty'))
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    windows = {'today': midnight, 'last_24h': now - 86400}
    qa, collector = root/'urtruck-qa2', root/'urtruck-telegram-feed'
    bridge = config(qa/'external-feed-bridge.env', {
        'EXTERNAL_FREIGHT_SOURCE_DB', 'EXTERNAL_FREIGHT_ADAPTER_DB', 'EXTERNAL_FREIGHT_SOURCE_MODE'})
    backend = config(qa/'backend/.env', {'DB_PATH', 'EXTERNAL_FREIGHT_DB_PATH'})
    source = Path(bridge.get('EXTERNAL_FREIGHT_SOURCE_DB', str(collector/'state/feed.sqlite3')))
    adapter = Path(bridge.get('EXTERNAL_FREIGHT_ADAPTER_DB', str(qa/'external-feed/adapter.sqlite3')))
    primary = Path(backend.get('DB_PATH', str(qa/'runtime/security.db')))
    feed = Path(backend.get('EXTERNAL_FREIGHT_DB_PATH', str(primary.with_name('external-freight.sqlite3'))))
    report = {'schema_version': 1, 'read_only': True, 'environment': 'qa2', 'checked_at': iso(now),
              'timezone': 'Asia/Almaty', 'local_date': local.date().isoformat(), 'source_sha': None,
              'source_sha_scope': 'release_marker_only_compare_runtime_module_hashes',
              'windows': {name: {'start': iso(start), 'end': iso(now)} for name, start in windows.items()},
              'errors': [], 'blockers': ['temporary_cleanup_policy_not_verified'], 'temporary_cleanup': {
                  'configured': False, 'eligible_records': None, 'last_result': None,
                  'reason': 'temporary_data_classification_not_verified'},
              'required_chain': 'sources -> @UrTruck_UT -> API -> cargo/vehicle'}
    marker = qa/'backend/.qa-source-sha'
    if marker.is_file():
        match = re.fullmatch(r'[0-9a-f]{40}', marker.read_text().strip())
        report['source_sha'] = match.group() if match else None
    paths = {'collector': collector/'feed.py', **{
        name: qa/'backend'/name for name in ['services/external_freight_queue_bridge.py',
        'services/external_freight_classifier.py', 'services/external_freight_parser.py',
        'services/external_freight_import_adapter.py', 'database/external_freight_dal.py']}}
    report['code_sha256'] = {name: hashlib.sha256(path.read_bytes()).hexdigest()
                             if path.is_file() else None for name, path in paths.items()}
    mode = bridge.get('EXTERNAL_FREIGHT_SOURCE_MODE')
    if not mode and services:
        mode = unit_mode()
    mode = mode if mode in {'incoming', 'published', 'owned'} else None
    report['bridge_source_mode_configured'] = mode
    if mode != 'published':
        report['blockers'].append('required_channel_chain_not_verified')
    if services:
        report['api'] = api_state()
        if report['api'].get('health_http') != 200 or report['api'].get('version_http') != 200:
            report['errors'].append('qa2_api_health_not_verified')
        report['services'] = {unit: service_state(unit) for unit in [
            'urtruck-telegram-feed.service', 'urtruck-qa2-feed-bridge.service',
            'urtruck-qa2-feed-bridge.timer', 'urtruck-qa2.service',
            'urtruck-production-feed-bridge.timer']}
    report['last_successful_collection_at'] = None
    if confined(source, collector):
        try:
            with readonly(source) as db:
                present = tables(db)
                report['collector'] = {'queue_by_status': counts(db, 'SELECT status,count(*) FROM queue GROUP BY status', allowed={'queued','sending','uncertain','published','expired','rejected'}),
                    'rejection_reasons_all_time': grouped_reasons(db.execute(
                        'SELECT reason,count(*) FROM queue WHERE reason IS NOT NULL GROUP BY reason'))}
                if 'source_health' in present:
                    successful, errors = db.execute("SELECT max(CASE WHEN error IS NULL OR error='' THEN checked_at END),sum(CASE WHEN error IS NOT NULL AND error!='' THEN 1 ELSE 0 END) FROM source_health").fetchone()
                    report['last_successful_collection_at'] = iso(successful) if successful else None
                    report['collector']['source_errors'] = errors or 0
                pending = db.execute("SELECT count(*),min(source_date) FROM queue WHERE status IN ('queued','sending','uncertain')").fetchone()
                report['collector']['pending'] = pending[0]
                report['collector']['oldest_pending_age_seconds'] = max(0, now-pending[1]) if pending[1] else None
                for window, start in windows.items():
                    target = report['windows'][window]
                    target['publisher_confirmed_messages'] = db.execute("SELECT count(*) FROM queue WHERE status='published' AND published_at>=? AND published_at<=?", (start, now)).fetchone()[0]
                    target['channel_total_messages'] = None
                    target['channel_total_evidence'] = 'publisher_receipts_only_not_complete_channel_history'
                    target['collected_messages'] = db.execute('SELECT count(*) FROM app_messages WHERE received_at>=? AND received_at<=?', (start, now)).fetchone()[0] if 'app_messages' in present else None
                    target['publisher_rejection_reasons'] = grouped_reasons(db.execute("SELECT reason,count(*) FROM queue WHERE reason IS NOT NULL AND source_date>=? AND source_date<=? GROUP BY reason", (start, now)))
        except sqlite3.Error:
            report['errors'].append('collector_database_query_failed')
    else:
        report['errors'].append('collector_database_missing_or_outside_root')
    if confined(adapter, qa/'external-feed'):
        try:
            with readonly(adapter) as db:
                present = tables(db)
                report['delivery'] = {'http_status_all_time': counts(db, 'SELECT last_http_status,count(*) FROM selected_outbox GROUP BY last_http_status'),
                    'quarantine_reasons': grouped_reasons(db.execute('SELECT quarantine_reason,count(*) FROM selected_outbox WHERE quarantined_at IS NOT NULL GROUP BY quarantine_reason')),
                    'pending': db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL').fetchone()[0],
                    'quarantined': db.execute('SELECT count(*) FROM selected_outbox WHERE quarantined_at IS NOT NULL').fetchone()[0],
                    'retry_records': db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL AND attempts>0').fetchone()[0],
                    'oldest_pending_source_age_seconds': None}
                oldest = db.execute("SELECT min(julianday(json_extract(payload,'$.source_published_at'))) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL").fetchone()[0]
                if oldest is not None:
                    report['delivery']['oldest_pending_source_age_seconds'] = round(max(0, now-(oldest-2440587.5)*86400),2)
                if 'incoming_bridge_seen' in present:
                    report['delivery']['classification_reasons_all_time'] = grouped_reasons(db.execute('SELECT reason,count(*) FROM incoming_bridge_seen GROUP BY reason'))
                for window, start in windows.items():
                    target = report['windows'][window]
                    # REAL affinity не запрещает ISO-строки: штатный ACK пишет ISO.
                    delivered_epoch = "CASE WHEN typeof(delivered_at) IN ('real','integer') THEN delivered_at ELSE (julianday(delivered_at)-2440587.5)*86400 END"
                    target['latest_delivery_acks'] = [dict(kind=kind, status=status, records=count) for kind, status, count in db.execute(f"SELECT json_extract(payload,'$.kind'),json_extract(payload,'$.status'),count(*) FROM selected_outbox WHERE ({delivered_epoch})>=? AND ({delivered_epoch})<=? GROUP BY 1,2", (start, now)) if kind in {'cargo','vehicle'} and status in {'active','review','closed','hidden'}]
                    target['delivery_counter_semantics'] = 'latest_ack_per_identity_not_new_cards_or_total_attempts'
                    if 'incoming_bridge_seen' in present:
                        target['classification_reasons'] = grouped_reasons(db.execute('SELECT reason,count(*) FROM incoming_bridge_seen WHERE processed_at>=? AND processed_at<=? GROUP BY reason', (start, now)))
        except (sqlite3.Error, ValueError):
            report['errors'].append('adapter_database_query_failed')
    else:
        report['errors'].append('adapter_database_missing_or_outside_root')
    if confined(feed, qa) and feed.resolve() != primary.resolve():
        try:
            with readonly(feed) as db:
                present = tables(db)
                report['cards'] = {'active': {kind: db.execute("SELECT count(*) FROM external_freight_items WHERE kind=? AND status='active' AND julianday(expires_at)>julianday(?)", (kind, iso(now))).fetchone()[0] for kind in ('cargo','vehicle')},
                    'by_kind_status': [dict(kind=kind,status=status,count=count) for kind,status,count in db.execute('SELECT kind,status,count(*) FROM external_freight_items GROUP BY kind,status') if kind in {'cargo','vehicle'} and status in {'active','review','closed','hidden','expired'}],
                    'manual_review': db.execute("SELECT count(*) FROM external_freight_items WHERE status='review' AND julianday(expires_at)>julianday(?)", (iso(now),)).fetchone()[0],
                    'ttl_hours_observed': [dict(hours=hours,records=count) for hours,count in db.execute('SELECT round((julianday(expires_at)-julianday(source_published_at))*24,2),count(*) FROM external_freight_items GROUP BY 1')],
                    'hidden_by_clock': db.execute("SELECT count(*) FROM external_freight_items WHERE status='active' AND julianday(expires_at)<=julianday(?)", (iso(now),)).fetchone()[0],
                    'expiry_closed_status': db.execute("SELECT count(*) FROM external_freight_items WHERE status='expired'").fetchone()[0]}
                if any(row['hours'] != 168 for row in report['cards']['ttl_hours_observed']):
                    report['blockers'].append('seven_day_ttl_not_deployed')
                total = sum(report['cards']['active'].values())
                report['goal'] = {'target': 10000,'actual_active_cards':total,'missing':max(0,10000-total)}
                for window, start in windows.items():
                    target = report['windows'][window]
                    target['new_cards'] = [dict(kind=kind,status=status,cards=count) for kind,status,count in db.execute('SELECT kind,status,count(*) FROM external_freight_items WHERE julianday(ingested_at)>=julianday(?) AND julianday(ingested_at)<=julianday(?) GROUP BY kind,status', (iso(start),iso(now))) if kind in {'cargo','vehicle'} and status in {'active','review','closed','hidden','expired'}]
                    target['api_events'] = counts(db,'SELECT action,count(*) FROM external_freight_audit WHERE julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) GROUP BY action', (iso(start),iso(now)), allowed={'created','updated','replayed','approved','expired','closed','hidden','bookmarked','unbookmarked'}) if 'external_freight_audit' in present else None
                    target['new_cards_per_hour'] = round(sum(row['cards'] for row in target['new_cards'])/max((now-start)/3600,1/3600),2)
                    latency = db.execute('SELECT avg((julianday(ingested_at)-julianday(source_published_at))*86400),max((julianday(ingested_at)-julianday(source_published_at))*86400) FROM external_freight_items WHERE julianday(ingested_at)>=julianday(?) AND julianday(ingested_at)<=julianday(?) AND julianday(ingested_at)>=julianday(source_published_at)', (iso(start),iso(now))).fetchone()
                    target['publication_to_first_ingest_seconds'] = dict(zip(('mean','maximum'),(round(v,2) if v is not None else None for v in latency)))
        except sqlite3.Error:
            report['errors'].append('feed_database_query_failed')
    else:
        report['errors'].append('feed_database_missing_or_outside_root_or_primary')
    report['status'] = 'incomplete' if report['errors'] else 'blocked' if report['blockers'] else 'observed'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/home/ubuntu'))
    args = parser.parse_args()
    try:
        report = build_report(args.root)
    except (OSError, ValueError, sqlite3.Error) as exc:
        report = {'schema_version':1, 'read_only':True, 'environment':'qa2',
                  'status':'incomplete', 'errors':[type(exc).__name__]}
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
