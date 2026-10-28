"""Отказ до записи, сохранность настроек и rollback ротации credential."""
import copy
import importlib
import json
from pathlib import Path
import sys
from unittest.mock import Mock

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/ops'))
rotation = importlib.import_module('production_openai_key_rotation')
REAL_RESTART = rotation.restart
REAL_SUBPROCESS_RUN = rotation.subprocess.run
OLD = 'sk-' + 'o' * 40
NEW = 'sk-' + 'n' * 40


@pytest.fixture
def context(tmp_path, monkeypatch):
    backend = tmp_path / 'backend'
    backend.mkdir()
    backup = tmp_path / 'backups'
    backup.mkdir()
    env = backend / '.env'
    env.write_text('OTHER=unchanged\nOPENAI_API_KEY=' + OLD + '\nAFTER=yes\n')
    rows = {name: {'name': name, 'pm_id': i, 'pid': 100 + i,
                  'pm2_env': {'env': {rotation.KEY: OLD, 'OTHER': name},
                              rotation.KEY: OLD, 'pm_cwd': str(backend)}}
            for i, name in enumerate(rotation.NAMES)}
    dump_rows = [dict(row['pm2_env'], name=name) for name, row in rows.items()]
    dump_rows.append({'name': 'unrelated', 'env': {'PRIVATE': 'preserved'}})
    dumps = tuple(tmp_path / name for name in ('dump.pm2', 'dump.pm2.bak'))
    for path in dumps:
        path.write_text(json.dumps(dump_rows))
    monkeypatch.setattr(rotation.runtime, 'ROOT', backend)
    monkeypatch.setattr(rotation.runtime, 'BACKUP_ROOT', backup)
    monkeypatch.setattr(rotation, 'DUMPS', dumps)
    monkeypatch.setattr(rotation.runtime, 'runtime_identity', Mock(return_value=({}, None)))
    monkeypatch.setattr(rotation, 'source_hashes', Mock(return_value={'main.py': 'fixed'}))
    monkeypatch.setattr(rotation, 'processes', lambda: copy.deepcopy(rows))
    provider = Mock()
    monkeypatch.setattr(rotation, 'provider_check', provider)

    def restart(before, keys):
        for name in rotation.NAMES:
            rows[name]['pid'] += 10
            rows[name]['pm2_env']['env'][rotation.KEY] = keys[name]
            rows[name]['pm2_env'][rotation.KEY] = keys[name]

    monkeypatch.setattr(rotation, 'restart', restart)
    monkeypatch.setattr(rotation, 'verify_processes', Mock())
    return {'env': env, 'dumps': dumps, 'rows': rows, 'provider': provider,
            'files': {p: p.read_bytes() for p in (env, *dumps)}, 'backup': backup}


def test_success_preserves_every_other_setting_and_saves_closed_backup(context):
    result = rotation.apply(NEW, '123', 'a' * 40)
    assert result['status'] == 'OPENAI_KEY_ROTATED'
    assert context['env'].read_text() == 'OTHER=unchanged\nOPENAI_API_KEY=' + NEW + '\nAFTER=yes\n'
    for path in context['dumps']:
        before, after = json.loads(context['files'][path]), json.loads(path.read_bytes())
        for row in before[:2]:
            row[rotation.KEY] = NEW
            row['env'][rotation.KEY] = NEW
        assert after == before
        assert path.stat().st_mode & 0o077 == 0
    backup = next(context['backup'].glob('openai-key-rotation-*'))
    assert backup.stat().st_mode & 0o077 == 0
    assert (backup / 'configuration-0').read_bytes() == context['files'][context['env']]
    assert NEW not in json.dumps(result) and OLD not in json.dumps(result)


def test_rejected_provider_key_does_not_mutate_any_configuration(context):
    context['provider'].side_effect = ValueError('provider_http_401')
    with pytest.raises(ValueError, match='provider_http_401'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert all(path.read_bytes() == old for path, old in context['files'].items())
    assert not list(context['backup'].glob('openai-key-rotation-*'))


def test_health_failure_rolls_back_config_and_process_credentials(context, monkeypatch):
    restart = rotation.restart
    calls = []

    def failing(before, keys):
        calls.append(keys)
        restart(before, keys)
        if len(calls) == 1:
            raise ValueError('production_health_failed')

    monkeypatch.setattr(rotation, 'restart', failing)
    with pytest.raises(ValueError, match='rotation_failed_rollback_verified'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert len(calls) == 2
    assert all(path.read_bytes() == old for path, old in context['files'].items())
    assert all(context['rows'][n]['pm2_env']['env'][rotation.KEY] == OLD for n in rotation.NAMES)


def test_concurrent_env_change_before_mutation_is_not_rolled_back(context):
    context['provider'].side_effect = lambda key: context['env'].write_text('OWNER=changed\n')
    with pytest.raises(ValueError, match='production_changed_before_mutation'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert context['env'].read_text() == 'OWNER=changed\n'


def test_concurrent_change_after_our_write_is_not_overwritten(context, monkeypatch):
    def conflicting(before, keys):
        context['env'].write_text('OWNER=changed\n')
        raise ValueError('simulated_failure')

    monkeypatch.setattr(rotation, 'restart', conflicting)
    with pytest.raises(ValueError, match='rotation_failed_rollback_failed'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert context['env'].read_text() == 'OWNER=changed\n'


@pytest.mark.parametrize('contents', ['bad', NEW + '\nINJECT=value', ' ' + NEW])
def test_secret_input_rejects_malformed_data_without_echo(tmp_path, contents):
    path = tmp_path / 'secret'
    path.write_text(contents)
    path.chmod(0o600)
    with pytest.raises(ValueError, match='invalid_secret_format') as error:
        rotation.read_key(path)
    assert contents not in str(error.value)


def test_secret_input_requires_closed_regular_file(tmp_path):
    path = tmp_path / 'secret'
    path.write_text(NEW)
    path.chmod(0o644)
    with pytest.raises(ValueError, match='unsafe_secret_input'):
        rotation.read_key(path)
    path.chmod(0o600)
    assert rotation.read_key(path) == NEW
    link = tmp_path / 'link'
    link.symlink_to(path)
    with pytest.raises(ValueError, match='unsafe_secret_input'):
        rotation.read_key(link)


@pytest.mark.parametrize('contents', [b'OTHER=yes\n', b'OPENAI_API_KEY=a\nexport OPENAI_API_KEY=b\n'])
def test_env_missing_or_duplicate_key_fails_closed(contents):
    with pytest.raises(ValueError, match='environment_key_not_unique'):
        rotation.replace_env(contents, NEW)


def test_changed_dump_process_identity_fails_before_writes(context):
    path = context['dumps'][1]
    rows = json.loads(path.read_bytes())
    rows[0]['pm_cwd'] = '/different'
    path.write_text(json.dumps(rows))
    with pytest.raises(ValueError, match='dump_process_identity_changed'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert context['env'].read_bytes() == context['files'][context['env']]


def test_volatile_pm2_metrics_do_not_invalidate_same_process(context):
    before = copy.deepcopy(context['rows'])
    after = copy.deepcopy(before)
    after[rotation.NAMES[0]]['monit'] = {'cpu': 15}
    assert rotation.same_processes(before, after)
    after[rotation.NAMES[0]]['pm2_env']['env']['OTHER'] = 'different'
    assert not rotation.same_processes(before, after)


def test_real_restart_and_rollback_preserve_concurrent_foreign_env(context, monkeypatch):
    rows = context['rows']
    calls = []

    def rpc(identity, key):
        name = next(n for n in rotation.NAMES if rows[n]['pm_id'] == identity)
        rows[name]['pm2_env']['env'][rotation.KEY] = key
        rows[name]['pm2_env'][rotation.KEY] = key
        rows[name]['pid'] += 10
        calls.append((name, key))
        if len(calls) == 1:
            rows[name]['pm2_env']['env']['OTHER'] = 'foreign-live-change'

    def verify(before, key, restarted):
        assert rows[rotation.NAMES[0]]['pm2_env']['env']['OTHER'] == 'foreign-live-change'
        raise ValueError('process_configuration_not_preserved')

    monkeypatch.setattr(rotation, 'restart', REAL_RESTART)
    monkeypatch.setattr(rotation, 'pm2_restart_key', rpc)
    monkeypatch.setattr(rotation, 'verify_processes', verify)
    monkeypatch.setattr(rotation.runtime, 'status', lambda path: 200)
    monkeypatch.setattr(rotation.runtime, 'runtime_identity',
                        lambda **kwargs: ({rotation.KEY: rows[rotation.NAMES[0]]['pm2_env']['env'][rotation.KEY]}, None))
    with pytest.raises(ValueError, match='rotation_failed_rollback_verified'):
        rotation.apply(NEW, '123', 'a' * 40)
    assert len(calls) == 4
    assert rows[rotation.NAMES[0]]['pm2_env']['env']['OTHER'] == 'foreign-live-change'
    assert all(rows[n]['pm2_env']['env'][rotation.KEY] == OLD for n in rotation.NAMES)


def test_real_restart_refuses_foreign_launch_identity(context, monkeypatch):
    before = copy.deepcopy(context['rows'])
    context['rows'][rotation.NAMES[0]]['pm2_env']['pm_cwd'] = '/different'
    rpc = Mock()
    monkeypatch.setattr(rotation, 'pm2_restart_key', rpc)
    with pytest.raises(ValueError, match='process_changed_before_restart'):
        REAL_RESTART(before, {n: NEW for n in rotation.NAMES})
    rpc.assert_not_called()


def test_pm2_rpc_sends_only_key_and_keeps_secret_out_of_arguments(monkeypatch):
    run = Mock()
    monkeypatch.setattr(rotation.subprocess, 'run', run)
    rotation.pm2_restart_key(3, NEW)
    args, kwargs = run.call_args
    assert NEW not in json.dumps(args)
    assert NEW not in json.dumps(kwargs['env'])
    assert json.loads(kwargs['input']) == {'id': 3, 'key': NEW}
    script = args[0][2]
    assert 'env: { OPENAI_API_KEY: value.key }' in script
    assert 'process.env' not in script
    # Проверяется настоящий JS, чтобы опечатка в RPC не попала на сервер.
    REAL_SUBPROCESS_RUN(['node', '--check'], input=script, text=True, check=True, capture_output=True)


def test_workflow_remains_protected_and_uses_existing_executor():
    import yaml
    workflow = yaml.safe_load((ROOT / '.github/workflows/sync-production-openai-key.yml').read_text())
    sync = workflow['jobs']['sync']
    assert sync['needs'] == ['quality-gate']
    assert sync['uses'].endswith('production-deploy-execute.yml@main')
    assert sync['with']['operation'] == 'sync_openai_key'
    executor = yaml.safe_load((ROOT / '.github/workflows/production-deploy-execute.yml').read_text())
    assert executor['jobs']['sync-openai-key']['environment'] == 'production'
    validation = executor['jobs']['validate-scope']['steps'][0]['run']
    assert 'sync_openai_key:full)' in validation
    assert 'test "$CALLER_REF" = refs/heads/main' in validation
    assert 'test "$CALLER_SHA" = "$DEPLOY_SHA"' in validation
