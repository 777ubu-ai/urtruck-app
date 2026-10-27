#!/usr/bin/env python3
"""Изолированное включение своего Telegram; по умолчанию только проверка."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

QA = Path('/home/ubuntu/urtruck-qa2')
COLLECTOR = Path('/home/ubuntu/urtruck-telegram-feed')
UNIT = 'urtruck-qa2-owned-feed-bridge'


def updated_env(text, values):
    lines = text.splitlines()
    for key, value in values.items():
        indexes = [i for i, line in enumerate(lines) if line.split('=', 1)[0].strip() == key]
        if len(indexes) > 1:
            raise ValueError('duplicate_environment_key')
        if indexes:
            lines[indexes[0]] = key+'='+value
        else:
            lines.append(key+'='+value)
    return '\n'.join(lines)+'\n'


def env(text):
    return {key.strip(): value.strip().strip('"').strip("'") for line in text.splitlines()
            if '=' in line and not line.lstrip().startswith('#') for key, value in [line.split('=', 1)]}


def atomic_file(path, data, mode):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            os.chmod(temporary, mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def command(*args, required=True):
    # Не выводим env или содержимое journal с токенами/текстами объявлений.
    subprocess.run(args, check=required, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def sqlite_backup(source, destination):
    with sqlite3.connect(source.resolve().as_uri()+'?mode=ro', uri=True) as before:
        with sqlite3.connect(destination) as backup:
            before.backup(backup)
            if backup.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise RuntimeError('backup_integrity_failed')
    os.chmod(destination, 0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--collector-sha256', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    bundle = Path(__file__).resolve().parents[2]
    code = bundle/'ops/telegram-feed/feed.py'
    templates = bundle/'docs/qa/external-freight-feed-20261020'
    if not re.fullmatch('[a-f0-9]{40}', args.source_sha) or not re.fullmatch('[a-f0-9]{64}', args.collector_sha256):
        raise ValueError('invalid_source_identity')
    if (QA/'backend/.qa-source-sha').read_text().strip() != args.source_sha:
        raise ValueError('qa2_exact_source_required')
    if hashlib.sha256(code.read_bytes()).hexdigest() != args.collector_sha256:
        raise ValueError('collector_hash_mismatch')
    compile(code.read_text(), str(code), 'exec')
    bridge_text = (QA/'external-feed-bridge.env').read_text()
    target = urlparse(env(bridge_text).get('EXTERNAL_FREIGHT_API_URL', ''))
    if target.scheme != 'https' or target.hostname != 'qa2.urtruck.kz' or target.path not in {'', '/'} or target.port or target.username or target.password or target.query or target.fragment:
        raise ValueError('qa2_target_required')
    if env(bridge_text).get('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET', 'qa2') != 'qa2':
        raise ValueError('qa2_deployment_target_required')
    if Path(env(bridge_text).get('EXTERNAL_FREIGHT_SOURCE_DB', '')).resolve() != COLLECTOR/'state/feed.sqlite3':
        raise ValueError('unexpected_source_database')
    own_env = updated_env(bridge_text, {'EXTERNAL_FREIGHT_SOURCE_MODE': 'owned',
        'EXTERNAL_FREIGHT_ADAPTER_DB': str(QA/'external-feed-owned/adapter.sqlite3'),
        'EXTERNAL_FREIGHT_DEPLOYMENT_TARGET': 'qa2'})
    collector_env = updated_env((COLLECTOR/'.env').read_text(),
        {'OWNED_FEED_ENABLED': 'true', 'OWNED_TELEGRAM_CTA_ENABLED': 'false'})
    for suffix in ('service', 'timer'):
        if not (templates/f'{UNIT}.{suffix}').is_file():
            raise ValueError('unit_template_required')
    if not args.apply:
        print(json.dumps({'status': 'dry_run', 'source_sha': args.source_sha,
                          'collector_hash_verified': True, 'target': 'qa2', 'mode': 'owned'}))
        return
    with (QA/'.owned-feed-install.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        command('sudo', '-n', 'true')
        backup = QA/'backups'/('owned-intake-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
        backup.mkdir(mode=0o700, parents=True)
        paths = [COLLECTOR/'feed.py', COLLECTOR/'.env', QA/'external-feed-owned.env',
                 *(Path('/etc/systemd/system')/f'{UNIT}.{suffix}' for suffix in ('service', 'timer'))]
        existed = {}
        for index, path in enumerate(paths):
            existed[path] = path.exists()
            if path.exists():
                shutil.copy2(path, backup/str(index)); os.chmod(backup/str(index), 0o600)
        sqlite_backup(COLLECTOR/'state/feed.sqlite3', backup/'collector.sqlite3')
        (QA/'external-feed-owned').mkdir(mode=0o700, exist_ok=True)
        prior_enabled = subprocess.run(['systemctl', 'is-enabled', UNIT+'.timer'], capture_output=True).returncode == 0
        try:
            atomic_file(COLLECTOR/'feed.py', code.read_bytes(), 0o644)
            atomic_file(COLLECTOR/'.env', collector_env.encode(), 0o600)
            atomic_file(QA/'external-feed-owned.env', own_env.encode(), 0o600)
            for suffix in ('service', 'timer'):
                command('sudo', '-n', 'install', '-m', '644', str(templates/f'{UNIT}.{suffix}'), '/etc/systemd/system/')
            command('sudo', '-n', 'systemctl', 'daemon-reload')
            command('sudo', '-n', 'systemctl', 'restart', 'urtruck-telegram-feed.service')
            time.sleep(3)
            command('systemctl', 'is-active', '--quiet', 'urtruck-telegram-feed.service')
            command('sudo', '-n', 'systemctl', 'enable', '--now', UNIT+'.timer')
        except Exception:
            command('sudo', '-n', 'systemctl', 'stop', UNIT+'.timer', UNIT+'.service', required=False)
            if not prior_enabled:
                command('sudo', '-n', 'systemctl', 'disable', UNIT+'.timer', required=False)
            for index, path in enumerate(paths):
                if str(path).startswith('/etc/'):
                    if existed[path]: command('sudo', '-n', 'install', '-m', '644', str(backup/str(index)), str(path))
                    else: command('sudo', '-n', 'rm', '-f', str(path))
                elif existed[path]: atomic_file(path, (backup/str(index)).read_bytes(), 0o644 if path.name == 'feed.py' else 0o600)
                else: path.unlink(missing_ok=True)
            command('sudo', '-n', 'systemctl', 'daemon-reload')
            command('sudo', '-n', 'systemctl', 'restart', 'urtruck-telegram-feed.service')
            if prior_enabled: command('sudo', '-n', 'systemctl', 'start', UNIT+'.timer')
            raise
        print(json.dumps({'status': 'installed', 'source_sha': args.source_sha, 'backup': str(backup),
                          'own_timer_enabled': True, 'cta_enabled': False}))


if __name__ == '__main__':
    main()
