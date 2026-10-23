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


class FakePlay:
    def __init__(self, *, existing=False, failure=None, empty_draft=False):
        self.failure, self.calls, self.edit, self.track_reads = failure, [], 0, 0
        self.bundle = {'versionCode': int(module.VERSION), 'sha256': module.SHA256}
        self.saved = copy.deepcopy(self.bundle) if existing else None
        self.track = {'track': 'internal', 'releases': [
            {'status': 'completed', 'versionCodes': ['214552884'], 'name': 'existing'},
            {'status': 'draft', 'name': 'manager draft', 'releaseNotes': [{'language':'ru-RU','text':'existing'}],
             **({} if empty_draft else {'versionCodes': ['123']})}]}

    def __call__(self, url, method='GET', payload=None):
        self.calls.append((url, method))
        if '/tracks/' in url:
            assert method == 'GET', 'Ни один трек нельзя менять'
        if url == module.API + '/edits':
            self.edit += 1
            return {'id': f'edit-{self.edit}'}
        if url.endswith('/tracks/internal'):
            self.track_reads += 1
            value = copy.deepcopy(self.track)
            if (self.failure == 'prechange' and self.track_reads == 2
                    or self.failure == 'postchange' and self.edit == 2):
                value['releases'][0]['name'] = 'concurrent change'
            return value
        if url.endswith('/bundles'):
            bundle = copy.deepcopy(self.saved)
            if self.failure == 'hash' and bundle:
                bundle['sha256'] = 'wrong'
            return {'bundles': [bundle] if bundle else []}
        if 'uploadType=media' in url:
            return {**self.bundle, 'versionCode': 123} if self.failure == 'upload' else self.bundle
        if url.endswith(':validate'):
            if self.failure == 'validate':
                raise ValueError('synthetic_validation_failed')
            return {}
        if ':commit?' in url:
            if self.failure == 'review':
                raise RuntimeError('play_http_400')
            if self.failure != 'lost_before':
                self.saved = copy.deepcopy(self.bundle)
            if self.failure in {'lost_before', 'lost_after'}:
                raise module.urllib.error.URLError('synthetic_response_lost')
            return {}
        raise AssertionError('Неожиданный запрос')


@pytest.mark.parametrize('existing', [False, True])
@pytest.mark.parametrize('empty_draft', [False, True])
def test_library_upload_preserves_other_draft_and_active_release(existing, empty_draft):
    call = FakePlay(existing=existing, empty_draft=empty_draft)
    original = copy.deepcopy(call.track)
    result = module.upload(b'synthetic-not-a-real-bundle', call)
    assert result['status'] == 'BUNDLE_LIBRARY_SAVED'
    assert result['internal_track_unchanged'] and not result['assigned_by_this_operation']
    assert result['existing_internal_statuses'] == []
    assert call.track == original
    assert sum('uploadType=media' in url for url, _ in call.calls) == int(not existing)
    commits = [url for url, _ in call.calls if ':commit' in url]
    assert len(commits) == int(not existing)
    assert all('changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW' in url for url in commits)
    assert call.edit == 2
    assert not any('/tracks/production' in url or method in {'PUT','PATCH','DELETE'} for url, method in call.calls)
    assert not result['review_submitted_by_this_operation'] and not result['published_by_this_operation']


@pytest.mark.parametrize('failure', ['hash', 'upload', 'prechange', 'validate'])
def test_error_before_commit_does_not_change_track_or_commit(failure):
    call = FakePlay(existing=failure == 'hash', failure=failure)
    original = copy.deepcopy(call.track)
    with pytest.raises(ValueError):
        module.upload(b'synthetic', call)
    assert call.track == original
    assert not any(':commit' in url for url, _ in call.calls)


def test_review_in_progress_refusal_has_no_fallback_commit():
    call = FakePlay(failure='review')
    with pytest.raises(RuntimeError, match='play_http_400'):
        module.upload(b'synthetic', call)
    commits = [url for url, _ in call.calls if ':commit' in url]
    assert len(commits) == 1
    assert 'changesInReviewBehavior=ERROR_IF_IN_REVIEW' in commits[0]


def test_already_assigned_candidate_reports_existing_status_without_writes():
    call = FakePlay(existing=True)
    call.track['releases'][0]['versionCodes'] = [module.VERSION]
    result = module.upload(b'synthetic', call)
    assert result['commit_state'] == 'ALREADY_SAVED'
    assert result['existing_internal_statuses'] == ['completed']
    assert not result['assigned_by_this_operation']
    assert not any(':commit' in url or 'uploadType=media' in url for url, _ in call.calls)


@pytest.mark.parametrize('failure', ['lost_before', 'lost_after', 'postchange'])
def test_commit_loss_uses_readback_without_reupload_or_second_commit(failure):
    call = FakePlay(failure=failure)
    if failure == 'lost_after':
        result = module.upload(b'synthetic', call)
        assert result['commit_state'] == 'RESPONSE_LOST_READBACK_CONFIRMED'
    else:
        with pytest.raises(ValueError, match='committed_'):
            module.upload(b'synthetic', call)
    assert sum('uploadType=media' in url for url, _ in call.calls) == 1
    assert sum(':commit' in url for url, _ in call.calls) == 1
    assert call.edit == 2


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
    assert 'UPLOAD_BUNDLE_LIBRARY' in job['if']
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
