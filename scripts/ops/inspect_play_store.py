"""Inspect existing Play tracks using an ephemeral edit; no publication."""
import json, os
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
PACKAGE = 'com.urtruck.app'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
info = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)
def checked(r):
    if r.status_code not in (200, 201):
        errors=r.json().get('error',{})
        raise SystemExit('Play HTTP '+str(r.status_code)+': '+str(errors.get('message','Unknown error')))
    return r.json()
edit = checked(s.post(BASE+'/edits',json={},timeout=30))['id']
try:
    tracks = checked(s.get(BASE+'/edits/'+edit+'/tracks',timeout=30))
    listings = checked(s.get(BASE+'/edits/'+edit+'/listings',timeout=30))
    report={'package':PACKAGE,'mode':'inspect','publication_performed':False,'tracks':tracks,'listings':listings}
    with open('play-store-inspection.json','w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({'package':PACKAGE,'tracks':tracks,'listing_languages':[x.get('language') for x in listings.get('listings',[])]},ensure_ascii=False))
finally:
    r=s.delete(BASE+'/edits/'+edit,timeout=30)
    print('Ephemeral edit removed:',r.status_code==204)
