"""Регрессии узкого writer на временных файлах и синтетической SQLite."""
import difflib
import ast
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import urllib.error

import pytest
import yaml

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


@pytest.mark.parametrize('bridge_failure,rollback_failure', [(False, False), (True, False), (True, True)])
def test_install_and_rollback_preserve_core_data_and_configuration(fixture, tmp_path, monkeypatch, capsys, bridge_failure, rollback_failure):
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
    env = {'DB_PATH': str(primary), 'pm_id': '3', 'pm_exec_path': '/synthetic/python', '_pid': '1', 'PM2_HOME': '/synthetic/pm2-home'}
    monkeypatch.setattr(module, 'ROOT', root)
    monkeypatch.setattr(module, 'RUNTIME', runtime)
    monkeypatch.setattr(module, 'BACKUP_ROOT', backups)
    monkeypatch.setattr(module, 'runtime_identity', lambda **kwargs: ({**env, '_pid': '2'} if kwargs else env, pm2))
    monkeypatch.setattr(module, 'empty_import_probe', lambda key: None)
    monkeypatch.setattr(module, 'verify_feed_schema', lambda *args: None)
    monkeypatch.setattr(module, 'status', lambda path: 200 if path == '/health' else 401)
    actual_run = module.subprocess.run
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        if args[0] == str(pm2):
            assert kwargs['env']['PM2_HOME'] == '/synthetic/pm2-home'
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
    if rollback_failure:
        checks = []
        def health(*args, **kwargs):
            checks.append(1)
            if len(checks) > 1:
                raise ValueError('synthetic_rollback_health_failed')
        monkeypatch.setattr(module, 'wait_healthy', health)
    bundle = make()
    if bridge_failure:
        exception, message = (RuntimeError, 'production_rollback_failed') if rollback_failure else (ValueError, 'synthetic_bridge_failure')
        with pytest.raises(exception, match=message):
            module.apply(bundle, module.digest(bundle), 'a' * 40)
        if rollback_failure:
            output = capsys.readouterr().out
            assert 'ROLLBACK_FAILED' in output
            assert 'ROLLED_BACK_CODE_AND_ENV' not in output
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


@pytest.mark.parametrize('operation', ['deploy', 'sync_push_mode', 'invalid'])
@pytest.mark.parametrize('scope', ['full', 'external_feed_overlay', 'invalid'])
def test_workflow_selects_at_most_one_writer_and_rejects_invalid_scope(operation, scope):
    root = SCRIPT.parents[2]
    doc = yaml.safe_load((root / '.github/workflows/production-deploy-execute.yml').read_text())

    def condition(text):
        expression = text.removeprefix('${{').removesuffix('}}').strip()
        expression = expression.replace('inputs.operation', repr(operation)).replace('inputs.deploy_scope', repr(scope))
        expression = expression.replace('&&', 'and').replace('||', 'or')

        def calculate(node):
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq):
                return calculate(node.left) == calculate(node.comparators[0])
            if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
                return all(calculate(x) for x in node.values)
            raise AssertionError('Неожиданная конструкция writer guard')
        return calculate(ast.parse(expression, mode='eval').body)

    selected = [name for name in ('deploy', 'sync_push_mode', 'external-feed-overlay')
                if condition(doc['jobs'][name]['if'])]
    valid = (operation, scope) in {('deploy', 'full'), ('sync_push_mode', 'full'),
                                  ('deploy', 'external_feed_overlay')}
    assert len(selected) == int(valid)
    script = doc['jobs']['validate-scope']['steps'][0]['run']
    result = subprocess.run(['bash', '-c', script], env={
        'OPERATION': operation, 'DEPLOY_SCOPE': scope, 'CALLER_REF': 'refs/heads/main',
        'CALLER_SHA': 'a' * 40, 'DEPLOY_SHA': 'a' * 40}, capture_output=True, text=True)
    assert (result.returncode == 0) == valid


@pytest.mark.parametrize('reference,sha', [('refs/heads/qa2/integration-candidate', 'a' * 40),
                                        ('refs/heads/main', 'b' * 40)])
def test_overlay_rejects_non_main_or_different_source(reference, sha):
    doc = yaml.safe_load((SCRIPT.parents[2] / '.github/workflows/production-deploy-execute.yml').read_text())
    result = subprocess.run(['bash', '-c', doc['jobs']['validate-scope']['steps'][0]['run']], env={
        'OPERATION': 'deploy', 'DEPLOY_SCOPE': 'external_feed_overlay', 'CALLER_REF': reference,
        'CALLER_SHA': sha, 'DEPLOY_SHA': 'a' * 40}, capture_output=True)
    assert result.returncode != 0


def test_disabled_import_is_not_a_successful_smoke(monkeypatch):
    def disabled(request, **kwargs):
        assert request.data == b'{"records":[]}'
        raise urllib.error.HTTPError(request.full_url, 404, 'disabled', {}, None)
    monkeypatch.setattr(module.urllib.request, 'urlopen', disabled)
    with pytest.raises(urllib.error.HTTPError):
        module.empty_import_probe('synthetic-key')


def test_feed_schema_must_be_initialized_and_separate(tmp_path):
    primary, feed = tmp_path / 'primary.db', tmp_path / 'feed.db'
    for path in (primary, feed):
        with sqlite3.connect(path) as connection:
            connection.execute('CREATE TABLE existing(id TEXT)')
    with pytest.raises(ValueError, match='feed_database_not_separate'):
        module.verify_feed_schema(primary, primary)
    with pytest.raises(ValueError, match='feed_schema_not_initialized'):
        module.verify_feed_schema(feed, primary)
    with sqlite3.connect(feed) as connection:
        for name in ['external_freight_items', 'external_freight_bookmarks', 'external_freight_delivery']:
            connection.execute(f'CREATE TABLE {name}(id TEXT)')
    module.verify_feed_schema(feed, primary)


def test_successful_restart_requires_new_correct_listener(monkeypatch):
    original = {'pm_id': '3', 'pm_exec_path': '/synthetic/python', '_pid': '1'}
    monkeypatch.setattr(module, 'runtime_identity', lambda **kwargs: (original, None))
    monkeypatch.setattr(module, 'status', lambda path: 200)
    monkeypatch.setattr(module.time, 'sleep', lambda seconds: None)
    with pytest.raises(ValueError, match='production_runtime_not_healthy'):
        module.wait_healthy(original, require_new_pid=True)
    monkeypatch.setattr(module, 'runtime_identity', lambda **kwargs: ({**original, '_pid': '2'}, None))
    module.wait_healthy(original, require_new_pid=True)


def test_production_caller_uses_valid_github_reusable_refs():
    root = SCRIPT.parents[2]
    doc = yaml.safe_load((root / '.github/workflows/break-glass-production-deploy.yml').read_text())
    for job_name in ['overlay-quality-gate', 'deploy']:
        reference = doc['jobs'][job_name]['uses']
        target, revision = reference.rsplit('@', 1)
        assert revision == 'main'
        assert target.startswith('777ubu-ai/urtruck-app/.github/workflows/')
        assert (root / '.github/workflows' / target.rsplit('/', 1)[1]).is_file()
    assert doc['jobs']['guard']['steps'][1]['with']['ref'] == 'refs/heads/main'


def test_pm2_cli_can_live_outside_daemon_node_directory(tmp_path, monkeypatch):
    target = tmp_path / 'lib/node_modules/pm2/bin/pm2'
    target.parent.mkdir(parents=True)
    target.write_text('#!/usr/bin/env node\n')
    target.chmod(0o755)
    entry = tmp_path / 'bin/pm2'
    entry.parent.mkdir()
    entry.symlink_to(target)
    monkeypatch.setattr(module, 'PM2_ENTRY', entry)
    monkeypatch.setattr(module, 'PM2_TARGET', target)
    assert module.verified_pm2_entry() == entry
    monkeypatch.setattr(module, 'PM2_TARGET', tmp_path / 'another-pm2')
    with pytest.raises(ValueError, match='pm2_identity_unavailable'):
        module.verified_pm2_entry()


def test_pm2_cli_missing_or_not_executable_is_rejected(tmp_path, monkeypatch):
    path = tmp_path / 'pm2'
    monkeypatch.setattr(module, 'PM2_ENTRY', path)
    monkeypatch.setattr(module, 'PM2_TARGET', path)
    with pytest.raises(ValueError, match='pm2_identity_unavailable'):
        module.verified_pm2_entry()
    path.write_text('not executable')
    path.chmod(0o600)
    with pytest.raises(ValueError, match='pm2_identity_unavailable'):
        module.verified_pm2_entry()


@pytest.mark.parametrize('failure', [False, True, 'backend_drift'])
def test_existing_overlay_source_switch_preserves_data_and_rolls_back_only_env(tmp_path, monkeypatch, capsys, failure):
    root, runtime, units, backups = [tmp_path / name for name in ['backend', 'runtime', 'units', 'backups']]
    for path in [root, runtime, units, backups]:
        path.mkdir()
    source = tmp_path / 'collector.sqlite3'
    with sqlite3.connect(source) as connection:
        connection.execute('CREATE TABLE app_messages(source_id TEXT,source_message TEXT,source_date REAL,text TEXT,revision TEXT)')
    source_hash = module.digest(source)
    primary = tmp_path / 'primary.sqlite3'
    for path in [primary, runtime / 'feed.sqlite3', runtime / 'adapter.sqlite3']:
        with sqlite3.connect(path) as connection:
            connection.execute('CREATE TABLE preserved(id TEXT)')
            connection.execute("INSERT INTO preserved VALUES('existing')")
    backend_env = (f'PUSH_TRANSPORT=legacy\nEXTERNAL_FREIGHT_FEED_ENABLED=true\n'
                   f'EXTERNAL_FREIGHT_DB_PATH={runtime}/feed.sqlite3\n'
                   'EXTERNAL_FREIGHT_IMPORTER_KEY=synthetic-private-key\n').encode()
    if failure == 'backend_drift':
        backend_env = backend_env.replace(b'=synthetic-private-key', b'=other-private-key')
    (root / '.env').write_bytes(backend_env)
    (root / 'auth.py').write_text('PROTECTED=True\n')
    for key, value in [('ROOT', root), ('RUNTIME', runtime), ('UNIT_ROOT', units),
                       ('BACKUP_ROOT', backups), ('SOURCE_DB', source)]:
        monkeypatch.setattr(module, key, value)
    unit = 'urtruck-production-feed-bridge'
    (units / (unit + '.service')).write_text(module.bridge_service('/synthetic/python'))
    (units / (unit + '.timer')).write_text(module.bridge_timer())
    original = (f'EXTERNAL_FREIGHT_IMPORT_ENABLED=true\nEXTERNAL_FREIGHT_DEPLOYMENT_TARGET=production\n'
                f'EXTERNAL_FREIGHT_API_URL=https://urtruck.kz\nEXTERNAL_FREIGHT_SOURCE_DB={source}\n'
                f'EXTERNAL_FREIGHT_ADAPTER_DB={runtime}/adapter.sqlite3\n'
                'EXTERNAL_FREIGHT_IMPORTER_KEY=synthetic-private-key\n').encode()
    env_path = runtime / 'bridge.env'
    env_path.write_bytes(original)
    timer_active, commands = [True], []
    def run(args, **kwargs):
        commands.append(args)
        if args[:2] == ['systemctl', 'show']:
            return subprocess.CompletedProcess(args, 0,
                f'FragmentPath={units / args[2]}\nDropInPaths=\nNeedDaemonReload=no\n', '')
        if args[:2] == ['systemctl', 'is-active']:
            text = ('active' if timer_active[0] else 'inactive') if args[-1].endswith('.timer') else 'inactive'
            return subprocess.CompletedProcess(args, 0, text, '')
        assert args[:3] == ['sudo', '-n', 'systemctl']
        if args[-1].endswith('.timer'):
            timer_active[0] = args[3] == 'start'
        return subprocess.CompletedProcess(args, 0, '', '')
    monkeypatch.setattr(module.subprocess, 'run', run)
    monkeypatch.setattr(module, 'installed_overlay_matches', lambda manifest: True)
    monkeypatch.setattr(module, 'status', lambda path: 200)
    def observe(since):
        assert env_path.read_bytes().count(b'EXTERNAL_FREIGHT_SOURCE_MODE=incoming') == 1
        with sqlite3.connect(runtime / 'feed.sqlite3') as connection:
            connection.execute("INSERT INTO preserved VALUES('new-after-switch')")
        if failure:
            raise ValueError('synthetic_delivery_failure')
        return [{'mode': 'incoming', 'status': 'delivered'}, {'mode': 'incoming', 'status': 'idle'}]
    monkeypatch.setattr(module, 'observe_bridge_cycles', observe)
    env = {'DB_PATH': str(primary), 'pm_exec_path': '/synthetic/python'}
    if failure == 'backend_drift':
        with pytest.raises(ValueError, match='backend_bridge_configuration_mismatch'):
            module.reconcile_bridge_source(env, {}, 'a' * 40)
        assert not any(command[0] == 'sudo' for command in commands)
        assert not list(backups.iterdir())
        assert env_path.read_bytes() == original
        assert (root / '.env').read_bytes() == backend_env
        return
    if failure:
        with pytest.raises(ValueError, match='synthetic_delivery_failure'):
            module.reconcile_bridge_source(env, {}, 'a' * 40)
        assert env_path.read_bytes() == original
    else:
        module.reconcile_bridge_source(env, {}, 'a' * 40)
        assert env_path.read_bytes() == original + b'EXTERNAL_FREIGHT_SOURCE_MODE=incoming\n'
    assert timer_active[0]
    assert module.digest(source) == source_hash
    assert (root / '.env').read_bytes() == backend_env
    with sqlite3.connect(runtime / 'feed.sqlite3') as connection:
        assert connection.execute('SELECT id FROM preserved').fetchall() == [('existing',), ('new-after-switch',)]
    assert len(list(backups.glob('*/primary/snapshot.sqlite3'))) == 1
    assert len(list(backups.glob('*/adapter/snapshot.sqlite3'))) == 1
    assert len(list(backups.glob('*/feed/snapshot.sqlite3'))) == 1
    assert not any('restart' in command for command in commands)
    assert 'synthetic-private-key' not in capsys.readouterr().out


@pytest.mark.parametrize('suffix', ['.service', '.timer'])
@pytest.mark.parametrize('drift', ['dropin', 'fragment', 'reload', 'missing'])
def test_effective_unit_drift_rejected_before_control_or_write(tmp_path, monkeypatch, suffix, drift):
    unit = 'urtruck-production-feed-bridge'
    monkeypatch.setattr(module, 'UNIT_ROOT', tmp_path)
    (tmp_path / (unit + '.service')).write_text(module.bridge_service('/synthetic/python'))
    (tmp_path / (unit + '.timer')).write_text(module.bridge_timer())
    commands = []
    def run(args, **kwargs):
        commands.append(args)
        assert args[:2] == ['systemctl', 'show']
        values = {'FragmentPath': str(tmp_path / args[2]), 'DropInPaths': '', 'NeedDaemonReload': 'no'}
        if args[2].endswith(suffix):
            if drift == 'dropin':
                values['DropInPaths'] = '/etc/systemd/system/override.conf'
            elif drift == 'fragment':
                values['FragmentPath'] = '/run/systemd/system/other.service'
            elif drift == 'reload':
                values['NeedDaemonReload'] = 'yes'
            else:
                values.pop('DropInPaths')
        return subprocess.CompletedProcess(args, 0, '\n'.join(f'{key}={value}' for key, value in values.items()), '')
    monkeypatch.setattr(module.subprocess, 'run', run)
    def forbidden(*args, **kwargs):
        pytest.fail('Отказ должен произойти до чтения источника или записи backup/env')
    monkeypatch.setattr(module, 'verify_app_messages_source', forbidden)
    monkeypatch.setattr(module, 'write_atomic', forbidden)
    with pytest.raises(ValueError, match='effective_bridge_unit_requires_reconciliation'):
        module.reconcile_bridge_source({'pm_exec_path': '/synthetic/python'}, {}, 'a' * 40)
    assert commands and all(command[:2] == ['systemctl', 'show'] for command in commands)


def test_existing_overlay_requires_all_nine_hashes_and_safe_paths(fixture, tmp_path, monkeypatch):
    root, manifest, make = fixture
    staged = tmp_path / 'verification'
    staged.mkdir()
    manifest = module.unpack_verified(make(), staged)
    module.prepare(root, staged, manifest)
    monkeypatch.setattr(module, 'ROOT', root)
    assert not module.installed_overlay_matches(manifest)
    for name in manifest['files']:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes((staged / name).read_bytes())
    assert module.installed_overlay_matches(manifest)
    (root / 'main.py').write_text('changed')
    assert not module.installed_overlay_matches(manifest)


def synthetic_catalog(path, *, private=False, status_value='active'):
    with sqlite3.connect(path) as connection:
        connection.execute('''CREATE TABLE carrier_directory(sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT UNIQUE,payload TEXT,status TEXT)''')
        payload = {'id': 'carrier_00000000000000000001', 'record_type': 'carrier', 'name': 'Synthetic',
                   'phones': ['+77000000001'], 'emails': [], 'city': '', 'country': '',
                   'transport_type': '', 'notes': '', 'availability': 'unknown',
                   'contact_verification': 'not_checked', 'sources': []}
        if private:
            payload['iin'] = 'private-never-published'
        connection.execute('INSERT INTO carrier_directory(id,payload,status) VALUES(?,?,?)',
                           (payload['id'], json.dumps(payload), status_value))


@pytest.mark.parametrize('defect', ['private', 'count', 'symlink'])
def test_carrier_source_rejects_private_payload_wrong_count_and_redirect(tmp_path, monkeypatch, defect):
    source = tmp_path / 'catalog.sqlite3'
    synthetic_catalog(source, private=defect == 'private')
    monkeypatch.setattr(module, 'CARRIER_EXPECTED_COUNT', 2 if defect == 'count' else 1)
    if defect == 'symlink':
        link = tmp_path / 'link.sqlite3'
        link.symlink_to(source)
        source = link
    with pytest.raises(ValueError):
        module.validate_carrier_catalog(source)


@pytest.fixture
def carrier_fixture(tmp_path, monkeypatch):
    root, runtime, source_dir, backups, staged = [tmp_path / p for p in ['backend', 'runtime', 'qa2', 'backups', 'staged']]
    for p in [root, runtime, source_dir, backups, staged]:
        p.mkdir()
    main = b'PROTECTED_MAIN=True\n'
    old_api, new_api, service = b'OLD_API=True\n', b'NEW_API=True\n', b'SERVICE=True\n'
    hashes = {name: hashlib.sha256(b'EXISTING=True\n').hexdigest() for name in module.FILES}
    hashes.update({'main.py': hashlib.sha256(main).hexdigest(),
                   'api/external_freight.py': hashlib.sha256(new_api).hexdigest(),
                   module.CARRIER_MODULE: hashlib.sha256(service).hexdigest()})
    manifest = {'carrier_activation': 'reviewed-directory-v1', 'files': hashes}
    for name in module.FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(old_api if name == 'api/external_freight.py' else b'EXISTING=True\n')
    (root / 'main.py').write_bytes(main)
    (root / 'auth.py').write_bytes(b'PROTECTED_AUTH=True\n')
    for name, value in [('api/external_freight.py', new_api), (module.CARRIER_MODULE, service)]:
        path = staged / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
    original_env = (f'EXTERNAL_FREIGHT_FEED_ENABLED=true\nEXTERNAL_FREIGHT_DB_PATH={runtime}/feed.sqlite3\n'
                    'AUTH_SECRET=synthetic-private-secret\nPUSH_TRANSPORT=legacy\n').encode()
    (root / '.env').write_bytes(original_env)
    source = source_dir / 'carrier-directory.sqlite3'
    synthetic_catalog(source)
    primary = tmp_path / 'primary.sqlite3'
    with sqlite3.connect(primary) as c:
        c.execute('CREATE TABLE deals(id TEXT)')
        c.execute("INSERT INTO deals VALUES('preserve-primary-data')")
    (runtime / 'feed.sqlite3').write_bytes(b'PRESERVE_FEED_DATA')
    (runtime / 'adapter.sqlite3').write_bytes(b'PRESERVE_ADAPTER_DATA')
    pm2 = tmp_path / 'bin/pm2'
    env = {'DB_PATH': str(primary), 'pm_id': '3', 'pm_exec_path': '/synthetic/python',
           '_pid': '1', 'PM2_HOME': '/synthetic/pm2-home'}
    for name, value in [('ROOT', root), ('RUNTIME', runtime), ('BACKUP_ROOT', backups),
                        ('CARRIER_SOURCE', source), ('CARRIER_EXPECTED_COUNT', 1),
                        ('CARRIER_OLD_API', hashlib.sha256(old_api).hexdigest()),
                        ('CARRIER_NEW_API', hashlib.sha256(new_api).hexdigest()),
                        ('CARRIER_MODULE_SHA', hashlib.sha256(service).hexdigest()),
                        ('CARRIER_MAIN_SHA', hashlib.sha256(main).hexdigest())]:
        monkeypatch.setattr(module, name, value)
    calls = []
    monkeypatch.setattr(module, 'runtime_identity', lambda **kw: (env, pm2))
    monkeypatch.setattr(module, 'verify_bridge_units', lambda python: None)
    monkeypatch.setattr(module, 'wait_healthy', lambda *a, **kw: None)
    monkeypatch.setattr(module, 'status', lambda path: 200 if path == '/health' else 401)
    monkeypatch.setattr(module.subprocess, 'run', lambda args, **kw: calls.append(args))
    return root, runtime, source, backups, staged, manifest, primary, old_api, original_env, calls


@pytest.mark.parametrize('failure', [False, True, 'rollback'])
def test_carrier_deploy_and_code_env_only_rollback(carrier_fixture, monkeypatch, capsys, failure):
    root, runtime, source, backups, staged, manifest, primary, old_api, original_env, calls = carrier_fixture
    primary_hash, source_hash = module.digest(primary), module.digest(source)
    if failure:
        health_calls = []
        def health(*args, **kwargs):
            health_calls.append(1)
            if len(health_calls) == 1 or failure == 'rollback':
                raise ValueError('synthetic_restart_failure')
        monkeypatch.setattr(module, 'wait_healthy', health)
        error = RuntimeError if failure == 'rollback' else ValueError
        with pytest.raises(error):
            module.apply_carriers(staged, manifest, 'a' * 40)
        assert (root / 'api/external_freight.py').read_bytes() == old_api
        assert (root / '.env').read_bytes() == original_env
        output = capsys.readouterr().out
        assert ('ROLLBACK_FAILED' if failure == 'rollback' else 'CARRIER_CODE_ENV_ROLLED_BACK') in output
        assert len(calls) == 2
    else:
        module.apply_carriers(staged, manifest, 'a' * 40)
        assert (root / '.env').read_bytes() == original_env + f'EXTERNAL_CARRIER_DIRECTORY_DB={runtime}/carrier-directory.sqlite3\n'.encode()
        assert list(backups.glob('*/result.json'))
        assert len(calls) == 1
        module.apply_carriers(staged, manifest, 'a' * 40)
        assert len(calls) == 1
        assert len(list(backups.iterdir())) == 1
        assert 'ALREADY_ACTIVE' in capsys.readouterr().out
    assert module.validate_carrier_catalog(runtime / 'carrier-directory.sqlite3') == 1
    assert module.digest(primary) == primary_hash
    assert module.digest(source) == source_hash
    assert (runtime / 'feed.sqlite3').read_bytes() == b'PRESERVE_FEED_DATA'
    assert (runtime / 'adapter.sqlite3').read_bytes() == b'PRESERVE_ADAPTER_DATA'
    assert (root / 'auth.py').read_bytes() == b'PROTECTED_AUTH=True\n'
    assert list(backups.glob('*/primary/restore-probe.sqlite3'))
    assert list(backups.glob('*/carrier/restore-probe.sqlite3'))


def test_existing_hidden_production_contacts_never_overwritten_by_qa(carrier_fixture):
    root, runtime, source, backups, staged, manifest, *_ = carrier_fixture
    target = runtime / 'carrier-directory.sqlite3'
    synthetic_catalog(target, status_value='hidden')
    checksum = module.digest(target)
    module.apply_carriers(staged, manifest, 'a' * 40)
    assert module.digest(target) == checksum
    assert module.validate_carrier_catalog(target) == 0


@pytest.mark.parametrize('drift', ['router', 'main', 'module', 'environment', 'source'])
def test_carrier_drift_stops_before_backup_restart_or_live_write(carrier_fixture, drift):
    root, runtime, source, backups, staged, manifest, primary, old_api, original_env, calls = carrier_fixture
    if drift in {'router', 'main', 'module'}:
        path = root / {'router': 'api/external_freight.py', 'main': 'main.py', 'module': module.CARRIER_MODULE}[drift]
        path.write_bytes(b'UNREVIEWED=True\n')
    elif drift == 'environment':
        (root / '.env').write_bytes(original_env + b'EXTERNAL_CARRIER_DIRECTORY_DB=/unexpected.sqlite3\n')
    else:
        with sqlite3.connect(source) as c:
            c.execute("UPDATE carrier_directory SET payload='{}'")
    before = (root / 'api/external_freight.py').read_bytes()
    with pytest.raises((ValueError, KeyError)):
        module.apply_carriers(staged, manifest, 'a' * 40)
    assert not list(backups.iterdir()) and not calls
    assert not (runtime / 'carrier-directory.sqlite3').exists()
    assert (root / 'api/external_freight.py').read_bytes() == before


def test_carrier_manifest_rejects_other_module_or_different_target_hash(carrier_fixture):
    *_, manifest, primary, old_api, original_env, calls = carrier_fixture
    manifest['files'][module.CARRIER_MODULE] = '0' * 64
    with pytest.raises(ValueError, match='invalid_carrier_transition_manifest'):
        module.carrier_manifest(manifest)


def test_real_carrier_bundle_hashes_match_reviewed_repository(tmp_path):
    root = SCRIPT.parents[2]
    manifest = json.loads((root / 'ops/external-feed-production/manifest.json').read_text())
    bundle = tmp_path / 'carrier.tar.gz'
    with tarfile.open(bundle, 'w:gz') as archive:
        for name in manifest['files']:
            if name != 'main.py':
                archive.add(root / 'backend' / name, arcname=name, recursive=False)
        for name in ['main.patch', 'manifest.json']:
            archive.add(root / 'ops/external-feed-production' / name, arcname=name, recursive=False)
    result = module.unpack_verified(bundle, tmp_path / 'staged')
    assert module.carrier_manifest(result)
    assert result['files']['main.py'] == module.CARRIER_MAIN_SHA


@pytest.mark.parametrize('alias', ['primary', 'feed', 'source'])
def test_carrier_destination_hardlinks_to_protected_or_qa_data_rejected(carrier_fixture, alias):
    root, runtime, source, backups, staged, manifest, primary, *rest = carrier_fixture
    target = runtime / 'carrier-directory.sqlite3'
    target.hardlink_to({'primary': primary, 'feed': runtime / 'feed.sqlite3', 'source': source}[alias])
    with pytest.raises(ValueError, match='aliases_protected_database|source_destination_alias'):
        module.apply_carriers(staged, manifest, 'a' * 40)
    assert not list(backups.iterdir())


def test_carrier_process_env_cannot_override_reviewed_path(carrier_fixture, monkeypatch):
    root, runtime, source, backups, staged, manifest, primary, *rest = carrier_fixture
    monkeypatch.setattr(module, 'runtime_identity', lambda **kw: ({'DB_PATH': str(primary),
        'EXTERNAL_CARRIER_DIRECTORY_DB': '/unexpected/catalog.sqlite3', 'pm_exec_path': '/synthetic/python'}, None))
    with pytest.raises(ValueError, match='existing_carrier_configuration_changed'):
        module.apply_carriers(staged, manifest, 'a' * 40)
    assert not list(backups.iterdir())
