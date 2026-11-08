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
