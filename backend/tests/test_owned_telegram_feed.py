import asyncio
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from services.owned_telegram_feed import OWNED_SOURCE, map_owned_messages
from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from services.external_freight_queue_bridge import IncomingQueueBridge, OwnedTelegramQueueBridge


def raw(text, **kw):
    return dict(source=OWNED_SOURCE, source_id='123', source_message=44,
                source_date=datetime.now(timezone.utc).timestamp(), text=text, **kw)


def collector():
    path = Path(__file__).resolve().parents[2] / 'ops/telegram-feed/feed.py'
    spec = importlib.util.spec_from_file_location('owned_test_collector', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_prepared_emoji_selection_shares_footer_but_not_price():
    text = ('📍 Погрузка: Киев, Украина 🇺🇦\n📍 Выгрузка: Ташкент, Узбекистан 🇺🇿\n'
            '🧺 Груз: стиральный порошок\n💰 Ставка: 10 500 USD\n'
            '________\n📍 Погрузка: Днепр, Украина 🇺🇦\nВыгрузка: Ташкент, Узбекистан 🇺🇿\n'
            '🍫 Груз: шоколад\n⚖️ Вес: 15 тонн\n'
            '________\n📍 Погрузка: Житомир, Украина 🇺🇦\nВыгрузка: Ташкент, Узбекистан 🇺🇿\n'
            '🧀 Груз: сыр\n🚛 Транспорт: рефрижератор\n📞 +998901234567')
    items = map_owned_messages(raw(text))
    assert len(items) == 3
    assert [x['origin'] for x in items] == ['Киев, Украина', 'Днепр, Украина', 'Житомир, Украина']
    assert all(x['destination'] == 'Ташкент, Узбекистан' for x in items)
    assert [x['amount'] for x in items] == [10500, None, None]
    assert all(x['contacts'] == ['+998901234567'] and x['status'] == 'active' for x in items)
    assert all(x['origin_source'] == OWNED_SOURCE for x in items)


def test_ten_routes_footer_and_local_contact_priority():
    text = '\n'.join(f'{i+1}. Алматы → Москва\nГруз: товар {i}'
                     + ('\n+77001234567' if i == 1 else '') for i in range(10))
    items = map_owned_messages(raw(text + '\nОбщий телефон: +998901234567'))
    assert len(items) == 10
    assert items[1]['contacts'] == ['+77001234567']
    assert all(x['contacts'] == ['+998901234567'] for i, x in enumerate(items) if i != 1)


def test_missing_contact_review_and_free_vehicle_has_correct_kind():
    assert map_owned_messages(raw('Алматы → Москва\nГруз: товар'))[0]['status'] == 'review'
    item = map_owned_messages(raw('Есть свободная машина\nАлматы → Москва\n+77001234567'))[0]
    assert item['kind'] == 'vehicle' and item['status'] == 'active'


def test_own_chat_capture_never_enters_publisher_and_keeps_forward_date(tmp_path, monkeypatch):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    monkeypatch.setattr('telethon.utils.get_peer_id', lambda entity: -100123)
    entity = SimpleNamespace(id=123, username=OWNED_SOURCE, noforwards=False)
    date = m.utcnow()
    msg = SimpleNamespace(id=44, raw_text='Алматы → Москва\nГруз: сыр\n+77001234567',
                          date=date, fwd_from=SimpleNamespace(date=date), noforwards=False)
    assert m.capture_owned_message(db, entity, msg)
    assert not m.capture_owned_message(db, entity, msg)
    assert db.execute('SELECT count(*) FROM queue').fetchone()[0] == 0
    assert db.execute('SELECT source_date FROM app_messages').fetchone()[0] == date.timestamp()
    msg.raw_text = m.DOWNLOAD_TEXT
    assert not m.capture_owned_message(db, entity, msg)
    entity.username = 'foreign_chat'
    msg.raw_text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    assert not m.capture_owned_message(db, entity, msg)


def test_owned_bridge_excludes_foreign_posts_and_replays_without_duplicates(tmp_path, monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED', 'true')
    m = collector()
    source = tmp_path/'feed.db'
    db = m.database(source)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, 'foreign_channel', 222, 7, text, m.utcnow())
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    batches = []

    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return json.dumps({'results': [{'id': 'synthetic', 'result': 'created'}]}).encode()

    def opener(req, **kw):
        batches.extend(json.loads(req.data)['records'])
        return Response()

    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path/'state.db'), api_url='https://qa2.urtruck.kz',
                                         importer_key='test-only', opener=opener)
    first = OwnedTelegramQueueBridge(source, adapter).run_once()
    assert first['scanned'] == 1 and first['sent'] == 1
    assert batches[0]['origin_source'] == OWNED_SOURCE and batches[0]['source_message_id'] == '44'
    assert OwnedTelegramQueueBridge(source, adapter).run_once()['scanned'] == 0
    assert len(batches) == 1


def test_download_buttons_sent_once_as_reply_and_uncertain_send_not_retried(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    calls = []
    cfg = {'OWNED_FEED_ENABLED': 'true', 'OWNED_TELEGRAM_CTA_ENABLED': 'true', 'TELEGRAM_BOT_TOKEN': 'test-only'}
    def seed(ident):
        with db:
            db.execute('INSERT INTO metadata VALUES(?,?)', (f'owned_cta:-100123:{ident}', json.dumps({
                'status': 'pending', 'chat_id': -100123, 'message_id': ident, 'created_at': m.time.time()})))
    def sender(token, payload):
        calls.append(payload)
        return 99
    seed(44)
    asyncio.run(m.owned_download_tick(db, cfg, sender))
    asyncio.run(m.owned_download_tick(db, cfg, sender))
    assert len(calls) == 1
    assert calls[0]['reply_parameters']['message_id'] == 44
    assert len(calls[0]['reply_markup']['inline_keyboard'][0]) == 2
    assert all(x['url'].startswith(('https://play.google.com/', 'https://apps.apple.com/'))
               for x in calls[0]['reply_markup']['inline_keyboard'][0])
    seed(45)
    def timeout(token, payload):
        calls.append(payload)
        raise TimeoutError('test-only')
    asyncio.run(m.owned_download_tick(db, cfg, timeout))
    asyncio.run(m.owned_download_tick(db, cfg, timeout))
    assert len(calls) == 2
    assert json.loads(db.execute("SELECT value FROM metadata WHERE key='owned_cta:-100123:45'").fetchone()[0])['status'] == 'uncertain'


def test_slow_collection_does_not_block_publication_and_cancels_before_db_close(tmp_path, monkeypatch):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    started = []; published = []; stopped = []
    real_sleep = asyncio.sleep
    async def scan(reader, state):
        started.append(True)
        try:
            await asyncio.Event().wait()
        finally:
            stopped.append(True)
            state.execute('SELECT 1')
    async def publish(*args): published.append(True)
    async def sleep(_):
        await real_sleep(0)
        if len(published) >= 3:
            raise asyncio.CancelledError()
    monkeypatch.setattr(m, 'collect', scan)
    monkeypatch.setattr(m, 'telegram_tick', publish)
    monkeypatch.setattr(m.asyncio, 'sleep', sleep)
    async def scenario():
        try:
            await m.run_cycles(None, db, {'PUBLISH_ENABLED': 'true'})
        except asyncio.CancelledError:
            pass
    asyncio.run(scenario())
    assert len(started) == 1 and len(published) == 3 and stopped == [True]


def test_bot_429_pauses_all_download_replies_without_losing_pending(tmp_path):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    cfg = {'OWNED_FEED_ENABLED': 'true', 'OWNED_TELEGRAM_CTA_ENABLED': 'true', 'TELEGRAM_BOT_TOKEN': 'test-only'}
    with db:
        db.execute('INSERT INTO metadata VALUES(?,?)', ('owned_cta:-100123:44', json.dumps({
            'status': 'pending', 'chat_id': -100123, 'message_id': 44, 'created_at': m.time.time()})))
    calls = []
    def sender(*args):
        calls.append(True)
        raise m.BotReplyRejected(429, 120)
    asyncio.run(m.owned_download_tick(db, cfg, sender))
    asyncio.run(m.owned_download_tick(db, cfg, sender))
    assert len(calls) == 1
    assert json.loads(db.execute("SELECT value FROM metadata WHERE key='owned_cta:-100123:44'").fetchone()[0])['status'] == 'pending'


def test_our_receiver_cannot_be_a_republication_source(tmp_path):
    m = collector()
    m.ROOT = tmp_path
    m.SOURCES = ('public_channel', m.OWNED_FEED_SOURCE, 'UrTruck_UT')
    assert m.app_sources() == ('public_channel',)


def test_last_block_local_phone_wins_over_common_footer():
    items = map_owned_messages(raw(
        'Погрузка: Алматы\nВыгрузка: Москва\nГруз: сыр\n'
        'Погрузка: Астана\nВыгрузка: Бишкек\nГруз: шины\n'
        'Телефон: +77001234567\nОбщий телефон: +998901234567'))
    assert items[0]['contacts'] == ['+998901234567']
    assert items[1]['contacts'] == ['+77001234567']


def test_switch_to_owned_does_not_flush_or_delete_legacy_outbox(tmp_path):
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path/'legacy.db'), api_url='https://qa2.urtruck.kz', importer_key='test-only')
    adapter.enqueue(raw('Алматы → Москва\nГруз: сыр\n+77001234567', origin_source='foreign_channel'))
    import pytest
    with pytest.raises(ValueError, match='separate_adapter_state'):
        OwnedTelegramQueueBridge(tmp_path/'source.db', adapter)
    assert adapter.pending_count() == 1


def test_legacy_incoming_does_not_duplicate_staged_own_intake(tmp_path, monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED', 'true')
    m = collector()
    source = tmp_path/'feed.db'
    db = m.database(source)
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, 'Алматы → Москва\nГруз: сыр\n+77001234567', m.utcnow())
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path/'state.db'), api_url='https://qa2.urtruck.kz', importer_key='test-only')
    assert IncomingQueueBridge(source, adapter).run_once()['scanned'] == 0
    assert adapter.pending_count() == 0
