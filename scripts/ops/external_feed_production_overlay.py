"""Узкий production writer, вызывается только существующим защищённым executor."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path('/home/ubuntu/urtruck/backend')
RUNTIME = Path('/home/ubuntu/urtruck/runtime/external-feed')
SOURCE_DB = Path('/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3')
BACKUP_ROOT = Path('/home/ubuntu/urtruck-backups')
UNIT_ROOT = Path('/etc/systemd/system')
PM2_ENTRY = Path('/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2')
PM2_TARGET = Path('/home/ubuntu/.nvm/versions/node/v22.15.0/lib/node_modules/pm2/bin/pm2')
FILES = frozenset({
    'api/external_freight.py', 'database/external_freight_connection.py',
    'database/external_freight_dal.py', 'services/external_freight_classifier.py',
    'services/external_freight_import_adapter.py', 'services/external_freight_parser.py',
    'services/external_freight_queue_bridge.py', 'services/external_freight_route_places.py',
})
ENV_KEYS = frozenset({'EXTERNAL_FREIGHT_FEED_ENABLED', 'EXTERNAL_FREIGHT_DB_PATH',
                      'EXTERNAL_FREIGHT_IMPORTER_KEY'})


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_atomic(path, data, mode=0o600):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('symlink_target_forbidden')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.external-feed-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def unpack_verified(bundle, destination):
    """Не разрешает дополнительные файлы, traversal, ссылки и подмену manifest."""
    expected = FILES | {'main.patch', 'manifest.json'}
    with tarfile.open(bundle, 'r:gz') as archive:
        members = archive.getmembers()
        if len(members) != len(expected) or {x.name for x in members} != expected:
            raise ValueError('unexpected_overlay_members')
        for item in members:
            if not item.isfile() or item.size > 200_000:
                raise ValueError('invalid_overlay_member')
            write_atomic(destination / item.name, archive.extractfile(item).read())
    manifest = json.loads((destination / 'manifest.json').read_text())
    if set(manifest['files']) != FILES | {'main.py'}:
        raise ValueError('invalid_overlay_allowlist')
    for name in FILES:
        if digest(destination / name) != manifest['files'][name]:
            raise ValueError('overlay_checksum_mismatch')
    return manifest


def prepare(root, staged, manifest):
    """Baseline проверяется до любой записи в runtime."""
    if digest(root / 'main.py') != manifest['production_main_before_sha256']:
        raise ValueError('production_baseline_changed')
    for name in FILES | {'main.py'}:
        target = root / name
        if target.is_symlink() or not target.resolve().is_relative_to(root.resolve()):
            raise ValueError('overlay_target_outside_backend')
        if name != 'main.py' and target.exists() and digest(target) != manifest['files'][name]:
            raise ValueError('existing_feed_module_requires_reconciliation')
    shutil.copy2(root / 'main.py', staged / 'main.py')
    subprocess.run(['patch', '--batch', '--forward', str(staged / 'main.py'),
                    str(staged / 'main.patch')], check=True, capture_output=True)
    if digest(staged / 'main.py') != manifest['files']['main.py']:
        raise ValueError('patched_main_checksum_mismatch')
    for name in FILES | {'main.py'}:
        compile((staged / name).read_bytes(), name, 'exec')


def online_backup(source, backup):
    """SQLite backup работающей БД; восстановление проверяется в другом файле."""
    source = Path(source).resolve(strict=True)
    backup = Path(backup)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
        with sqlite3.connect(backup) as dst:
            src.backup(dst)
    backup.chmod(0o600)
    probe = backup.with_name('restore-probe.sqlite3')
    shutil.copy2(backup, probe)
    for file in (backup, probe):
        with sqlite3.connect(file.as_uri() + '?mode=ro', uri=True) as conn:
            if conn.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                raise ValueError('backup_restore_probe_failed')
    if digest(backup) != digest(probe):
        raise ValueError('restore_probe_checksum_mismatch')
    return {'source': str(source), 'backup': str(backup), 'sha256': digest(backup),
            'restore_probe': 'PASS'}


def updated_env(original, additions):
    lines = original.decode().splitlines()
    kept = [line for line in lines if line.partition('=')[0].strip() not in additions]
    return ('\n'.join(kept + [f'{key}={value}' for key, value in additions.items()]) + '\n').encode()


def verified_pm2_entry():
    """Существующий CLI проверяется отдельно от executable работающего daemon."""
    if (not PM2_ENTRY.is_file() or PM2_ENTRY.resolve(strict=True) != PM2_TARGET
            or not os.access(PM2_ENTRY, os.X_OK)):
        raise ValueError('pm2_identity_unavailable')
    return PM2_ENTRY


def runtime_identity(*, allow_feed_env=False):
    result = subprocess.run(['ss', '-ltnpH', 'sport = :8001'], check=True,
                            text=True, capture_output=True)
    pids = set(re.findall(r'pid=(\d+)', result.stdout))
    if len(pids) != 1:
        raise ValueError('production_listener_not_unique')
    pid = pids.pop()
    env = dict(x.split('=', 1) for x in Path(f'/proc/{pid}/environ').read_bytes().decode().split('\0') if '=' in x)
    if env.get('name') != 'urtruck-security-api' or Path(env.get('pm_cwd', '')).resolve() != ROOT:
        raise ValueError('unexpected_production_process')
    if not allow_feed_env and ENV_KEYS.intersection(env):
        raise ValueError('production_feed_environment_requires_reconciliation')
    python = Path(env.get('pm_exec_path', ''))
    if not python.is_file() or python.resolve() != Path(f'/proc/{pid}/exe').resolve(strict=True):
        raise ValueError('production_python_interpreter_unverified')
    probe = subprocess.run([str(python), '-I', '-c',
                            'import sys;raise SystemExit(0 if sys.version_info >= (3,10) else 1)'],
                           check=False, capture_output=True, timeout=10)
    if probe.returncode:
        raise ValueError('production_python_version_unsupported')
    daemon = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[1]
    node = Path(f'/proc/{daemon}/exe').resolve(strict=True)
    if (node != Path('/usr/bin/node') or env.get('PM2_HOME') != '/home/ubuntu/.pm2'
            or not env.get('pm_id', '').isdigit()):
        raise ValueError('pm2_identity_unavailable')
    pm2 = verified_pm2_entry()
    return {**env, '_pid': pid}, pm2


def protected_hashes(root):
    return {str(p.relative_to(root)): digest(p) for p in root.rglob('*.py')
            if not {'venv', '.venv', '__pycache__', 'backups', 'tests'}.intersection(p.relative_to(root).parts)
            and str(p.relative_to(root)) not in FILES | {'main.py'}}


def status(path):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8001' + path, timeout=8) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def wait_healthy(expected, *, require_new_pid=False):
    for _ in range(20):
        try:
            current, _ = runtime_identity(allow_feed_env=True)
            if (current['pm_id'] == expected['pm_id']
                    and current['pm_exec_path'] == expected['pm_exec_path']
                    and (not require_new_pid or current['_pid'] != expected['_pid'])
                    and status('/health') == 200):
                return
        except (ValueError, OSError, subprocess.SubprocessError):
            pass
        time.sleep(1)
    raise ValueError('production_runtime_not_healthy')


def empty_import_probe(key):
    request = urllib.request.Request('http://127.0.0.1:8001/api/v1/external-freight/import',
        data=b'{"records":[]}', method='POST', headers={
            'Content-Type': 'application/json', 'X-External-Importer-Key': key})
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status != 200 or json.loads(response.read()) != {'results': []}:
            raise ValueError('production_import_contract_failed')


def verify_feed_schema(path, primary):
    path = path.resolve(strict=True)
    if path == Path(primary).resolve(strict=True) or path.samefile(primary):
        raise ValueError('feed_database_not_separate')
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'external_freight_items', 'external_freight_bookmarks', 'external_freight_delivery'} <= tables:
        raise ValueError('feed_schema_not_initialized')


def bridge_service(python):
    return f'''[Unit]
Description=UrTruck isolated production mirror of confirmed publications
After=network-online.target
[Service]
Type=oneshot
User=ubuntu
WorkingDirectory={ROOT}
EnvironmentFile={RUNTIME}/bridge.env
ExecStart={python} -m services.external_freight_queue_bridge
TimeoutStartSec=45
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=/home/ubuntu/urtruck-telegram-feed
ReadWritePaths={RUNTIME}
'''


def bridge_timer():
    unit = 'urtruck-production-feed-bridge'
    return f'''[Unit]
Description=UrTruck isolated production feed mirror every minute
[Timer]
OnBootSec=30
OnUnitInactiveSec=60
AccuracySec=5
Unit={unit}.service
[Install]
WantedBy=timers.target
'''


def install_bridge(python, key, since):
    """Отдельный мост читает согласованный app_messages; очередь не меняется."""
    verify_app_messages_source()
    unit = 'urtruck-production-feed-bridge'
    unit_root = UNIT_ROOT
    if any((unit_root / (unit + suffix)).exists() for suffix in ('.service', '.timer')):
        raise ValueError('existing_production_bridge_requires_reconciliation')
    write_atomic(RUNTIME / 'bridge.env', (
        'EXTERNAL_FREIGHT_IMPORT_ENABLED=true\n'
        'EXTERNAL_FREIGHT_SOURCE_MODE=incoming\n'
        'EXTERNAL_FREIGHT_DEPLOYMENT_TARGET=production\n'
        'EXTERNAL_FREIGHT_API_URL=https://urtruck.kz\n'
        f'EXTERNAL_FREIGHT_SOURCE_DB={SOURCE_DB}\n'
        f'EXTERNAL_FREIGHT_ADAPTER_DB={RUNTIME}/adapter.sqlite3\n'
        f'EXTERNAL_FREIGHT_IMPORTER_KEY={key}\n').encode())
    service = bridge_service(python)
    timer = bridge_timer()
    for suffix, body in (('.service', service), ('.timer', timer)):
        source = RUNTIME / (unit + suffix)
        write_atomic(source, body.encode())
        subprocess.run(['sudo', '-n', 'install', '-m', '644', str(source),
                        str(unit_root / source.name)], check=True, capture_output=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'daemon-reload'], check=True, capture_output=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'start', unit + '.service'], check=True, capture_output=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'enable', '--now', unit + '.timer'], check=True, capture_output=True)
    return observe_bridge_cycles(since)


def observe_bridge_cycles(since):
    unit = 'urtruck-production-feed-bridge'
    cycles = []
    for _ in range(100):
        result = subprocess.run(['journalctl', '-u', unit + '.service', '--since', since,
                                 '-o', 'cat', '--no-pager'], check=True, text=True, capture_output=True)
        cycles = []
        for line in result.stdout.splitlines():
            try:
                item = json.loads(line)
            except (ValueError, TypeError):
                continue
            if 'status' in item:
                cycles.append(item)
        if len(cycles) >= 2:
            break
        time.sleep(1)
    if len(cycles) < 2 or any(x['status'] not in {'delivered', 'idle', 'busy'} for x in cycles):
        raise ValueError('production_bridge_two_cycles_failed')
    return cycles


def installed_overlay_matches(manifest):
    for name, expected in manifest['files'].items():
        path = ROOT / name
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError('overlay_target_outside_backend')
        if not path.is_file() or digest(path) != expected:
            return False
    return True


def verify_app_messages_source():
    if SOURCE_DB.resolve(strict=True) != SOURCE_DB:
        raise ValueError('redirected_source_queue')
    with sqlite3.connect(SOURCE_DB.as_uri() + '?mode=ro', uri=True) as connection:
        connection.execute('SELECT source_id,source_message,source_date,text,revision FROM app_messages LIMIT 1')


def verify_bridge_units(python):
    """Проверяет файлы и эффективные units до управляющих действий."""
    unit = 'urtruck-production-feed-bridge'
    for suffix, expected in [('.service', bridge_service(python)),
                             ('.timer', bridge_timer())]:
        path = UNIT_ROOT / (unit + suffix)
        if path.is_symlink() or path.read_text() != expected:
            raise ValueError('existing_bridge_unit_requires_reconciliation')
        result = subprocess.run(['systemctl', 'show', unit + suffix,
                                 '-p', 'FragmentPath', '-p', 'DropInPaths', '-p', 'NeedDaemonReload'],
                                check=True, text=True, capture_output=True)
        effective = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
        if (effective.get('FragmentPath') != str(path) or effective.get('DropInPaths') != ''
                or effective.get('NeedDaemonReload') != 'no'):
            raise ValueError('effective_bridge_unit_requires_reconciliation')


def reconcile_bridge_source(env, manifest, source_sha):
    """Меняет только источник отдельного моста; backend и Telegram не перезапускаются."""
    unit = 'urtruck-production-feed-bridge'
    verify_bridge_units(env['pm_exec_path'])
    verify_app_messages_source()
    path = RUNTIME / 'bridge.env'
    if path.is_symlink():
        raise ValueError('redirected_bridge_environment')
    original = path.read_bytes()
    values = dict(line.split('=', 1) for line in original.decode().splitlines() if '=' in line)
    expected = {'EXTERNAL_FREIGHT_IMPORT_ENABLED': 'true',
                'EXTERNAL_FREIGHT_DEPLOYMENT_TARGET': 'production',
                'EXTERNAL_FREIGHT_API_URL': 'https://urtruck.kz',
                'EXTERNAL_FREIGHT_SOURCE_DB': str(SOURCE_DB),
                'EXTERNAL_FREIGHT_ADAPTER_DB': str(RUNTIME / 'adapter.sqlite3')}
    if (any(values.get(key) != value for key, value in expected.items())
            or not values.get('EXTERNAL_FREIGHT_IMPORTER_KEY')
            or values.get('EXTERNAL_FREIGHT_SOURCE_MODE', 'published') not in {'published', 'incoming'}
            or set(values) - set(expected) - {'EXTERNAL_FREIGHT_IMPORTER_KEY', 'EXTERNAL_FREIGHT_SOURCE_MODE'}):
        raise ValueError('unexpected_bridge_environment')
    backend_env = (ROOT / '.env').read_bytes()
    backend_values = dict(line.split('=', 1) for line in backend_env.decode().splitlines() if '=' in line)
    if (backend_values.get('EXTERNAL_FREIGHT_FEED_ENABLED') != 'true'
            or backend_values.get('EXTERNAL_FREIGHT_DB_PATH') != str(RUNTIME / 'feed.sqlite3')
            or backend_values.get('EXTERNAL_FREIGHT_IMPORTER_KEY') != values['EXTERNAL_FREIGHT_IMPORTER_KEY']):
        raise ValueError('backend_bridge_configuration_mismatch')
    def control(*args):
        return subprocess.run(['sudo', '-n', 'systemctl', *args], check=True, capture_output=True)
    def state(suffix):
        return subprocess.run(['systemctl', 'is-active', unit + suffix],
                              text=True, capture_output=True).stdout.strip()
    if state('.timer') != 'active':
        raise ValueError('bridge_timer_not_active')
    protected = protected_hashes(ROOT)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUP_ROOT / ('external-feed-source-' + stamp)
    backup.mkdir(mode=0o700)
    write_atomic(backup / 'bridge.env', original)
    try:
        control('stop', unit + '.timer')
        for _ in range(50):
            if state('.service') == 'inactive':
                break
            time.sleep(1)
        else:
            raise ValueError('bridge_drain_timeout')
        proofs = {}
        for label, source in [('primary', Path(env['DB_PATH'])),
                              ('feed', RUNTIME / 'feed.sqlite3'),
                              ('adapter', RUNTIME / 'adapter.sqlite3')]:
            folder = backup / label
            folder.mkdir(mode=0o700)
            proofs[label] = online_backup(source, folder / 'snapshot.sqlite3')
        write_atomic(path, updated_env(original, {'EXTERNAL_FREIGHT_SOURCE_MODE': 'incoming'}))
        since = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f UTC')
        control('start', unit + '.service')
        control('start', unit + '.timer')
        cycles = observe_bridge_cycles(since)
        if any(item.get('mode') != 'incoming' for item in cycles):
            raise ValueError('bridge_source_mode_not_confirmed')
        if (not installed_overlay_matches(manifest) or protected_hashes(ROOT) != protected
                or (ROOT / '.env').read_bytes() != backend_env or status('/health') != 200):
            raise ValueError('source_switch_protected_state_changed')
        report = {'source_sha': source_sha, 'operation': 'bridge_source_incoming',
                  'backups': proofs, 'bridge_cycles': cycles, 'protected_unchanged': True,
                  'backend_restarted': False, 'telegram_queue_changed': False,
                  'store_activation': False}
        write_atomic(backup / 'result.json', json.dumps(report, ensure_ascii=False, indent=2).encode())
        print(json.dumps(report, ensure_ascii=False))
    except BaseException:
        try:
            control('stop', unit + '.timer')
            for _ in range(50):
                if state('.service') in {'inactive', 'failed'}:
                    break
                time.sleep(1)
            else:
                raise ValueError('source_switch_rollback_drain_timeout')
            write_atomic(path, original)
            control('start', unit + '.timer')
            if (path.read_bytes() != original or state('.timer') != 'active'
                    or protected_hashes(ROOT) != protected or (ROOT / '.env').read_bytes() != backend_env
                    or status('/health') != 200):
                raise ValueError('source_switch_rollback_unhealthy')
            print(json.dumps({'status': 'SOURCE_ENV_ROLLED_BACK', 'backup': str(backup)}))
        except BaseException:
            print(json.dumps({'status': 'ROLLBACK_FAILED', 'backup': str(backup)}))
            raise RuntimeError('production_source_rollback_failed') from None
        raise


def apply(bundle, bundle_sha, source_sha):
    if not re.fullmatch('[0-9a-f]{40}', source_sha) or digest(bundle) != bundle_sha:
        raise ValueError('release_identity_mismatch')
    if ROOT.resolve() != ROOT or RUNTIME.resolve() != RUNTIME:
        raise ValueError('redirected_production_path')
    # Повтор разрешён только для уже установленного идентичного девятифайлового пакета.
    with tempfile.TemporaryDirectory(prefix='external-feed-verify-') as name:
        manifest = unpack_verified(bundle, Path(name))
        if installed_overlay_matches(manifest):
            env, _ = runtime_identity(allow_feed_env=True)
            reconcile_bridge_source(env, manifest, source_sha)
            return
    env, pm2 = runtime_identity()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = BACKUP_ROOT / ('external-feed-' + stamp)
    backup.mkdir(mode=0o700)
    with tempfile.TemporaryDirectory(prefix='external-feed-overlay-') as name:
        staged = Path(name)
        manifest = unpack_verified(bundle, staged)
        prepare(ROOT, staged, manifest)
        protected = protected_hashes(ROOT)
        original_env = (ROOT / '.env').read_bytes()
        unit = 'urtruck-production-feed-bridge'
        if any(Path('/etc/systemd/system', unit + suffix).exists() for suffix in ('.service', '.timer')):
            raise ValueError('existing_production_bridge_requires_reconciliation')
        original_files = {p: (ROOT / p).read_bytes() if (ROOT / p).exists() else None
                          for p in FILES | {'main.py'}}
        for key, data in original_files.items():
            if data is not None:
                write_atomic(backup / 'code' / key, data)
        write_atomic(backup / 'backend.env', original_env)
        proof = online_backup(env['DB_PATH'], backup / 'primary.sqlite3')
        # Эти ключи отсутствовали в окружении процесса; .env подхватывается main.py.
        RUNTIME.mkdir(parents=True, exist_ok=True, mode=0o700)
        RUNTIME.chmod(0o700)
        key = secrets.token_urlsafe(48)
        additions = {'EXTERNAL_FREIGHT_FEED_ENABLED': 'true',
                     'EXTERNAL_FREIGHT_DB_PATH': str(RUNTIME / 'feed.sqlite3'),
                     'EXTERNAL_FREIGHT_IMPORTER_KEY': key}
        command_env = dict(os.environ)
        command_env['PATH'] = str(pm2.parent) + ':' + command_env.get('PATH', '')
        command_env['PM2_HOME'] = env['PM2_HOME']

        def restart():
            subprocess.run([str(pm2), 'restart', env['pm_id']], env=command_env,
                           check=True, capture_output=True)

        try:
            for item in FILES | {'main.py'}:
                write_atomic(ROOT / item, (staged / item).read_bytes(), 0o644)
            write_atomic(ROOT / '.env', updated_env(original_env, additions))
            if protected_hashes(ROOT) != protected:
                raise ValueError('protected_code_changed')
            restart()
            wait_healthy(env, require_new_pid=True)
            empty_import_probe(key)
            verify_feed_schema(RUNTIME / 'feed.sqlite3', env['DB_PATH'])
            if status('/api/v1/external-freight/count') != 401:
                raise ValueError('production_feed_auth_guard_changed')
            if status('/api/v1/driver/expenses') != 401:
                raise ValueError('existing_expenses_auth_changed')
            if protected_hashes(ROOT) != protected:
                raise ValueError('protected_code_changed')
            for item, expected in manifest['files'].items():
                if digest(ROOT / item) != expected:
                    raise ValueError('installed_overlay_checksum_mismatch')
            cycles = install_bridge(env['pm_exec_path'], key,
                                    datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'))
            report = {'source_sha': source_sha, 'overlay_files': manifest['files'],
                      'backup': proof, 'external_api': 401, 'empty_import': 200, 'feed_schema': 'PASS', 'existing_expenses': 401,
                      'protected_python_files': len(protected), 'protected_unchanged': True,
                      'bridge_cycles': cycles, 'store_activation': False}
            write_atomic(backup / 'result.json', json.dumps(report, ensure_ascii=False, indent=2).encode())
            print(json.dumps(report, ensure_ascii=False))
        except BaseException:
            try:
                subprocess.run(['sudo', '-n', 'systemctl', 'disable', '--now', unit + '.timer'],
                               capture_output=True)
                subprocess.run(['sudo', '-n', 'systemctl', 'stop', unit + '.service'], capture_output=True)
                # Новые модули остаются инертными; данные ленты никогда не удаляются.
                for item, data in original_files.items():
                    if data is not None:
                        write_atomic(ROOT / item, data, 0o644)
                write_atomic(ROOT / '.env', original_env)
                restart()
                wait_healthy(env)
                if protected_hashes(ROOT) != protected or (ROOT / '.env').read_bytes() != original_env:
                    raise ValueError('rollback_protected_state_mismatch')
                if any((ROOT / item).read_bytes() != data for item, data in original_files.items() if data is not None):
                    raise ValueError('rollback_code_mismatch')
                print(json.dumps({'status': 'ROLLED_BACK_CODE_AND_ENV', 'health': 'PASS', 'backup': str(backup)}))
            except BaseException:
                print(json.dumps({'status': 'ROLLBACK_FAILED', 'backup': str(backup)}))
                raise RuntimeError('production_rollback_failed') from None
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    with Path('/home/ubuntu/urtruck/runtime/.external-feed-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        apply(args.bundle, args.bundle_sha256, args.source_sha)


if __name__ == '__main__':
    main()
