import argparse,fcntl,hashlib,json,os,shutil,sqlite3,subprocess,tarfile,tempfile,time,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('/home/ubuntu/urtruck/backend')
DB=Path('/home/ubuntu/urtruck/runtime/security.db')
SOURCE='e1cb79f79085962bb7f1cb29c5439631e6445ddb'
PAYLOAD_SHA='5c2dfacc93ae195fb053e7a3b7141c8219dfabd6c07a2f563d6d9b6f161ca1d3'
FILES={'api/notifications.py','api/chat.py','api/deal_room.py','services/storage_service.py','services/private_file_transport.py'}
TABLES=['drivers_registration','cargos','trips','bids','deals','chat_rooms','chat_messages','message_attachments']
NODE='/home/ubuntu/.nvm/versions/node/v22.15.0/bin/node'
PM2='/home/ubuntu/.nvm/versions/node/v22.15.0/lib/node_modules/pm2/bin/pm2'
GUARDS=['/api/v1/notifications/attention','/api/v1/chat/messages/compatibility-read-probe/media/1','/api/v1/chat/conversations/compatibility-read-probe/attachments/compatibility-file/content']
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def atomic(p,data,mode=0o644):
 p=Path(p)
 if p.is_symlink():raise RuntimeError('symlink_target')
 fd,tmp=tempfile.mkstemp(prefix='.client-compat-',dir=p.parent)
 try:
  os.fchmod(fd,mode)
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(tmp,p)
 finally:
  if Path(tmp).exists():Path(tmp).unlink()
def readonly(path):
 c=sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True,timeout=10)
 c.execute('PRAGMA query_only=ON');return c
def identities():
 with readonly(DB) as c:return {t:{str(r[0]) for r in c.execute('SELECT id FROM '+t)} for t in TABLES}
def backup_db(target):
 start=time.monotonic()
 def progress(status,remaining,total):
  if time.monotonic()-start>150:raise RuntimeError('backup_deadline')
 with readonly(DB) as src,sqlite3.connect(target) as dst:src.backup(dst,pages=2048,progress=progress,sleep=0.05)
 Path(target).chmod(0o600)
 probe=Path(target).with_name('restore-probe.sqlite3');shutil.copy2(target,probe)
 for p in [target,probe]:
  with readonly(p) as c:
   if c.execute('PRAGMA quick_check').fetchall()!=[('ok',)]:raise RuntimeError('backup_quick_check')
 if digest(target)!=digest(probe):raise RuntimeError('restore_checksum')
 return {'sha256':digest(target),'bytes':Path(target).stat().st_size,'quick_check':'ok','restore_checksum':'PASS'}
def protected():
 result={}
 for p in ROOT.rglob('*.py'):
  rel=p.relative_to(ROOT)
  if set(rel.parts)&{'venv','.venv','__pycache__'} or str(rel) in FILES:continue
  result[str(rel)]=digest(p)
 for p in [ROOT/'.env',ROOT.parent/'.env']:
  if p.exists():result[str(p)]=digest(p)
 return result
def get(url):
 try:
  with urllib.request.urlopen(url,timeout=8) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def restart():
 r=subprocess.run([NODE,PM2,'restart','3'],capture_output=True,text=True,timeout=35)
 if r.returncode:raise RuntimeError('pm2_restart_failed')
def api_health(require_new):
 deadline=time.monotonic()+65
 while time.monotonic()<deadline:
  try:
   status,_=get('https://urtruck.kz/security/api/v1/system/info')
   if status==200:
    if not require_new:return True
    if all(get('https://urtruck.kz'+p)[0]==401 for p in GUARDS):return True
  except (OSError,TimeoutError):pass
  time.sleep(1)
 return False

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--bundle',required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 os.umask(0o077)
 bundle=Path(args.bundle)
 if digest(bundle)!=PAYLOAD_SHA:raise RuntimeError('payload_hash')
 with tarfile.open(bundle) as tar:
  members=tar.getmembers()
  if len(members)!=6 or {m.name for m in members}!=FILES|{'manifest.json'} or not all(m.isfile() for m in members):raise RuntimeError('payload_members')
  content={m.name:tar.extractfile(m).read() for m in members}
 manifest=json.loads(content.pop('manifest.json'))
 if manifest['source_sha']!=SOURCE or set(manifest['files'])!=FILES:raise RuntimeError('payload_source')
 with Path('/home/ubuntu/urtruck/runtime/.external-feed-deploy.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  originals={};modes={}
  for name in FILES:
   p=ROOT/name
   if p.is_symlink() or not p.resolve().is_relative_to(ROOT.resolve()):raise RuntimeError('unsafe_target')
   originals[name]=p.read_bytes() if p.exists() else None;modes[name]=(p.stat().st_mode&0o777) if p.exists() else 0o644
   actual=hashlib.sha256(originals[name]).hexdigest() if originals[name] is not None else None
   if actual!=manifest['before'][name]:raise RuntimeError('production_baseline_changed:'+name)
   if hashlib.sha256(content[name]).hexdigest()!=manifest['files'][name]:raise RuntimeError('payload_file_hash')
   compile(content[name],name,'exec')
  processes=json.loads(subprocess.run([NODE,PM2,'jlist'],capture_output=True,text=True,check=True).stdout)
  api=next(p for p in processes if p.get('pm_id')==3)
  if api['name']!='urtruck-security-api' or Path(api['pm2_env']['pm_cwd']).resolve()!=ROOT.resolve() or api['pm2_env']['status']!='online':raise RuntimeError('production_process_changed')
  if shutil.disk_usage(ROOT).free<DB.stat().st_size*3+1024**3:raise RuntimeError('insufficient_backup_space')
  website=get('https://urtruck.kz/');site_sha=hashlib.sha256(website[1]).hexdigest()
  if website[0]!=200 or not api_health(False):raise RuntimeError('baseline_health')
  protected_before=protected();before_ids=identities()
  print(json.dumps({'phase':'PREFLIGHT_PASS','source_sha':SOURCE,'files':len(FILES),'records':{t:len(v) for t,v in before_ids.items()}}),flush=True)
  if not args.apply:return
  stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
  backup=Path('/home/ubuntu/urtruck-backups')/('client-compat-'+SOURCE[:8]+'-'+stamp)
  backup.mkdir(mode=0o700,parents=True)
  (backup/'code').mkdir(mode=0o700)
  for name,data in originals.items():
   if data is not None:
    p=backup/'code'/name;p.parent.mkdir(mode=0o700,parents=True,exist_ok=True);atomic(p,data,0o600)
  atomic(backup/'manifest.json',json.dumps(manifest,indent=2).encode(),0o600)
  atomic(backup/'operator.py',Path(__file__).read_bytes(),0o600)
  proof=backup_db(backup/'snapshot.sqlite3')
  print(json.dumps({'phase':'BACKUP_RESTORE_PASS','backup':str(backup),'proof':proof}),flush=True)
  changed=False
  try:
   for name in FILES:
    p=ROOT/name
    current=p.read_bytes() if p.exists() else None
    if current!=originals[name]:raise RuntimeError('concurrent_production_change')
   changed=True
   for name in sorted(FILES):atomic(ROOT/name,content[name],modes[name])
   restart()
   if not api_health(True):raise RuntimeError('new_route_health_failed')
   if protected()!=protected_before:raise RuntimeError('protected_code_or_env_changed')
   if hashlib.sha256(get('https://urtruck.kz/')[1]).hexdigest()!=site_sha:raise RuntimeError('public_landing_changed')
   after_ids=identities()
   if any(before_ids[t]-after_ids[t] for t in TABLES):raise RuntimeError('historical_id_missing')
   report={'status':'DEPLOYED','source_sha':SOURCE,'scope':'five-file-client-compatibility-overlay','files':manifest['files'],'backup':str(backup),'backup_proof':proof,'routes_anonymous_http':{p:401 for p in GUARDS},'protected_code_env':'UNCHANGED','public_landing':'UNCHANGED','historical_ids':'PRESERVED','records_after':{t:len(v) for t,v in after_ids.items()},'public_store_release':False,'deployed_at':datetime.now(timezone.utc).isoformat()}
   atomic(backup/'result.json',json.dumps(report,indent=2).encode(),0o600)
   atomic(Path('/home/ubuntu/urtruck/runtime/client-compatibility-overlay.json'),json.dumps(report,indent=2).encode(),0o600)
   print(json.dumps(report),flush=True)
  except BaseException:
   if changed:
    for name,data in originals.items():
     if data is None:
      if (ROOT/name).exists():(ROOT/name).unlink()
     else:atomic(ROOT/name,data,modes[name])
    restart();ok=api_health(False)
    print(json.dumps({'status':'CODE_ROLLED_BACK','health':ok,'database_restored':False,'backup':str(backup)}),flush=True)
   raise
if __name__=='__main__':main()
