"""Independent regressions for the six FEED-05 audit findings."""
import importlib.util
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from services.external_freight_parser import map_selected_messages
from database import external_freight_dal as dal
from database.external_freight_connection import get_conn

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('feed05_snapshot_fixture', ROOT/'backend/tests/test_telegram_feed_health_snapshot.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
health = fixture.health


@pytest.mark.parametrize('revision', ['old-message:current-parser', 'current-message:old-parser'])
def test_health_requires_both_message_and_parser_revision(tmp_path, revision):
    now = datetime.now(timezone.utc).timestamp()
    source, qa = fixture._fixture(tmp_path, now)
    for directory in ['external-feed','external-feed-owned']:
        with sqlite3.connect(qa/directory/'adapter.sqlite3') as db:
            db.execute('UPDATE incoming_bridge_seen SET source_revision=?', (revision,))
    assert health.snapshot(root=source, qa_root=qa, now=now)['incoming']['source_waiting'] == 2


def test_ready_age_alarm_is_not_cleared_by_occasional_success():
    state = {}
    start = 10_000
    for seconds in range(0, 16*60+1, 120):
        current = {'incoming': {'ready': 1, 'backlog': 1000, 'progress': seconds,
            'oldest_ready_age_seconds': 1000+seconds,
            'oldest_ready_source_published_at': '2026-10-01T00:00:00+00:00'}}
        state = health.evaluate(current, state, start+seconds)
    assert 'incoming_ready_age_exceeded' in state['problems']
    assert 'incoming_delivery_stalled' not in state['problems']


@pytest.mark.parametrize('api_status,active,review', [('active',1,0),('review',0,1),(None,0,0)])
def test_api_ack_is_not_proof_of_an_active_card(tmp_path, monkeypatch, api_status, active, review):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    now = datetime.now(timezone.utc)
    class Response:
        status=200
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self):
            item={'id':'api-card','result':'created'}
            if api_status is not None:item['status']=api_status
            return json.dumps({'results':[item]}).encode()
    adapter=ExternalFreightFeedAdapter(db_path=str(tmp_path/'outbox.db'), api_url='https://qa2.urtruck.kz', importer_key='synthetic', opener=lambda *args,**kw: Response(),clock=lambda:now.timestamp())
    adapter.enqueue({'source_id':'test','source_message_id':'1','text':'Алматы → Астана\nНужен тент, груз готов','source_published_at':now.isoformat()})
    result=adapter.flush_once()
    assert result['confirmed_deliveries']==active
    assert result['api_accepted']==1
    assert result['review_accepted']==review
    assert adapter.pending_count()==0, 'accepted review must not be retried forever'


@pytest.mark.parametrize('marker',['•','-','*','▪'])
def test_bulleted_cargo_and_vehicle_are_independent_offers(marker):
    text=f'{marker} Алматы → Астана\nНужен тент, груз готов\n+77000000001\n{marker} Ташкент → Москва\nЕсть свободная машина, тент\n+998900000002'
    records=map_selected_messages({'source_id':'synthetic','source_message_id':'1','text':text,'source_published_at':datetime.now(timezone.utc).isoformat()})
    assert len(records)==2
    assert {r['kind'] for r in records}=={'cargo','vehicle'}
    assert all(r['status']=='active' for r in records)
    assert all(r['source_text']==text for r in records)
    assert records[0]['contacts']!=records[1]['contacts']


def test_undated_review_has_finite_non_rolling_retention(tmp_path,monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH',str(tmp_path/'feed.db'))
    dal.init_schema()
    now=datetime.now(timezone.utc)
    real_utc=dal._utc
    clock=[now]
    monkeypatch.setattr(dal,'_utc',lambda value=None: clock[0] if value is None else real_utc(value))
    raw={'source_id':'unknown-date','source_message_id':'1','kind':'cargo','original_text':'Алматы → Астана\nНужен тент','classification_status':'approved'}
    result=dal.import_records([raw])[0]
    with get_conn() as db:
        first=dict(db.execute('SELECT * FROM external_freight_items').fetchone())
    assert first['status']=='review'
    assert first['expires_at']==(now+timedelta(days=30)).isoformat()
    clock[0]=now+timedelta(days=29)
    dal.import_records([raw])
    with get_conn() as db:assert db.execute('SELECT expires_at FROM external_freight_items').fetchone()[0]==first['expires_at']
    clock[0]=now+timedelta(days=31)
    assert dal.purge_expired_items()==1
    assert dal.import_records([raw])[0]['result']=='expired', 'replay must not restore purged text'


def test_undated_ready_identity_ages_even_when_other_deliveries_succeed():
    state={}
    for t in range(0, 961, 120):
        state=health.evaluate({'incoming':{'ready':1,'backlog':1000,'progress':t,
            'oldest_ready_key':'opaque-persisting-row','oldest_ready_age_seconds':None}},state,10000+t)
    assert 'incoming_ready_age_exceeded' in state['problems']
    recovered=health.evaluate({'incoming':{'ready':1,'backlog':1000,'progress':1000,
        'oldest_ready_key':'next-row'}},state,11000)
    assert 'incoming_ready_age_exceeded' not in recovered['problems']


def test_legacy_undated_null_expiry_is_purged_after_thirty_days_without_extension(tmp_path,monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH',str(tmp_path/'feed.db'))
    dal.init_schema()
    raw={'source_id':'legacy','source_message_id':'1','kind':'cargo','original_text':'Объявление без даты'}
    dal.import_records([raw])
    old=(datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
    with get_conn() as db:db.execute('UPDATE external_freight_items SET ingested_at=?,expires_at=NULL',(old,))
    assert dal.purge_expired_items()==1
    assert dal.import_records([raw])[0]['result']=='expired'


def test_import_limits_actual_stream_before_json_and_keeps_auth(tmp_path,monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api import external_freight as api
    monkeypatch.setattr(api,'MAX_IMPORT_BODY_BYTES',512)
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED','true')
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORTER_KEY','synthetic-secret')
    app=FastAPI();app.include_router(api.router,prefix='/api/v1/external-freight')
    client=TestClient(app)
    path='/api/v1/external-freight/import'
    assert client.post(path,content=b'x'*513).status_code==413
    assert client.post(path,content=(chunk for chunk in [b'x'*256,b'x'*257]),headers={'Content-Type':'application/json'}).status_code==413
    assert client.post(path,json={'records':[]}).status_code==401
    assert client.post(path,json={'records':[]},headers={'X-External-Importer-Key':'wrong'}).status_code==401


def test_qa2_health_cli_uses_independent_state_and_never_recovers_collector(tmp_path):
    import subprocess,sys
    now=datetime.now(timezone.utc).timestamp()
    collector,qa=fixture._fixture(tmp_path,now)
    command=[sys.executable,str(ROOT/'ops/telegram-feed/health.py'),'--qa2-only','--source-root',str(collector),'--qa-root',str(qa),'--state-dir',str(qa/'health-state')]
    result=subprocess.run(command,capture_output=True,text=True,check=True)
    state=json.loads(result.stdout)
    assert 'telegram' not in state['snapshot']
    assert state['notification']=='not_configured'
    assert (qa/'health-state/health.json').is_file()
    assert not (collector/'state/health.json').exists()
    forbidden=subprocess.run(command+['--recover'],capture_output=True,text=True)
    assert forbidden.returncode!=0
    assert 'must never restart' in forbidden.stderr


def test_422_isolation_counts_review_and_active_acks_separately(tmp_path,monkeypatch):
    import urllib.error
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    now=datetime.now(timezone.utc)
    def opener(request,**kwargs):
        records=json.loads(request.data)['records']
        if len(records)>1:raise urllib.error.HTTPError(request.full_url,422,'synthetic',{},None)
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps({'results':[{'id':'test','result':'created','status':'review' if records[0]['source_message_id']=='1' else 'active'}]}).encode()
        return Response()
    adapter=ExternalFreightFeedAdapter(db_path=str(tmp_path/'isolate.db'),api_url='https://qa2.urtruck.kz',importer_key='synthetic',opener=opener,clock=lambda:now.timestamp())
    for ident in ['1','2']:adapter.enqueue({'source_id':'test','source_message_id':ident,'text':'Алматы → Астана\nНужен тент, груз готов','source_published_at':now.isoformat()})
    result=adapter.flush_once()
    assert result['confirmed_deliveries']==1
    assert result['api_accepted']==2 and result['review_accepted']==1
    assert adapter.pending_count()==0


def test_bullet_common_footer_is_shared_only_when_explicit():
    base='• Алматы → Астана\nНужен тент, груз готов\n• Ташкент → Москва\nЕсть свободная машина, тент\n'
    for footer,shared in [('Контакт для всех: +77000000001',True),('+77000000001',False)]:
        rows=map_selected_messages({'source_id':'test','source_message_id':'footer','text':base+footer,'source_published_at':datetime.now(timezone.utc).isoformat()})
        assert len(rows)==2
        assert bool(rows[0]['contacts']) is shared
        assert rows[1]['contacts']


def test_a_feature_bullet_list_is_not_split_into_invented_offers():
    text='• Нужен тент, груз готов\nАлматы → Астана\n• Загрузка сбоку\n• Оплата после выгрузки\n+77000000001'
    rows=map_selected_messages({'source_id':'test','source_message_id':'features','text':text,'source_published_at':datetime.now(timezone.utc).isoformat()})
    assert len(rows)==1 and rows[0]['original_text']==text


def test_old_unparsed_source_alerts_despite_regular_source_progress():
    state={}
    for t in range(0, 961, 120):
        state=health.evaluate({'incoming':{'ready':0,'source_waiting':1000,
            'source_progress':t,'oldest_source_waiting_age_seconds':1000+t}},state,10000+t)
    assert 'incoming_source_age_exceeded' in state['problems']
    assert 'incoming_source_stalled' not in state['problems']
