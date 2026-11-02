"""Execute the actual remote deploy body in an isolated filesystem with service shims."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import time

import pytest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('deploy05_fixtures',ROOT/'backend/tests/test_telegram_feed_health_snapshot.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)


def executable(path, content):
    path.write_text('#!/usr/bin/env python3\n'+content);path.chmod(0o700)


@pytest.mark.parametrize('fail_hash',[False,True])
@pytest.mark.parametrize('existing', ['absent', 'disabled', 'enabled'])
def test_real_deploy_installs_health_and_rolls_back_without_overwriting_new_rows(tmp_path, fail_hash, existing):
    collector,qa=f._fixture(tmp_path,time.time())
    (collector/'.env').write_text('PUBLISH_ENABLED=true\n')
    for name in ['feed.py','health.py']:(collector/name).write_text('shared sentinel\n')
    shared={str(p):p.read_bytes() for p in [collector/'feed.py',collector/'health.py',collector/'state/feed.sqlite3']}
    original=(ROOT/'scripts/qa/deploy_external_feed_candidate.sh').read_text()
    remote=original.split("<<'REMOTE'\n",1)[1].rsplit('\nREMOTE',1)[0]
    # Only test roots are substituted. All safety checks and mutations execute unchanged.
    unit_root=tmp_path/'systemd';unit_root.mkdir()
    if existing != 'absent':
        for name in ['urtruck-qa2-feed-health.service','urtruck-qa2-feed-health.timer']:
            (unit_root/name).write_text('previous '+name)
        old_health=qa/'ops/telegram-feed/health.py'
        old_health.parent.mkdir(parents=True)
        old_health.write_text('# previous QA2 health\n')
    if existing == 'enabled': (tmp_path/'timer-active').touch()
    remote=remote.replace('/home/ubuntu/urtruck-qa2',str(qa)).replace('/home/ubuntu/urtruck-telegram-feed',str(collector)).replace('/etc/systemd/system',str(unit_root))
    remote=remote.replace('/tmp/urtruck-feed-candidate-',str(tmp_path/'urtruck-feed-candidate-'))
    bundle=tmp_path/'bundle';bundle.mkdir()
    paths=[]
    for line in original.split('paths=(\n',1)[1].split('\n)',1)[0].splitlines():
        name=line.strip();paths.append(name)
        dst=bundle/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,dst)
        if name.startswith('backend/'):
            old=qa/name;old.parent.mkdir(parents=True,exist_ok=True);old.write_text('# previous code\n')
    source_sha='a'*40
    (bundle/'SOURCE_SHA').write_text(source_sha+'\n')
    (bundle/'SHA256SUMS').write_text(''.join(hashlib.sha256((bundle/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in paths))
    archive=tmp_path/'urtruck-feed-candidate-123-1.tar.gz'
    with tarfile.open(archive,'w:gz') as tar:
        for name in paths+['SOURCE_SHA','SHA256SUMS']:tar.add(bundle/name,arcname=name)
    for mode,directory in [('incoming','external-feed'),('owned','external-feed-owned')]:
        filename=qa/('external-feed-bridge.env' if mode=='incoming' else 'external-feed-owned.env')
        values={'EXTERNAL_FREIGHT_API_URL':'https://qa2.urtruck.kz','EXTERNAL_FREIGHT_DEPLOYMENT_TARGET':'qa2','EXTERNAL_FREIGHT_ADAPTER_DB':str(qa/directory/'adapter.sqlite3'),'EXTERNAL_FREIGHT_SOURCE_DB':str(collector/'state/feed.sqlite3'),'EXTERNAL_FREIGHT_SOURCE_MODE':mode,'EXTERNAL_FREIGHT_IMPORT_ENABLED':'true'}
        filename.write_text('\n'.join(k+'='+v for k,v in values.items()))
    shims=tmp_path/'bin';shims.mkdir();log=tmp_path/'service.log'
    executable(shims/'sudo',"import os,sys\na=sys.argv[1:]\nif a and a[0]=='-n':a=a[1:]\nif a:os.execvp(a[0],a)\n")
    executable(shims/'systemctl',"""import os,sys,pathlib
args=sys.argv[1:]
with open(os.environ['FEED05_SERVICE_LOG'],'a') as f:f.write(' '.join(args)+'\\n')
marker=pathlib.Path(os.environ['FEED05_TIMER_STATE'])
if args[0] in ['is-active','is-enabled'] and args[-1]=='urtruck-qa2-feed-health.timer':sys.exit(0 if marker.exists() else 1)
if args[0]=='enable' and '--now' in args:marker.touch()
if args[0]=='start' and args[-1]=='urtruck-qa2-feed-health.timer':marker.touch()
if args[0] in ['stop','disable'] and 'urtruck-qa2-feed-health.timer' in args:marker.unlink(missing_ok=True)
""")
    # Simulate a new message arriving AFTER online backup, before any rollback.
    executable(shims/'curl',"""import json,sqlite3,os,sys
url=next((arg for arg in sys.argv[1:] if arg.startswith('http://') or arg.startswith('https://')), '')
if url.endswith('/openapi.json'):
    print(json.dumps({'paths':{'/api/v1/external-freight/import':{'post':{}}}}))
elif url.endswith('/health'):
    with sqlite3.connect(os.environ['FEED05_ADAPTER']) as db:
        db.execute("INSERT OR IGNORE INTO incoming_bridge_seen VALUES(999,'new-message',123,'accepted')")
else:
    sys.exit(22)
""")
    real_sha=shutil.which('sha256sum')
    executable(shims/'sha256sum',"import os,sys\nif sys.argv[1:]==[os.environ.get('FEED05_FAIL_PATH')]:print('0'*64+'  '+sys.argv[1])\nelse:os.execv("+repr(real_sha)+",["+repr(real_sha)+"]+sys.argv[1:])\n")
    env={**os.environ,'PATH':str(shims)+os.pathsep+os.environ['PATH'],'FEED05_SERVICE_LOG':str(log),'FEED05_TIMER_STATE':str(tmp_path/'timer-active'),'FEED05_ADAPTER':str(qa/'external-feed/adapter.sqlite3'),'FEED05_FAIL_PATH':str(qa/'ops/telegram-feed/health.py') if fail_hash else ''}
    result=subprocess.run(['bash','-s','--','123','1',source_sha,hashlib.sha256(archive.read_bytes()).hexdigest(),str(archive)],input=remote,text=True,capture_output=True,env=env,timeout=30)
    assert (result.returncode!=0)==fail_hash, result.stdout+result.stderr
    for name,contents in shared.items():assert Path(name).read_bytes()==contents
    with sqlite3.connect(qa/'external-feed/adapter.sqlite3') as db:assert db.execute('SELECT count(*) FROM incoming_bridge_seen WHERE source_queue_id=999').fetchone()[0]==1
    calls=log.read_text()
    assert 'urtruck-telegram-feed.service' not in calls
    if fail_hash:
        assert (qa/'backend/services/external_freight_parser.py').read_text()=='# previous code\n'
        assert not (qa/'external-feed-component-manifest').exists()
        if existing == 'absent':
            assert not (unit_root/'urtruck-qa2-feed-health.timer').exists()
            assert not (qa/'ops/telegram-feed/health.py').exists()
        else:
            assert (unit_root/'urtruck-qa2-feed-health.timer').read_text()=='previous urtruck-qa2-feed-health.timer'
            assert (qa/'ops/telegram-feed/health.py').read_text()=='# previous QA2 health\n'
        assert (tmp_path/'timer-active').exists() == (existing == 'enabled')
    else:
        assert 'QA2_FEED_DEPLOY=verified' in result.stdout
        assert (qa/'ops/telegram-feed/health.py').read_bytes()==(ROOT/'ops/telegram-feed/health.py').read_bytes()
        assert (unit_root/'urtruck-qa2-feed-health.timer').is_file()
        manifest=(qa/'external-feed-component-manifest').read_text()
        assert 'ops/telegram-feed/health.py' in manifest
        snapshot=json.loads((qa/'backups/feed-candidate-123-1/post-install-health-snapshot.json').read_text())
        assert 'telegram' not in snapshot and 'incoming' in snapshot
