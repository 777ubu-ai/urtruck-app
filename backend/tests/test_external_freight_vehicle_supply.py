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
from services.external_freight_parser import block_contacts, map_selected_message, map_selected_messages


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


@pytest.mark.parametrize('offer', [
    'Заберу груз',
    'Заберу ваш груз',
    'Доставлю товар',
    'Перевезу груз',
    'Готов перевезти',
    'Ищу обратный груз',
    'Еду пустой',
    'Освободился',
])
def test_first_person_carrier_offers_are_vehicle_supply(offer):
    result = classify_message(f'{offer}\nАлматы → Москва')
    assert result['kind'] == 'vehicle'
    assert result['status'] == 'active'


def test_vehicle_ready_with_freight_service_description_is_vehicle_supply():
    result = classify_message('Машина свободна, перевозка грузов\nАлматы → Москва')
    assert result['kind'] == 'vehicle'
    assert result['status'] == 'active'


@pytest.mark.parametrize('text', [
    'Ищу груз\nМашина в ремонте', 'Машина не свободна, ищу груз',
    'Есть машина\nПродам фуру', 'Есть машина\nНужен водитель',
    'Не ищу груз', 'Не освободился\nАлматы',
])
def test_unavailable_or_sale_or_vacancy_is_not_available_vehicle(text):
    assert classify_message(text)['kind'] != 'vehicle'


def test_future_offer_preserves_explicit_readiness_instead_of_calling_it_ready_now():
    item = map_selected_message(message('Освободимся через неделю\nАлматы → Москва'))
    assert item['kind'] == 'vehicle'
    assert item['ready_text'] == 'Освободимся через неделю'
    assert item['loading_date'] is None


def test_numbered_cargo_and_vehicle_blocks_have_separate_types_and_full_source():
    text = '1. Алматы → Москва\nГруз готов, нужен тент\n\n2. Ташкент → Казань\nМашина свободна, ищу груз'
    items = map_selected_messages(message(text))
    assert [item['kind'] for item in items] == ['cargo', 'vehicle']
    assert all(item['source_text'] == text and item['status'] == 'active' for item in items)


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


def test_parsed_contact_list_is_completed_from_source_text_without_format_rewrite():
    raw = message('Есть машина\nХоргос → Алматы\nТел: 8 705 174 35 67')
    raw['phones'] = ['+7 700 000 00 01']
    item = map_selected_message(raw)
    assert item['contacts'] == ['+7 700 000 00 01', '8 705 174 35 67']


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


def test_explicit_cargo_search_from_verified_city_keeps_partial_vehicle_location():
    item=map_selected_message(message('ГАЗель-next 6.25/2.45/2.55\nТент\nИщу груз с Оренбурга'))
    assert (item['kind'],item['status'])==('vehicle','active')
    assert item['origin']=='Оренбурга' and item['destination'] is None
    assert item['contacts']==[] and item['amount'] is None and item['weight'] is None


@pytest.mark.parametrize('text',[
    'Есть машина\nИщу груз с оплатой наличными',
    'Есть машина\nИщу груз с Неизвестногогорода',
    'Есть машина\nИщу груз с Оренбурга\nИщу груз с Москвы',
])
def test_unknown_or_conflicting_cargo_search_locations_remain_review(text):
    item=map_selected_message(message(text))
    assert item['status']=='active' and item['origin'] is None and item['destination'] is None


@pytest.mark.parametrize('text', [
    'Есть машина\nУсть-Каменогорск',
    'Есть машина\nСанкт-Петербург',
    'Есть машина\nНеизвестноегороддан\nНезнакомоега',
    'Есть машина\nToshkentdan Nukusga\nQarshidan Buxoroga',
])
def test_unparsed_but_clear_vehicle_offer_stays_visible(text):
    assert map_selected_message(message(text))['status']=='active'


def test_broker_question_and_promotion_remain_review():
    assert map_selected_message(message('Fura bor — yuk kerakmi?\nSizga doimiy yuk topib beramiz!'))['status']=='review'


def test_nine_digit_local_contact_requires_source_phone_context():
    item=map_selected_message(message('Yuk kerak\n📍Toshkentdan\n📞901234567\nTent'))
    assert item['contacts']==['901234567']
    other=map_selected_message(message('Есть машина\nАлматы → Москва\nЦена 901234567 KZT'))
    assert other['contacts']==[]
    spaced=map_selected_message(message('Yuk kerak\n📍Toshkentdan\n📞 90 123 45 67'))
    assert spaced['contacts']==['90 123 45 67']


@pytest.mark.parametrize('number', ['123456', '87051743567', '998705250671', '+998990512603'])
def test_confirmed_footer_contact_formats_are_preserved(number):
    item=map_selected_message(message(f'Есть машина\nХоргос\n{number}'))
    assert item['contacts']==[number]


def test_six_digit_footer_contact_requires_terminal_standalone_line():
    assert block_contacts('Есть машина\nАлматы\n123456')==['123456']
    assert block_contacts('Есть машина\nАлматы\nТел: 123456')==['123456']
    assert block_contacts('Есть машина\n123456\nАлматы\nТент\nВес 10 тонн')==[]
    assert block_contacts('Есть машина\nНомер заявки: 123456')==[]


@pytest.mark.parametrize('number', ['1234567', '12345678'])
def test_standalone_seven_or_eight_digit_phone_is_kept_anywhere_in_post(number):
    text = f'Нужен тент\nАлматы → Москва\n{number}\nУсловия оплаты\nЦена 9000 USD\nГруз готов\nСрочно'
    assert block_contacts(text) == [number]


def test_keycap_emoji_digits_with_phone_marker_are_extracted():
    assert block_contacts('Нужен тент\nАлматы → Ташкент\n📞 9️⃣9️⃣8️⃣9️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣') == ['998901234567']


def test_keycap_six_digit_footer_is_extracted_as_owner_confirmed_local_contact():
    assert block_contacts('Нужен тент\nАлматы → Ташкент\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣') == ['123456']


def test_shared_footer_contact_is_not_copied_to_multiple_route_blocks():
    items=map_selected_messages(message(
        '1. Есть машина\nХоргос → Алматы\n2. Есть машина\nМосква → Астана\n123456'))
    assert len(items)==2
    assert items[0]['contacts']==[]
    assert items[1]['contacts']==['123456']


def test_exists_word_does_not_match_inside_quantity():
    text='Ангрен - Барнаул\nВес 22 тонны\nНадо шесть машина тент'
    assert classify_message(text)['kind']!='vehicle'


@pytest.mark.parametrize('phrase', [
    'У кого есть тент срочно звоните', 'У кого есть реф звоните',
    'Если есть машина звоните', 'Есть транспортная компания',
    'Есть машина в ремонте, ищем запчасти', 'Есть машина не свободна',
])
def test_conditional_and_unavailable_transport_is_not_vehicle_supply(phrase):
    item=map_selected_message(message(phrase+'\nАлматы → Москва'))
    assert item['status']=='review'


@pytest.mark.parametrize('line', [
    'Цена 1200000000 KZT', 'Цена 901234567 KZT телефон уточняйте',
    'Стоимость 1200000000', 'Телефон уточняйте, цена 901234567',
    'Цена 1200000000 USD; тел: +77000000001',
    'Цена USD 1200000000', 'Цена: KZT 1200000000', 'USD 1200000000',
    'Цена: UZS 1200000000', 'Цена $ 1200000000',
])
def test_price_never_becomes_contact(line):
    item=map_selected_message(message('Есть машина\nАлматы → Москва\n'+line))
    assert item['contacts']==(['+77000000001'] if '+77000000001' in line else [])


def test_phone_context_belongs_to_number_not_whole_line():
    item=map_selected_message(message('Есть машина\nАлматы → Москва\nтелефон уточняйте: 901234567'))
    assert item['contacts']==[]


def test_multiple_segments_never_borrow_contacts():
    items=map_selected_messages(message('1. Есть машина\nХоргос → Алматы\n📞901234567\n2. Есть машина\nМосква → Астана'))
    assert len(items)==2
    assert items[0]['contacts']==['901234567'] and items[1]['contacts']==[]


def test_history_capture_does_not_displace_fresh_publication(tmp_path,monkeypatch):
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    from services.external_freight_queue_bridge import IncomingQueueBridge
    import json
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    m=collector();path=tmp_path/'source.sqlite3';db=m.database(path);now=m.utcnow()
    for i in range(120):
        m.capture_for_app(db,'approved_source',1001,i+1,
                          f'Груз: доски\nАлматы → Москва\nНомер заявки: {i+1}',
                          now-timedelta(hours=30 if i<60 else 80))
    m.capture_for_app(db,'approved_source',1001,999,'Есть машина\nАлматы → Астана',now)
    m.capture_for_app(db,'approved_source',1001,998,'Машина свободна\nОренбург → Ташкент',now-timedelta(hours=50))
    # Старый хвост + массовый backfill, принятый позже свежей публикации.
    db.execute('UPDATE app_messages SET updated_at=? WHERE source_message<=60',(now.timestamp()-3600,))
    db.execute('UPDATE app_messages SET updated_at=? WHERE source_message>60 AND source_message<999',(now.timestamp()+1,))
    db.commit();received=[]
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
    assert result['scanned']==50
    assert any(r['source_message_id']=='999' for r in received)
    assert any(r['source_message_id']=='998' and r['kind']=='vehicle' for r in received)
    assert result['enqueued_active_by_kind']['vehicle'] >= 2
    # Продвижение старого хвоста также сохраняется, а Telegram queue не меняется.
    with adapter._connect() as state:
        assert state.execute('select count(*) from incoming_bridge_seen where source_queue_id<=60').fetchone()[0]>0
    assert db.execute('select count(*) from queue').fetchone()[0]==0


def collector():
    path=Path(__file__).resolve().parents[2]/'ops/telegram-feed/feed.py'
    spec=importlib.util.spec_from_file_location('supply_collector',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def test_history_captures_seven_days_in_bounded_restartable_pages(tmp_path):
    m=collector();m.APP_HISTORY_PAGE=2
    db=m.database(tmp_path/'source.sqlite3')
    now=m.utcnow()
    messages=[SimpleNamespace(id=i,date=now-timedelta(hours=h),raw_text='Есть машина\nХоргос-Алматы',noforwards=False)
              for i,h in [(5,1),(4,80),(3,167),(2,169)]]
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


@pytest.mark.parametrize('phrase', [
    'нужен груз с Самарканда до Ташкента машина готов тент +77000000001',
    'Ищу груз из Самарканда в Ташкент, машина готова, тент +77000000001',
])
def test_explicit_ru_vehicle_pair_in_sentence_preserves_literal_route(phrase):
    item=map_selected_message(message(phrase))
    assert (item['kind'],item['status'])==('vehicle','active')
    assert item['origin']=='Самарканда'
    assert item['destination']==('Ташкента' if 'до Ташкента' in phrase else 'Ташкент')
    assert item['contacts']==['+77000000001']
    assert item['amount'] is None and item['currency'] is None
    assert item['original_text']==phrase


@pytest.mark.parametrize('phrase', [
    'нужен груз с Самарканда до Неизвестногогорода машина готов тент',
    'нужен груз с Неизвестногогорода до Ташкента машина готов тент',
    'нужен груз с Самарканда до Ташкента-на-Дону машина готов тент',
    'нужен груз с Самарканда до Ташкента или Москвы машина готов тент',
    'нужен груз с Самарканда до Ташкента до Москвы машина готов тент',
    'нужен груз с Самарканда до Ташкента машина готов, нужен груз с Москвы до Алматы',
    'нужен груз с Самарканда до Ташкента\nToshkentdan Nukusga',
])
def test_ambiguous_ru_vehicle_pair_remains_review(phrase):
    item=map_selected_message(message(phrase))
    assert item['status']=='active'
    assert item['origin'] is None and item['destination'] is None


def test_verified_uzbek_samarqand_spelling_preserves_whole_vehicle_route():
    phrase='Samarqanddan Toshkentga yuk kerak, tent mashina tayyor. Tel: 901234567'
    item=map_selected_message(message(phrase))
    assert (item['kind'],item['status'])==('vehicle','active')
    assert (item['origin'],item['destination'])==('Samarqand','Toshkent')
    assert item['contacts']==['901234567']
    assert item.get('origin_country') is None and item['amount'] is None


def test_bare_number_is_not_guessed_to_be_phone_in_ru_vehicle_pair():
    item=map_selected_message(message('нужен груз с Самарканда до Ташкента машина готов тент 901234567'))
    assert item['status']=='active' and item['origin']=='Самарканда'
    assert item['contacts']==[]
