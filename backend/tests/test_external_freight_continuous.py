import importlib.util
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from services.external_freight_parser import map_selected_messages, map_selected_message
from services.external_freight_classifier import classify_message
from services.external_freight_queue_bridge import IncomingQueueBridge
from services.external_freight_import_adapter import ExternalFreightFeedAdapter


def raw(text, **extra):
    return dict(source='public_channel', source_id='12345', source_message=88,
                source_date=datetime.now(timezone.utc).timestamp(), text=text, **extra)


def test_need_machine_is_cargo_empty_container_is_not_vehicle():
    for text in ['Нужна машина\nАлматы → Москва', 'Нужны 2 машины\nАлматы → Москва',
                 'Груз: порожние контейнеры\nАлматы → Москва']:
        assert classify_message(text)['kind'] == 'cargo'
    assert classify_message('Есть свободная машина\nАлматы → Москва')['kind'] == 'vehicle'
    assert classify_message('Жүк керек\nАлматы → Москва')['kind'] == 'vehicle'


def test_separate_blocks_do_not_borrow_price_phone_or_direction():
    text='1. Алматы → Москва\nГруз: шины\n1500 USD\n+77001234567\n2. Астана → Бишкек\nЕсть свободная машина'
    a,b=map_selected_messages(raw(text, phones=['+79999999999']))
    assert (a['kind'],a['origin'],a['destination'],a['amount'])==('cargo','Алматы','Москва',1500)
    assert a['contacts']==['+77001234567']
    assert (b['kind'],b['origin'],b['destination'],b['amount'])==('vehicle','Астана','Бишкек',None)
    assert b['contacts']==[]
    assert (a['segment_id'],b['segment_id'])==('block-1','block-2')


def test_route_first_blocks_and_missing_contact_allowed():
    a,b=map_selected_messages(raw('Алматы → Москва\nГруз: шины\nАстана → Бишкек\nГруз: доски'))
    assert a['cargo_name']=='шины' and b['cargo_name']=='доски'
    assert a['status']==b['status']=='active'
    assert a['contacts']==b['contacts']==[]


def test_partial_direction_is_not_fabricated():
    item=map_selected_message(raw('Есть свободная машина\nНахожусь: Алматы'))
    assert item['origin']=='Алматы' and item['destination'] is None
    assert item['status']=='active'


def collector():
    path=next(parent/'ops/telegram-feed/feed.py' for parent in Path(__file__).parents if (parent/'ops/telegram-feed/feed.py').exists())
    spec=importlib.util.spec_from_file_location('continuous_collector',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def test_collector_restricts_existing_state_database_and_sidecars(tmp_path):
    m=collector()
    root=tmp_path/'collector'
    state=root/'state'
    state.mkdir(parents=True,mode=0o755)
    path=state/'feed.sqlite3'
    raw=sqlite3.connect(path)
    try:
        raw.execute('PRAGMA journal_mode=WAL')
        raw.execute('CREATE TABLE sample (value TEXT)')
        raw.execute("INSERT INTO sample VALUES ('private')")
        raw.commit()
        for candidate in (path,Path(f'{path}-wal'),Path(f'{path}-shm')):
            assert candidate.exists()
            candidate.chmod(0o644)
        state.chmod(0o755)
        m.ROOT=root
        db=m.database()
        try:
            assert db.execute('SELECT value FROM sample').fetchone()[0]=='private'
            assert state.stat().st_mode & 0o777 == 0o700
            for candidate in (path,Path(f'{path}-wal'),Path(f'{path}-shm')):
                assert candidate.stat().st_mode & 0o777 == 0o600
        finally:
            db.close()
    finally:
        raw.close()


def test_capture_without_phone_legacy_queue_unchanged_and_edit_ttl(tmp_path):
    m=collector();db=m.database(tmp_path/'source.sqlite3')
    published=m.utcnow()
    assert m.capture_for_app(db,'public_channel',12345,88,'Нужна машина\nАлматы → Москва',published)
    assert not m.capture_for_app(db,'public_channel',12345,88,'Нужна машина\nАлматы → Москва',published)
    assert m.capture_for_app(db,'public_channel',12345,88,'Нужна машина\nАлматы → Москва\nЦена 100 USD',published)
    assert db.execute('select count(*) from app_messages').fetchone()[0]==1
    assert db.execute('select count(*) from queue').fetchone()[0]==0
    assert db.execute('select source_date from app_messages').fetchone()[0]==published.timestamp()


def test_incoming_delivers_before_telegram_and_survives_restart(tmp_path,monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    m=collector();path=tmp_path/'source.sqlite3';db=m.database(path)
    m.capture_for_app(db,'public_channel',12345,88,'Есть свободная машина\nАлматы → Москва',m.utcnow())
    received=[]
    def opener(request,timeout):
        records=json.loads(request.data)['records'];received.extend(records)
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps({'results':[{'id':str(i),'result':'created'} for i,_ in enumerate(records)]}).encode()
        return Response()
    adapter=ExternalFreightFeedAdapter(db_path=str(tmp_path/'adapter.sqlite3'),api_url='https://qa2.urtruck.kz',importer_key='test',opener=opener)
    worker=IncomingQueueBridge(path,adapter)
    good=adapter.opener
    adapter.opener=lambda *a,**kw: (_ for _ in ()).throw(OSError('offline'))
    assert worker.run_once()['status']=='retry_scheduled'
    assert adapter.pending_count()==1
    adapter.opener=good
    adapter.clock=lambda:datetime.now(timezone.utc).timestamp()+60
    result=IncomingQueueBridge(path,adapter).run_once()
    assert result['sent']==1 and result['scanned']==0
    assert received[0]['kind']=='vehicle' and received[0]['status']=='active'
    assert IncomingQueueBridge(path,adapter).run_once()['sent']==0
    assert db.execute('select count(*) from queue').fetchone()[0]==0


def test_publisher_has_no_night_gate():
    m=collector()
    class DB:
        def execute(self,query):
            class R:
                def fetchone(self):return [None] if 'max(' in query else [0]
            return R()
    assert m.due(DB(),datetime(2026,10,24,22,0,tzinfo=timezone.utc))


def test_one_closed_block_does_not_close_other_blocks():
    a,b=map_selected_messages(raw('1. Алматы → Москва\nГруз: доски\nЗаявка закрыта\n2. Астана → Бишкек\nЕсть свободная машина'))
    assert a['status']=='closed' and b['status']=='active'


def test_empty_container_and_vehicle_wording_do_not_mix():
    item=map_selected_message(raw('Алматы → Павлодар\nГруз: порожние контейнеры\nНужна машина'))
    assert item['kind']=='cargo' and item['status']=='active'


def test_both_feeds_receive_new_messages_and_exact_duplicate_is_suppressed(tmp_path,monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    m=collector();path=tmp_path/'source.sqlite3';db=m.database(path)
    texts=['Алматы → Москва\nГруз: шины','Астана → Бишкек\nЕсть свободная машина']
    for i,text in enumerate(texts):m.capture_for_app(db,'public_channel',12345,88+i,text,m.utcnow())
    m.capture_for_app(db,'other_channel',54321,999,texts[0],m.utcnow())
    received=[]
    def opener(request,timeout):
        records=json.loads(request.data)['records'];received.extend(records)
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps({'results':[{'id':str(i),'result':'created'} for i,_ in enumerate(records)]}).encode()
        return Response()
    adapter=ExternalFreightFeedAdapter(db_path=str(tmp_path/'adapter.sqlite3'),api_url='https://qa2.urtruck.kz',importer_key='test',opener=opener)
    result=IncomingQueueBridge(path,adapter).run_once()
    assert result['sent']==2 and result['duplicates']==1
    assert {r['kind'] for r in received}=={'cargo','vehicle'}
    assert IncomingQueueBridge(path,adapter).run_once()['sent']==0


def test_scan_failure_keeps_first_durable_cursor_and_recovers_next_message(tmp_path,monkeypatch):
    import asyncio
    import sys
    import types
    m=collector();m.ROOT=tmp_path;m.SOURCES=('test_channel',)
    class FloodWaitError(Exception):pass
    monkeypatch.setitem(sys.modules,'telethon.errors',types.SimpleNamespace(FloodWaitError=FloodWaitError))
    db=m.database(tmp_path/'source.sqlite3')
    class Reader:
        fail=True
        queries=[]
        async def get_entity(self,source):return types.SimpleNamespace(id=12345,noforwards=False)
        async def iter_messages(self,entity,**kwargs):
            self.queries.append(kwargs)
            if not kwargs.get('reverse'):return  # Exercise failure in checkpointed history.
            for i in [1,2]:
                if i<=kwargs.get('min_id',0):continue
                if i==2 and self.fail:raise OSError('temporary')
                yield types.SimpleNamespace(id=i,date=m.utcnow(),raw_text='Алматы → Москва\nГруз: шины',noforwards=False)
    reader=Reader()
    asyncio.run(m.collect(reader,db))
    assert db.execute('select message_id from app_cursors').fetchone()[0]==1
    assert db.execute('select count(*) from app_messages').fetchone()[0]==1
    reader.fail=False
    asyncio.run(m.collect(reader,db))
    assert reader.queries[-1]['reverse'] is True and reader.queries[-1]['min_id']==1
    assert db.execute('select message_id from app_cursors').fetchone()[0]==2
    assert db.execute('select count(*) from app_messages').fetchone()[0]==2
