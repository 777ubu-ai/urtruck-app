"""Регрессии узкого writer на временных файлах и синтетической SQLite."""
import difflib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/ops/external_feed_production_overlay.py'
spec = importlib.util.spec_from_file_location('feed_overlay', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.fixture
def fixture(tmp_path):
    root = tmp_path / 'backend'
    root.mkdir()
    before = 'x = 1\n'
    after = 'x = 1\nfeed_enabled = True\n'
    (root / 'main.py').write_text(before)
    values = {name: b'VALUE = 1\n' for name in module.FILES}
    values['main.patch'] = ''.join(difflib.unified_diff(
        before.splitlines(True), after.splitlines(True), 'runtime/main.py', 'overlay/main.py')).encode()
    checksum = lambda x: hashlib.sha256(x).hexdigest()
    manifest = {'production_main_before_sha256': checksum(before.encode()),
                'files': {name: checksum(data) for name, data in values.items() if name in module.FILES}}
    manifest['files']['main.py'] = checksum(after.encode())
    values['manifest.json'] = json.dumps(manifest).encode()

    def bundle(changes=None):
        path = tmp_path / 'bundle.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for name, data in {**values, **(changes or {})}.items():
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        return path
    return root, manifest, bundle


def test_verified_patch_changes_only_expected_file(fixture, tmp_path):
    root, manifest, make = fixture
    staged = tmp_path / 'stage'
    staged.mkdir()
    actual = module.unpack_verified(make(), staged)
    module.prepare(root, staged, actual)
    assert (root / 'main.py').read_text() == 'x = 1\n'
    assert module.digest(staged / 'main.py') == manifest['files']['main.py']


@pytest.mark.parametrize('name', ['../outside', 'auth.py', 'main.py'])
def test_extra_or_traversal_member_rejected(fixture, tmp_path, name):
    _, _, make = fixture
    with pytest.raises(ValueError, match='unexpected_overlay_members'):
        module.unpack_verified(make({name: b'bad'}), tmp_path / 'stage')


def test_tampered_module_rejected(fixture, tmp_path):
    _, _, make = fixture
    with pytest.raises(ValueError, match='overlay_checksum_mismatch'):
        module.unpack_verified(make({'api/external_freight.py': b'bad'}), tmp_path / 'stage')


def test_changed_baseline_fails_without_runtime_write(fixture, tmp_path):
    root, _, make = fixture
    staged = tmp_path / 'stage'
    staged.mkdir()
    manifest = module.unpack_verified(make(), staged)
    (root / 'main.py').write_text('other_release = True\n')
    with pytest.raises(ValueError, match='production_baseline_changed'):
        module.prepare(root, staged, manifest)
    assert not (root / 'api/external_freight.py').exists()


def test_existing_different_feed_module_is_not_overwritten(fixture, tmp_path):
    root, _, make = fixture
    staged = tmp_path / 'stage'
    staged.mkdir()
    manifest = module.unpack_verified(make(), staged)
    (root / 'api').mkdir()
    (root / 'api/external_freight.py').write_text('other = 2\n')
    with pytest.raises(ValueError, match='existing_feed_module_requires_reconciliation'):
        module.prepare(root, staged, manifest)


def test_online_backup_keeps_all_rows_and_restores_separately(tmp_path):
    source = tmp_path / 'primary.sqlite3'
    with sqlite3.connect(source) as connection:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('CREATE TABLE expenses(id TEXT, amount INTEGER)')
        connection.executemany('INSERT INTO expenses VALUES(?,?)', [('one', 150000), ('two', 10000)])
        connection.commit()
        proof = module.online_backup(source, tmp_path / 'backup.sqlite3')
        with sqlite3.connect(tmp_path / 'restore-probe.sqlite3') as probe:
            assert probe.execute('SELECT * FROM expenses ORDER BY id').fetchall() == [('one', 150000), ('two', 10000)]
        assert connection.execute('SELECT count(*) FROM expenses').fetchone()[0] == 2
        assert proof['restore_probe'] == 'PASS'


def test_environment_preserves_push_auth_and_primary_db():
    source = b'PUSH_TRANSPORT=legacy\nAUTH_SECRET=synthetic\nDB_PATH=/tmp/synthetic.db\n'
    result = module.updated_env(source, {'EXTERNAL_FREIGHT_FEED_ENABLED': 'true'})
    assert result.startswith(source)
    assert result.count(b'EXTERNAL_FREIGHT_FEED_ENABLED=true') == 1


def test_repeated_env_update_does_not_duplicate_setting():
    source = b'EXTERNAL_FREIGHT_FEED_ENABLED=false\nPUSH_TRANSPORT=legacy\n'
    result = module.updated_env(source, {'EXTERNAL_FREIGHT_FEED_ENABLED': 'true'})
    assert b'EXTERNAL_FREIGHT_FEED_ENABLED=false' not in result
    assert result.count(b'EXTERNAL_FREIGHT_FEED_ENABLED=') == 1


def test_atomic_write_does_not_follow_symlink(tmp_path):
    protected = tmp_path / 'protected'
    protected.write_bytes(b'original')
    target = tmp_path / 'target'
    target.symlink_to(protected)
    with pytest.raises(ValueError, match='symlink_target_forbidden'):
        module.write_atomic(target, b'changed')
    assert protected.read_bytes() == b'original'


@pytest.mark.parametrize('bridge_failure', [False, True])
def test_install_and_rollback_preserve_core_data_and_configuration(fixture, tmp_path, monkeypatch, bridge_failure):
    root, _, make = fixture
    runtime = tmp_path / 'runtime'
    backups = tmp_path / 'backups'
    backups.mkdir()
    primary = tmp_path / 'business.sqlite3'
    with sqlite3.connect(primary) as conn:
        conn.execute('CREATE TABLE deals(id TEXT PRIMARY KEY)')
        conn.execute("INSERT INTO deals VALUES('existing-user-deal')")
    original = b'PUSH_TRANSPORT=legacy\nAUTH_SECRET=synthetic\n'
    (root / '.env').write_bytes(original)
    (root / 'auth.py').write_text('PROTECTED = True\n')
    old_main = (root / 'main.py').read_bytes()
    pm2 = tmp_path / 'bin/pm2'
    env = {'DB_PATH': str(primary), 'pm_id': '3', 'pm_exec_path': '/synthetic/python'}
    monkeypatch.setattr(module, 'ROOT', root)
    monkeypatch.setattr(module, 'RUNTIME', runtime)
    monkeypatch.setattr(module, 'BACKUP_ROOT', backups)
    monkeypatch.setattr(module, 'runtime_identity', lambda: (env, pm2))
    monkeypatch.setattr(module, 'status', lambda path: 200 if path == '/health' else 401)
    actual_run = module.subprocess.run
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        if args[0] in {str(pm2), 'sudo'}:
            return None
        return actual_run(args, **kwargs)

    def install(*args):
        (runtime / 'feed.sqlite3').write_bytes(b'new-data-never-restore-over-it')
        if bridge_failure:
            raise ValueError('synthetic_bridge_failure')
        return [{'status': 'delivered', 'sent': 1}, {'status': 'idle', 'sent': 0}]

    monkeypatch.setattr(module.subprocess, 'run', run)
    monkeypatch.setattr(module, 'install_bridge', install)
    bundle = make()
    if bridge_failure:
        with pytest.raises(ValueError, match='synthetic_bridge_failure'):
            module.apply(bundle, module.digest(bundle), 'a' * 40)
        assert (root / '.env').read_bytes() == original
        assert (root / 'main.py').read_bytes() == old_main
        assert sum(x[:2] == [str(pm2), 'restart'] for x in calls) == 2
    else:
        module.apply(bundle, module.digest(bundle), 'a' * 40)
        assert (root / '.env').read_bytes().startswith(original)
        assert b'feed_enabled' in (root / 'main.py').read_bytes()
        assert list(backups.glob('*/result.json'))
    assert (root / 'auth.py').read_text() == 'PROTECTED = True\n'
    assert (runtime / 'feed.sqlite3').read_bytes() == b'new-data-never-restore-over-it'
    with sqlite3.connect(primary) as conn:
        assert conn.execute('SELECT * FROM deals').fetchall() == [('existing-user-deal',)]
