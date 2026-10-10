"""Prepare notes on the verified existing production draft; never publish."""
import copy, json, os
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
PACKAGE = 'com.urtruck.app'
VERSION = '213798673'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
mode = os.environ.get('STORE_ACTION', 'inspect')
if mode not in ('inspect', 'prepare_draft'): raise SystemExit('Unsupported action')
info = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)
def checked(r):
    if r.status_code not in (200, 201):
        raise SystemExit('Play HTTP '+str(r.status_code)+': '+str(r.json().get('error',{}).get('message','Unknown error')))
    return r.json()
edit = checked(s.post(BASE+'/edits', json={}, timeout=30))['id']
committed = False
try:
    tracks = checked(s.get(BASE+'/edits/'+edit+'/tracks', timeout=30))
    before = copy.deepcopy(next(t for t in tracks['tracks'] if t['track']=='production'))
    report = {'package':PACKAGE, 'mode':mode, 'publication_performed':False, 'production_before':before}
    if mode == 'prepare_draft':
        releases = before.get('releases', [])
        if len(releases)!=2: raise SystemExit('Production release count changed; inspect again')
        candidates = [r for r in releases if r.get('versionCodes')==[VERSION] and r.get('status')=='draft' and r.get('name')=='1.0.9']
        baseline = [r for r in releases if r.get('versionCodes')==['213702394'] and r.get('status')=='completed']
        if len(candidates)!=1 or len(baseline)!=1: raise SystemExit('Production identity/status changed; inspect again')
        desired = copy.deepcopy(before)
        target = next(r for r in desired['releases'] if r['versionCodes']==[VERSION])
        note = {'language':'ru-RU', 'text':'Улучшена обработка документов в чате. Улучшены уведомления, счётчики непрочитанного и поле ввода сообщений. Исправлены сохранение машины и единицы измерения. Обновлена совместимость карты на Android.'}
        target['releaseNotes'] = [n for n in target.get('releaseNotes',[]) if n['language']!='ru-RU'] + [note]
        report['production_desired'] = desired
        checked(s.put(BASE+'/edits/'+edit+'/tracks/production', json=desired, timeout=30))
        checked(s.post(BASE+'/edits/'+edit+':validate', json={}, timeout=30))
        report['commit'] = checked(s.post(BASE+'/edits/'+edit+':commit', json={}, timeout=30))
        committed = True
        report['notes_committed'] = True
    # Fresh own edit after commit verifies the persisted state, without another write.
    if committed:
        fresh = checked(s.post(BASE+'/edits', json={}, timeout=30))['id']
        try: report['production_after'] = checked(s.get(BASE+'/edits/'+fresh+'/tracks/production', timeout=30))
        finally: s.delete(BASE+'/edits/'+fresh, timeout=30)
        if report['production_after'] != report['production_desired']: raise SystemExit('Persisted track differs from expected draft; inspect again')
    with open('play-store-inspection.json','w') as f: json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps(report,ensure_ascii=False))
finally:
    if not committed:
        r=s.delete(BASE+'/edits/'+edit, timeout=30)
        print('Own ephemeral edit removed:',r.status_code==204)
