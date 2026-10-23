"""Проверки явного выбора окружения без сетевых вызовов и рабочих БД."""
import pytest
from services.external_freight_queue_bridge import validate_qa_target

STATE='/home/ubuntu/urtruck/runtime/external-feed/adapter.sqlite3'

def test_default_remains_qa2(monkeypatch):
    monkeypatch.delenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET', raising=False)
    validate_qa_target('https://qa2.urtruck.kz')
    with pytest.raises(ValueError,match='qa2_target_required'):
        validate_qa_target('https://urtruck.kz',state_path=STATE)

def test_production_requires_explicit_separate_state(monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET','production')
    validate_qa_target('https://urtruck.kz',state_path=STATE)
    for path in (None,'adapter.sqlite3','/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3','/home/ubuntu/urtruck/backend/database/security.db','/home/ubuntu/urtruck/runtime/external-feed'):
        with pytest.raises(ValueError,match='separate_production_state_required'):
            validate_qa_target('https://urtruck.kz',state_path=path)

@pytest.mark.parametrize('url',['http://urtruck.kz','https://qa2.urtruck.kz','https://urtruck.kz:443','https://urtruck.kz/api','https://urtruck.kz?x=1','https://urtruck.kz#x','https://u:p@urtruck.kz','https://urtruck.kz.evil.test'])
def test_production_rejects_ambiguous_destinations(monkeypatch,url):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET','production')
    with pytest.raises(ValueError):validate_qa_target(url,state_path=STATE)

def test_unknown_target_does_not_fall_back(monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET','prod-typo')
    with pytest.raises(ValueError,match='external_feed_target_required'):validate_qa_target('https://qa2.urtruck.kz')


def test_production_root_symlink_cannot_redirect_into_qa2(monkeypatch):
    from pathlib import Path
    monkeypatch.setenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET','production')
    original=Path.resolve
    root=Path('/home/ubuntu/urtruck/runtime/external-feed')
    monkeypatch.setattr(Path,'resolve',lambda path,*a,**k: Path('/home/ubuntu/urtruck-qa2/external-feed') if path==root else original(path,*a,**k))
    with pytest.raises(ValueError,match='separate_production_state_required'):
        validate_qa_target('https://urtruck.kz',state_path=STATE)


def test_invalid_production_cli_never_opens_adapter_state(monkeypatch,tmp_path):
    from services import external_freight_queue_bridge as bridge
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    monkeypatch.setenv('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET','production')
    monkeypatch.setenv('EXTERNAL_FREIGHT_API_URL','https://urtruck.kz')
    monkeypatch.setenv('EXTERNAL_FREIGHT_SOURCE_DB',str(tmp_path/'source.sqlite3'))
    state=tmp_path/'qa2.sqlite3'
    monkeypatch.setenv('EXTERNAL_FREIGHT_ADAPTER_DB',str(state))
    def unexpected_adapter():raise AssertionError('SQLite адаптера не должен открываться')
    monkeypatch.setattr(bridge,'ExternalFreightFeedAdapter',unexpected_adapter)
    with pytest.raises(ValueError,match='separate_production_state_required'):bridge.main()
    assert not state.exists()
