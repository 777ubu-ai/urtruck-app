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
from contextlib import ExitStack

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
RELEASE_SOURCE = '88e349531a3cc8777b95e09b65fb6ebfb8dc29cc'
RELEASE_FILES = frozenset({
    'api/external_freight.py', 'api/marketplace.py', 'database/db.py',
    'database/external_freight_connection.py', 'database/external_freight_dal.py',
    'services/bid_expiry.py', 'services/external_freight_classifier.py',
    'services/external_freight_import_adapter.py', 'services/external_freight_parser.py',
    'services/external_freight_queue_bridge.py', 'services/owned_telegram_feed.py',
})


# Единственный разрешённый переход: уже принятый каталог PR589/596.
CARRIER_MODULE = 'services/carrier_directory.py'
CARRIER_SOURCE = Path('/home/ubuntu/urtruck-qa2/runtime/carrier-directory.sqlite3')
CARRIER_EXPECTED_COUNT = 1297
CARRIER_OLD_API = '748fd3d766fab2aefce8ff2c9481c0536ceccec2dbb0c91e0cf471905f92f648'
CARRIER_NEW_API = '1e8c785e058b8dc2f0ed406b20b83ba0df0acca01996e175f3a17f35114ef077'
CARRIER_MODULE_SHA = 'c5b0a9b2c1c27e5cd3fb424aaf6103b90f200fb8a09bde79912c09e2cc403f60'
CARRIER_MAIN_SHA = 'fd7071cdb71e49158ef79a9da4462ff0eb2bae4d40615fdfde42fca7ce8352b9'


def carrier_manifest(manifest):
    if manifest.get('carrier_activation') != 'reviewed-directory-v1':
        return False
    files = manifest['files']
    if (set(files) != FILES | {'main.py', CARRIER_MODULE}
            or files['api/external_freight.py'] != CARRIER_NEW_API
            or files[CARRIER_MODULE] != CARRIER_MODULE_SHA
            or files['main.py'] != CARRIER_MAIN_SHA):
        raise ValueError('invalid_carrier_transition_manifest')
    return True


def release_manifest(manifest):
    if manifest.get('compatibility_activation') != 'reviewed-public-store-v1':
        return False
    before, after = manifest.get('production_before'), manifest.get('files')
    if (manifest.get('app_source') != RELEASE_SOURCE
            or not isinstance(before, dict) or set(before) != RELEASE_FILES
            or not isinstance(after, dict) or set(after) != RELEASE_FILES
            or manifest.get('catalog_import') is not False
            or manifest.get('primary_database_replacement') is not False):
        raise ValueError('invalid_release_compatibility_manifest')
    for name in RELEASE_FILES:
        if not isinstance(after[name], str) or not re.fullmatch('[0-9a-f]{64}', after[name]):
            raise ValueError('invalid_release_payload_hash')
        if before[name] is None and name == 'services/owned_telegram_feed.py':
            continue
        if not isinstance(before[name], str) or not re.fullmatch('[0-9a-f]{64}', before[name]):
            raise ValueError('invalid_release_baseline_hash')
    return True


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
    with tarfile.open(bundle, 'r:gz') as archive:
        members = archive.getmembers()
        names = {x.name for x in members}
        expected = FILES | {'main.patch', 'manifest.json'}
        allowed_shapes = (expected, expected | {CARRIER_MODULE}, RELEASE_FILES | {'manifest.json'})
        if len(members) != len(names) or names not in allowed_shapes:
            raise ValueError('unexpected_overlay_members')
        for item in members:
            if not item.isfile() or item.size > 200_000:
                raise ValueError('invalid_overlay_member')
        manifest = json.load(archive.extractfile('manifest.json'))
        if release_manifest(manifest):
            allowed = RELEASE_FILES
            if names != allowed | {'manifest.json'}:
                raise ValueError('invalid_overlay_allowlist')
        else:
            carrier = carrier_manifest(manifest)
            allowed = FILES | ({CARRIER_MODULE} if carrier else set())
            if set(manifest['files']) != allowed | {'main.py'} or names != allowed | {'main.patch', 'manifest.json'}:
                raise ValueError('invalid_overlay_allowlist')
        for item in members:
            write_atomic(destination / item.name, archive.extractfile(item).read())
    for name in allowed:
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


def validate_carrier_catalog(path):
    path = Path(path)
    if path.resolve(strict=True) != path or not path.is_file():
        raise ValueError('redirected_carrier_catalog')
    allowed = {'id', 'record_type', 'name', 'phones', 'emails', 'city', 'country',
               'transport_type', 'notes', 'availability', 'contact_verification', 'sources'}
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as connection:
        if connection.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError('carrier_catalog_integrity_failed')
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if tables != {'carrier_directory', 'sqlite_sequence'}:
            raise ValueError('unexpected_carrier_catalog_schema')
        rows = connection.execute('SELECT id,payload,status FROM carrier_directory').fetchall()
        if len(rows) != CARRIER_EXPECTED_COUNT:
            raise ValueError('unexpected_carrier_catalog_count')
        for key, payload, status_value in rows:
            value = json.loads(payload)
            if (set(value) != allowed or value['id'] != key
                    or not re.fullmatch(r'carrier_[a-f0-9]{20}', key)
                    or value['availability'] != 'unknown'
                    or value['contact_verification'] != 'not_checked'
                    or value['record_type'] not in {'carrier', 'driver_contact'}
                    or status_value not in {'active', 'hidden'}
                    or not isinstance(value['phones'], list) or not value['phones']
                    or any(not isinstance(p, str) or not re.fullmatch(r'\+[1-9][0-9]{9,14}', p) for p in value['phones'])):
                raise ValueError('unreviewed_carrier_catalog_payload')
    return sum(row[2] == 'active' for row in rows)


def prepare_carrier_transition(manifest):
    if not carrier_manifest(manifest):
        raise ValueError('carrier_transition_required')
    for name, expected in manifest['files'].items():
        target = ROOT / name
        if target.is_symlink() or not target.resolve().is_relative_to(ROOT):
            raise ValueError('overlay_target_outside_backend')
        if name == CARRIER_MODULE:
            if target.exists() and digest(target) != expected:
                raise ValueError('existing_carrier_module_changed')
        elif name == 'api/external_freight.py':
            if digest(target) not in {CARRIER_OLD_API, CARRIER_NEW_API}:
                raise ValueError('carrier_router_baseline_changed')
        elif digest(target) != expected:
            raise ValueError('carrier_protected_baseline_changed')


def apply_carriers(staged, manifest, source_sha):
    """Не переустанавливает ленту: только reviewed router/module и отдельный каталог."""
    prepare_carrier_transition(manifest)
    env, pm2 = runtime_identity(allow_feed_env=True)
    verify_bridge_units(env['pm_exec_path'])
    destination = RUNTIME / 'carrier-directory.sqlite3'
    expected_env = str(destination)
    original_env = (ROOT / '.env').read_bytes()
    configured = dict(line.split('=', 1) for line in original_env.decode().splitlines()
                      if '=' in line and not line.lstrip().startswith('#'))
    if (configured.get('EXTERNAL_CARRIER_DIRECTORY_DB', expected_env) != expected_env
            or env.get('EXTERNAL_CARRIER_DIRECTORY_DB', expected_env) != expected_env):
        raise ValueError('existing_carrier_configuration_changed')
    for key in ('EXTERNAL_FREIGHT_DB_PATH', 'EXTERNAL_FREIGHT_FEED_ENABLED'):
        expected = str(RUNTIME / 'feed.sqlite3') if key.endswith('DB_PATH') else 'true'
        if configured.get(key) != expected:
            raise ValueError('existing_feed_configuration_changed')
    if destination.is_symlink() or destination.resolve() != destination:
        raise ValueError('redirected_carrier_destination')
    protected_databases = [Path(env['DB_PATH']), RUNTIME / 'feed.sqlite3', RUNTIME / 'adapter.sqlite3']
    for candidate in [destination, CARRIER_SOURCE]:
        for other in protected_databases:
            if (candidate.resolve() == other.resolve()
                    or candidate.exists() and other.exists() and candidate.samefile(other)):
                raise ValueError('carrier_catalog_aliases_protected_database')
    if (destination.resolve() == CARRIER_SOURCE.resolve()
            or destination.exists() and CARRIER_SOURCE.exists() and destination.samefile(CARRIER_SOURCE)):
        raise ValueError('carrier_catalog_source_destination_alias')
    complete = installed_overlay_matches(manifest) and configured.get('EXTERNAL_CARRIER_DIRECTORY_DB') == expected_env
    if complete:
        active = validate_carrier_catalog(destination)
        if status('/health') != 200 or status('/api/v1/external-freight/directory') != 401:
            raise ValueError('carrier_existing_runtime_unhealthy')
        print(json.dumps({'status': 'ALREADY_ACTIVE', 'active_contacts': active, 'source_sha': source_sha}))
        return
    # Существующий production каталог никогда не заменяется QA-снимком.
    if destination.exists():
        validate_carrier_catalog(destination)
    else:
        if validate_carrier_catalog(CARRIER_SOURCE) != CARRIER_EXPECTED_COUNT:
            raise ValueError('source_carrier_catalog_not_fully_active')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUP_ROOT / ('carrier-directory-' + stamp)
    backup.mkdir(mode=0o700)
    protected = {k: v for k, v in protected_hashes(ROOT).items() if k != CARRIER_MODULE}
    originals = {name: (ROOT / name).read_bytes() if (ROOT / name).exists() else None
                 for name in ('api/external_freight.py', CARRIER_MODULE)}
    for name, data in originals.items():
        if data is not None:
            write_atomic(backup / 'code' / name, data)
    write_atomic(backup / 'backend.env', original_env)
    (backup / 'primary').mkdir(mode=0o700)
    proof = online_backup(env['DB_PATH'], backup / 'primary' / 'snapshot.sqlite3')
    if not destination.exists():
        (backup / 'carrier').mkdir(mode=0o700)
        snapshot = backup / 'carrier' / 'snapshot.sqlite3'
        online_backup(CARRIER_SOURCE, snapshot)
        validate_carrier_catalog(snapshot)
        write_atomic(destination, snapshot.read_bytes())
    command_env = dict(os.environ)
    command_env['PATH'] = str(pm2.parent) + ':' + command_env.get('PATH', '')
    command_env['PM2_HOME'] = env['PM2_HOME']

    def restart():
        subprocess.run([str(pm2), 'restart', env['pm_id']], env=command_env,
                       check=True, capture_output=True)

    def check_protected():
        current = {k: v for k, v in protected_hashes(ROOT).items() if k != CARRIER_MODULE}
        if current != protected:
            raise ValueError('carrier_protected_code_changed')

    try:
        for name in originals:
            compile((staged / name).read_bytes(), name, 'exec')
            write_atomic(ROOT / name, (staged / name).read_bytes(), 0o644)
        write_atomic(ROOT / '.env', updated_env(original_env, {'EXTERNAL_CARRIER_DIRECTORY_DB': expected_env}))
        check_protected()
        restart()
        wait_healthy(env, require_new_pid=True)
        if not installed_overlay_matches(manifest):
            raise ValueError('carrier_installed_code_mismatch')
        for endpoint in ['/api/v1/external-freight/directory', '/api/v1/external-freight/count', '/api/v1/driver/expenses']:
            if status(endpoint) != 401:
                raise ValueError('carrier_auth_guard_changed')
        check_protected()
        report = {'status': 'CARRIER_DIRECTORY_ACTIVE', 'source_sha': source_sha,
                  'active_contacts': validate_carrier_catalog(destination), 'backup': proof,
                  'protected_unchanged': True, 'primary_db_mutation': False, 'stores_changed': False}
        write_atomic(backup / 'result.json', json.dumps(report, ensure_ascii=False, indent=2).encode())
        print(json.dumps(report))
    except BaseException:
        try:
            # Новый service остаётся инертным; каталог/primary/feed/QA не откатываются.
            for name, data in originals.items():
                if data is not None:
                    write_atomic(ROOT / name, data, 0o644)
            write_atomic(ROOT / '.env', original_env)
            restart()
            wait_healthy(env)
            check_protected()
            if ((ROOT / '.env').read_bytes() != original_env
                    or any((ROOT / name).read_bytes() != data for name, data in originals.items() if data is not None)):
                raise ValueError('carrier_rollback_configuration_mismatch')
            print(json.dumps({'status': 'CARRIER_CODE_ENV_ROLLED_BACK', 'backup': str(backup)}))
        except BaseException:
            print(json.dumps({'status': 'ROLLBACK_FAILED', 'backup': str(backup)}))
            raise RuntimeError('carrier_production_rollback_failed') from None
        raise


def release_destination(root, name):
    if name not in RELEASE_FILES or root.is_symlink() or root.resolve() != root:
        raise ValueError('unsafe_release_destination')
    current = root
    for part in Path(name).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('release_destination_symlink')
    if current.exists() and not current.is_file():
        raise ValueError('release_destination_not_file')
    return current


def release_baseline(root, manifest):
    """Проверяет весь заменяемый набор до backup, остановки и первой записи."""
    originals = {}
    for name, expected in manifest['production_before'].items():
        path = release_destination(root, name)
        actual = digest(path) if path.exists() else None
        if actual != expected:
            raise ValueError('release_baseline_changed: ' + name)
        originals[name] = path.read_bytes() if path.exists() else None
    return originals


def release_protected_hashes(root):
    excluded = {'venv', '.venv', '__pycache__', 'backups', 'tests', 'storage', 'models'}
    result = {}
    def scan_failed(error):
        raise error
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=scan_failed):
        parent = Path(directory)
        dirs[:] = [name for name in dirs if name not in excluded]
        if any((parent / name).is_symlink() for name in dirs):
            raise ValueError('protected_directory_symlink')
        for name in files:
            path = parent / name
            relative = path.relative_to(root).as_posix()
            if path.suffix in {'.py', '.sql'} and relative not in RELEASE_FILES:
                if path.is_symlink():
                    raise ValueError('protected_file_symlink')
                result[relative] = digest(path)
    if (root / '.env').is_symlink():
        raise ValueError('protected_environment_symlink')
    result['.env'] = digest(root / '.env')
    return result


def release_scheduler(env, pm2, command_env):
    values = json.loads(subprocess.check_output([str(pm2), 'jlist'], env=command_env, text=True))
    matches = [p for p in values if p.get('name') == 'urtruck-security-scheduler']
    if len(matches) != 1:
        raise ValueError('release_scheduler_not_unique')
    scheduler = matches[0]
    config = scheduler.get('pm2_env', {})
    pid = scheduler.get('pid')
    if (config.get('status') != 'online' or not isinstance(pid, int) or pid <= 0
            or Path(config.get('pm_cwd', '')).resolve() != ROOT
            or Path(f'/proc/{pid}/cwd').resolve(strict=True) != ROOT
            or Path(f'/proc/{pid}/exe').resolve(strict=True) != Path(env['pm_exec_path']).resolve(strict=True)):
        raise ValueError('release_scheduler_identity_mismatch')
    return str(scheduler['pm_id'])


def apply_release_compatibility(staged, manifest, source_sha):
    """Установить только проверенные модули, не меняя секреты и каталог."""
    if not release_manifest(manifest) or not re.fullmatch('[0-9a-f]{40}', source_sha):
        raise ValueError('release_identity_mismatch')
    env, pm2 = runtime_identity(allow_feed_env=True)
    command_env = dict(os.environ)
    command_env['PATH'] = str(pm2.parent) + ':' + command_env.get('PATH', '')
    command_env['PM2_HOME'] = env['PM2_HOME']
    scheduler_id = release_scheduler(env, pm2, command_env)
    catalog = RUNTIME / 'carrier-directory.sqlite3'
    if catalog.is_symlink() or catalog.resolve() != catalog:
        raise ValueError('release_catalog_path_mismatch')
    catalog_hash, catalog_count = digest(catalog), validate_carrier_catalog(catalog)
    protected = release_protected_hashes(ROOT)
    if installed_overlay_matches(manifest):
        if status('/health') != 200:
            raise ValueError('release_existing_runtime_unhealthy')
        print(json.dumps({'status': 'RELEASE_ALREADY_ACTIVE', 'app_source': RELEASE_SOURCE,
                          'release_config_sha': source_sha, 'active_contacts': catalog_count}))
        return
    originals = release_baseline(ROOT, manifest)
    for name in RELEASE_FILES:
        if digest(staged / name) != manifest['files'][name]:
            raise ValueError('release_staged_hash_mismatch')
        compile((staged / name).read_bytes(), name, 'exec')
    feed = RUNTIME / 'feed.sqlite3'
    primary = Path(env['DB_PATH'])
    if (feed.is_symlink() or feed.resolve() != feed or not primary.is_file()
            or primary.is_symlink() or primary.resolve() != primary
            or feed.samefile(primary) or feed.samefile(catalog)):
        raise ValueError('release_database_identity_mismatch')
    if BACKUP_ROOT.is_symlink() or BACKUP_ROOT.resolve() != BACKUP_ROOT or not BACKUP_ROOT.is_dir():
        raise ValueError('release_backup_root_unsafe')
    if shutil.disk_usage(BACKUP_ROOT).free < 2 * (primary.stat().st_size + feed.stat().st_size) + 128 * 1024 * 1024:
        raise ValueError('release_backup_insufficient_space')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUP_ROOT / ('public-store-compatibility-' + stamp)
    # Те же lock-файлы использует существующий production bridge. Очередь и
    # collector продолжают сохранять сообщения; новый collector не создаётся.
    with ExitStack() as locks:
        for suffix in ('.bridge.lock', '.flush.lock'):
            path = RUNTIME / ('adapter.sqlite3' + suffix)
            if path.is_symlink() or not path.is_file():
                raise ValueError('release_bridge_lock_unavailable')
            lock = locks.enter_context(path.open('r+'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        backup.mkdir(mode=0o700)
        for name, data in originals.items():
            if data is not None:
                write_atomic(backup / 'code' / name, data)
        for folder in ('primary', 'feed'):
            (backup / folder).mkdir(mode=0o700)
        proof = {'primary': online_backup(primary, backup / 'primary/snapshot.sqlite3'),
                 'feed': online_backup(feed, backup / 'feed/snapshot.sqlite3')}
        write_atomic(backup / 'manifest.json', json.dumps(manifest, indent=2).encode())
        write_atomic(backup / 'backend.env', (ROOT / '.env').read_bytes())

        def process(action, identity):
            subprocess.run([str(pm2), action, identity], env=command_env,
                           check=True, capture_output=True)

        def check_protected():
            if release_protected_hashes(ROOT) != protected or digest(catalog) != catalog_hash:
                raise ValueError('release_protected_state_changed')

        def start_and_verify():
            process('restart', env['pm_id'])
            wait_healthy(env, require_new_pid=True)
            process('restart', scheduler_id)
            release_scheduler(env, pm2, command_env)

        # Чужое изменение во время backup — отказ без остановки процессов и
        # без rollback: собственная установка ещё не начиналась.
        release_baseline(ROOT, manifest)
        check_protected()
        try:
            process('stop', scheduler_id)
            process('stop', env['pm_id'])
            for name in RELEASE_FILES:
                write_atomic(release_destination(ROOT, name), (staged / name).read_bytes(), 0o644)
            # Миграция только отдельной feed-БД: добавление совместимых полей
            # и 30-дневный TTL. Основная БД и каталог не заменяются.
            migration_env = {**command_env, **{k: v for k, v in env.items() if not k.startswith('_')}}
            migration_env['EXTERNAL_FREIGHT_DB_PATH'] = str(feed)
            subprocess.run([env['pm_exec_path'], '-c',
                            'from database.external_freight_dal import init_schema; init_schema()'],
                           env=migration_env, cwd=ROOT, check=True, capture_output=True, timeout=120)
            check_protected()
            start_and_verify()
            if not installed_overlay_matches(manifest):
                raise ValueError('release_installed_hash_mismatch')
            for endpoint in ('/api/v1/external-freight/directory', '/api/v1/external-freight/count',
                             '/api/v1/driver/expenses', '/api/v1/market/my/listings'):
                if status(endpoint) != 401:
                    raise ValueError('release_auth_guard_changed: ' + endpoint)
            check_protected()
            report = {'status': 'RELEASE_COMPATIBILITY_ACTIVE', 'app_source': RELEASE_SOURCE,
                      'release_config_sha': source_sha, 'runtime_scope': 'limited_overlay',
                      'files': manifest['files'], 'backup': proof,
                      'protected_unchanged': True, 'active_contacts': catalog_count,
                      'catalog_import_performed': False, 'database_replacement_performed': False,
                      'store_upload_performed': False}
            write_atomic(backup / 'result.json', json.dumps(report, ensure_ascii=False, indent=2).encode())
            print(json.dumps(report, ensure_ascii=False))
        except BaseException:
            try:
                # Восстановление касается только кода. Новые пользовательские
                # записи и совместимая feed-миграция не откатываются снимком.
                for identity in (scheduler_id, env['pm_id']):
                    subprocess.run([str(pm2), 'stop', identity], env=command_env,
                                   check=False, capture_output=True)
                for name, data in originals.items():
                    path = release_destination(ROOT, name)
                    if data is None:
                        if path.exists() and digest(path) == manifest['files'][name]:
                            path.unlink()
                    else:
                        write_atomic(path, data, 0o644)
                check_protected()
                start_and_verify()
                release_baseline(ROOT, manifest)
                print(json.dumps({'status': 'RELEASE_CODE_ROLLED_BACK', 'backup': str(backup),
                                  'database_replacement_performed': False}))
            except BaseException:
                print(json.dumps({'status': 'ROLLBACK_FAILED', 'backup': str(backup)}))
                raise RuntimeError('release_compatibility_rollback_failed') from None
            raise


def apply(bundle, bundle_sha, source_sha):
    if not re.fullmatch('[0-9a-f]{40}', source_sha) or digest(bundle) != bundle_sha:
        raise ValueError('release_identity_mismatch')
    if ROOT.resolve() != ROOT or RUNTIME.resolve() != RUNTIME:
        raise ValueError('redirected_production_path')
    with tempfile.TemporaryDirectory(prefix='carrier-feed-verify-') as name:
        staged = Path(name)
        manifest = unpack_verified(bundle, staged)
        if release_manifest(manifest):
            apply_release_compatibility(staged, manifest, source_sha)
            return
        if carrier_manifest(manifest):
            apply_carriers(staged, manifest, source_sha)
            return
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
