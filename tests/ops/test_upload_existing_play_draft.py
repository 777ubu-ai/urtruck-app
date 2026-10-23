"""Синтетические проверки загрузки AAB: ни один тест не обращается к Google."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('play_draft', ROOT / 'scripts/ops/upload_existing_play_draft.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize('existing', [False, True])
def test_only_draft_saved_and_existing_active_release_preserved(existing):
    active = {'status': 'completed', 'versionCodes': ['214552884'], 'name': 'existing'}
    track = {'track': 'internal', 'releases': [active]}
    calls = []
    def call(url, method='GET', payload=None):
        calls.append((url, method, copy.deepcopy(payload)))
        if url == module.API + '/edits':
            return {'id': 'synthetic-edit'}
        if url.endswith('/tracks/internal'):
            if method == 'PUT':
                track.update(payload)
            return copy.deepcopy(track)
        if url.endswith('/bundles'):
            return {'bundles': [{'versionCode': int(module.VERSION), 'sha256': module.SHA256}] if existing else []}
        if 'uploadType=media' in url:
            return {'versionCode': int(module.VERSION), 'sha256': module.SHA256}
        return {}
    result = module.upload(b'synthetic-not-a-real-bundle', call)
    assert result['status'] == 'INTERNAL_DRAFT_SAVED'
    assert track['releases'][0] == active
    assert track['releases'][1]['status'] == 'draft'
    assert track['releases'][1]['versionCodes'] == [module.VERSION]
    assert sum('uploadType=media' in url for url, _, _ in calls) == int(not existing)
    assert calls[-1][0].endswith(':commit?changesNotSentForReview=true')
    assert not any('/tracks/production' in url for url, _, _ in calls)
    assert not result['review_submitted'] and not result['published']


@pytest.mark.parametrize('failure', ['other_draft', 'active', 'hash', 'upload', 'readback', 'validate'])
def test_error_never_commits_or_replaces_other_draft(failure):
    calls = []
    def call(url, method='GET', payload=None):
        calls.append((url, method))
        if url == module.API + '/edits':
            return {'id': 'synthetic-edit'}
        if url.endswith('/tracks/internal'):
            if method == 'PUT':
                return {'track': 'internal', 'releases': []} if failure == 'readback' else payload
            releases = []
            if failure == 'other_draft':
                releases = [{'status': 'draft', 'versionCodes': ['123']}]
            elif failure == 'active':
                releases = [{'status': 'completed', 'versionCodes': [module.VERSION]}]
            return {'track': 'internal', 'releases': releases}
        if url.endswith('/bundles'):
            return {'bundles': [{'versionCode': int(module.VERSION), 'sha256': 'wrong'}] if failure == 'hash' else []}
        if 'uploadType=media' in url:
            return {'versionCode': 123 if failure == 'upload' else int(module.VERSION), 'sha256': module.SHA256}
        if url.endswith(':validate'):
            raise ValueError('synthetic_validation_failed')
        raise AssertionError('Недопустимый commit после ошибки')
    with pytest.raises(ValueError):
        module.upload(b'synthetic', call)
    assert not any(':commit' in url for url, _ in calls)
    if failure == 'other_draft':
        assert not any('uploadType=media' in url or method == 'PUT' for url, method in calls)


@pytest.mark.parametrize('field,value', [('id', 1), ('head_sha', 'bad'), ('event', 'pull_request'),
                                         ('status', 'in_progress'), ('conclusion', 'failure'),
                                         ('path', '.github/workflows/other.yml'), ('repository', {})])
def test_untrusted_run_refused_before_artifact_or_credential_access(tmp_path, field, value):
    metadata = {'id': 39959276862, 'head_sha': module.SOURCE, 'event': 'workflow_dispatch',
                'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/deploy-play.yml',
                'repository': {'full_name': '777ubu-ai/urtruck-app'}}
    metadata[field] = value
    (tmp_path / 'aab-run.json').write_text(json.dumps(metadata))
    with pytest.raises(ValueError, match='unexpected_artifact_provenance'):
        module.verify(tmp_path)


def test_workflow_secrets_only_upload_step_and_no_build_or_dependency_execution():
    workflow = yaml.safe_load((ROOT / '.github/workflows/upload-existing-play-internal-draft.yml').read_text())
    job = workflow['jobs']['upload-draft']
    assert "github.ref == 'refs/heads/main'" in job['if']
    assert 'UPLOAD_INTERNAL_DRAFT' in job['if']
    assert 'env' not in job
    assert workflow['permissions'] == {'contents': 'read', 'actions': 'read'}
    secret_steps = [step for step in job['steps'] if 'PLAY_SERVICE_ACCOUNT_JSON' in str(step)]
    assert len(secret_steps) == 1 and secret_steps[0] is job['steps'][-1]
    assert not any(word in str(job['steps']) for word in ['npm ', 'gradlew', 'pip install', 'eas '])


@pytest.mark.parametrize('failure', [None, 'checksum', 'extra', 'size', 'filename'])
def test_zip_metadata_and_actual_bytes_are_verified(tmp_path, monkeypatch, failure):
    metadata = {'id': 39959276862, 'head_sha': module.SOURCE, 'event': 'workflow_dispatch',
                'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/deploy-play.yml',
                'repository': {'full_name': '777ubu-ai/urtruck-app'}}
    (tmp_path / 'aab-run.json').write_text(json.dumps(metadata))
    data = b'synthetic-aab-content'
    monkeypatch.setattr(module, 'SHA256', hashlib.sha256(data).hexdigest())
    entry = SimpleNamespace(filename='app-release.aab', file_size=145323685)
    if failure == 'size':
        entry.file_size = 1
    if failure == 'filename':
        entry.filename = 'other.aab'
    class Archive:
        def __init__(self, path):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def infolist(self):
            return [entry, entry] if failure == 'extra' else [entry]
        def read(self, member):
            return b'changed' if failure == 'checksum' else data
    monkeypatch.setattr(module.zipfile, 'ZipFile', Archive)
    if failure:
        with pytest.raises(ValueError):
            module.verify(tmp_path)
    else:
        assert module.verify(tmp_path) == data
