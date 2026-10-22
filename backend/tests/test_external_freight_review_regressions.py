"""Independent regression cases. Copy into backend/tests at reviewed repository root.
Run: PYTHONPATH=backend .venv/bin/python -m pytest <this file> -q
Standalone location: set REVIEW573_ROOT to the candidate root.
"""
import asyncio
import importlib.util
import json
import os
import sys
import types
from pathlib import Path


def feed_module():
    root = os.getenv('REVIEW573_ROOT')
    path = Path(root)/'ops/telegram-feed/feed.py' if root else next(
        p/'ops/telegram-feed/feed.py' for p in Path(__file__).parents
        if (p/'ops/telegram-feed/feed.py').exists())
    spec = importlib.util.spec_from_file_location('reviewed_feed', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_telethon(monkeypatch):
    flood = type('FloodWaitError', (Exception,), {})
    monkeypatch.setitem(sys.modules, 'telethon.errors', types.SimpleNamespace(FloodWaitError=flood))


def test_review_unavailable_first_and_later_sources_do_not_create_cursors(tmp_path, monkeypatch):
    m = feed_module(); m.ROOT=tmp_path; m.SOURCES=('bad_first','good_channel','bad_last')
    fake_telethon(monkeypatch)
    async def no_sleep(*args): pass
    monkeypatch.setattr(m.asyncio, 'sleep', no_sleep)
    class Reader:
        async def get_entity(self, source):
            if source.startswith('bad'): raise OSError('offline')
            return types.SimpleNamespace(id=12345, noforwards=False)
        async def iter_messages(self, entity, **kwargs):
            yield types.SimpleNamespace(id=77, date=m.utcnow(), raw_text='Алматы → Москва\nГруз: шины', noforwards=False)
    db=m.database(tmp_path/'source.db')
    report=asyncio.run(m.collect(Reader(),db))
    assert report['bad_first']['blocked']=='OSError'
    assert report['bad_last']['blocked']=='OSError'
    assert [tuple(r) for r in db.execute('SELECT source,message_id FROM app_cursors')]==[('good_channel',77)]
    assert db.execute('SELECT count(*) FROM app_messages').fetchone()[0]==1


def test_review_capture_failure_does_not_ack_cursor(tmp_path,monkeypatch):
    m=feed_module();m.ROOT=tmp_path;m.SOURCES=('test_channel',)
    fake_telethon(monkeypatch)
    async def no_sleep(*args): pass
    monkeypatch.setattr(m.asyncio,'sleep',no_sleep)
    class Reader:
        async def get_entity(self,source):return types.SimpleNamespace(id=12345,noforwards=False)
        async def iter_messages(self,entity,**kwargs):
            yield types.SimpleNamespace(id=77,date=m.utcnow(),raw_text='Алматы → Москва\nГруз: шины',noforwards=False)
    db=m.database(tmp_path/'source.db'); original=m.capture_for_app
    def failed(*args,**kwargs): raise OSError('durability failed')
    m.capture_for_app=failed
    asyncio.run(m.collect(Reader(),db))
    assert not db.execute('SELECT * FROM app_cursors').fetchall()
    m.capture_for_app=original
    asyncio.run(m.collect(Reader(),db))
    assert db.execute('SELECT message_id FROM app_cursors').fetchone()[0]==77
    assert db.execute('SELECT count(*) FROM app_messages').fetchone()[0]==1


def adapter_for(tmp_path):
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    class Response:
        status=200
        def __init__(self,n):self.n=n
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self):return json.dumps({'results':[{'id':str(i),'result':'updated'} for i in range(self.n)]}).encode()
    def opener(req,**kwargs):return Response(len(json.loads(req.data)['records']))
    return ExternalFreightFeedAdapter(db_path=str(tmp_path/'adapter.db'),api_url='https://qa2.urtruck.kz',importer_key='test',opener=opener)


def test_review_switch_mode_preserves_legacy_active_dedup(tmp_path,monkeypatch):
    from services.external_freight_parser import map_selected_message
    from services.external_freight_queue_bridge import IncomingQueueBridge
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    m=feed_module();p=tmp_path/'source.db';db=m.database(p);a=adapter_for(tmp_path)
    text='Алматы → Москва\nГруз: шины'
    a.enqueue(map_selected_message(dict(source_id='123',source_message=88,source_date=m.utcnow().timestamp(),text=text)))
    assert a.flush_once()['sent']==1
    m.capture_for_app(db,'second_channel',456,99,text,m.utcnow())
    result=IncomingQueueBridge(p,a).run_once()
    assert result['sent']==0 and result['duplicates']==1
    with a._connect() as state:
        assert state.execute('SELECT count(*) FROM selected_outbox').fetchone()[0]==1


def test_review_edit_to_duplicate_closes_stale_active(tmp_path,monkeypatch):
    from services.external_freight_queue_bridge import IncomingQueueBridge
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    m=feed_module();p=tmp_path/'source.db';db=m.database(p);a=adapter_for(tmp_path)
    alpha='Алматы → Москва\nГруз: шины';beta='Астана → Бишкек\nГруз: доски'
    for i,text in enumerate([alpha,beta]):m.capture_for_app(db,'test_channel',123,88+i,text,m.utcnow())
    worker=IncomingQueueBridge(p,a);assert worker.run_once()['sent']==2
    with a._connect() as state:
        before=json.loads(state.execute("SELECT payload FROM selected_outbox WHERE source_message_id='88'").fetchone()[0])
    m.capture_for_app(db,'test_channel',123,88,beta,m.utcnow())
    result=worker.run_once();assert result['duplicates']==1 and result['sent']==1
    with a._connect() as state:
        after=json.loads(state.execute("SELECT payload FROM selected_outbox WHERE source_message_id='88'").fetchone()[0])
    assert after['status']=='closed'
    assert after['source_published_at']==before['source_published_at']


def test_review_destination_permission_failure_does_not_stop_app_intake(tmp_path,monkeypatch):
    m=feed_module();fake_telethon(monkeypatch);db=m.database(tmp_path/'source.db')
    class Reader:
        async def get_input_entity(self,target):return target
        async def get_permissions(self,target,me):return types.SimpleNamespace(is_creator=False,is_admin=False)
    state={}
    asyncio.run(m.telegram_tick(Reader(),db,state))
    assert state.get('retry_after',0)>0 and not state.get('target')
    assert m.capture_for_app(db,'test_channel',123,88,'Алматы → Москва\nГруз: шины',m.utcnow())
    assert db.execute('SELECT count(*) FROM app_messages').fetchone()[0]==1
