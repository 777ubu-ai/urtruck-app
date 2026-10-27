"""Установка своего потока требует точного QA2 SHA; dry-run ничего не меняет."""
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


@pytest.fixture
def installer(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location('owned_installer', root/'scripts/qa/install_owned_feed_qa2.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    qa = tmp_path/'qa2'; collector = tmp_path/'collector'
    (qa/'backend').mkdir(parents=True); collector.mkdir()
    (qa/'backend/.qa-source-sha').write_text('a'*40)
    (qa/'external-feed-bridge.env').write_text('EXTERNAL_FREIGHT_API_URL=https://qa2.urtruck.kz\n'
        'EXTERNAL_FREIGHT_IMPORTER_KEY=synthetic-secret\n'
        f'EXTERNAL_FREIGHT_SOURCE_DB={collector}/state/feed.sqlite3\n')
    (collector/'.env').write_text('PUBLISH_ENABLED=true\nTELEGRAM_API_HASH=synthetic-hash\n')
    monkeypatch.setattr(module, 'QA', qa); monkeypatch.setattr(module, 'COLLECTOR', collector)
    def forbidden(*args, **kwargs):
        raise AssertionError('dry-run не должен вызывать системные команды или делать backup')
    monkeypatch.setattr(module, 'command', forbidden); monkeypatch.setattr(module, 'sqlite_backup', forbidden)
    digest = hashlib.sha256((root/'ops/telegram-feed/feed.py').read_bytes()).hexdigest()
    monkeypatch.setattr('sys.argv', ['installer', '--source-sha', 'a'*40, '--collector-sha256', digest])
    return module, qa, collector


def test_default_dry_run_has_no_mutations_or_secrets(installer, capsys):
    module, qa, collector = installer
    before = {str(p): p.read_bytes() for p in qa.parent.rglob('*') if p.is_file()}
    module.main()
    output = capsys.readouterr().out
    assert json.loads(output)['status'] == 'dry_run'
    assert 'synthetic-secret' not in output and 'synthetic-hash' not in output
    assert before == {str(p): p.read_bytes() for p in qa.parent.rglob('*') if p.is_file()}


@pytest.mark.parametrize('failure', ['production', 'stale_sha'])
def test_wrong_environment_or_source_is_rejected_before_mutation(installer, failure):
    module, qa, collector = installer
    if failure == 'production':
        path = qa/'external-feed-bridge.env'
        path.write_text(path.read_text().replace('https://qa2.urtruck.kz', 'https://urtruck.kz'))
    else:
        (qa/'backend/.qa-source-sha').write_text('b'*40)
    with pytest.raises(ValueError, match='qa2_'):
        module.main()
    assert not (qa/'external-feed-owned.env').exists()


def test_enabling_owned_preserves_publisher_and_other_settings(installer):
    module, _, _ = installer
    text = 'PUBLISH_ENABLED=true\nSECRET=synthetic#value\nOWNED_FEED_ENABLED=false\n'
    updated = module.updated_env(text, {'OWNED_FEED_ENABLED': 'true', 'OWNED_TELEGRAM_CTA_ENABLED': 'false'})
    assert 'PUBLISH_ENABLED=true\nSECRET=synthetic#value\n' in updated
    assert updated.count('OWNED_FEED_ENABLED=') == 1
    assert 'OWNED_TELEGRAM_CTA_ENABLED=false' in updated
