"""Inspect Play or prepare the already-uploaded candidate as a production draft."""
import copy, json, os
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
PACKAGE = 'com.urtruck.app'
VERSION = '213660672'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
mode = os.environ.get('STORE_ACTION', 'inspect')
assert mode in ('inspect', 'prepare_draft')
info = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)
def checked(r):
    if r.status_code not in (200, 201):
        raise SystemExit('Play HTTP '+str(r.status_code)+': '+str(r.json().get('error',{}).get('message','Unknown error')))
    return r.json()
edit = checked(s.post(BASE+'/edits',json={},timeout=30))['id']
committed = False
try:
    tracks = checked(s.get(BASE+'/edits/'+edit+'/tracks',timeout=30))
    listings = checked(s.get(BASE+'/edits/'+edit+'/listings',timeout=30))
    indexed = {t['track']:t for t in tracks['tracks']}
    before = copy.deepcopy(indexed['production'])
    report={'package':PACKAGE,'mode':mode,'publication_performed':False,'tracks':tracks,'listings':listings,'production_before':before}
    if mode == 'prepare_draft':
        internal = indexed['internal']['releases']
        assert any(r['status']=='completed' and VERSION in r['versionCodes'] for r in internal), 'Candidate not in completed internal track'
        current = before.get('releases',[])
        assert len(current)==1 and current[0]['status']=='completed' and current[0]['versionCodes']==['212912064'], 'Production baseline changed; inspect again'
        candidate={'name':'1.0.9','versionCodes':[VERSION],'status':'draft','inAppUpdatePriority':2,'releaseNotes':[{'language':'ru-RU','text':'Исправления уведомлений и счётчиков непрочитанного. Полный список стран. Улучшения чата и обработки голосовых сообщений.'}]}
        desired={'track':'production','releases':current+[candidate]}
        report['production_desired']=desired
        checked(s.put(BASE+'/edits/'+edit+'/tracks/production',json=desired,timeout=30))
        checked(s.post(BASE+'/edits/'+edit+':validate',json={},timeout=30))
        report['commit']=checked(s.post(BASE+'/edits/'+edit+':commit',params={'changesNotSentForReview':'true'},json={},timeout=30))
        committed = True
        report['production_draft_committed']=True
        print('Production draft committed; NOT sent for review and NOT published:',VERSION)
    with open('play-store-inspection.json','w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({'package':PACKAGE,'mode':mode,'tracks':tracks,'listing_languages':[x.get('language') for x in listings.get('listings',[])]},ensure_ascii=False))
finally:
    if not committed:
        r=s.delete(BASE+'/edits/'+edit,timeout=30)
        print('Own ephemeral edit removed:',r.status_code==204)
