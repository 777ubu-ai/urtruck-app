"""Обезличенные регрессии потерь машин из снимка источников 23.10.2026."""
from datetime import datetime, timezone
import asyncio
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from datetime import timedelta

import pytest

from services.external_freight_classifier import classify_message
from services.external_freight_parser import map_selected_message, map_selected_messages


def message(text):
    return dict(source='approved_source', source_id='1001', source_message=17,
                source_date=datetime.now(timezone.utc).timestamp(), text=text, phones=[])


@pytest.mark.parametrize('text', [
    'Есть машина\nХоргос-Алматы\n88 куб\nТент',
    'Есть машина рэф\nАЛАШАНЬКОУ\nищу рейс направление Москва',
    'Машина свободна\nНужна загрузка\nАлматы → Москва',
    'Есть свободный транспорт\nАлматы → Москва',
    'ЮК КЕРАК\n📍 КАШКАДАРЁДАН\n📍 АНДИЖОНГА',
])
def test_explicit_vehicle_intents_are_recognized(text):
    assert classify_message(text)['kind'] == 'vehicle'


@pytest.mark.parametrize('text', [
    'Нужен перевозчик\nАлматы → Москва',
    'Груз: доски\nАлматы → Москва\nИщем свободные машины!',
    'Груз готов\nХоргос → Алматы\nЕсть свободная машина? Забирайте рейс!',
    'Tent fura kerak\nToshkent → Nukus\nYuk bor',
    'Груз: доска\nАлматы → Москва\nУ кого есть машины — срочно звоните!',
    'Груз: овощи\nТашкент → Москва\nЕсть машины — звоните/пишите!',
    'Нужна фура\nАлматы → Москва\nЕсть машина — пишите сейчас!',
])
def test_request_for_transport_is_not_vehicle_supply(text):
    assert classify_message(text)['kind'] == 'cargo'


def test_compact_route_and_source_contact_are_preserved():
    text='Есть машина\nХоргос-Алматы\n88 куб\n+77000000001\nТент'
    item=map_selected_message(message(text))
    assert (item['kind'],item['status']) == ('vehicle','active')
    assert (item['origin'],item['destination'],item['volume']) == ('Хоргос','Алматы',88)
    assert item['contacts'] == ['+77000000001']
    assert item['amount'] is None and item['currency'] is None
    assert item['original_text'] == text


@pytest.mark.parametrize('text,origin,destination,count', [
    ('🇨🇳Uluĝchatdan\n✅fura bor 5ta\n❔yuk kerak\n📞901234567', 'Uluĝchat',None,5),
    ('📍 QASHQADARYODAN\n📍 ANDIJONGA\n4 TA KATTA ISUZUGA\nYUK KERAK\n📞901234567', 'QASHQADARYO','ANDIJON',4),
    ('‼ Qarshi Kosondan\n‼ Buxoroga\nYuk kerak\n22 tonna\ntent fura', 'Qarshi Koson','Buxoro',None),
    ('Toshkentdan Nukusga moshina bor tent fura yuk kerak tel 901234567', 'Toshkent','Nukus',None),
    ('Есть машина рэф\nАЛАШАНЬКОУ\nищу рейс направление Москва', 'АЛАШАНЬКОУ','Москва',None),
])
def test_explicit_vehicle_locations_without_fabricated_fields(text,origin,destination,count):
    item=map_selected_message(message(text))
    assert (item['kind'],item['status']) == ('vehicle','active')
    assert (item['origin'],item['destination'],item['vehicle_count']) == (origin,destination,count)
    assert item.get('origin_country') is None and item.get('destination_country') is None


def test_bilingual_same_direction_is_one_vehicle_listing():
    text='YUK KERAK\n📍QASHQADARYODAN\n📍ANDIJONGA\n4 TA KATTA ISUZUGA\n📞901234567\n---\nЮК КЕРАК\n📍КАШКАДАРЁДАН\n📍АНДИЖОНГА\n4 ТА КАТТА ИСУЗУ\n📞901234567'
    items=map_selected_messages(message(text))
    assert len(items)==1 and items[0]['status']=='active'
    assert items[0]['kind']=='vehicle' and items[0]['contacts']==['901234567']


@pytest.mark.parametrize('text', [
    'Есть машина\nУсть-Каменогорск',
    'Есть машина\nСанкт-Петербург',
    'Есть машина\nНеизвестноегороддан\nНезнакомоега',
    'Есть машина\nToshkentdan Nukusga\nQarshidan Buxoroga',
    'Fura bor — yuk kerakmi?\nSizga doimiy yuk topib beramiz!',
])
def test_ambiguous_locations_and_broker_questions_remain_review(text):
    assert map_selected_message(message(text))['status']=='review'


def test_nine_digit_local_contact_requires_source_phone_context():
    item=map_selected_message(message('Yuk kerak\n📍Toshkentdan\n📞901234567\nTent'))
    assert item['contacts']==['901234567']
    other=map_selected_message(message('Есть машина\nАлматы → Москва\nЦена 901234567 KZT'))
    assert other['contacts']==[]
    spaced=map_selected_message(message('Yuk kerak\n📍Toshkentdan\n📞 90 123 45 67'))
    assert spaced['contacts']==['90 123 45 67']


def test_exists_word_does_not_match_inside_quantity():
    text='Ангрен - Барнаул\nВес 22 тонны\nНадо шесть машина тент'
    assert classify_message(text)['kind']!='vehicle'


def test_multiple_segments_never_borrow_contacts():
    items=map_selected_messages(message('1. Есть машина\nХоргос → Алматы\n📞901234567\n2. Есть машина\nМосква → Астана'))
    assert len(items)==2
    assert items[0]['contacts']==['901234567'] and items[1]['contacts']==[]


def collector():
    path=Path(__file__).resolve().parents[2]/'ops/telegram-feed/feed.py'
    spec=importlib.util.spec_from_file_location('supply_collector',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def test_history_captures_120_hours_in_bounded_restartable_pages(tmp_path):
    m=collector();m.APP_HISTORY_PAGE=2
    db=m.database(tmp_path/'source.sqlite3')
    now=m.utcnow()
    messages=[SimpleNamespace(id=i,date=now-timedelta(hours=h),raw_text='Есть машина\nХоргос-Алматы',noforwards=False)
              for i,h in [(5,1),(4,80),(3,119),(2,121)]]
    calls=[]
    class Reader:
        async def iter_messages(self,entity,**kwargs):
            calls.append(kwargs)
            candidates=[msg for msg in messages if msg.id<kwargs.get('offset_id',999)]
            for msg in candidates[:kwargs['limit']]:yield msg
    reader=Reader();entity=SimpleNamespace(id=1001)
    db.execute("INSERT INTO cursors VALUES('approved_source',99)");db.commit()
    a=asyncio.run(m.collect_app_history(reader,db,'approved_source',entity))
    assert a['status']=='catching_up' and a['seen']==2
    db.close();db=m.database(tmp_path/'source.sqlite3')
    b=asyncio.run(m.collect_app_history(reader,db,'approved_source',entity))
    assert b['status']=='complete'
    assert [r[0] for r in db.execute('SELECT source_message FROM app_messages ORDER BY source_message')]==[3,4,5]
    assert db.execute('SELECT count(*) FROM queue').fetchone()[0]==0
    assert db.execute('SELECT message_id FROM cursors').fetchone()[0]==99
    assert calls==[{'limit':2},{'limit':2,'offset_id':4}]
    assert asyncio.run(m.collect_app_history(reader,db,'approved_source',entity))['seen']==0
    assert len(calls)==2


def test_history_capture_failure_does_not_skip_record(tmp_path,monkeypatch):
    m=collector();db=m.database(tmp_path/'source.sqlite3')
    class Reader:
        async def iter_messages(self,entity,**kwargs):
            for i in [5,4]:
                if i<kwargs.get('offset_id',999):
                    yield SimpleNamespace(id=i,date=m.utcnow()-timedelta(hours=80),raw_text='Yuk kerak\n📍Toshkentdan',noforwards=False)
    original=m.capture_for_app
    def capture(*args,**kwargs):
        if args[3]==4:raise OSError('synthetic capture failure')
        return original(*args,**kwargs)
    monkeypatch.setattr(m,'capture_for_app',capture)
    with pytest.raises(OSError):asyncio.run(m.collect_app_history(Reader(),db,'source',SimpleNamespace(id=1001)))
    assert db.execute('SELECT oldest_id FROM app_history').fetchone()[0]==5
    monkeypatch.setattr(m,'capture_for_app',original)
    asyncio.run(m.collect_app_history(Reader(),db,'source',SimpleNamespace(id=1001)))
    assert db.execute('SELECT count(*) FROM app_messages').fetchone()[0]==2


def test_control_scan_rotates_bounded_history_without_second_reader(tmp_path,monkeypatch):
    m=collector();m.ROOT=tmp_path;m.SOURCES=('source_a','source_b','source_c','source_d')
    monkeypatch.setitem(sys.modules,'telethon.errors',SimpleNamespace(FloodWaitError=type('FloodWaitError',(Exception,),{})))
    async def no_sleep(*args):pass
    monkeypatch.setattr(m.asyncio,'sleep',no_sleep)
    class Reader:
        history_calls=[]
        async def get_entity(self,source):return SimpleNamespace(id=m.SOURCES.index(source)+1,noforwards=False)
        async def iter_messages(self,entity,**kwargs):
            if kwargs=={'limit':m.APP_HISTORY_PAGE}:self.history_calls.append(entity.id)
            if False:yield None
    reader=Reader();db=m.database(tmp_path/'source.sqlite3')
    asyncio.run(m.collect(reader,db))
    assert reader.history_calls==[1,2]
    asyncio.run(m.collect(reader,db))
    assert reader.history_calls==[1,2,3,4]
    asyncio.run(m.collect(reader,db))
    assert reader.history_calls==[1,2,3,4]
    assert db.execute('SELECT count(*) FROM queue').fetchone()[0]==0


def test_history_floodwait_pauses_same_reader_and_preserves_cursor(tmp_path,monkeypatch):
    m=collector();m.ROOT=tmp_path;m.SOURCES=('source_a','source_b')
    class FloodWaitError(Exception):seconds=17
    monkeypatch.setitem(sys.modules,'telethon.errors',SimpleNamespace(FloodWaitError=FloodWaitError))
    async def no_sleep(*args):pass
    monkeypatch.setattr(m.asyncio,'sleep',no_sleep)
    class Reader:
        history_calls=0
        async def get_entity(self,source):return SimpleNamespace(id=1,noforwards=False)
        async def iter_messages(self,entity,**kwargs):
            if kwargs=={'limit':m.APP_HISTORY_PAGE}:
                self.history_calls+=1
                raise FloodWaitError('synthetic flood wait')
            if False:yield None
    reader=Reader();db=m.database(tmp_path/'source.sqlite3')
    result=asyncio.run(m.collect(reader,db))
    assert result['source_a']['history']['blocked']=='flood_wait'
    assert reader.history_calls==1
    assert db.execute('SELECT oldest_id FROM app_history').fetchone()[0]==0
    assert db.execute('SELECT last_error FROM app_history').fetchone()[0]=='FloodWaitError'
    assert asyncio.run(m.collect(reader,db))=={'status':'flood_wait'}
    assert reader.history_calls==1
