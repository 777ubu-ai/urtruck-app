import os,sys,json,sqlite3,hashlib,asyncio
from pathlib import Path
from dotenv import load_dotenv
ROOT=Path('/home/ubuntu/urtruck/backend')
report=json.loads(Path('/home/ubuntu/urtruck/runtime/client-compatibility-overlay.json').read_text())
assert report['source_sha']=='e1cb79f79085962bb7f1cb29c5439631e6445ddb'
backup=Path(report['backup']);probe=backup/'restore-probe.sqlite3'
assert hashlib.sha256(probe.read_bytes()).hexdigest()==report['backup_proof']['sha256']
load_dotenv(ROOT.parent/'.env');load_dotenv(ROOT/'.env',override=True)
os.environ['DB_PATH']=str(probe)
os.environ['CGR_IIN_SALT']=os.environ.get('CGR_IIN_SALT') or 'isolated-restore-probe-only'
sys.path.insert(0,str(ROOT))
import config
assert Path(config.DB_PATH).resolve()==probe.resolve()
from api import chat,deal_room,notifications
from services import storage_service
from fastapi import FastAPI,HTTPException
import httpx
app=FastAPI();app.include_router(chat.chat_router,prefix='/api/v1/chat');app.include_router(deal_room.deal_room_router,prefix='/api/v1');app.include_router(notifications.notif_router,prefix='/api/v1/notifications')
selected={'id':None}
def actor():
 if selected['id'] is None:raise HTTPException(status_code=401)
 return {'id':selected['id'],'verification_level':1}
for route in app.routes:
 if getattr(route,'path','') in ['/api/v1/notifications/attention','/api/v1/chat/messages/{room_id}/media/{message_id}','/api/v1/chat/conversations/{conversation_id}/attachments/{attachment_id}/content']:
  for dep in route.dependant.dependencies:app.dependency_overrides[dep.call]=actor
c=sqlite3.connect(probe);c.row_factory=sqlite3.Row
cases=[]
allowed="('accepted','in_progress','at_border','awaiting_confirmation','delivered','received','completed')"
rows=c.execute("SELECT DISTINCT a.id,a.conversation_id AS room,a.url AS ref,r.participant_1 AS p1,r.participant_2 AS p2 FROM message_attachments a JOIN chat_rooms r ON r.id=a.conversation_id JOIN deals d ON d.chat_room_id=r.id WHERE a.upload_status='uploaded' AND d.status IN "+allowed+" ORDER BY a.rowid DESC LIMIT 4").fetchall()
for r in rows:
 if storage_service.ref_has_purpose(r['ref'],{'chat_attachments'}):cases.append(dict(r,kind='attachment'));break
for voice in [0,1]:
 rows=c.execute("SELECT DISTINCT m.id,m.room_id AS room,m.photo_url AS ref,r.participant_1 AS p1,r.participant_2 AS p2 FROM chat_messages m JOIN chat_rooms r ON r.id=m.room_id JOIN deals d ON d.chat_room_id=r.id WHERE m.photo_url IS NOT NULL AND m.is_voice=? AND d.status IN "+allowed+" ORDER BY m.id DESC LIMIT 12",(voice,)).fetchall()
 for r in rows:
  if storage_service.ref_has_purpose(r['ref'],{'chat_photos','chat_voice','chat'}):cases.append(dict(r,kind='voice' if voice else 'photo'));break
users=[r[0] for r in c.execute("SELECT user_id FROM notifications WHERE is_read=0 GROUP BY user_id LIMIT 20")]
c.close()
async def main():
 results=[]
 async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,raise_app_exceptions=False),base_url='http://isolated-restored-db') as client:
  for row in cases:
   url=(f"/api/v1/chat/conversations/{row['room']}/attachments/{row['id']}/content" if row['kind']=='attachment' else f"/api/v1/chat/messages/{row['room']}/media/{row['id']}")
   expected=hashlib.sha256(storage_service.read_private_bytes(row['ref'],12*1024*1024)).hexdigest()
   for who in [row['p1'],row['p2']]:
    selected['id']=who;r=await client.get(url)
    assert r.status_code==200, 'participant_content_status_'+str(r.status_code)
    assert hashlib.sha256(r.content).hexdigest()==expected,'participant_content_hash'
    assert r.headers.get('cache-control')=='private, no-store'
   selected['id']='isolated-restore-probe-outsider';r=await client.get(url);assert r.status_code in (403,404),'outsider_not_denied'
   selected['id']=None;r=await client.get(url);assert r.status_code==401,'anonymous_not_denied'
   with sqlite3.connect(probe) as db:
    before=db.execute('SELECT id,status FROM deals WHERE chat_room_id=?',(row['room'],)).fetchall()
    db.execute("UPDATE deals SET status='cancelled' WHERE chat_room_id=?",(row['room'],))
   selected['id']=row['p1'];r=await client.get(url);assert r.status_code==403,'revocation_not_enforced'
   with sqlite3.connect(probe) as db:
    db.executemany('UPDATE deals SET status=? WHERE id=?',[(status,ident) for ident,status in before])
   results.append({'kind':row['kind'],'participants':2,'bytes_match':True,'outsider':'DENIED','anonymous':'DENIED','revocation':'DENIED'})
  for user in users:
   selected['id']=user;r=await client.get('/api/v1/notifications/attention');assert r.status_code==200
   data=r.json();assert data['badge']==notifications.unread_badge_count(user)
   assert data['badge']==len(data['notifications'])+sum(x['unread_count'] for x in data['rooms'])
 print(json.dumps({'status':'PASS','scope':'isolated_ASGI_restored_production_DB_actual_storage','files':results,'attention_accounts':len(users),'production_database_writes':0,'live_authenticated_phone_test':False}))
asyncio.run(main())
