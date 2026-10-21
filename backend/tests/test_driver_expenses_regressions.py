"""Регрессии расходов: только временная БД фикстуры, без сетевых сервисов."""
import sqlite3

import pytest

import config
from api import driver_expenses as api
from tests.test_driver_expenses import client, payload, add


def test_deleted_standalone_vehicle_keeps_snapshot_and_all_editable_fields(client):
    item = add(client, deal_id=None, vehicle_id='v1')
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("DELETE FROM vehicles WHERE id='v1'")
    body = payload(deal_id=None, vehicle_id='v1', version=1, amount='900.25',
                   description='Историческая машина', category='repair', spent_on='2026-10-17')
    response = client.put('/expenses/' + item['id'], json=body)
    assert response.status_code == 200, response.text
    saved = response.json()['expense']
    assert (saved['vehicle_id'], saved['vehicle_plate'], saved['amount'], saved['description'],
            saved['category'], saved['spent_on']) == ('v1', 'A123', '900.25', 'Историческая машина', 'repair', '2026-10-17')
    api.init_expenses_schema()
    assert client.get('/expenses').json()['expenses'][0] == saved
    assert client.post('/expenses', json=payload(deal_id=None, vehicle_id='v1')).status_code == 404
    assert client.post('/expenses', json=payload(deal_id=None, vehicle_id='absent')).status_code == 404


def test_snapshot_cannot_be_reused_by_another_owner_or_forged(client):
    item = add(client, deal_id=None, vehicle_id='v1')
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("DELETE FROM vehicles WHERE id='v1'")
    client.headers['X-User'] = 'other'
    assert client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v1', version=1)).status_code == 404
    assert client.post('/expenses', json=payload(deal_id=None, vehicle_id='v1')).status_code == 404
    client.headers['X-User'] = 'driver'
    assert client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v2', version=1)).status_code == 404
    assert client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v1', vehicle_plate='FORGED', version=1)).status_code == 422
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("INSERT INTO vehicles VALUES ('v1','other','FOREIGN','2026-10-18')")
    assert client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v1', version=1)).status_code == 404


def test_explicit_rebind_and_clear_replace_snapshot(client):
    item = add(client, deal_id=None, vehicle_id='v1')
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("UPDATE vehicles SET license_plate='NEW' WHERE id='v1'")
    original = client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v1', version=1)).json()['expense']
    assert original['vehicle_plate'] == 'A123'
    changed = client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id='v3', version=2)).json()['expense']
    assert (changed['vehicle_id'], changed['vehicle_plate']) == ('v3', 'C789')
    cleared = client.put('/expenses/' + item['id'], json=payload(deal_id=None, vehicle_id=None, version=3)).json()['expense']
    assert cleared['vehicle_id'] is None and cleared['vehicle_plate'] == '' and cleared['deal_label'] == ''
    assert client.get('/expenses').json()['expenses'][0] == cleared


def test_order_timestamps_ties_cursor_insert_refresh_and_legacy_offset(client, monkeypatch):
    # UUID намеренно упорядочены против времени создания.
    ids = iter([f'{1000-i:08d}' for i in range(123)])
    monkeypatch.setattr(api, 'new_id', lambda: next(ids))
    created = [add(client, amount='0.01') for _ in range(121)]
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("UPDATE driver_expenses SET created_at='2026-10-18 10:00:00'")
    expected = [r['id'] for r in reversed(created)]
    first = client.get('/expenses?limit=17').json()
    assert [r['id'] for r in first['expenses']] == expected[:17]
    inserted = add(client, amount='0.02')
    seen = [r['id'] for r in first['expenses']]
    cursor = first['next_cursor']
    while cursor:
        result = client.get('/expenses', params={'limit':17, 'cursor':cursor}).json()
        assert result['total'] == 121 and result['totals'] == [{'currency':'KZT','amount':'1.21'}]
        seen.extend(r['id'] for r in result['expenses'])
        cursor = result['next_cursor']
    assert seen == expected and len(set(seen)) == 121
    refreshed = client.get('/expenses').json()
    assert refreshed['expenses'][0]['id'] == inserted['id'] and refreshed['total'] == 122
    assert refreshed['totals'] == [{'currency':'KZT','amount':'1.23'}]
    older = add(client, spent_on='2026-10-17')
    assert client.get('/expenses', params={'offset':122}).json()['expenses'][0]['id'] == older['id']
    assert client.get('/expenses', params={'cursor':first['next_cursor'], 'vehicle_id':'v1'}).status_code == 400
    assert client.get('/expenses', params={'cursor':first['next_cursor'], 'offset':1}).status_code == 400
    client.headers['X-User'] = 'other'
    assert client.get('/expenses', params={'cursor':first['next_cursor']}).status_code == 400


def test_legacy_additive_migration_preserves_money_snapshot_and_creation_order(client):
    with sqlite3.connect(config.DB_PATH) as c:
        c.executescript('DROP INDEX idx_expenses_owner_created; DROP INDEX idx_expenses_sequence; ALTER TABLE driver_expenses DROP COLUMN created_seq;')
        for expense_id, timestamp, amount in [('z-old','2026-10-18 09:00:00',123), ('a-new','2026-10-18 10:00:00',456)]:
            c.execute("INSERT INTO driver_expenses(id,owner_user_id,client_id,create_fingerprint,vehicle_id,vehicle_plate,amount_minor,currency,category,spent_on,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                      (expense_id,'driver',expense_id,'fingerprint','deleted','HISTORY',amount,'KZT','food','2026-10-18',timestamp))
    api.init_expenses_schema(); api.init_expenses_schema()
    rows = client.get('/expenses').json()
    assert [r['id'] for r in rows['expenses']] == ['a-new','z-old']
    assert rows['totals'] == [{'currency':'KZT','amount':'5.79'}]
    assert all(r['vehicle_plate'] == 'HISTORY' for r in rows['expenses'])
    assert all('created_seq' not in r for r in rows['expenses'])


def test_history_over_200_bounded_search_pages_selection_and_foreign_denial(client):
    with sqlite3.connect(config.DB_PATH) as c:
        c.executemany("INSERT INTO deals VALUES (?, 'driver','shipper', ?, 'Тест', 'v1','A123','2026-10-18')",
                      [(f'history-{i:04}', f'Город {i}') for i in range(257)])
        c.execute("INSERT INTO deals VALUES ('foreign-hidden','other','shipper','Город 0','Тест','v2','B456','2020-01-01')")
        c.execute("INSERT INTO deals VALUES ('literal_100%','driver','shipper','Поиск','Тест',NULL,NULL,'2020-01-01')")
    assert len(client.get('/expenses/options').json()['deals']) == 200
    assert not any(d['id'] == 'history-0000' for d in client.get('/expenses/options').json()['deals'])
    seen = []
    cursor = None
    while True:
        response = client.get('/expenses/options/deals', params={'limit':37, **({'cursor':cursor} if cursor else {})})
        assert response.status_code == 200, response.text
        result = response.json()
        assert len(result['deals']) <= 37
        seen.extend(d['id'] for d in result['deals'])
        cursor = result['next_cursor']
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == 260 and 'history-0000' in seen and 'foreign-hidden' not in seen
    search = client.get('/expenses/options/deals', params={'q':'history-0000'}).json()
    assert [d['id'] for d in search['deals']] == ['history-0000']
    assert [d['id'] for d in client.get('/expenses/options/deals', params={'q':'_100%'}).json()['deals']] == ['literal_100%']
    assert client.get('/expenses/options/deals', params={'q':'foreign-hidden'}).json()['deals'] == []
    selected = client.get('/expenses/options', params={'deal_id':'history-0000'}).json()['deals'][0]
    assert selected['id'] == 'history-0000' and len(client.get('/expenses/options?deal_id=history-0000').json()['deals']) == 201
    item = add(client, deal_id=selected['id'])
    assert item['vehicle_plate'] == 'A123' and item['deal_label'] == 'Город 0 → Тест'
    assert client.get('/expenses?deal_id=history-0000').json()['expenses'][0]['id'] == item['id']
    assert client.get('/expenses/options?deal_id=foreign-hidden').status_code == 404
    assert client.post('/expenses', json=payload(deal_id='foreign-hidden')).status_code == 404
    page = client.get('/expenses/options/deals?limit=1').json()
    assert client.get('/expenses/options/deals', params={'cursor':page['next_cursor'], 'q':'different'}).status_code == 400
    client.headers['X-User'] = 'other'
    assert client.get('/expenses/options/deals', params={'cursor':page['next_cursor']}).status_code == 400
    assert client.get('/expenses/options/deals?limit=101').status_code == 422


@pytest.mark.parametrize('path', ['/expenses', '/expenses/options/deals'])
@pytest.mark.parametrize('cursor', ['not-json', 'e30', '***', 'W10'])
def test_bad_cursors_are_rejected(client, path, cursor):
    assert client.get(path, params={'cursor':cursor}).status_code == 400


@pytest.mark.parametrize('position,snapshot', [(2**63,1),(1,2**63),(-1,1),(True,1),(1,True)])
def test_cursor_integers_fit_sqlite_and_do_not_raise_500(client, position, snapshot):
    token = api._cursor('expenses','driver',[None,None],['2026-10-18','2026-10-18 00:00:00',position,'id'],snapshot)
    assert client.get('/expenses', params={'cursor':token}).status_code == 400


def test_cursor_with_unpaired_unicode_is_rejected_before_sqlite(client):
    token = api._cursor('expenses','driver',[None,None],['\ud800','2026-10-18 00:00:00',1,'id'],1)
    assert client.get('/expenses', params={'cursor':token}).status_code == 400
