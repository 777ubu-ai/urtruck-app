"""Синтетические отказы адресной выкладки; живая база и сеть не используются."""
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/ops'))
import owned_listing_production_overlay as module

SHA = 'a' * 40


@pytest.fixture
def setup(tmp_path, monkeypatch):
    root, stage, backups = (tmp_path / n for n in ('backend', 'stage', 'backups'))
    for folder in (root, stage, backups):
        folder.mkdir()
    names = set(module.FILES) | module.runtime.REQUIRED
    names |= {'extra/module_' + str(i) + '.py' for i in range(183 - len(names))}
    before, after = {}, {}
    for name in names:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'VALUE = 1\n')
        before[name] = module.legacy.digest(path)
        if name in module.FILES:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'VALUE = 2\n')
            after[name] = module.legacy.digest(target)
    database = tmp_path / 'primary.sqlite3'
    with sqlite3.connect(database) as c:
        c.execute('CREATE TABLE sentinel(id TEXT PRIMARY KEY, value TEXT)')
        c.execute("INSERT INTO sentinel VALUES('original','preserved')")
    (root / '.env').write_bytes(b'SYNTHETIC_SECRET=not-a-live-key\n')
    allowlist = backups / 'allowlist.json'
    allowlist.write_text(json.dumps([{'table': t, 'id': t} for t in ('cargos', 'trips')]))
    allowlist.chmod(0o600)
    manifest = {'schema': 1, 'operation': 'owned_history_auto_renew_v1',
                'production_root': str(root), 'primary_database': str(database),
                'baseline_files': before, 'files': after, 'reconstructed_baseline_sha': 'b' * 40,
                'full_runtime_promotion': False, 'environment_changes': False,
                'database_replacement': False, 'store_release': False,
                'recovery_allowlist_path': str(allowlist),
                'recovery_allowlist_sha256': module.legacy.digest(allowlist),
                'expected_recovery_counts': {'cargos': 1, 'trips': 1},
                'candidate_manifest': {'schema': 1, 'environment': 'production', 'source_sha': SHA,
                                       'files': {**before, **after}}}
    monkeypatch.setattr(module, 'ROOT', root)
    monkeypatch.setattr(module, 'BACKUPS', backups)
    monkeypatch.setattr(module, 'DATABASE', database)
    return root, stage, backups, database, allowlist, manifest


def test_bundle_is_bound_to_full_source_and_exact_members(setup, tmp_path):
    _, stage, _, _, _, manifest = setup
    bundle = tmp_path / 'valid.tar.gz'
    with tarfile.open(bundle, 'w:gz') as archive:
        for name in module.FILES:
            archive.add(stage / name, arcname=name)
        data = json.dumps(manifest).encode()
        member = tarfile.TarInfo('manifest.json'); member.size = len(data)
        archive.addfile(member, io.BytesIO(data))
    destination = tmp_path / 'unpacked'; destination.mkdir()
    assert module.unpack(bundle, module.legacy.digest(bundle), destination, SHA) == manifest
    with pytest.raises(ValueError):
        module.unpack(bundle, module.legacy.digest(bundle), destination, 'c' * 40)
    with pytest.raises(ValueError):
        module.unpack(bundle, '0' * 64, destination, SHA)


@pytest.mark.parametrize('flag', ['full_runtime_promotion', 'environment_changes', 'database_replacement', 'store_release'])
def test_scope_cannot_expand(setup, flag):
    manifest = setup[-1]; manifest[flag] = True
    with pytest.raises(ValueError, match='scope_expanded'):
        module.release_manifests(manifest, SHA)


def test_foreign_change_in_protected_module_blocks_before_write(setup):
    root, _, _, _, _, manifest = setup
    protected = next(n for n in manifest['baseline_files'] if n not in module.FILES)
    (root / protected).write_bytes(b'FOREIGN = True\n')
    with pytest.raises(ValueError, match='drift_before_write'):
        module.verify_state(manifest, SHA)
    assert (root / protected).read_bytes() == b'FOREIGN = True\n'


def test_rollback_checks_every_postimage_before_first_write(setup):
    root, stage, _, _, _, manifest = setup
    originals = {n: (root / n).read_bytes() for n in module.FILES}
    for n in module.FILES:
        (root / n).write_bytes((stage / n).read_bytes())
    foreign = sorted(module.FILES)[-1]
    (root / foreign).write_bytes(b'FOREIGN = True\n')
    observed = {n: (root / n).read_bytes() for n in module.FILES}
    with pytest.raises(ValueError, match='foreign_code'):
        module.rollback_code(manifest, SHA, originals)
    assert observed == {n: (root / n).read_bytes() for n in module.FILES}


def test_rollback_restores_only_four_modules_and_truthful_manifest(setup):
    root, stage, _, _, _, manifest = setup
    originals = {n: (root / n).read_bytes() for n in module.FILES}
    for n in module.FILES:
        (root / n).write_bytes((stage / n).read_bytes())
    module.rollback_code(manifest, SHA, originals)
    assert module.verify_state(manifest, SHA) == 'before'
    assert json.loads((root / '.urtruck-runtime-manifest.json').read_text())['source_sha'] == 'b' * 40


def proof(backups):
    data = {'utc': datetime.now(timezone.utc).isoformat(), 'environment': 'production',
            'database_integrity': 'ok', 'live_overwritten': False, 'cloud_objects_restored': 1}
    data.update({k: True for k in ('database_copy_identical', 'backend_copy_identical',
        'config_copy_identical', 'local_storage_copy_identical', 'cloud_hashes_match', 'cloud_snapshot_stable')})
    path = backups / 'result.json'; path.write_text(json.dumps(data)); path.chmod(0o600)
    return path, data


@pytest.mark.parametrize('failure', ['stale', 'cloud_snapshot_stable', 'config_copy_identical', 'public', 'symlink'])
def test_backup_proof_is_fresh_complete_private_and_not_redirected(setup, failure):
    backups = setup[2]; path, data = proof(backups)
    assert module.full_backup_proof(path)['age_seconds'] <= 1
    if failure == 'stale':
        data['utc'] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    elif failure in data:
        data[failure] = False
    elif failure == 'public':
        path.chmod(0o644)
    elif failure == 'symlink':
        alias = backups / 'alias'; alias.symlink_to(backups, target_is_directory=True); path = alias / path.name
    if failure in data or failure == 'stale':
        path.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        module.full_backup_proof(path)


def test_restart_attempts_both_services_when_first_fails(monkeypatch):
    calls = []
    def fail_first(pm2, command_env, action, identity):
        calls.append(identity)
        if identity == '1':
            raise subprocess.CalledProcessError(1, 'synthetic')
    monkeypatch.setattr(module, 'process', fail_first)
    with pytest.raises(ValueError, match='pair_restart_failed'):
        module.start_pair(Path('/synthetic/pm2'), {}, {'pm_id': '1'}, '2', 200)
    assert calls == ['1', '2']


@pytest.fixture
def running(setup, monkeypatch):
    root, stage, backups, database, allowlist, manifest = setup
    env = {'DB_PATH': str(database), 'pm_id': '1', 'pm_exec_path': '/synthetic/python',
           '_pid': '100', 'PM2_HOME': '/synthetic/pm2'}
    monkeypatch.setattr(module.legacy, 'runtime_identity', lambda **kw: (env, Path('/synthetic/bin/pm2')))
    monkeypatch.setattr(module.legacy, 'release_scheduler', lambda *a: '2')
    monkeypatch.setattr(module, 'scheduler_record', lambda *a: {'pid': 200})
    monkeypatch.setattr(module, 'full_backup_proof', lambda p: {'verified': True})
    monkeypatch.setattr(module, 'rehearsal', lambda *a: {'applied_on_copy': {'cargos': 1, 'trips': 1}})
    monkeypatch.setattr(module.legacy, 'status', lambda *a: 200)
    monkeypatch.setattr(module, 'public_recovery_smoke', lambda *a: {'cargos': 1, 'trips': 1})
    monkeypatch.setattr(module.recovery, 'recover', lambda *a, **kw: {'applied': {'cargos': 1, 'trips': 1}, 'already_matching': 0, 'audit': 'synthetic-audit'})
    calls = []
    monkeypatch.setattr(module, 'stop_pair', lambda *a: calls.append('stop'))
    monkeypatch.setattr(module, 'start_pair', lambda *a: calls.append('start'))
    return setup, calls


def test_preflight_never_changes_live_code_database_or_services(running):
    setup, calls = running
    root, stage, _, database, _, manifest = setup
    before = database.read_bytes()
    result = module.execute(stage, manifest, SHA, 'preflight')
    assert result['status'] == 'PREFLIGHT_ONLY' and not calls
    assert module.verify_state(manifest, SHA) == 'before' and database.read_bytes() == before


def test_partial_stop_failure_attempts_service_recovery_without_code_write(running, monkeypatch):
    setup, calls = running
    root, stage, _, _, _, manifest = setup
    def partial(*a):
        calls.append('scheduler-stopped-api-stop-failed')
        raise ValueError('synthetic stop failure')
    monkeypatch.setattr(module, 'stop_pair', partial)
    with pytest.raises(ValueError, match='synthetic stop'):
        module.execute(stage, manifest, SHA, 'apply', Path('/synthetic/proof'))
    assert calls == ['scheduler-stopped-api-stop-failed', 'start']
    assert module.verify_state(manifest, SHA) == 'before'


def test_partial_copy_failure_restores_four_files_and_preserves_database(running, monkeypatch):
    setup, calls = running
    root, stage, _, database, _, manifest = setup
    original = module.legacy.write_atomic
    failed = False
    def write(path, data, mode=0o600):
        nonlocal failed
        if Path(path).is_relative_to(root) and Path(path).suffix == '.py' and not failed:
            failed = True
            raise OSError('synthetic disk failure')
        return original(path, data, mode)
    monkeypatch.setattr(module.legacy, 'write_atomic', write)
    before = database.read_bytes()
    with pytest.raises(OSError, match='synthetic disk'):
        module.execute(stage, manifest, SHA, 'apply', Path('/synthetic/proof'))
    assert calls == ['stop', 'stop', 'start']
    assert module.verify_state(manifest, SHA) == 'before' and database.read_bytes() == before


def test_post_commit_smoke_failure_keeps_audit_without_restoring_old_database(running, monkeypatch):
    setup, calls = running
    root, stage, backups, database, _, manifest = setup
    def recover(*a, **kw):
        with sqlite3.connect(database) as c:
            c.execute("INSERT INTO sentinel VALUES('concurrent','keep-new-data')")
        return {'applied': {'cargos': 1, 'trips': 1}, 'already_matching': 0, 'audit': 'synthetic-audit'}
    monkeypatch.setattr(module.recovery, 'recover', recover)
    def fail(*a):
        raise ValueError('synthetic smoke failure')
    monkeypatch.setattr(module, 'public_recovery_smoke', fail)
    with pytest.raises(ValueError, match='synthetic smoke'):
        module.execute(stage, manifest, SHA, 'apply', Path('/synthetic/proof'))
    with sqlite3.connect(database) as c:
        assert c.execute('SELECT count(*) FROM sentinel').fetchone()[0] == 2
    assert module.verify_state(manifest, SHA) == 'after'
    result = json.loads(next(backups.glob('owned-listings-*/result.json')).read_text())
    assert result['status'] == 'CODE_ACTIVE_RECOVERY_REQUIRES_INSPECTION'
    assert result['recovery_audit'] == 'synthetic-audit'


def test_drift_while_stopping_services_is_not_overwritten_or_rolled_back(running, monkeypatch):
    setup, calls = running
    root, stage, _, _, _, manifest = setup
    foreign = sorted(module.FILES)[0]
    def changed_during_stop(*a):
        calls.append('stop')
        (root / foreign).write_bytes(b'FOREIGN = True\n')
    monkeypatch.setattr(module, 'stop_pair', changed_during_stop)
    with pytest.raises(ValueError, match='drift_before_write'):
        module.execute(stage, manifest, SHA, 'apply', Path('/synthetic/proof'))
    assert (root / foreign).read_bytes() == b'FOREIGN = True\n'
    assert calls == ['stop', 'start']
