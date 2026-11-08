"""Публичная отправка не меняет другие треки и не повторяется при неопределённости."""
import copy
import importlib.util
from pathlib import Path
import pytest
spec=importlib.util.spec_from_file_location('public_play',Path(__file__).resolve().parents[2]/'scripts/ops/upload_existing_play_draft.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

@pytest.fixture(autouse=True)
def corrected_version(monkeypatch):
    monkeypatch.setattr(m,'VERSION','215090230')

class Play:
    def __init__(self,error=None,already=False):
        self.error=error;self.calls=[];self.edit=0;self.track_reads=0
        self.bundle={'versionCode':int(m.VERSION),'sha256':m.SHA256}
        self.saved_bundle=copy.deepcopy(self.bundle) if already else None
        self.tracks={x:{'track':x,'releases':[{'name':'old','status':'completed','versionCodes':['215090228' if x=='production' else '215090227']}]} for x in ('production','internal','alpha','beta')}
        if already:self.tracks['production']['releases']=[{'name':'1.0.13','status':'completed','versionCodes':[m.VERSION]}]
        if error=='draft':self.tracks['alpha']['releases'][0]['status']='draft'
        if error=='rollout':self.tracks['production']['releases'][0]['status']='inProgress'
        if error=='assigned':self.tracks['internal']['releases'][0]['versionCodes']=[m.VERSION]
        self.saved=copy.deepcopy(self.tracks);self.working=None
    def __call__(self,url,method='GET',body=None):
        self.calls.append((url,method,copy.deepcopy(body)))
        if url==m.API+'/edits':
            self.edit+=1;self.working=copy.deepcopy(self.saved);return {'id':str(self.edit)}
        if url.endswith('/bundles'):
            value=copy.deepcopy(self.saved_bundle)
            if self.error=='existing_hash' and value:value['sha256']='wrong'
            return {'bundles':[value] if value else []}
        if url.endswith('/tracks'):
            self.track_reads+=1;result=copy.deepcopy(self.working)
            if self.error=='prechange' and self.track_reads==2:result['internal']['releases'][0]['name']='foreign'
            if self.error=='postchange' and self.edit==2:result['beta']['releases'][0]['name']='foreign'
            return {'tracks':list(result.values())}
        if 'uploadType=media' in url:
            return {**self.bundle,'sha256':'wrong'} if self.error=='upload' else self.bundle
        if url.endswith('/tracks/production'):
            assert method=='PUT';self.working['production']=copy.deepcopy(body);return body
        if ':validate' in url:
            if self.error=='validate':raise ValueError('validate_failed')
            return {}
        if ':commit?' in url:
            if self.error=='review':raise RuntimeError('play_http_400')
            if self.error!='lost_before':self.saved=copy.deepcopy(self.working);self.saved_bundle=copy.deepcopy(self.bundle)
            if self.error in ('lost_before','lost_after'):raise m.urllib.error.URLError('synthetic_lost_response')
            return {}
        raise AssertionError((url,method))


def test_exact_production_assignment_and_other_tracks_unchanged():
    p=Play();before=copy.deepcopy(p.saved);r=m.submit_production(b'fixture',p)
    assert r['status']=='PRODUCTION_RELEASE_SUBMITTED' and r['review_requested_by_this_operation']
    assert not r['public_availability_confirmed']
    assert all(p.saved[k]==before[k] for k in before if k!='production')
    writes=[(u,v) for u,v,_ in p.calls if v in ('PUT','PATCH','DELETE')]
    assert len(writes)==1 and writes[0][0].endswith('/tracks/production')
    commits=[u for u,_,_ in p.calls if ':commit' in u]
    assert len(commits)==1 and commits[0].endswith(':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW')

@pytest.mark.parametrize('error',['draft','rollout','assigned','upload','prechange','validate'])
def test_conflict_or_invalid_candidate_never_commits(error):
    p=Play(error=error)
    with pytest.raises(ValueError):m.submit_production(b'fixture',p)
    assert not any(':commit' in u for u,_,_ in p.calls)


def test_review_refusal_has_no_second_commit():
    p=Play(error='review')
    with pytest.raises(RuntimeError):m.submit_production(b'fixture',p)
    assert sum(':commit' in u for u,_,_ in p.calls)==1


def test_previous_unfixed_candidate_cannot_be_submitted(monkeypatch):
    monkeypatch.setattr(m,'VERSION','215090229');p=Play()
    with pytest.raises(ValueError,match='registration_fix'):m.submit_production(b'fixture',p)
    assert p.calls==[]

@pytest.mark.parametrize('error',['lost_before','lost_after','postchange'])
def test_uncertain_commit_only_reads_back_without_second_upload(error):
    p=Play(error=error)
    if error=='lost_after':assert m.submit_production(b'fixture',p)['commit_state']=='RESPONSE_LOST_READBACK_CONFIRMED'
    else:
        with pytest.raises(ValueError):m.submit_production(b'fixture',p)
    assert sum(':commit' in u for u,_,_ in p.calls)==1
    assert sum('uploadType=media' in u for u,_,_ in p.calls)==1


def test_already_assigned_exact_bundle_has_no_writes():
    p=Play(already=True);r=m.submit_production(b'fixture',p)
    assert r['status']=='PRODUCTION_ASSIGNMENT_ALREADY_PRESENT'
    assert not any('uploadType=media' in u or ':commit' in u or v in ('PUT','PATCH','DELETE') for u,v,_ in p.calls)


def test_already_assigned_wrong_hash_is_rejected():
    p=Play(error='existing_hash',already=True)
    with pytest.raises(ValueError,match='checksum'):m.submit_production(b'fixture',p)


def test_production_workflow_is_explicit_and_protected_and_tests_run_in_ci():
    import yaml
    root=Path(__file__).resolve().parents[2]
    workflow=yaml.safe_load((root/'.github/workflows/submit-existing-play-production.yml').read_text())
    job=workflow['jobs']['upload-draft']
    assert "github.ref == 'refs/heads/main'" in job['if']
    assert 'SUBMIT_PRODUCTION_1_0_13' in job['if'] and job['environment']=='production'
    assert 'env' not in job
    assert workflow['permissions']=={'contents':'read','actions':'read'}
    assert workflow['concurrency']['cancel-in-progress'] is False
    credentials=[s for s in job['steps'] if 'PLAY_SERVICE_ACCOUNT_JSON' in str(s)]
    assert len(credentials)==1 and 'submit-production --root' in credentials[0]['run']
    assert not any(word in str(job['steps']) for word in ('npm ','gradlew','pip install','eas '))
    gate=yaml.safe_load((root/'.github/workflows/quality-gate-reusable.yml').read_text())
    assert any(s.get('run')=='python -m pytest tests/ops/test_submit_play_production.py -q' for s in gate['jobs']['backend-tests']['steps'])
