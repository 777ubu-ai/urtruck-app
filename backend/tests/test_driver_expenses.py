"""Изолированная проверка приватного блокнота: никогда не использует рабочую БД."""
import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import config
from api import driver_expenses as api


@pytest.fixture()
def client(tmp_path, monkeypatch):
    path = tmp_path / "expenses.sqlite"
    monkeypatch.setattr(config, "DB_PATH", str(path))
    with sqlite3.connect(path) as c:
        c.executescript("""
        CREATE TABLE vehicles (id TEXT PRIMARY KEY,owner_user_id TEXT,license_plate TEXT,updated_at TEXT);
        CREATE TABLE deals (id TEXT PRIMARY KEY,driver_id TEXT,shipper_id TEXT,from_city TEXT,to_city TEXT,
          vehicle_id TEXT,vehicle_plate_snapshot TEXT,created_at TEXT);
        INSERT INTO vehicles VALUES ('v1','driver','A123','2026-10-18'),('v2','other','B456','2026-10-18'),('v3','driver','C789','2026-10-18');
        INSERT INTO deals VALUES ('d1','driver','shipper','Бишкек','Воронеж','v1','A123','2026-10-18'),
          ('d2','other','shipper','Алматы','Астана','v2','B456','2026-10-18'),
          ('d3','driver','shipper','Иу','Алматы',NULL,NULL,'2026-10-18');
        CREATE TABLE legacy_sentinel (value TEXT);
        INSERT INTO legacy_sentinel VALUES ('preserve');
        """)
    api.init_expenses_schema()
    app = FastAPI()
    app.include_router(api.router, prefix="/expenses")
    def user(x_user: str = Header(default=None), x_role: str = Header(default="driver"), x_level: int = Header(default=1)):
        if not x_user:
            raise HTTPException(status_code=401)
        return {"id": x_user, "role": x_role, "verification_level": x_level}
    app.dependency_overrides[api.verified_user] = user
    with TestClient(app) as test_client:
        test_client.headers.update({"X-User": "driver"})
        yield test_client


def payload(**overrides):
    return {"client_id": uuid4().hex, "amount": "1500.00", "currency": "KZT", "category": "food",
            "description": "Купил хлеб и жвачку", "spent_on": "2026-10-18", "deal_id": "d1", **overrides}


def add(client, **values):
    r = client.post('/expenses', json=payload(**values))
    assert r.status_code == 200, r.text
    return r.json()['expense']


def test_roundtrip_private_bindings_and_schema_preservation(client):
    item = add(client)
    assert item['vehicle_id'] == 'v1' and item['vehicle_plate'] == 'A123'
    assert item['deal_label'] == 'Бишкек → Воронеж'
    assert item['description'] == 'Купил хлеб и жвачку'
    result = client.get('/expenses').json()
    assert result['total'] == 1 and result['totals'] == [{'currency': 'KZT', 'amount': '1500.00'}]
    assert all(k not in item for k in ['owner_user_id', 'create_fingerprint', 'client_id'])
    api.init_expenses_schema(); api.init_expenses_schema()
    assert client.get('/expenses').json()['total'] == 1
    with sqlite3.connect(config.DB_PATH) as c:
        assert c.execute('SELECT value FROM legacy_sentinel').fetchall() == [('preserve',)]


@pytest.mark.parametrize('headers', [{}, {'X-User':'shipper','X-Role':'client'}, {'X-User':'guest','X-Level':'0'}, {'X-User':'guest','X-Role':'guest'}])
def test_auth_and_role_are_required_even_in_beta(client, headers):
    client.headers.clear()
    r = client.get('/expenses', headers=headers)
    assert r.status_code in (401, 403)


def test_other_users_never_see_or_mutate_expenses(client):
    item = add(client)
    client.headers['X-User'] = 'other'
    assert client.get('/expenses').json()['expenses'] == []
    assert client.get('/expenses?deal_id=d1&vehicle_id=v1').json()['totals'] == []
    assert client.put('/expenses/' + item['id'], json=payload(deal_id=None, version=1)).status_code == 404
    assert client.delete('/expenses/' + item['id'] + '?version=1').status_code == 404
    client.headers['X-User'] = 'shipper'
    assert client.get('/expenses').json()['total'] == 0
    assert client.post('/expenses', json=payload()).status_code == 404


@pytest.mark.parametrize('fields,status', [({'deal_id':'d2'},404), ({'deal_id':None,'vehicle_id':'v2'},404), ({'vehicle_id':'v3'},409)])
def test_foreign_binding_and_deal_vehicle_mismatch(client, fields, status):
    assert client.post('/expenses', json=payload(**fields)).status_code == status
    assert client.get('/expenses').json()['total'] == 0


def test_retry_is_idempotent_and_changed_payload_cannot_duplicate(client):
    body = payload(amount='1.2')
    first = client.post('/expenses', json=body).json()['expense']
    body['amount'] = '1.20'
    second = client.post('/expenses', json=body)
    assert second.json()['expense']['id'] == first['id'] and second.json()['deduplicated']
    body['description'] = 'Changed after timeout'
    assert client.post('/expenses', json=body).status_code == 409
    assert client.get('/expenses').json()['total'] == 1


@pytest.mark.parametrize('fields', [
    {'amount':'0'}, {'amount':'-1'}, {'amount':'1.001'}, {'amount':'NaN'}, {'amount':'Infinity'}, {'amount':'1000000000'},
    {'currency':'XXX'}, {'category':'invalid'}, {'spent_on':'2026-02-30'}, {'spent_on':'1999-12-31'},
    {'description':'a'*501}, {'owner_user_id':'victim'}, {'client_id':'!invalid!'},
])
def test_invalid_inputs_fail_closed(client, fields):
    assert client.post('/expenses', json=payload(**fields)).status_code == 422


def test_totals_exact_per_currency_and_across_pages_filters_and_delete(client):
    first = add(client, amount='1.20')
    add(client, amount='2.30')
    add(client, amount='10.00', currency='USD', deal_id='d3', vehicle_id='v3')
    result = client.get('/expenses?limit=1').json()
    assert len(result['expenses']) == 1 and result['total'] == 3
    assert result['totals'] == [{'currency':'KZT','amount':'3.50'}, {'currency':'USD','amount':'10.00'}]
    assert len(client.get('/expenses?offset=1&limit=1').json()['expenses']) == 1
    assert client.get('/expenses?vehicle_id=v1').json()['total'] == 2
    assert client.get('/expenses?deal_id=d3').json()['totals'] == [{'currency':'USD','amount':'10.00'}]
    assert client.delete('/expenses/' + first['id'] + '?version=1').status_code == 200
    assert client.get('/expenses?deal_id=d1').json()['totals'] == [{'currency':'KZT','amount':'2.30'}]
    assert client.get('/expenses?limit=101').status_code == 422


def test_edit_conflict_and_soft_delete_do_not_resurrect(client):
    original = payload()
    item = client.post('/expenses', json=original).json()['expense']
    edited = client.put('/expenses/' + item['id'], json={**original, 'version':1, 'description':'Дизель', 'amount':'42.10'})
    assert edited.status_code == 200 and edited.json()['expense']['version'] == 2
    assert client.put('/expenses/' + item['id'], json={**original,'version':1}).status_code == 409
    assert client.delete('/expenses/' + item['id'] + '?version=1').status_code == 409
    assert client.delete('/expenses/' + item['id'] + '?version=2').status_code == 200
    assert client.delete('/expenses/' + item['id'] + '?version=2').status_code == 200
    assert client.post('/expenses', json=original).status_code == 409
    assert client.get('/expenses').json()['total'] == 0


def test_options_and_requested_historical_deal_are_owner_scoped(client):
    result = client.get('/expenses/options').json()
    assert {v['id'] for v in result['vehicles']} == {'v1','v3'}
    assert {d['id'] for d in result['deals']} == {'d1','d3'}
    assert client.get('/expenses/options?deal_id=d2').status_code == 404
    item = add(client)
    with sqlite3.connect(config.DB_PATH) as c:
        c.execute("DELETE FROM vehicles WHERE id='v1'")
    edited = client.put('/expenses/' + item['id'], json=payload(version=1))
    assert edited.status_code == 200 and edited.json()['expense']['vehicle_plate'] == 'A123'
    assert client.post('/expenses', json=payload()).status_code == 404
    assert add(client, deal_id=None)['vehicle_id'] is None
