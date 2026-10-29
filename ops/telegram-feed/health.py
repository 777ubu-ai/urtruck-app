#!/usr/bin/env python3
"""Контроль прогресса QA2/Telegram: без текстов объявлений и телефонов в логах."""
import argparse
import json
import os
import sqlite3
import subprocess
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STALL_SECONDS = 120
HEARTBEAT_SECONDS = 180


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
        result = {'telegram': {'ready': queue.get('queued', 0),
                  'progress': queue.get('published', 0), 'paused_until': float(metadata.get('publish_after') or 0),
                  'uncertain': queue.get('sending', 0)+queue.get('uncertain', 0)},
                  'heartbeat_age': max(0, now-tick),
                  'last_received_age': max(0, now-latest) if latest else None}
    for name, directory in [('incoming', 'external-feed'), ('owned', 'external-feed-owned')]:
        path = Path('/home/ubuntu/urtruck-qa2')/directory/'adapter.sqlite3'
        if not path.is_file():
            result[name] = {'error': 'state_missing'}
            continue
        with readonly(path) as db:
            ready = db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL '
                               'AND quarantined_at IS NULL AND next_attempt_at<=?', (now,)).fetchone()[0]
            progress = db.execute('SELECT max(delivered_at) FROM selected_outbox').fetchone()[0]
            pending = db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL').fetchone()[0]
            quarantined = db.execute('SELECT count(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NOT NULL').fetchone()[0]
            result[name] = {'ready': ready, 'pending': pending, 'quarantined': quarantined,
                            'progress': progress, 'paused_until': 0}
    return result


def evaluate(current, previous, now):
    """Сигнал только при готовой очереди без прогресса, не при отсутствии заявок."""
    state = {'flows': {}, 'restarts': previous.get('restarts', []),
             'last_alert': previous.get('last_alert', 0), 'alerted': previous.get('alerted', [])}
    problems = []
    if current.get('heartbeat_age', 0) > HEARTBEAT_SECONDS:
        problems.append('collector_heartbeat_stale')
    for name in ('telegram', 'incoming', 'owned'):
        flow = current.get(name, {})
        old = previous.get('flows', {}).get(name, {})
        if flow.get('error'):
            problems.append(name + '_' + flow['error'])
            continue
        paused = flow.get('paused_until', 0) > now
        waiting = bool(flow.get('pending') or flow.get('ready') or flow.get('uncertain'))
        if flow.get('quarantined'):
            problems.append(name + '_validation_quarantined')
        changed = old.get('progress') != flow.get('progress')
        since = now if changed or paused or not waiting or not old.get('waiting') else old.get('since', now)
        state['flows'][name] = {'progress': flow.get('progress'), 'since': since, 'waiting': waiting and not paused}
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
