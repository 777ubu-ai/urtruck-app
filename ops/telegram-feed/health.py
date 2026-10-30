#!/usr/bin/env python3
"""Контроль прогресса QA2/Telegram: без текстов объявлений и телефонов в логах."""
import argparse
import json
import os
import sqlite3
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STALL_SECONDS = 120
HEARTBEAT_SECONDS = 180
BACKLOG_GROWTH_SECONDS = 600
BACKLOG_GROWTH_MIN_ROWS = 20
RETENTION_SECONDS = 10 * 24 * 3600


def readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    db.execute('PRAGMA query_only=ON')
    return db


def snapshot(root=ROOT, now=None):
    now = time.time() if now is None else now
    with readonly(root/'state/feed.sqlite3') as db:
        metadata = dict(db.execute("SELECT key,value FROM metadata WHERE key IN ('last_tick','publish_after')"))
        tick = datetime.fromisoformat(metadata['last_tick']).timestamp() if metadata.get('last_tick') else 0
        queue = dict(db.execute('SELECT status,count(*) FROM queue GROUP BY status'))
        latest = db.execute('SELECT max(received_at) FROM app_messages').fetchone()[0]
        source_errors = db.execute('SELECT count(*) FROM source_health WHERE error IS NOT NULL').fetchone()[0]
        result = {'telegram': {'ready': queue.get('queued', 0),
                  'progress': queue.get('published', 0), 'paused_until': float(metadata.get('publish_after') or 0),
                  'uncertain': queue.get('sending', 0)+queue.get('uncertain', 0)},
                  'source_errors': source_errors, 'heartbeat_age': max(0, now-tick),
                  'last_received_age': max(0, now-latest) if latest else None}
    for name, directory in [('incoming', 'external-feed'), ('owned', 'external-feed-owned')]:
        path = Path('/home/ubuntu/urtruck-qa2')/directory/'adapter.sqlite3'
        if not path.is_file():
            result[name] = {'error': 'state_missing'}
            continue
        with readonly(path) as db:
            cutoff = datetime.fromtimestamp(now - RETENTION_SECONDS, timezone.utc).isoformat()
            eligible = '''delivered_at IS NULL AND quarantined_at IS NULL
                AND (json_extract(payload,'$.source_published_at') IS NULL
                    OR julianday(json_extract(payload,'$.source_published_at')) >= julianday(?))'''
            ready = db.execute(f'SELECT count(*) FROM selected_outbox WHERE {eligible} '
                               'AND next_attempt_at<=?', (cutoff, now)).fetchone()[0]
            progress = db.execute('SELECT max(delivered_at) FROM selected_outbox').fetchone()[0]
            pending = db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL').fetchone()[0]
            expired_pending = db.execute('''SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL
                AND quarantined_at IS NULL AND json_extract(payload,'$.source_published_at') IS NOT NULL
                AND julianday(json_extract(payload,'$.source_published_at')) <
                    julianday(?)''', (cutoff,)).fetchone()[0]
            quarantined = db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NOT NULL').fetchone()[0]
            result[name] = {'ready': ready, 'pending': pending, 'quarantined': quarantined,
                            'backlog': pending - expired_pending, 'expired_pending': expired_pending,
                            'progress': progress, 'paused_until': 0}
    source_path = Path('/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3')
    incoming_path = Path('/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3')
    owned_path = Path('/home/ubuntu/urtruck-qa2/external-feed-owned/adapter.sqlite3')
    if source_path.is_file() and incoming_path.is_file() and owned_path.is_file():
        with readonly(source_path) as source:
            source.execute('ATTACH DATABASE ? AS incoming_state',
                           (incoming_path.resolve().as_uri() + '?mode=ro',))
            source.execute('ATTACH DATABASE ? AS owned_state',
                           (owned_path.resolve().as_uri() + '?mode=ro',))
            waiting = source.execute('''SELECT count(*) FROM app_messages m
                WHERE m.source_date>=? AND NOT EXISTS (
                    SELECT 1 FROM incoming_state.incoming_bridge_seen s WHERE s.source_queue_id=m.id
                ) AND NOT EXISTS (
                    SELECT 1 FROM owned_state.incoming_bridge_seen s WHERE s.source_queue_id=m.id
                )''', (now - RETENTION_SECONDS,)).fetchone()[0]
            progress = source.execute('''SELECT max(processed_at) FROM (
                SELECT processed_at FROM incoming_state.incoming_bridge_seen
                UNION ALL SELECT processed_at FROM owned_state.incoming_bridge_seen
            )''').fetchone()[0]
            result['incoming']['source_waiting'] = waiting
            result['incoming']['source_backlog'] = waiting
            result['incoming']['source_progress'] = progress
    return result


def evaluate(current, previous, now):
    """Сигнал только при готовой очереди без прогресса, не при отсутствии заявок."""
    state = {'flows': {}, 'restarts': previous.get('restarts', []),
             'last_alert': previous.get('last_alert', 0), 'alerted': previous.get('alerted', [])}
    problems = []
    state['snapshot'] = current
    if current.get('source_errors'):
        problems.append('source_scan_errors')
    if current.get('heartbeat_age', 0) > HEARTBEAT_SECONDS:
        problems.append('collector_heartbeat_stale')
    for name in ('telegram', 'incoming', 'owned'):
        flow = current.get(name, {})
        old = previous.get('flows', {}).get(name, {})
        if flow.get('error'):
            problems.append(name + '_' + flow['error'])
            continue
        paused = flow.get('paused_until', 0) > now
        # `pending` includes records whose retry is scheduled in the future.
        # Only a due record (ready) or an in-flight/uncertain Telegram send
        # proves that delivery should currently be making progress.
        waiting = bool(flow.get('ready') or flow.get('uncertain'))
        if flow.get('quarantined'):
            problems.append(name + '_validation_quarantined')
        if flow.get('expired_pending'):
            problems.append(name + '_expired_pending')
        changed = old.get('progress') != flow.get('progress')
        since = now if changed or paused or not waiting or not old.get('waiting') else old.get('since', now)
        backlog = flow.get('backlog', flow.get('pending'))
        baseline = old.get('backlog_baseline')
        baseline_at = old.get('backlog_baseline_at')
        if paused or not isinstance(backlog, int):
            baseline, baseline_at = backlog, now
        elif not isinstance(baseline, int) or not isinstance(baseline_at, (int, float)):
            baseline, baseline_at = backlog, now
        elif backlog < baseline:
            baseline, baseline_at = backlog, now
        elif now - baseline_at >= BACKLOG_GROWTH_SECONDS and backlog - baseline >= BACKLOG_GROWTH_MIN_ROWS:
            problems.append(name + '_backlog_growing')
        elif now - baseline_at >= BACKLOG_GROWTH_SECONDS:
            baseline, baseline_at = backlog, now
        state['flows'][name] = {'progress': flow.get('progress'), 'since': since, 'waiting': waiting and not paused,
                                'backlog_baseline': baseline, 'backlog_baseline_at': baseline_at}
        source_waiting = flow.get('source_waiting')
        if name == 'incoming' and isinstance(source_waiting, int):
            source_old = old.get('source_progress')
            source_changed = source_old != flow.get('source_progress')
            source_since = now if source_changed or paused or not source_waiting or not old.get('source_waiting') else old.get('source_since', now)
            source_backlog = flow.get('source_backlog', source_waiting)
            source_baseline = old.get('source_backlog_baseline')
            source_baseline_at = old.get('source_backlog_baseline_at')
            if paused or not isinstance(source_baseline, int) or not isinstance(source_baseline_at, (int, float)):
                source_baseline, source_baseline_at = source_backlog, now
            elif source_backlog < source_baseline:
                source_baseline, source_baseline_at = source_backlog, now
            elif now-source_baseline_at >= BACKLOG_GROWTH_SECONDS and source_backlog-source_baseline >= BACKLOG_GROWTH_MIN_ROWS:
                problems.append('incoming_source_backlog_growing')
            elif now-source_baseline_at >= BACKLOG_GROWTH_SECONDS:
                source_baseline, source_baseline_at = source_backlog, now
            if source_waiting and not paused and now-source_since >= STALL_SECONDS:
                problems.append('incoming_source_stalled')
            state['flows'][name].update({'source_waiting': source_waiting,
                'source_progress': flow.get('source_progress'), 'source_since': source_since,
                'source_backlog_baseline': source_baseline,
                'source_backlog_baseline_at': source_baseline_at})
        if waiting and not paused and now-since >= STALL_SECONDS:
            problems.append(name + '_delivery_stalled')
    state['problems'] = sorted(problems)
    state['checked_at'] = now
    return state


def restart_allowed(state, now):
    recent = [stamp for stamp in state['restarts'] if now-stamp < 3600]
    return ('collector_heartbeat_stale' in state['problems'] and len(recent) < 2
            and (not recent or now-max(recent) >= 300))


def settings():
    result = {}
    for line in (ROOT/'.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def send_alert(state, cfg, now):
    token, chat = cfg.get('TELEGRAM_BOT_TOKEN'), cfg.get('TELEGRAM_ALERT_CHAT_ID')
    if not token or not chat:
        return 'not_configured'
    if state['problems'] == state['alerted'] or now-state['last_alert'] < 300:
        return 'unchanged_or_throttled'
    text = ('UrTruck: требуется проверка загрузки. ' + ', '.join(state['problems'])
            if state['problems'] else 'UrTruck: загрузка восстановлена, контроль прогресса проходит.')
    request = urllib.request.Request('https://api.telegram.org/bot'+token+'/sendMessage',
        data=json.dumps({'chat_id': chat, 'text': text}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=8) as response:
        result = json.load(response)
    if not result.get('ok'):
        raise RuntimeError('notification_not_confirmed')
    state['last_alert'], state['alerted'] = now, state['problems']
    return 'sent'


def save(path, state):
    temp = path.with_suffix('.tmp')
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as output:
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recover', action='store_true')
    args = parser.parse_args()
    import fcntl
    with (ROOT/'state/health.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        path = ROOT/'state/health.json'
        previous = json.loads(path.read_text()) if path.exists() else {}
        now = time.time()
        try:
            current = snapshot(now=now)
            cfg = settings()
            if cfg.get('PUBLISH_ENABLED', 'false').lower() != 'true':
                current['telegram']['ready'] = current['telegram']['uncertain'] = 0
            state = evaluate(current, previous, now)
        except Exception as exc:
            state = evaluate({}, previous, now)
            state['problems'] = ['health_read_failed_' + type(exc).__name__]
        if args.recover and restart_allowed(state, now):
            state['restarts'] = [stamp for stamp in state['restarts'] if now-stamp < 3600] + [now]
            save(path, state)
            try:
                result = subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'urtruck-telegram-feed.service'],
                                        capture_output=True, timeout=45)
                state['recovery'] = 'restart_requested' if result.returncode == 0 else 'restart_failed'
            except (OSError, subprocess.TimeoutExpired):
                state['recovery'] = 'restart_failed'
        try:
            state['notification'] = send_alert(state, settings(), now)
        except Exception as exc:
            state['notification'] = 'failed_' + type(exc).__name__
        save(path, state)
        print(json.dumps(state, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
