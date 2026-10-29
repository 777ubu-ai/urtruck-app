"""Контракт оригинала и общих контактов до и после durable-доставки."""
import json
from datetime import datetime, timezone

import pytest
from services.external_freight_parser import block_contacts, map_selected_messages, source_contact_values
from services.owned_telegram_feed import map_owned_messages
from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from database import external_freight_dal as dal


@pytest.mark.parametrize('text,expected', [
    ('Контакты: 998901234567 77001234567', ['998901234567', '77001234567']),
    ('12345678 87654321', ['12345678', '87654321']),
    ('Счёт: 1234567890123456789012345678', []),
    ('Цена 12345678 USD', []),
])
def test_adjacent_numbers_are_not_lost_or_split_from_bank_account(text, expected):
    assert block_contacts(text) == expected


def test_source_contacts_include_whole_post_without_reassigning_local_phones():
    text = 'Алматы → Москва\nНужен тент\n+77001234567\nТашкент → Казань\nНужен реф\n+998901234567'
    raw = {'source_id': '1', 'source_message_id': '2', 'text': text,
           'source_published_at': datetime.now(timezone.utc).isoformat()}
    items = map_selected_messages(raw)
    assert len(items) == 2
    assert items[0]['contacts'] == ['+77001234567']
    assert items[1]['contacts'] == ['+998901234567']
    assert all(item['source_contacts'] == ['+77001234567', '+998901234567'] for item in items)
    assert all(item['source_text'] == text for item in items)


def test_long_owned_original_survives_parser_outbox_and_api_storage(tmp_path, monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path/'api.sqlite3'))
    dal.init_schema()
    text = '  🚚 Погрузка: Алматы\nВыгрузка: Москва\nНужен тент\nЦена 7500 USD\n' + ('Дополнительные условия перевозки.\n'*400) + '\n☎ +998901234567\n  '
    raw = {'source_id':'1', 'source_message_id':'2', 'text':text,
           'source_published_at':datetime.now(timezone.utc).isoformat()}
    item = map_owned_messages(raw)[0]
    adapter = ExternalFreightFeedAdapter(db_path=tmp_path/'outbox.sqlite3', api_url='https://qa2.urtruck.kz')
    adapter.enqueue(item)
    with adapter._connect() as db:
        payload = json.loads(db.execute('SELECT payload FROM selected_outbox').fetchone()[0])
    ident = dal.import_records([payload])[0]['id']
    result = dal.get_item(ident)
    assert result['original_text'] == text
    assert '+998901234567' in result['contacts'] + result['source_contacts']
    assert result['amount'] == 7500
    assert adapter.enqueue(item) is False
    assert dal.import_records([payload])[0]['id'] == ident
