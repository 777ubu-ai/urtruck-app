#!/usr/bin/env python3
"""Адресная установка двух проверенных файлов QA2 без замены БД или unit."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

sha = os.environ['QA_SOURCE_SHA']
run_id = os.environ['GITHUB_RUN_ID']
mode = os.environ['QA_DEPLOY_MODE']
if mode not in {'verify', 'deploy'}: raise SystemExit('invalid_deployment_mode')
if not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdecimal():
    raise SystemExit('invalid_deployment_identity')
paths = subprocess.check_output(['git', 'ls-files', 'backend'], text=True).splitlines()
manifest = {}
for path in paths:
    p = Path(path)
    if '/__pycache__/' in path or '/.env' in path or p.suffix in {'.db', '.sqlite', '.sqlite3'}:
        continue
    if p.is_file():
        manifest[path[8:]] = hashlib.sha256(p.read_bytes()).hexdigest()
changed = ['database/external_freight_dal.py', 'tests/test_external_freight_feed.py']
files = {path: base64.b64encode(Path('backend', path).read_bytes()).decode() for path in changed}
payload = {'sha': sha, 'run_id': run_id, 'mode': mode, 'manifest': manifest, 'files': files,
           'baseline': '4195f888c444d04b532fe358c2f32c7d3c72e494'}
remote = r'''
import base64, datetime, hashlib, json, os, re, sqlite3, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
p=json.load(sys.stdin); root=Path('/home/ubuntu/urtruck-qa2'); backend=root/'backend'
changed={'database/external_freight_dal.py','tests/test_external_freight_feed.py'}
if set(p['files'])!=changed or not re.fullmatch('[0-9a-f]{40}',p['sha']) or not p['run_id'].isdigit(): raise SystemExit('identity_invalid')
if (backend/'.qa-source-sha').read_text().strip()!=p['baseline']: raise SystemExit('baseline_marker_changed')
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
for name,expected in p['manifest'].items():
    if name in changed: continue
    f=backend/name
    if not f.is_file() or digest(f)!=expected: raise SystemExit('baseline_mismatch: '+name)
# Два изменяемых файла также обязаны совпасть с точно известной базой.
old_hashes={'database/external_freight_dal.py':'152de292a60f804de561650c98cfaefe9e1d3a5f9a28a12fe1ab758b2b19577b',
            'tests/test_external_freight_feed.py':'57213c3e77075b682bc09fce988f3c56ccd7f6224c507033f6c5044228e52dd1'}
for name,h in old_hashes.items():
    if digest(backend/name)!=h: raise SystemExit('baseline_mismatch: '+name)
unit_hash=hashlib.sha256(subprocess.check_output(['systemctl','cat','urtruck-qa2.service'])).hexdigest()
def service_pid():
    return int(subprocess.check_output(['systemctl','show','urtruck-qa2.service','-p','MainPID','--value'], text=True))
def cutoff(pid):
    values=dict(v.split(b'=',1) for v in Path('/proc',str(pid),'environ').read_bytes().split(b'\0') if b'=' in v)
    value=values.get(b'PUSH_OUTBOX_CUTOFF_ID',b'').decode()
    if not value.isdecimal() or int(value)<=0: raise RuntimeError('push_cutoff_missing')
    return int(value)
pid=service_pid(); before_cutoff=cutoff(pid)
values=[]
for line in (backend/'.env').read_text().splitlines():
    if line.startswith('PUSH_OUTBOX_CUTOFF_ID='): values.append(line.partition('=')[2].strip().strip('"\''))
if len(values)!=1 or not values[0].isdecimal() or int(values[0])!=before_cutoff: raise SystemExit('push_cutoff_config_mismatch')
security=root/'runtime/security.db'; external=root/'runtime/external-freight.sqlite3'
def ro(path): return sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=20)
with ro(security) as db:
    held=[r[0] for r in db.execute("SELECT id FROM push_outbox WHERE status IN ('pending','retry') AND id<=?",(before_cutoff,))]
backup=root/'backups'/('vehicle-window-'+p['run_id']+'-'+p['sha']); backup.mkdir(mode=0o700)
for name in changed:
    dest=backup/name; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes((backend/name).read_bytes()); dest.chmod(0o600)
for label,source in [('security.sqlite3',security),('external-freight.sqlite3',external)]:
    with ro(source) as source_db, sqlite3.connect(backup/label) as target:
        source_db.backup(target)
        if target.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise SystemExit('backup_integrity_failed')
    (backup/label).chmod(0o600)
# Проверка правила на изолированной копии без изменения активной базы.
with ro(backup/'external-freight.sqlite3') as db:
    now=datetime.datetime.now(datetime.timezone.utc)
    window,total=db.execute("SELECT count(*) FILTER (WHERE source_published_at>?),count(*) FROM external_freight_items WHERE kind='vehicle' AND status='active' AND expires_at>?",
        ((now-datetime.timedelta(days=10)).isoformat(), now.isoformat())).fetchone()
    # Проверяем на snapshot существующую startup-процедуру, не запуская её на live DB.
    pending_updates=0
    for kind,status,published,expires in db.execute("SELECT kind,status,source_published_at,expires_at FROM external_freight_items WHERE status IN ('active','expired') AND source_published_at IS NOT NULL"):
        try:
            date=datetime.datetime.fromisoformat(str(published).replace('Z','+00:00'))
            if date.tzinfo is None: date=date.replace(tzinfo=datetime.timezone.utc)
            deadline=date.astimezone(datetime.timezone.utc)+datetime.timedelta(days=30)
        except (TypeError,ValueError):
            continue
        expected='expired' if deadline<=now else 'active'
        if status!=expected or expires!=deadline.isoformat(): pending_updates+=1
    if pending_updates: raise SystemExit('startup_would_change_existing_feed_rows: '+str(pending_updates))
print('backup_ok; isolated_vehicle_window=',window,'of',total,'held=',len(held),flush=True)
if p['mode']=='verify':
    print('QA2_VEHICLE_WINDOW_VERIFY_ONLY=pass', 'backup='+str(backup), flush=True)
    sys.exit(0)
if p['mode']!='deploy': raise SystemExit('deployment_mode_invalid')
def install(name,data):
    target=backend/name
    fd,tmp=tempfile.mkstemp(prefix='.vehicle-window-',dir=str(target.parent))
    try:
        with os.fdopen(fd,'wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp,0o644); os.replace(tmp,target)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def restart():
    subprocess.run(['sudo','-n','systemctl','restart','urtruck-qa2.service'],check=True,timeout=90)
    for _ in range(90):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8002/health',timeout=2) as response:
                if response.status==200: return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('qa2_health_timeout')
try:
    for name,encoded in p['files'].items():
        data=base64.b64decode(encoded,validate=True)
        if hashlib.sha256(data).hexdigest()!=p['manifest'][name]: raise RuntimeError('payload_hash_mismatch')
        install(name,data)
    restart()
    if cutoff(service_pid())!=before_cutoff: raise RuntimeError('push_cutoff_changed')
    if hashlib.sha256(subprocess.check_output(['systemctl','cat','urtruck-qa2.service'])).hexdigest()!=unit_hash: raise RuntimeError('service_unit_changed')
    for name,expected in p['manifest'].items():
        if digest(backend/name)!=expected: raise RuntimeError('deployed_file_mismatch: '+name)
    with ro(security) as db:
        for event_id in held:
            row=db.execute('SELECT status FROM push_outbox WHERE id=?',(event_id,)).fetchone()
            if row and row[0] in ('processing','sent','sent_partial'): raise RuntimeError('held_push_released')
    install('.qa-source-sha',(p['sha']+'\n').encode())
except Exception:
    for name in changed: install(name,(backup/name).read_bytes())
    restart()
    raise
print('QA2_BACKEND_SOURCE_SHA='+p['sha'],'backup='+str(backup),'held_push_checked='+str(len(held)),flush=True)
'''
cmd=['ssh','qa2-final','python3 -c '+shlex.quote(remote)]
result=subprocess.run(cmd,input=json.dumps(payload),text=True)
sys.exit(result.returncode)
