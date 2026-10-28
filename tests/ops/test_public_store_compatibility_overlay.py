"""Проверки реального ограниченного writer без доступа к серверу и секретам."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import sys
import tarfile

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/ops/external_feed_production_overlay.py'
spec = importlib.util.spec_from_file_location('public_store_overlay', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.fixture
def release(tmp_path, monkeypatch):
    root, stage, runtime, backups = [tmp_path / name for name in ('backend', 'staged', 'runtime', 'backups')]
    for path in (root, stage, runtime, backups):
        path.mkdir()
    old, new = b'VALUE = 1\n', b'VALUE = 2\n'
    for name in module.RELEASE_FILES:
        (stage / name).parent.mkdir(parents=True, exist_ok=True)
        (stage / name).write_bytes(new)
        if name != 'services/owned_telegram_feed.py':
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_bytes(old)
    (root / 'main.py').write_text('PROTECTED = True\n')
    (root / 'api/chat.py').write_text('CHAT_PROTECTED = True\n')
    (root / '.env').write_text('UNCHANGED = synthetic\n')
    primary = runtime / 'primary.sqlite3'
    for path in (primary, runtime / 'feed.sqlite3', runtime / 'carrier-directory.sqlite3'):
        with sqlite3.connect(path) as connection:
            connection.execute('CREATE TABLE preserved(id INTEGER PRIMARY KEY, value TEXT)')
            connection.executemany('INSERT INTO preserved VALUES(?,?)', [(1, 'original'), (2, 'second')])
    for suffix in ('.bridge.lock', '.flush.lock'):
        (runtime / ('adapter.sqlite3' + suffix)).touch()
    checksum = lambda data: hashlib.sha256(data).hexdigest()
    manifest = {'compatibility_activation': 'reviewed-public-store-v1', 'app_source': module.RELEASE_SOURCE,
                'files': {name: checksum(new) for name in module.RELEASE_FILES},
                'production_before': {name: None if name == 'services/owned_telegram_feed.py' else checksum(old)
                                      for name in module.RELEASE_FILES},
                'catalog_import': False, 'primary_database_replacement': False}
    env = {'DB_PATH': str(primary), 'pm_exec_path': sys.executable, 'pm_id': '1', '_pid': '100',
           'PM2_HOME': str(tmp_path / 'pm2')}
    calls = []
    monkeypatch.setattr(module, 'ROOT', root)
    monkeypatch.setattr(module, 'RUNTIME', runtime)
    monkeypatch.setattr(module, 'BACKUP_ROOT', backups)
    monkeypatch.setattr(module, 'runtime_identity', lambda **kwargs: (env, Path('/bin/true')))
    monkeypatch.setattr(module, 'release_scheduler', lambda *args: '2')
    monkeypatch.setattr(module, 'validate_carrier_catalog', lambda path: 1297)
    monkeypatch.setattr(module, 'wait_healthy', lambda *args, **kwargs: None)
    monkeypatch.setattr(module, 'status', lambda path: 200 if path == '/health' else 401)
    monkeypatch.setattr(module.subprocess, 'run', lambda args, **kwargs: calls.append((args, kwargs)))
    return root, stage, runtime, backups, manifest, calls


def make_bundle(path, stage, manifest, extra=None):
    with tarfile.open(path, 'w:gz') as archive:
        for name in module.RELEASE_FILES:
            archive.add(stage / name, arcname=name, recursive=False)
        data = json.dumps(manifest).encode()
        item = tarfile.TarInfo('manifest.json')
        item.size = len(data)
        archive.addfile(item, io.BytesIO(data))
        if extra:
            item = tarfile.TarInfo(extra)
            item.size = 1
            archive.addfile(item, io.BytesIO(b'x'))


def test_accepts_only_bounded_release_archive(release, tmp_path):
    _, stage, _, _, manifest, _ = release
    archive = tmp_path / 'release.tar.gz'
    make_bundle(archive, stage, manifest)
    result = module.unpack_verified(archive, tmp_path / 'verified')
    assert module.release_manifest(result)
    assert set(result['files']) == module.RELEASE_FILES
    assert not {'main.py', 'api/chat.py', 'services/carrier_directory.py'} & module.RELEASE_FILES


@pytest.mark.parametrize('extra', ['../outside.py', 'api/chat.py', '.env', 'main.patch'])
def test_rejects_extra_members_before_extraction(release, tmp_path, extra):
    _, stage, _, _, manifest, _ = release
    archive = tmp_path / 'release.tar.gz'
    make_bundle(archive, stage, manifest, extra)
    with pytest.raises(ValueError, match='unexpected_overlay_members'):
        module.unpack_verified(archive, tmp_path / 'verified')
    assert not (tmp_path / 'verified').exists()


def test_baseline_drift_stops_before_backup_and_process_changes(release):
    root, stage, _, backups, manifest, calls = release
    (root / 'api/marketplace.py').write_text('DIFFERENT_RELEASE = True\n')
    with pytest.raises(ValueError, match='release_baseline_changed'):
        module.apply_release_compatibility(stage, manifest, 'a' * 40)
    assert not calls and not list(backups.iterdir())


def test_parent_symlink_is_rejected(release, tmp_path):
    root, _, _, _, manifest, _ = release
    (root / 'services').rename(tmp_path / 'outside')
    (root / 'services').symlink_to(tmp_path / 'outside', target_is_directory=True)
    with pytest.raises(ValueError, match='release_destination_symlink'):
        module.release_baseline(root, manifest)


def test_backup_error_does_not_stop_api_or_replace_code(release, monkeypatch):
    root, stage, _, _, manifest, calls = release
    def unavailable(*args):
        raise RuntimeError('synthetic_backup_error')
    monkeypatch.setattr(module, 'online_backup', unavailable)
    with pytest.raises(RuntimeError, match='synthetic_backup_error'):
        module.apply_release_compatibility(stage, manifest, 'a' * 40)
    assert not calls
    module.release_baseline(root, manifest)


@pytest.mark.parametrize('changed', ['api/marketplace.py', 'api/chat.py', '.env'])
def test_code_drift_during_backup_never_rolls_back_other_operator(release, monkeypatch, changed):
    root, stage, _, _, manifest, calls = release
    backup = module.online_backup
    def concurrent_change(source, destination):
        proof = backup(source, destination)
        (root / changed).write_bytes(b'OTHER_RELEASE = True\n')
        return proof
    monkeypatch.setattr(module, 'online_backup', concurrent_change)
    with pytest.raises(ValueError, match='release_baseline_changed|release_protected_state_changed'):
        module.apply_release_compatibility(stage, manifest, 'a' * 40)
    assert not calls
    assert (root / changed).read_bytes() == b'OTHER_RELEASE = True\n'
    assert not (root / 'services/owned_telegram_feed.py').exists()


def test_install_preserves_catalog_data_secrets_and_protected_code(release):
    root, stage, runtime, backups, manifest, calls = release
    protected = module.release_protected_hashes(root)
    catalog = module.digest(runtime / 'carrier-directory.sqlite3')
    module.apply_release_compatibility(stage, manifest, 'a' * 40)
    assert module.installed_overlay_matches(manifest)
    assert module.release_protected_hashes(root) == protected
    assert module.digest(runtime / 'carrier-directory.sqlite3') == catalog
    for path in (runtime / 'primary.sqlite3', runtime / 'feed.sqlite3'):
        with sqlite3.connect(path) as connection:
            assert connection.execute('SELECT * FROM preserved ORDER BY id').fetchall() == [(1, 'original'), (2, 'second')]
    proof = json.loads(next(backups.glob('*/result.json')).read_text())
    assert not proof['catalog_import_performed'] and not proof['database_replacement_performed']
    assert proof['backup']['primary']['restore_probe'] == proof['backup']['feed']['restore_probe'] == 'PASS'
    processes = [args[1:] for args, _ in calls if args[0] == '/bin/true']
    assert processes == [['stop', '2'], ['stop', '1'], ['restart', '1'], ['restart', '2']]
    migration = next(kwargs for args, kwargs in calls if args[0] == sys.executable)
    assert migration['env']['DB_PATH'] == str(runtime / 'primary.sqlite3')
    assert migration['env']['EXTERNAL_FREIGHT_DB_PATH'] == str(runtime / 'feed.sqlite3')


def test_failed_auth_probe_restores_code_without_database_replacement(release, monkeypatch):
    root, stage, runtime, backups, manifest, _ = release
    protected = module.release_protected_hashes(root)
    database_hashes = {name: module.digest(runtime / name) for name in ('primary.sqlite3', 'feed.sqlite3', 'carrier-directory.sqlite3')}
    monkeypatch.setattr(module, 'status', lambda path: 200)
    with pytest.raises(ValueError, match='release_auth_guard_changed'):
        module.apply_release_compatibility(stage, manifest, 'a' * 40)
    module.release_baseline(root, manifest)
    assert module.release_protected_hashes(root) == protected
    assert {name: module.digest(runtime / name) for name in database_hashes} == database_hashes
    assert not (root / 'services/owned_telegram_feed.py').exists()
    assert len(list(backups.iterdir())) == 1


def test_repeat_does_not_create_second_backup_or_restart(release):
    _, stage, _, backups, manifest, calls = release
    module.apply_release_compatibility(stage, manifest, 'a' * 40)
    count = len(calls)
    module.apply_release_compatibility(stage, manifest, 'a' * 40)
    assert len(calls) == count
    assert len(list(backups.iterdir())) == 1


@pytest.mark.parametrize('key,value', [('app_source', 'b' * 40), ('catalog_import', True), ('primary_database_replacement', True)])
def test_rejects_other_source_or_data_replacement(release, key, value):
    _, _, _, _, manifest, _ = release
    manifest[key] = value
    with pytest.raises(ValueError, match='invalid_release_compatibility_manifest'):
        module.release_manifest(manifest)
