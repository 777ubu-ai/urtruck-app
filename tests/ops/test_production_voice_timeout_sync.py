"""Timeout передаётся настоящему scheduler env без изменения credential."""
import copy
import importlib
import json
from pathlib import Path
import sys
from unittest.mock import Mock

import pytest
from test_production_openai_key_rotation import context  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/ops'))
sync = importlib.import_module('production_voice_timeout_sync')
REAL_RUN = sync.subprocess.run


@pytest.fixture
def configured(context, monkeypatch):
    calls = []
    def rpc(args, **kwargs):
        value = json.loads(kwargs['input'])
        row = context['rows'][sync.NAME]
        assert value['id'] == row['pm_id']
        row['pm2_env']['env'][sync.SETTING] = value['timeout']
        row['pm2_env'][sync.SETTING] = value['timeout']
        row['pid'] += 10
        calls.append((args, kwargs))
    monkeypatch.setattr(sync.subprocess, 'run', rpc)
    read_text = Path.read_text
    def read(path, *args, **kwargs):
        if str(path).startswith('/proc/') and str(path).endswith('/environ'):
            return '\0'.join(k+'='+v for k,v in context['rows'][sync.NAME]['pm2_env']['env'].items())
        return read_text(path, *args, **kwargs)
    monkeypatch.setattr(Path, 'read_text', read)
    monkeypatch.setattr(sync.rotation.runtime, 'status', lambda path: 200)
    context['rpc_calls'] = calls
    return context


def test_effective_scheduler_env_and_dump_updated_without_touching_key_or_backend_env(configured):
    before = copy.deepcopy(configured['rows'])
    result = sync.apply('123', 'a'*40)
    assert result['scheduler_effective_timeout_verified']
    assert configured['rows'][sync.NAME]['pm2_env']['env'][sync.SETTING] == '8'
    assert configured['env'].read_bytes() == configured['files'][configured['env']]
    assert configured['rows'][sync.rotation.NAMES[0]] == before[sync.rotation.NAMES[0]]
    for path in configured['dumps']:
        old = json.loads(configured['files'][path])
        row = next(r for r in old if r.get('name') == sync.NAME)
        row.setdefault('env',{})[sync.SETTING]='8'; row[sync.SETTING]='8'
        assert json.loads(path.read_bytes()) == old
    args, kwargs = configured['rpc_calls'][0]
    assert set(json.loads(kwargs['input'])) == {'id','timeout'}
    assert 'OPENAI_API_KEY' not in args[2] and 'process.env' not in args[2]
    REAL_RUN(['node','--check'],input=args[2],text=True,capture_output=True,check=True)


def test_failed_verification_restores_dumps_and_semantic_absence(configured, monkeypatch):
    monkeypatch.setattr(sync,'verify',Mock(side_effect=ValueError('health_failed')))
    with pytest.raises(ValueError,match='timeout_sync_failed_rollback_verified'):
        sync.apply('123','a'*40)
    assert len(configured['rpc_calls'])==2
    assert configured['rows'][sync.NAME]['pm2_env']['env'][sync.SETTING] == ''
    assert all(p.read_bytes()==b for p,b in configured['files'].items())


def test_foreign_timeout_preserved_after_first_rpc(configured,monkeypatch):
    def changed(before):
        configured['rows'][sync.NAME]['pm2_env']['env'][sync.SETTING]='5'
        raise ValueError('foreign_timeout')
    monkeypatch.setattr(sync,'verify',changed)
    with pytest.raises(ValueError,match='timeout_sync_failed_rollback_failed'):
        sync.apply('123','a'*40)
    assert len(configured['rpc_calls'])==1
    assert configured['rows'][sync.NAME]['pm2_env']['env'][sync.SETTING]=='5'


def test_foreign_other_setting_preserved_on_rollback(configured,monkeypatch):
    def changed(before):
        configured['rows'][sync.NAME]['pm2_env']['env']['OTHER']='foreign'
        raise ValueError('foreign_setting')
    monkeypatch.setattr(sync,'verify',changed)
    with pytest.raises(ValueError,match='timeout_sync_failed_rollback_verified'):
        sync.apply('123','a'*40)
    assert configured['rows'][sync.NAME]['pm2_env']['env']['OTHER']=='foreign'


@pytest.mark.parametrize('value',['','120'])
def test_unknown_live_override_blocks_before_write(configured,value):
    configured['rows'][sync.NAME]['pm2_env']['env'][sync.SETTING]=value
    with pytest.raises(ValueError,match='unexpected_scheduler_timeout'):
        sync.apply('123','a'*40)
    assert not configured['rpc_calls']
    assert all(p.read_bytes()==b for p,b in configured['files'].items())


def test_duplicate_dump_scheduler_rejected_before_write(configured):
    path=configured['dumps'][0];rows=json.loads(path.read_bytes());rows.append(copy.deepcopy(rows[1]));path.write_text(json.dumps(rows))
    with pytest.raises(ValueError,match='dump_scheduler_not_unique'):
        sync.apply('123','a'*40)
    assert not configured['rpc_calls']


def test_timeout_job_is_protected_and_excludes_key_secret():
    import yaml
    caller=yaml.safe_load((ROOT/'.github/workflows/sync-production-openai-key.yml').read_text());job=caller['jobs']['timeout']
    assert job['uses'].endswith('production-deploy-execute.yml@main')
    assert job['needs']==['quality-gate'] and job['with']['operation']=='sync_voice_timeout'
    assert 'OPENAI_API_KEY' not in job['secrets']
    executor=yaml.safe_load((ROOT/'.github/workflows/production-deploy-execute.yml').read_text())
    assert executor['jobs']['sync-voice-timeout']['environment']=='production'
