"""P1: явное уточнение страны без смены ID и тупика принятой сделки."""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config
from api import marketplace as market, chat, notifications, push
from database import db, registration_dal, deal_room_dal


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'DB_PATH', str(tmp_path / 'route-correction.sqlite3'))
    monkeypatch.setattr(db, '_maybe_expire_marketplace', lambda c: None)
    monkeypatch.setattr(market, 'send_to_user', lambda *a, **k: None)
    db.init_db()
    registration_dal.init_registration_schema()
    chat._init()
    market._init()
    notifications._init()
    push._init_schema()
    deal_room_dal.init_deal_room_schema()
    owner, driver, stranger = [str(uuid.uuid4()) for _ in range(3)]
    with db.get_conn() as c:
        for uid, role in [(owner, 'client'), (driver, 'driver'), (stranger, 'client')]:
            c.execute('INSERT INTO drivers_registration(id,phone,role,verification_level,status,full_name) VALUES(?,?,?,?,?,?)',
                      (uid, 'route-test-' + uid, role, 2, 'approved', 'Проверка маршрута'))
    headers = {uid: {'Authorization': 'Bearer ' + registration_dal.create_session(uid)} for uid in [owner, driver, stranger]}
    app = FastAPI()
    app.include_router(market.mp_router, prefix='/api/v1/market')
    client = TestClient(app)
    return {'owner': owner, 'driver': driver, 'stranger': stranger, 'headers': headers, 'http': client}


def cargo_and_bid(w, from_country='XX', to_country='IR'):
    cargo, bid = str(uuid.uuid4()), str(uuid.uuid4())
    with db.get_conn() as c:
        c.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,from_country,to_country,cargo_desc,price,currency,status,published_at) VALUES(?,?,'Пункт отправления','Пункт назначения',?,?,'Существующий груз',900,'USD','active',CURRENT_TIMESTAMP)",
                  (cargo, w['owner'], from_country, to_country))
        c.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES(?,?,?,900,'pending')", (bid, cargo, w['driver']))
    return cargo, bid


def test_unknown_cargo_cannot_be_accepted_and_nothing_changes(world):
    cargo, bid = cargo_and_bid(world)
    r = world['http'].post(f'/api/v1/market/bids/{bid}/accept', headers=world['headers'][world['owner']])
    assert r.status_code == 409, r.text
    assert r.json()['detail']['error'] == 'ROUTE_COUNTRY_UNKNOWN'
    with db.get_conn() as c:
        assert c.execute('SELECT status FROM cargos WHERE id=?', (cargo,)).fetchone()[0] == 'active'
        assert c.execute('SELECT status FROM bids WHERE id=?', (bid,)).fetchone()[0] == 'pending'
        assert c.execute('SELECT COUNT(*) FROM deals WHERE bid_id=?', (bid,)).fetchone()[0] == 0


def test_owner_can_explicitly_fix_country_preserving_the_cargo(world):
    cargo, bid = cargo_and_bid(world)
    with db.get_conn() as c:
        before = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cargo,)).fetchone())
    r = world['http'].post(f'/api/v1/market/cargos/{cargo}/route-country', headers=world['headers'][world['owner']],
                           json={'from_country': 'KZ', 'to_country': 'IR', 'request_id': 'owner-correction'})
    assert r.status_code == 200, r.text
    with db.get_conn() as c:
        after = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cargo,)).fetchone())
        assert after['from_country'] == 'KZ'
        assert {k: v for k, v in after.items() if k != 'from_country'} == {k: v for k, v in before.items() if k != 'from_country'}
    accepted = world['http'].post(f'/api/v1/market/bids/{bid}/accept', headers=world['headers'][world['owner']])
    assert accepted.status_code == 200, accepted.text


def legacy_deal(w, from_country='XX', to_country='IR', status='in_progress'):
    cargo, bid = cargo_and_bid(w, from_country, to_country)
    deal = str(uuid.uuid4())
    with db.get_conn() as c:
        room = market._ensure_chat_room_inline(c, w['owner'], w['driver'], cargo, None, bid)
        c.execute("UPDATE cargos SET status='taken',taken_by=? WHERE id=?", (w['driver'], cargo))
        c.execute("UPDATE bids SET status='accepted' WHERE id=?", (bid,))
        c.execute('INSERT INTO deals(id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) '
                  "VALUES(?,?,?,?,?,'Пункт отправления','Пункт назначения',900,?,?)",
                  (deal, cargo, bid, w['owner'], w['driver'], status, room))
        c.execute("INSERT INTO chat_messages(room_id,sender_id,text) VALUES(?,?,'Сохранённое сообщение')", (room, w['owner']))
    return cargo, bid, deal, room


def post(w, path, actor='owner', body=None):
    return w['http'].post('/api/v1/market'+path, headers=w['headers'][w[actor]], json=body)


def proposal(w, deal, request_id='correction-first', from_country='KZ', to_country='IR'):
    return post(w, f'/deals/{deal}/route-country', body={
        'request_id': request_id, 'from_country': from_country, 'to_country': to_country})


def step(w, deal, status, actor='driver'):
    r = w['http'].patch(f'/api/v1/market/deals/{deal}/status?new_status={status}&capture_mode=snapshot',
                        headers=w['headers'][w[actor]])
    assert r.status_code == 200, (status, r.text)


@pytest.mark.parametrize('initial', ['accepted', 'in_progress'])
def test_legacy_deal_two_party_correction_then_full_cycle_and_documents(world, initial):
    cargo, bid, deal, room = legacy_deal(world, status=initial)
    with db.get_conn() as c:
        old_cargo = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cargo,)).fetchone())
        old_bid = dict(c.execute('SELECT * FROM bids WHERE id=?', (bid,)).fetchone())
        old_message = dict(c.execute('SELECT * FROM chat_messages WHERE room_id=?', (room,)).fetchone())
    doc = post(world, f'/deals/{deal}/waybill-link')
    assert doc.status_code == 200, doc.text
    exp, sig = doc.json()['exp'], doc.json()['sig']
    pr = proposal(world, deal)
    assert pr.status_code == 200, pr.text
    clarification = pr.json()['clarification']['id']
    # Первая сторона не меняет ни маршрут, ни статус единолично.
    d = world['http'].get(f'/api/v1/market/deals/{deal}', headers=world['headers'][world['driver']]).json()
    assert d['route_country_valid'] is False and d['from_country'] == 'XX'
    assert d['route_country_clarification']['can_confirm'] is True
    assert post(world, f'/deals/{deal}/route-country/{clarification}/confirm').status_code == 403
    confirmed = post(world, f'/deals/{deal}/route-country/{clarification}/confirm', actor='driver')
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()['clarification']['from_country_before'] == 'XX'
    assert confirmed.json()['clarification']['approver_id'] == world['driver']
    d = world['http'].get(f'/api/v1/market/deals/{deal}', headers=world['headers'][world['owner']]).json()
    assert d['route_country_valid'] is True and d['from_country_code'] == 'KZ' and d['to_country_code'] == 'IR'
    assert d['route_country_clarification']['can_propose'] is False
    dashboard = world['http'].get('/api/v1/market/my', headers=world['headers'][world['owner']])
    assert dashboard.status_code == 200, dashboard.text
    same_deal = next(x for x in dashboard.json()['my_deals'] if x['id'] == deal)
    assert same_deal['from_country'] == 'KZ' and same_deal['to_country'] == 'IR'
    if initial == 'accepted':
        step(world, deal, 'in_progress')
    step(world, deal, 'at_border')
    step(world, deal, 'delivered')
    step(world, deal, 'received', actor='owner')
    step(world, deal, 'completed', actor='owner')
    # Прежняя подписанная ссылка остаётся действительной.
    assert world['http'].get(f'/api/v1/market/deals/{deal}/waybill?exp={exp}&sig={sig}').status_code == 200
    with db.get_conn() as c:
        current = dict(c.execute('SELECT * FROM deals WHERE id=?', (deal,)).fetchone())
        assert current['status'] == 'completed'
        assert current['cargo_id'] == cargo and current['bid_id'] == bid and current['chat_room_id'] == room
        # Завершение штатно меняет статус исходного груза; остальные поля сохранены.
        now_cargo = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cargo,)).fetchone())
        for key in old_cargo:
            if key not in ('status', 'updated_at'):
                assert now_cargo[key] == old_cargo[key], key
        assert dict(c.execute('SELECT * FROM bids WHERE id=?', (bid,)).fetchone()) == old_bid
        assert dict(c.execute('SELECT * FROM chat_messages WHERE id=?', (old_message['id'],)).fetchone()) == old_message
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 1


@pytest.mark.parametrize('actor', ['driver', 'stranger'])
def test_only_listing_owner_can_propose_correction(world, actor):
    cargo, _bid, deal, _room = legacy_deal(world)
    body = {'request_id': 'not-owner-request', 'from_country': 'KZ', 'to_country': 'IR'}
    assert post(world, f'/cargos/{cargo}/route-country', actor, body).status_code == 403
    assert post(world, f'/deals/{deal}/route-country', actor, body).status_code == 403


def test_stranger_and_anonymous_cannot_read_or_confirm(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    proposed = proposal(world, deal).json()['clarification']['id']
    assert post(world, f'/deals/{deal}/route-country/{proposed}/confirm', 'stranger').status_code == 403
    assert world['http'].get(f'/api/v1/market/deals/{deal}', headers=world['headers'][world['stranger']]).status_code == 403
    assert world['http'].post(f'/api/v1/market/deals/{deal}/route-country/{proposed}/confirm').status_code == 401


def test_existing_deal_cannot_be_changed_through_listing_endpoint(world):
    cargo, _bid, _deal, _room = legacy_deal(world)
    r = post(world, f'/cargos/{cargo}/route-country', body={
        'request_id': 'unilateral-change', 'from_country': 'KZ', 'to_country': 'IR'})
    assert r.status_code == 409 and r.json()['detail']['error'] == 'ROUTE_REQUIRES_PARTNER_CONFIRMATION'


@pytest.mark.parametrize('invalid', ['', 'XX', 'ZZ', 'Neverland'])
def test_unknown_country_is_never_replaced_by_another_unknown(world, invalid):
    cargo, _bid = cargo_and_bid(world)
    r = post(world, f'/cargos/{cargo}/route-country', body={
        'request_id': 'invalid-country', 'from_country': invalid, 'to_country': 'IR'})
    assert r.status_code in (409, 422)
    with db.get_conn() as c:
        assert c.execute('SELECT from_country FROM cargos WHERE id=?', (cargo,)).fetchone()[0] == 'XX'
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 0


def test_known_destination_cannot_be_rerouted(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    r = proposal(world, deal, to_country='CN')
    assert r.status_code == 409 and r.json()['detail']['error'] == 'ROUTE_COUNTRY_ALREADY_SET'


def test_retry_is_idempotent_and_changed_body_is_rejected(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    a, b = proposal(world, deal), proposal(world, deal)
    assert a.status_code == b.status_code == 200
    assert a.json()['clarification']['id'] == b.json()['clarification']['id']
    assert proposal(world, deal, from_country='RU').status_code == 409
    cid = a.json()['clarification']['id']
    assert post(world, f'/deals/{deal}/route-country/{cid}/confirm', 'driver').status_code == 200
    assert post(world, f'/deals/{deal}/route-country/{cid}/confirm', 'driver').status_code == 200
    with db.get_conn() as c:
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 1


def test_replaced_proposal_needs_its_own_partner_confirmation(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    a = proposal(world, deal).json()['clarification']['id']
    b = proposal(world, deal, request_id='correction-new', from_country='RU').json()['clarification']['id']
    assert a != b
    assert post(world, f'/deals/{deal}/route-country/{a}/confirm', 'driver').status_code == 409
    assert post(world, f'/deals/{deal}/route-country/{b}/confirm', 'driver').status_code == 200
    with db.get_conn() as c:
        assert c.execute('SELECT from_country_snapshot FROM deals WHERE id=?', (deal,)).fetchone()[0] == 'RU'
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 2


@pytest.mark.parametrize('status', ['completed', 'cancelled', 'delivered', 'received'])
def test_closed_or_delivered_deal_is_never_reactivated(world, status):
    _cargo, _bid, deal, _room = legacy_deal(world, status=status)
    assert proposal(world, deal).status_code == 409
    with db.get_conn() as c:
        assert c.execute('SELECT status FROM deals WHERE id=?', (deal,)).fetchone()[0] == status
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 0


def test_ax_route_is_accepted_and_snapshot_is_used(world):
    cargo, bid = cargo_and_bid(world, 'AX', 'FI')
    r = post(world, f'/bids/{bid}/accept')
    assert r.status_code == 200, r.text
    deal = r.json()['deal_id']
    with db.get_conn() as c:
        assert c.execute('SELECT from_country_snapshot FROM deals WHERE id=?', (deal,)).fetchone()[0] == 'AX'
        # Непредвиденная последующая правка объявления не меняет принятую сделку.
        c.execute("UPDATE cargos SET from_country='XX' WHERE id=?", (cargo,))
    d = world['http'].get(f'/api/v1/market/deals/{deal}', headers=world['headers'][world['driver']]).json()
    assert d['route_country_valid'] is True and d['from_country_code'] == 'AX'


def test_migration_is_idempotent_and_does_not_invent_old_countries(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    market._init()
    market._init()
    with db.get_conn() as c:
        d = dict(c.execute('SELECT * FROM deals WHERE id=?', (deal,)).fetchone())
        assert d['from_country_snapshot'] is None and d['to_country_snapshot'] is None
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 0


def test_public_validator_uses_same_ax_and_unknown_country_contract(world):
    ax = world['http'].get('/api/v1/market/route-country/validate?from_country=AX&to_country=FI')
    assert ax.status_code == 200
    assert ax.json() == {'from_country_code': 'AX', 'to_country_code': 'FI',
                         'route_country_valid': True, 'is_international': True, 'code': 'ok'}
    invalid = world['http'].get('/api/v1/market/route-country/validate?from_country=XX&to_country=IR').json()
    assert invalid['route_country_valid'] is False and invalid['from_country_code'] is None
    with db.get_conn() as c:
        assert c.execute('SELECT COUNT(*) FROM route_country_clarifications').fetchone()[0] == 0


def test_listing_correction_does_not_accept_unrelated_fields(world):
    cargo, _bid = cargo_and_bid(world)
    r = post(world, f'/cargos/{cargo}/route-country', body={
        'request_id': 'country-and-price', 'from_country': 'KZ', 'to_country': 'IR', 'price': 1, 'status': 'completed'})
    assert r.status_code == 422
    with db.get_conn() as c:
        row = c.execute('SELECT price,status,from_country FROM cargos WHERE id=?', (cargo,)).fetchone()
        assert tuple(row) == (900, 'active', 'XX')


def test_client_legacy_aliases_match_server_canonical_values():
    import json
    from pathlib import Path
    from services.geo_normalize import _COUNTRY_MAP
    path = Path(__file__).resolve().parents[2] / 'src/utils/routeCountryAliases.js'
    aliases = json.loads(path.read_text().split('export default ', 1)[1].rstrip().removesuffix(';'))
    assert aliases == _COUNTRY_MAP


def test_confirmation_and_replacement_are_serialized(world):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    _cargo, _bid, deal, _room = legacy_deal(world)
    old = proposal(world, deal).json()['clarification']['id']
    gate = Barrier(2)
    def confirm():
        gate.wait()
        return post(world, f'/deals/{deal}/route-country/{old}/confirm', 'driver')
    def replace():
        gate.wait()
        return proposal(world, deal, request_id='concurrent-new-country', from_country='RU')
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(confirm), pool.submit(replace)
        confirmation, replacement = a.result(), b.result()
    with db.get_conn() as c:
        value = c.execute('SELECT from_country_snapshot FROM deals WHERE id=?', (deal,)).fetchone()[0]
        pending = c.execute("SELECT from_country_after FROM route_country_clarifications WHERE entity_id=? AND status='pending'", (deal,)).fetchall()
    if confirmation.status_code == 200:
        assert replacement.status_code == 409 and value == 'KZ' and not pending
    else:
        assert confirmation.status_code == 409 and replacement.status_code == 200
        assert value is None and [r[0] for r in pending] == ['RU']


def test_correction_and_acceptance_cannot_create_unknown_snapshot(world):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    cargo, bid = cargo_and_bid(world)
    gate = Barrier(2)
    def correct():
        gate.wait()
        return post(world, f'/cargos/{cargo}/route-country', body={
            'request_id': 'race-explicit-country', 'from_country': 'KZ', 'to_country': 'IR'})
    def accept():
        gate.wait()
        return post(world, f'/bids/{bid}/accept')
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(correct), pool.submit(accept)
        correction, acceptance = a.result(), b.result()
    assert correction.status_code == 200
    assert acceptance.status_code in (200, 409)
    if acceptance.status_code == 409:
        assert acceptance.json()['detail']['error'] == 'ROUTE_COUNTRY_UNKNOWN'
        acceptance = post(world, f'/bids/{bid}/accept')
    assert acceptance.status_code == 200
    with db.get_conn() as c:
        rows = c.execute('SELECT from_country_snapshot,to_country_snapshot FROM deals WHERE bid_id=?', (bid,)).fetchall()
        assert [tuple(r) for r in rows] == [('KZ', 'IR')]


def test_pending_confirmation_does_not_reopen_closed_deal(world):
    _cargo, _bid, deal, _room = legacy_deal(world)
    cid = proposal(world, deal).json()['clarification']['id']
    with db.get_conn() as c:
        c.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal,))
    r = post(world, f'/deals/{deal}/route-country/{cid}/confirm', 'driver')
    assert r.status_code == 409 and r.json()['detail']['error'] == 'ROUTE_DEAL_CLOSED'
    with db.get_conn() as c:
        assert tuple(c.execute('SELECT status,from_country_snapshot FROM deals WHERE id=?', (deal,)).fetchone()) == ('cancelled', None)
