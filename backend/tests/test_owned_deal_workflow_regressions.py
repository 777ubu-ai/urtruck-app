"""Регрессии полного цикла объявлений: валюта рейса и страны из picker."""
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import marketplace, verification_gate
from database import registration_dal
from database.db import get_conn, new_id
from services.geo_normalize import normalize_country


@pytest.fixture
def flow_client(monkeypatch):
    # Настоящие сессии и verification_gate, без dependency_overrides.
    monkeypatch.setattr(verification_gate, 'BETA_MODE', False)
    app = FastAPI()
    app.include_router(marketplace.mp_router, prefix='/api/v1/market')
    people = {}
    for name, role in [('owner', 'driver'), ('shipper', 'client'), ('outsider', 'client')]:
        user = registration_dal.create_guest()
        registration_dal.update_driver(user['id'], {'role': role, 'verification_level': 1})
        people[name] = (user['id'], {'Authorization': 'Bearer ' + registration_dal.create_session(user['id'])})
    with TestClient(app) as client:
        yield client, people


@pytest.mark.parametrize('currency', ['USD', 'RUB', 'KZT', 'CNY'])
def test_trip_deal_returns_original_currency_and_agreed_amount_to_both_parties(flow_client, currency):
    client, people = flow_client
    driver, owner_headers = people['owner']
    _, bidder_headers = people['shipper']
    tid = new_id()
    with get_conn() as c:
        c.execute('''INSERT INTO trips (id,driver_id,from_city,to_city,from_country,to_country,
            price,currency,status) VALUES (?,?,?,?,?,?,?,?,?)''',
            (tid, driver, 'Иу', 'Берлин', 'CN', 'DE', 7000, currency, 'active'))
    bid = client.post('/api/v1/market/bids', headers=bidder_headers,
                      json={'trip_id': tid, 'amount': 6200})
    assert bid.status_code == 200, bid.text
    accepted = client.post('/api/v1/market/bids/' + bid.json()['id'] + '/accept', headers=owner_headers)
    assert accepted.status_code == 200, accepted.text
    did = accepted.json()['deal_id']
    for headers in [owner_headers, bidder_headers]:
        response = client.get('/api/v1/market/deals/' + did, headers=headers)
        assert response.status_code == 200
        assert response.json()['amount'] == 6200
        assert response.json().get('currency') == currency
    assert client.get('/api/v1/market/deals/' + did, headers=people['outsider'][1]).status_code == 403
    locked = client.patch('/api/v1/market/trips/' + tid, headers=owner_headers,
                          json={'price': 1, 'currency': 'USD' if currency != 'USD' else 'RUB'})
    assert locked.status_code == 409
    with get_conn() as c:
        original = c.execute('SELECT price,currency FROM trips WHERE id=?', (tid,)).fetchone()
        assert tuple(original) == (7000, currency)
    # После отмены объявление можно вернуть в работу с другой валютой.
    # Это не должно переписывать согласованную цену прежней сделки.
    cancelled = client.patch('/api/v1/market/deals/' + did + '/status',
                             headers=owner_headers, params={'new_status': 'cancelled'})
    assert cancelled.status_code == 200, cancelled.text
    active = client.patch('/api/v1/market/trips/' + tid + '/status',
                          headers=owner_headers, params={'new_status': 'active'})
    assert active.status_code == 200, active.text
    changed = client.patch('/api/v1/market/trips/' + tid, headers=owner_headers,
                           json={'currency': 'USD' if currency != 'USD' else 'RUB'})
    assert changed.status_code == 200, changed.text
    for headers in [owner_headers, bidder_headers]:
        historical = client.get('/api/v1/market/deals/' + did, headers=headers)
        assert historical.json()['amount'] == 6200
        assert historical.json()['currency'] == currency
        assert historical.json()['currency_source'] == 'accepted_snapshot'


@pytest.mark.parametrize('country', ['DE', 'BE', 'NL', 'PL', 'LV', 'US', 'GB'])
def test_valid_picker_country_allows_international_border_step(flow_client, country):
    client, people = flow_client
    driver, headers = people['owner']
    shipper, _ = people['shipper']
    cargo, deal = new_id(), new_id()
    with get_conn() as c:
        c.execute('''INSERT INTO cargos (id,owner_id,from_city,to_city,cargo_desc,cargo_type,
            from_country,to_country,price,status) VALUES (?,?,?,?,?,?,?,?,?,?)''',
            (cargo, shipper, 'Иу', 'Город назначения', 'Маршрутная проверка', 'tent', 'CN', country, 7000, 'taken'))
        c.execute('''INSERT INTO deals (id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status)
            VALUES (?,?,?,?,?,?,?,?,?)''', (deal, cargo, new_id(), shipper, driver, 'Иу', 'Город назначения', 6200, 'in_progress'))
    response = client.patch('/api/v1/market/deals/' + deal + '/status',
                            headers=headers, params={'new_status': 'at_border'})
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'at_border'


def test_backend_accepts_all_existing_picker_iso_codes():
    path = Path(__file__).resolve().parents[2] / 'src/utils/countries.js'
    match = re.search(r"const ALL_ISO = '([^']+)'\.split", path.read_text())
    assert match is not None
    codes = match.group(1).split()
    assert len(codes) >= 200
    assert {code: normalize_country(code) for code in codes} == {code: code for code in codes}


@pytest.mark.parametrize('value', ['XX', 'ZZ', 'Atlantis', 'UKK', '', None])
def test_invalid_or_missing_country_still_fails_closed(value):
    assert normalize_country(value) is None


@pytest.mark.parametrize('kind', ['cargo', 'trip'])
@pytest.mark.parametrize('counter', [False, True])
def test_agreed_currency_is_atomic_for_both_listing_directions(flow_client, kind, counter):
    client, people = flow_client
    driver, dh = people['owner']
    shipper, sh = people['shipper']
    listing = new_id()
    table = 'cargos' if kind == 'cargo' else 'trips'
    owner_headers, bidder_headers = (sh, dh) if kind == 'cargo' else (dh, sh)
    with get_conn() as c:
        if kind == 'cargo':
            c.execute('''INSERT INTO cargos (id,owner_id,from_city,to_city,cargo_desc,cargo_type,
                from_country,to_country,price,currency,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                (listing, shipper, 'Иу', 'Москва', 'Проверка цены', 'tent', 'CN', 'RU', 7000, 'KZT', 'active'))
        else:
            c.execute('''INSERT INTO trips (id,driver_id,from_city,to_city,from_country,to_country,
                price,currency,status) VALUES (?,?,?,?,?,?,?,?,?)''',
                (listing, driver, 'Иу', 'Москва', 'CN', 'RU', 7000, 'KZT', 'active'))
    bid = client.post('/api/v1/market/bids', headers=bidder_headers,
                      json={kind + '_id': listing, 'amount': 6200})
    assert bid.status_code == 200, bid.text
    bid_path = '/api/v1/market/bids/' + bid.json()['id']
    amount = 6200
    if counter:
        offered = client.post(bid_path + '/counter', headers=owner_headers, json={'amount': 6500})
        assert offered.status_code == 200, offered.text
        accepted = client.post(bid_path + '/counter/accept', headers=bidder_headers)
        amount = 6500
    else:
        accepted = client.post(bid_path + '/accept', headers=owner_headers)
    assert accepted.status_code == 200, accepted.text
    deal = '/api/v1/market/deals/' + accepted.json()['deal_id']
    # Изолируем инвариант: даже изменение родителя не меняет снимок сделки.
    with get_conn() as c:
        c.execute('UPDATE ' + table + ' SET currency=? WHERE id=?', ('USD', listing))
    for headers in [owner_headers, bidder_headers]:
        data = client.get(deal, headers=headers).json()
        assert (data['amount'], data['currency'], data['currency_source']) == (amount, 'KZT', 'accepted_snapshot')
    # Исторические записи без снимка нельзя выдавать за доказанную валюту.
    with get_conn() as c:
        c.execute('UPDATE deals SET currency_snapshot=NULL WHERE id=?', (accepted.json()['deal_id'],))
    marketplace._init()
    legacy = client.get(deal, headers=owner_headers).json()
    assert legacy['currency_snapshot'] is None
    assert legacy['currency_source'] == 'current_listing_unverified'


def test_accept_without_snapshot_migration_rolls_back_listing_and_bid(flow_client):
    client, people = flow_client
    driver, owner_headers = people['owner']
    _, bidder_headers = people['shipper']
    tid = new_id()
    with get_conn() as c:
        c.execute('''INSERT INTO trips (id,driver_id,from_city,to_city,from_country,to_country,
            price,currency,status) VALUES (?,?,?,?,?,?,?,?,?)''',
            (tid, driver, 'Иу', 'Москва', 'CN', 'RU', 7000, 'CNY', 'active'))
    bid = client.post('/api/v1/market/bids', headers=bidder_headers,
                      json={'trip_id': tid, 'amount': 6200}).json()['id']
    try:
        with get_conn() as c:
            c.execute('ALTER TABLE deals DROP COLUMN currency_snapshot')
        response = client.post('/api/v1/market/bids/' + bid + '/accept', headers=owner_headers)
        assert response.status_code == 503, response.text
        with get_conn() as c:
            assert c.execute('SELECT status FROM trips WHERE id=?', (tid,)).fetchone()[0] == 'active'
            assert c.execute('SELECT status FROM bids WHERE id=?', (bid,)).fetchone()[0] == 'pending'
            assert c.execute('SELECT COUNT(*) FROM deals WHERE bid_id=?', (bid,)).fetchone()[0] == 0
    finally:
        marketplace._init()
