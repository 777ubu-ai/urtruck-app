"""Подготовить основной Play draft из существующего неизменяемого bundle; без rollout."""
import argparse,copy,json,os,re
from pathlib import Path
from datetime import datetime,timezone
BASE='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.urtruck.app/edits'
CODE='215771502'
SOURCE='f2f2dc24672e47740b03f907e49895ad5ddbd103'
EXPECTED_AAB_SHA256='9baae75d00096bb61982b3dc477a434ba7f357ed2dc4af03dcd808fe982f893c'
CONFIRM='PREPARE_PRODUCTION_1_0_16_DRAFT'

def checked(r):
 if r.status_code not in (200,201,204):
  try:message=r.json().get('error',{}).get('message','')
  except ValueError:message=''
  message=re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+','[redacted-email]',message)
  message=re.sub(r'Bearer\s+\S+','Bearer [redacted]',message)
  raise RuntimeError('Google Play HTTP '+str(r.status_code)+': '+message[:1000])
 return r.json() if r.status_code!=204 else {}

def tracks(s,url):return {t['track']:t for t in checked(s.get(url+'/tracks',timeout=30)).get('tracks',[])}

def check_candidate(s,url,state):
 candidate=[r for r in state.get('internal',{}).get('releases',[]) if CODE in [str(c) for c in r.get('versionCodes',[])]]
 if len(candidate)!=1 or candidate[0].get('name')!='1.0.16' or candidate[0].get('status')!='completed':raise ValueError('internal_candidate_changed')
 bundles=[b for b in checked(s.get(url+'/bundles',timeout=30)).get('bundles',[]) if str(b.get('versionCode'))==CODE]
 if len(bundles)!=1 or bundles[0].get('sha256','').lower()!=EXPECTED_AAB_SHA256:raise ValueError('immutable_bundle_missing')
 return bundles[0]['sha256'].lower()

def prepare(s,confirmation):
 if confirmation!=CONFIRM:raise ValueError('explicit_draft_confirmation_required')
 edit=checked(s.post(BASE,json={},timeout=30))['id'];url=BASE+'/'+edit
 committed=False;commit_attempted=False;commit_state="COMMIT_CONFIRMED"
 try:
  original=tracks(s,url)
  if 'production' not in original:raise ValueError('production_track_missing')
  bundle_hash=check_candidate(s,url,original)
  production=copy.deepcopy(original['production']);releases=production.get('releases',[])
  exact=[r for r in releases if CODE in [str(c) for c in r.get('versionCodes',[])]]
  if exact:
   if len(exact)!=1 or exact[0].get('status')!='draft':raise ValueError('target_already_public_or_in_review')
   return {'status':'PRODUCTION_DRAFT_ALREADY_PRESENT','version_code':CODE,'source_sha':SOURCE,'bundle_sha256':bundle_hash,'public_rollout':False,'new_upload':False}
  if any(r.get('status')!='completed' for r in releases):raise ValueError('existing_unfinished_production_release')
  if any(int(c)>=int(CODE) for r in releases for c in r.get('versionCodes',[])):raise ValueError('production_version_conflict')
  production['releases']=releases+[{'name':'1.0.16','versionCodes':[CODE],'status':'draft','releaseNotes':[{'language':'ru-RU','text':'Улучшили вход и восстановление сессии, загрузку лент и счётчики. Исправили отображение непрочитанного и открытие вложений в сделках.'}]}]
  checked(s.put(url+'/tracks/production',json=production,timeout=30))
  staged=tracks(s,url)
  if any(staged.get(k)!=v for k,v in original.items() if k!='production'):raise ValueError('other_tracks_changed')
  if staged.get('production')!=production:raise ValueError('draft_assignment_mismatch')
  checked(s.post(url+':validate',timeout=30))
  commit_attempted=True
  try:
   checked(s.post(url+':commit',params={'changesNotSentForReview':'true','changesInReviewBehavior':'ERROR_IF_IN_REVIEW'},timeout=30));committed=True
  except (TimeoutError,OSError):
   commit_state='RESPONSE_LOST_READBACK_REQUIRED'

 finally:
  if not committed and not commit_attempted:checked(s.delete(url,timeout=30))
 read_id=checked(s.post(BASE,json={},timeout=30))['id'];read_url=BASE+'/'+read_id
 try:
  after=tracks(s,read_url)
  if check_candidate(s,read_url,after)!=bundle_hash:raise ValueError('bundle_hash_changed')
  if after.get('production')!=production or any(after.get(k)!=v for k,v in original.items() if k!='production'):raise ValueError('committed_track_readback_mismatch')
 finally:checked(s.delete(read_url,timeout=30))
 if commit_state=='RESPONSE_LOST_READBACK_REQUIRED':commit_state='RESPONSE_LOST_READBACK_CONFIRMED'
 return {'status':'PRODUCTION_DRAFT_PREPARED','package':'com.urtruck.app','version':'1.0.16','version_code':CODE,'source_sha':SOURCE,'bundle_sha256':bundle_hash,'production_track':after['production'],'other_tracks_unchanged':True,'public_rollout':False,'review_submitted':False,'new_upload':False,'commit_state':commit_state,'checked_at':datetime.now(timezone.utc).isoformat()}

def main():
 p=argparse.ArgumentParser();p.add_argument('--confirmation',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 from google.oauth2 import service_account
 from google.auth.transport.requests import AuthorizedSession
 credentials=service_account.Credentials.from_service_account_info(json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON']),scopes=['https://www.googleapis.com/auth/androidpublisher'])
 with AuthorizedSession(credentials) as s:result=prepare(s,args.confirmation)
 Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
