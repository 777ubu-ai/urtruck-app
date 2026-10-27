"""Регрессии ТЗ: полный исходник и цена не должны скрывать объявления/номера."""
from datetime import datetime, timedelta, timezone

import pytest

from database import external_freight_dal as dal
from services.external_freight_parser import block_contacts


@pytest.fixture(autouse=True)
def feed_db(monkeypatch, tmp_path):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path/'feed.sqlite3'))
    dal.init_schema()


def record(message, **changes):
    return {'source_id': 'master-spec', 'source_message_id': str(message), 'kind': 'cargo',
            'original_text': 'Нужен тент, груз готов', 'classification_status': 'approved',
            'source_published_at': (datetime.now(timezone.utc)-timedelta(minutes=int(message))).isoformat(),
            'contacts': [], **changes}


def test_source_contacts_do_not_replace_local_contact_or_original_text():
    text = '1. Алматы → Москва\nТел: +77001234567\n2. Ташкент → Казань\nТел: +998901234567'
    item_id = dal.import_records([record(1, original_text=text, contacts=['8 700 123 45 67'])])[0]['id']
    item = dal.list_items(kind='cargo')['items'][0]
    assert item['id'] == item_id
    assert item['original_text'] == text
    assert item['contacts'] == ['8 700 123 45 67']
    assert item['source_contacts'] == ['+998901234567']


def test_existing_empty_contacts_are_visible_without_reimport_or_date_reset():
    raw = record(1, original_text='Алматы → Москва\n12345678\nТент\nГруз готов\nДокументы готовы')
    dal.import_records([raw])
    item = dal.list_items(kind='cargo')['items'][0]
    assert item['contacts'] == []
    assert item['source_contacts'] == ['12345678']
    assert item['source_published_at'] == raw['source_published_at']


def test_entity_contacts_stay_separate_and_old_schema_migrates_without_losing_bookmark():
    from database.external_freight_connection import get_conn
    raw = record(1, source_contacts=['+998901234567'])
    ident = dal.import_records([raw])[0]['id']
    assert dal.list_items(kind='cargo')['items'][0]['source_contacts'] == ['+998901234567']
    dal.set_bookmark('owner', ident, 'cargo', True)
    with get_conn() as c:
        c.execute('ALTER TABLE external_freight_items DROP COLUMN source_contacts')
    dal.init_schema()
    item = dal.list_items(kind='cargo', owner_id='owner')['items'][0]
    assert item['saved'] is True and item['id'] == ident
    assert item['source_published_at'] == raw['source_published_at']
    assert item['source_contacts'] == []


@pytest.mark.parametrize('text,expected', [
    ('Телефон: 70\u200b123\u20604567\nГруз готов', ['701234567']),
    ('Тент\n9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣\nМосква\nЗагрузка\nДокументы готовы', ['98765432']),
    ('Тел: ١٢٣٤٥٦\nТент\nМосква\nГруз готов', ['123456']),
    ('Номер:946663033\u200b\ufeff\u200d\ufeff\u200b\nТент\nГруз готов\nМосква', ['946663033']),
    ('Номер заявки: 12345678\nНомер счёта: 12345678901\nНомер авто: 12345678', []),
    ('Цена: 12345678 USD\nВес: 1234567 кг\nID: 12345678\n27.10.2026', []),
])
def test_unicode_local_contacts_and_numeric_fields(text, expected):
    assert block_contacts(text) == expected


@pytest.mark.parametrize('sort,amounts', [('price_asc', [100, 200, 200]), ('price_desc', [200, 200, 100])])
def test_unpriced_records_remain_after_prices_across_page_boundaries(sort, amounts):
    records = [record(i+1, amount=amount, currency='USD', price_state='known')
               for i, amount in enumerate([200, 100, 200])]
    records += [record(4), record(5, price_state='negotiable'), record(6)]
    dal.import_records(records)
    seen, cursor = [], None
    for _ in range(8):
        page = dal.list_items(kind='cargo', sort=sort, limit=2, cursor=cursor)
        seen += page['items']
        cursor = page['next_cursor']
        if not cursor:
            break
    assert len(seen) == len({item['id'] for item in seen}) == 6
    assert [item['amount'] for item in seen] == amounts + [None, None, None]
    assert [item['source_message_id'] for item in seen[3:]] == ['4', '5', '6']
    assert seen[4]['price_state'] == 'negotiable'
