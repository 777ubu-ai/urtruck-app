import asyncio
import importlib.util
import json
import sys
import pytest
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
    assert all(x['source_text'] == text for x in items)


def test_ten_routes_footer_and_local_contact_priority():
    text = '\n'.join(f'{i+1}. Алматы → Москва\nГруз: товар {i}'
                     + ('\n+77001234567' if i == 1 else '') for i in range(10))
    items = map_owned_messages(raw(text + '\nОбщий телефон: +998901234567'))
    assert len(items) == 10
    assert items[1]['contacts'] == ['+77001234567']
    assert all(x['contacts'] == ['+998901234567'] for i, x in enumerate(items) if i != 1)


def test_footer_contact_in_long_owned_post_is_shared_across_routes():
    text = ('Погрузка: Самарканд\nВыгрузка: Москва\nГруз: плитка\n'
            'Погрузка: Самарканд\nВыгрузка: Казань\nГруз: плитка\n'
            'Общий телефон: +998901234567')
    items = map_owned_messages(raw(text))
    assert len(items) == 2
    assert all(item['contacts'] == ['+998901234567'] for item in items)
    assert all(item['source_text'] == text for item in items)


def test_group_welcome_rules_post_is_not_published_as_a_cargo_listing():
    text = ('Добро пожаловать в группу Груз Китай\n'
            'Данное сообщество создано для размещения объявлений о поиске грузов и услуг водителей.\n'
            'В НАШЕЙ ГРУППЕ ЗАПРЕЩЕНО: спам и реклама\nhttps://t.me/example')
    item = map_owned_messages(raw(text))[0]
    assert item['status'] == 'closed'
    assert item['classification_status'] == 'closed'


def test_missing_contact_still_publishes_and_free_vehicle_has_correct_kind():
    item = map_owned_messages(raw('Алматы → Москва\nГруз: товар'))[0]
    assert item['status'] == 'active' and item['contacts'] == []
    item = map_owned_messages(raw('Есть свободная машина\nАлматы → Москва\n+77001234567'))[0]
    assert item['kind'] == 'vehicle' and item['status'] == 'active'


def test_unrecognized_owned_post_is_preserved_in_feed_as_raw_text():
    text = 'Пост из группы без распознанного маршрута или типа'
    item = map_owned_messages(raw(text))[0]
    assert item['status'] == 'active'
    assert item['kind'] == 'cargo'
    assert item['original_text'] == text


def test_entity_links_and_media_caption_are_saved_without_changing_source_text(tmp_path):
    m = collector(); db = m.database(tmp_path/'feed.db')
    msg = SimpleNamespace(id=1, raw_text='📦 Алматы → Москва\nГруз готов', date=m.utcnow(),
        noforwards=False, media=SimpleNamespace(photo=True), entities=[
            SimpleNamespace(url='tel:+998901234567'), SimpleNamespace(url='https://wa.me/77001234567'),
            SimpleNamespace(url='https://example.org/123456789'), SimpleNamespace(url='https://t.me/+123456789'),
        ])
    assert m.capture_message_for_app(db, 'approved_source', 123, msg)
    row = db.execute('SELECT * FROM app_messages').fetchone()
    assert row['text'] == msg.raw_text
    assert json.loads(row['phones']) == ['+998901234567', '77001234567']
    metadata = db.execute('SELECT * FROM app_message_metadata').fetchone()
    assert metadata['has_media'] == 1
    assert not m.capture_message_for_app(db, 'approved_source', 123, msg)
    msg.entities = [SimpleNamespace(url='tel:12345678')]
    assert m.capture_message_for_app(db, 'approved_source', 123, msg)
    edited = db.execute('SELECT * FROM app_messages').fetchone()
    assert edited['text'] == row['text'] and edited['source_date'] == row['source_date']
    assert edited['revision'] != row['revision']
    assert json.loads(edited['phones']) == ['12345678']
    msg.id = 2; msg.noforwards = True
    assert not m.capture_message_for_app(db, 'approved_source', 123, msg)
    assert db.execute('SELECT COUNT(*) FROM app_message_metadata').fetchone()[0] == 1


def test_media_only_source_has_auditable_metadata_without_invented_text_or_phone(tmp_path):
    m = collector(); db = m.database(tmp_path/'feed.db')
    msg = SimpleNamespace(id=1, raw_text='', date=m.utcnow(), media=SimpleNamespace(photo=True), entities=[])
    assert not m.capture_message_for_app(db, 'approved_source', 123, msg)
    assert db.execute('SELECT COUNT(*) FROM app_messages').fetchone()[0] == 0
    metadata = db.execute('SELECT * FROM app_message_metadata').fetchone()
    assert metadata['has_media'] == 1 and json.loads(metadata['entity_contacts']) == []


def test_own_chat_capture_never_enters_publisher_and_keeps_forward_date(tmp_path, monkeypatch):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    # Telethon установлен у отдельного collector, не у backend/CI.
    # Подменяем только transport helper, без установки Telegram SDK в API.
    monkeypatch.setitem(sys.modules, 'telethon.utils', SimpleNamespace(get_peer_id=lambda entity: -100123))
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


def test_owned_scan_does_not_wait_for_general_history_and_stops_with_worker(tmp_path, monkeypatch):
    m = collector(); db = m.database(tmp_path/'feed.db')
    started, owned, stopped = [], [], []
    real_sleep = asyncio.sleep
    async def slow(reader, state):
        started.append(True)
        try:
            await asyncio.Event().wait()
        finally:
            stopped.append(True)
            state.execute('SELECT 1')
    async def own(reader, state):
        owned.append(True)
        state.execute('SELECT 1')
    async def sleep(_):
        await real_sleep(0)
        if owned:
            raise asyncio.CancelledError()
    monkeypatch.setattr(m, 'collect', slow)
    monkeypatch.setattr(m, 'collect_owned', own)
    monkeypatch.setattr(m.asyncio, 'sleep', sleep)
    async def scenario():
        try:
            await m.run_cycles(None, db, {'OWNED_FEED_ENABLED': 'true'})
        except asyncio.CancelledError:
            pass
    asyncio.run(scenario())
    assert started == owned == stopped == [True]


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


def test_common_closure_prefix_reaches_every_selection_block():
    items = map_owned_messages(raw('Заявка закрыта\nПогрузка: Алматы\nВыгрузка: Москва\nГруз: сыр\n'
                                  'Погрузка: Астана\nВыгрузка: Бишкек\nГруз: шины\n+77001234567'))
    assert len(items) == 2
    assert all(x['status'] == 'closed' and 'Заявка закрыта' in x['original_text'] for x in items)


def test_multiple_distinct_unloads_are_kept_with_raw_text():
    item = map_owned_messages(raw('Погрузка: Алматы\nВыгрузка: Москва\nВыгрузка: Астана\n'
                                 'Груз: сыр\n+77001234567'))[0]
    assert item['status'] == 'active'
    assert item['original_text'].startswith('Погрузка: Алматы')


def owned_worker(tmp_path, monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED', 'true')
    m = collector()
    source = tmp_path/'feed.db'
    db = m.database(source)
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path/'state.db'), api_url='https://qa2.urtruck.kz',
                                         importer_key='test-only')
    monkeypatch.setattr(adapter, 'flush_once', lambda: {'status': 'idle', 'sent': 0})
    return m, db, adapter, OwnedTelegramQueueBridge(source, adapter)


def test_distinct_shared_footer_phones_do_not_collapse_routes(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    selection = ('Погрузка: Алматы\nВыгрузка: Москва\nГруз: сыр\n'
                 'Погрузка: Астана\nВыгрузка: Бишкек\nГруз: шины\nОбщий телефон: ')
    for ident, phone in ((44, '+77001234567'), (45, '+77001234568')):
        m.capture_for_app(db, OWNED_SOURCE, 123, ident, selection + phone, m.utcnow())
    result = worker.run_once()
    assert result['duplicates'] == 0 and result['enqueued'] == 4
    assert adapter.pending_count() == 4
    assert worker.run_once()['scanned'] == 0


def test_edited_away_route_does_not_block_new_post_with_old_route(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    old = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, old, m.utcnow())
    assert worker.run_once()['enqueued'] == 1
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, old.replace('Москва', 'Астана'), m.utcnow())
    # Newer message is processed before the edit: stale outbox must not seed dedup.
    m.capture_for_app(db, OWNED_SOURCE, 123, 45, old, m.utcnow())
    result = worker.run_once()
    assert result['duplicates'] == 0 and result['enqueued'] == 2
    with adapter._connect() as state:
        payloads = [json.loads(row[0]) for row in state.execute('SELECT payload FROM selected_outbox')]
    assert {x['destination'] for x in payloads if x['status'] == 'active'} == {'Москва', 'Астана'}
    # The same route after a completed edit must also be accepted on a later run.
    m.capture_for_app(db, OWNED_SOURCE, 123, 45, old.replace('Москва', 'Бишкек'), m.utcnow())
    worker.run_once()
    m.capture_for_app(db, OWNED_SOURCE, 123, 46, old, m.utcnow())
    assert worker.run_once()['duplicates'] == 0


def test_owned_reconciliation_recovers_old_edit_after_restart(tmp_path, monkeypatch):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    monkeypatch.setattr(m, 'settings', lambda: {'OWNED_FEED_ENABLED': 'true'})
    monkeypatch.setitem(sys.modules, 'telethon.utils', SimpleNamespace(get_peer_id=lambda _: -100123))
    entity = SimpleNamespace(id=123, username=OWNED_SOURCE, noforwards=False)
    date = m.utcnow()
    for ident in range(1, 62):
        m.capture_for_app(db, OWNED_SOURCE, 123, ident,
                          'Алматы → Москва\nГруз: сыр\n+77001234567', date)
    with db:
        db.execute('INSERT INTO app_cursors VALUES(?,?)', (OWNED_SOURCE, 61))
    calls = []
    class Reader:
        async def get_entity(self, _): return entity
        async def iter_messages(self, *args, **kw):
            for _ in ():
                yield None
        async def get_messages(self, _, ids):
            calls.append(ids)
            return [SimpleNamespace(id=i, raw_text='Заявка закрыта' if i == 1 else
                    'Алматы → Астана\nГруз: сыр\n+77001234567', date=date, fwd_from=None) for i in ids]
    asyncio.run(m.collect_owned(Reader(), db))
    assert db.execute('SELECT text FROM app_messages WHERE source_message=1').fetchone()[0] == 'Заявка закрыта'
    db.close()
    db = m.database(tmp_path/'feed.db')
    asyncio.run(m.collect_owned(Reader(), db))
    assert len(calls[0]) == 50 and calls[1] == list(range(51, 62))
    assert db.execute('SELECT text FROM app_messages WHERE source_message=61').fetchone()[0].startswith('Алматы → Астана')
    asyncio.run(m.collect_owned(Reader(), db))
    assert calls[2] == list(range(1, 51))


def test_owned_dedup_survives_restart_and_closed_route_can_be_reposted(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    worker.run_once()
    m.capture_for_app(db, OWNED_SOURCE, 123, 45, text, m.utcnow())
    assert OwnedTelegramQueueBridge(worker.source_path, adapter).run_once()['duplicates'] == 1
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, 'Заявка закрыта\n' + text, m.utcnow())
    worker.run_once()
    m.capture_for_app(db, OWNED_SOURCE, 123, 46, text, m.utcnow())
    assert OwnedTelegramQueueBridge(worker.source_path, adapter).run_once()['duplicates'] == 0


def test_reconcile_invalid_response_does_not_advance_or_remove_posts(tmp_path, monkeypatch):
    m = collector()
    db = m.database(tmp_path/'feed.db')
    monkeypatch.setattr(m, 'settings', lambda: {'OWNED_FEED_ENABLED': 'true'})
    entity = SimpleNamespace(id=123, username=OWNED_SOURCE, noforwards=False)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    class Reader:
        async def get_entity(self, _): return entity
        async def iter_messages(self, *args, **kw):
            for _ in (): yield None
        async def get_messages(self, _, ids): return [SimpleNamespace(id=999)]
    asyncio.run(m.collect_owned(Reader(), db))
    assert db.execute("SELECT value FROM metadata WHERE key='owned_reconcile_cursor'").fetchone() is None
    assert db.execute('SELECT text FROM app_messages').fetchone()[0] == text
    assert db.execute('SELECT error FROM source_health').fetchone()[0] == 'RuntimeError'
    async def missing(*args, **kw): return [None]
    monkeypatch.setattr(Reader, 'get_messages', missing)
    asyncio.run(m.collect_owned(Reader(), db))
    assert db.execute('SELECT text FROM app_messages').fetchone()[0] == text
    assert db.execute('SELECT error FROM source_health').fetchone()[0] is None


def test_deleted_owned_post_is_closed_without_extending_ttl_or_leaking_contact(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    monkeypatch.setitem(sys.modules, 'telethon.utils', SimpleNamespace(get_peer_id=lambda _: -100123))
    entity = SimpleNamespace(id=123, username=OWNED_SOURCE, noforwards=False)
    published = m.utcnow() - m.timedelta(hours=3)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    assert m.capture_for_app(db, OWNED_SOURCE, entity.id, 44, text, published)
    assert worker.run_once()['enqueued'] == 1
    original_source_date = db.execute('SELECT source_date FROM app_messages').fetchone()[0]
    cta_key = 'owned_cta:-100123:44'
    with db:
        db.execute('INSERT INTO metadata VALUES(?,?)',
                   (cta_key, json.dumps({'status': 'pending', 'chat_id': -100123,
                                         'message_id': 44, 'created_at': m.time.time()})))

    assert m.capture_owned_deletion_event(db, entity, -100123, [44], -100123) == 1
    assert m.capture_owned_deletion_event(db, entity, -100123, [44], -100123) == 0
    assert m.capture_owned_deletion_event(db, entity, -100999, [44], -100123) == 0
    row = db.execute('SELECT source_date,text,phones FROM app_messages').fetchone()
    assert row[0] == original_source_date
    assert row[1] == 'Заявка закрыта' and json.loads(row[2]) == []
    assert json.loads(db.execute('SELECT value FROM metadata WHERE key=?', (cta_key,)).fetchone()[0])['status'] == 'cancelled_source_deleted'

    result = worker.run_once()
    assert result['enqueued'] >= 1
    with adapter._connect() as state:
        payloads = [json.loads(row[0]) for row in state.execute('SELECT payload FROM selected_outbox')]
    assert payloads and all(item['status'] == 'closed' for item in payloads)
    assert all(not item.get('contacts') and '+77001234567' not in item['original_text'] for item in payloads)


def test_deleted_multisegment_owned_post_redacts_every_previous_segment(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    monkeypatch.setitem(sys.modules, 'telethon.utils', SimpleNamespace(get_peer_id=lambda _: -100123))
    entity = SimpleNamespace(id=123, username=OWNED_SOURCE, noforwards=False)
    published = m.utcnow() - m.timedelta(hours=3)
    text = ('Погрузка: Алматы\nВыгрузка: Москва\nГруз: сыр\n'
            'Погрузка: Астана\nВыгрузка: Бишкек\nГруз: шины\n+77001234567')
    assert m.capture_for_app(db, OWNED_SOURCE, entity.id, 45, text, published)
    assert worker.run_once()['enqueued'] == 2

    assert m.capture_owned_deletion_event(db, entity, -100123, [45], -100123) == 1
    replay = worker.run_once()
    assert replay['enqueued'] >= 2, replay
    with adapter._connect() as state:
        payloads = [json.loads(row[0]) for row in state.execute(
            'SELECT payload FROM selected_outbox WHERE source_message_id=?', ('45',))]
    assert len(payloads) == 2
    assert all(item['status'] == 'closed' for item in payloads)
    assert all(item.get('contacts') == [] and item.get('original_text') == 'Исходное объявление удалено' for item in payloads)
    assert all('+77001234567' not in json.dumps(item, ensure_ascii=False) for item in payloads)


def test_edit_between_dedup_seed_and_source_query_cannot_suppress_new_post(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    worker.run_once()
    m.capture_for_app(db, OWNED_SOURCE, 123, 45, text, m.utcnow())
    seed = worker.seed_dedup
    def concurrent_edit(now):
        seed(now)
        m.capture_for_app(db, OWNED_SOURCE, 123, 44, text.replace('Москва', 'Астана'), m.utcnow())
    monkeypatch.setattr(worker, 'seed_dedup', concurrent_edit)
    result = worker.run_once()
    assert result['duplicates'] == 0 and result['enqueued'] == 2
    with adapter._connect() as state:
        assert state.execute('SELECT count(*) FROM selected_outbox').fetchone()[0] == 2


def test_malformed_dedup_owner_does_not_reject_valid_new_post(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    worker.run_once()
    m.capture_for_app(db, OWNED_SOURCE, 123, 45, text, m.utcnow())
    seed = worker.seed_dedup
    def malformed_edit(now):
        seed(now)
        m.capture_for_app(db, OWNED_SOURCE, 123, 44, 'x' * 20001, m.utcnow())
    monkeypatch.setattr(worker, 'seed_dedup', malformed_edit)
    result = worker.run_once()
    assert result['duplicates'] == 0 and result['enqueued'] == 1 and result['rejected'] == 1
    with adapter._connect() as state:
        assert state.execute("SELECT count(*) FROM selected_outbox WHERE source_message_id='45'").fetchone()[0] == 1


def test_multiroute_duplicate_checks_share_parse_but_notice_source_edit(tmp_path, monkeypatch):
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    text = ('Погрузка: Алматы\nВыгрузка: Москва\nГруз: сыр\n'
            'Погрузка: Астана\nВыгрузка: Бишкек\nГруз: шины\nОбщий телефон: +77001234567')
    m.capture_for_app(db, OWNED_SOURCE, 123, 44, text, m.utcnow())
    worker.run_once()
    records = map_owned_messages(dict(db.execute('SELECT * FROM app_messages').fetchone()))
    assert len(records) == 2
    parse = worker.parse
    calls = []
    def counted(value):
        calls.append(value['text'])
        return parse(value)
    monkeypatch.setattr(worker, 'parse', counted)
    for record in records:
        assert worker.find_duplicate(worker.fingerprint(record), adapter.clock())
    assert len(calls) == 1
    # Изменение фактического текста замечается даже при старом revision в БД.
    with db:
        db.execute('UPDATE app_messages SET text=? WHERE source_message=?',
                   (text.replace('сыр', 'молоко').replace('шины', 'обувь'), 44))
    for record in records:
        assert worker.find_duplicate(worker.fingerprint(record), adapter.clock()) is None
    assert len(calls) == 2


@pytest.mark.parametrize('mode', ['owned', 'incoming'])
def test_vehicle_priority_skips_seen_posts_and_excluded_source(tmp_path, monkeypatch, mode):
    import services.external_freight_queue_bridge as bridge_module
    m, db, adapter, worker = owned_worker(tmp_path, monkeypatch)
    if mode == 'incoming':
        worker = IncomingQueueBridge(worker.source_path, adapter)
    eligible = OWNED_SOURCE if mode == 'owned' else 'public_source'
    excluded = 'public_source' if mode == 'owned' else OWNED_SOURCE
    text = 'Алматы → Москва\nГруз: сыр\n+77001234567'
    m.capture_for_app(db, eligible, 123, 44, text, m.utcnow())
    m.capture_for_app(db, excluded, 456, 45, text+'\nЧужой поток', m.utcnow())
    hint = bridge_module.has_vehicle_supply_signal
    calls = []
    def counted(value):
        calls.append(value)
        return hint(value)
    monkeypatch.setattr(bridge_module, 'has_vehicle_supply_signal', counted)
    assert worker.run_once()['scanned'] == 1
    assert calls == [text]
    calls.clear()
    assert worker.run_once()['scanned'] == 0
    assert calls == []
    vehicle = 'Машина свободна\nАлматы → Москва\n+77001234567'
    m.capture_for_app(db, eligible, 123, 46, vehicle, m.utcnow())
    assert worker.run_once()['vehicle_candidates'] == 1
    assert calls == [vehicle]
