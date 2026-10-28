"""Сохранность credential и чужих настроек при исправлении timeout."""
import importlib
import sys
from pathlib import Path

import pytest
from test_production_openai_key_rotation import context  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/ops'))
sync = importlib.import_module('production_voice_timeout_sync')
REAL_RESTART = sync.restart


@pytest.fixture
def configured(context, monkeypatch):
    def restart(before):
        for row in context['rows'].values():
            row['pid'] += 10
    monkeypatch.setattr(sync, 'restart', restart)
    return context


def test_success_changes_only_timeout_and_keeps_keys_models_dumps(configured):
    result = sync.apply('123', 'a' * 40)
    before = configured['files'][configured['env']]
    assert configured['env'].read_bytes() == before + b'QA2_OPENAI_STT_TIMEOUT_SECONDS=8\n'
    assert result['openai_key_unchanged'] and result['pm2_environment_unchanged']
    assert all(path.read_bytes() == configured['files'][path] for path in configured['dumps'])


def test_failed_restart_restores_exact_env(configured, monkeypatch):
    calls = []
    def restart(before):
        calls.append(1)
        if len(calls) == 1:
            raise ValueError('health_failed')
    monkeypatch.setattr(sync, 'restart', restart)
    with pytest.raises(ValueError, match='timeout_sync_failed_rollback_verified'):
        sync.apply('123', 'a' * 40)
    assert len(calls) == 2
    assert configured['env'].read_bytes() == configured['files'][configured['env']]


def test_foreign_env_edit_after_write_is_not_overwritten(configured, monkeypatch):
    def restart(before):
        configured['env'].write_text('OWNER=changed\n')
    monkeypatch.setattr(sync, 'restart', restart)
    with pytest.raises(ValueError, match='timeout_sync_failed_rollback_failed'):
        sync.apply('123', 'a' * 40)
    assert configured['env'].read_text() == 'OWNER=changed\n'


def test_pm2_override_refused_before_environment_write(configured):
    configured['rows'][sync.rotation.NAMES[1]]['pm2_env']['env'][sync.SETTING] = '120'
    with pytest.raises(ValueError, match='incompatible_pm2_timeout_override'):
        sync.apply('123', 'a' * 40)
    assert configured['env'].read_bytes() == configured['files'][configured['env']]


@pytest.mark.parametrize('data', [b'KEY=value\n', b'KEY=value', b'export QA2_OPENAI_STT_TIMEOUT_SECONDS=120\nKEY=value\n'])
def test_timeout_patch_preserves_other_lines(data):
    result = sync.patch_timeout(data)
    assert result.count(b'QA2_OPENAI_STT_TIMEOUT_SECONDS=8\n') == 1
    assert b'KEY=value' in result


def test_ambiguous_timeout_refused():
    with pytest.raises(ValueError, match='timeout_setting_ambiguous'):
        sync.patch_timeout(b'QA2_OPENAI_STT_TIMEOUT_SECONDS=5\nexport QA2_OPENAI_STT_TIMEOUT_SECONDS=8\n')


def test_restart_does_not_send_caller_environment(configured, monkeypatch):
    from unittest.mock import Mock
    command = Mock()
    monkeypatch.setattr(sync.rotation, 'pm2', command)
    monkeypatch.setattr(sync.rotation.runtime, 'wait_healthy', Mock())
    # Вызывается настоящий restart, подменяется только транспорт PM2.
    for row in configured['rows'].values():
        row['pm2_env']['pm_exec_path'] = '/usr/bin/python3'
    REAL_RESTART(sync.rotation.processes())
    assert [call.args[0] for call in command.call_args_list] == [['restart', '0'], ['restart', '1']]
    assert all(len(call.args) == 1 for call in command.call_args_list)


def test_timeout_job_uses_protected_main_and_excludes_key_secret():
    import yaml
    caller = yaml.safe_load((ROOT / '.github/workflows/sync-production-openai-key.yml').read_text())
    job = caller['jobs']['timeout']
    assert job['uses'].endswith('production-deploy-execute.yml@main')
    assert job['needs'] == ['quality-gate']
    assert job['with']['operation'] == 'sync_voice_timeout'
    assert 'OPENAI_API_KEY' not in job['secrets']
    executor = yaml.safe_load((ROOT / '.github/workflows/production-deploy-execute.yml').read_text())
    assert executor['jobs']['sync-voice-timeout']['environment'] == 'production'
