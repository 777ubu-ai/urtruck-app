import copy,importlib.util
from pathlib import Path
import pytest
path=Path(__file__).resolve().parents[2]/'scripts/ops/promote_existing_1016_draft.py'
spec=importlib.util.spec_from_file_location('promotion',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response:
 def __init__(self,data=None,status=200):self.data=data or {};self.status_code=status
 def json(self):return self.data
class Store:
 def __init__(self):
  self.state={'production':{'track':'production','releases':[{'name':'1.0.15','status':'completed','versionCodes':['215771498']}]},'internal':{'track':'internal','releases':[{'name':'1.0.16','status':'completed','versionCodes':[m.CODE]}]},'beta':{'track':'beta','releases':[]}}
  self.edits={};self.calls=[];self.counter=0;self.lose_commit=False
 def post(self,url,**kwargs):
  self.calls.append(('POST',url,kwargs))
  if url==m.BASE:
   self.counter+=1;ident=str(self.counter);self.edits[ident]=copy.deepcopy(self.state);return Response({'id':ident})
  ident=url.split('/edits/')[1].split(':')[0]
  if url.endswith(':commit'):
   self.state=copy.deepcopy(self.edits[ident])
   if self.lose_commit:raise TimeoutError('response lost')
  return Response()
 def get(self,url,**kwargs):
  ident=url.split('/edits/')[1].split('/')[0]
  if url.endswith('/tracks'):return Response({'tracks':list(copy.deepcopy(self.edits[ident]).values())})
  if url.endswith('/bundles'):return Response({'bundles':[{'versionCode':m.CODE,'sha256':m.EXPECTED_AAB_SHA256}]})
  raise AssertionError(url)
 def put(self,url,json,**kwargs):
  self.calls.append(('PUT',url,copy.deepcopy(json)));ident=url.split('/edits/')[1].split('/')[0];assert url.endswith('/tracks/production');self.edits[ident]['production']=copy.deepcopy(json);return Response(json)
 def delete(self,url,**kwargs):self.calls.append(('DELETE',url,{}));return Response(status=204)
def test_exact_confirmation_before_any_api_call():
 s=Store()
 with pytest.raises(ValueError):m.prepare(s,'publish')
 assert not s.calls

def test_prepares_only_draft_and_keeps_public_and_internal_releases():
 s=Store();old=copy.deepcopy(s.state);r=m.prepare(s,m.CONFIRM)
 assert r['status']=='PRODUCTION_DRAFT_PREPARED' and not r['public_rollout'] and not r['new_upload'] and not r['review_submitted']
 assert s.state['internal']==old['internal'] and s.state['beta']==old['beta']
 assert s.state['production']['releases'][0]==old['production']['releases'][0]
 assert s.state['production']['releases'][1]['status']=='draft'
 commit=[x for x in s.calls if ':commit' in x[1]]
 assert len(commit)==1 and commit[0][2]['params']['changesNotSentForReview']=='true'
 assert all('/upload' not in x[1] for x in s.calls)

def test_idempotent_draft_does_not_commit_again():
 s=Store();m.prepare(s,m.CONFIRM);s.calls=[]
 assert m.prepare(s,m.CONFIRM)['status']=='PRODUCTION_DRAFT_ALREADY_PRESENT'
 assert not any(x[0]=='PUT' or ':commit' in x[1] for x in s.calls)

def test_wrong_internal_candidate_cannot_promote():
 s=Store();s.state['internal']['releases'][0]['name']='qa2'
 with pytest.raises(ValueError,match='internal_candidate_changed'):m.prepare(s,m.CONFIRM)
 assert not any(x[0]=='PUT' for x in s.calls)

def test_newer_public_version_cannot_be_downgraded():
 s=Store();s.state['production']['releases'][0]['versionCodes']=['215771503']
 with pytest.raises(ValueError,match='production_version_conflict'):m.prepare(s,m.CONFIRM)
 assert not any(x[0]=='PUT' for x in s.calls)

def test_lost_commit_response_is_read_back_without_second_commit():
 s=Store();s.lose_commit=True;r=m.prepare(s,m.CONFIRM)
 assert r['status']=='PRODUCTION_DRAFT_PREPARED'
 assert len([x for x in s.calls if ':commit' in x[1]])==1
 assert s.state['production']['releases'][-1]['status']=='draft'

def test_existing_public_candidate_is_not_replaced_with_draft():
 s=Store();s.state['production']['releases']=[copy.deepcopy(s.state['internal']['releases'][0])]
 with pytest.raises(ValueError,match='target_already_public_or_in_review'):m.prepare(s,m.CONFIRM)
 assert not any(x[0]=='PUT' for x in s.calls)
