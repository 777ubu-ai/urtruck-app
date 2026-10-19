"""Потерянный ответ, повтор после перезапуска и конкуренция на настоящем SQLite/API."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import marketplace
from database import registration_dal as reg
from database.db import get_conn


def actor(role):
    guest = reg.create_guest()
    uid = guest['id'] if isinstance(guest, dict) else guest
    reg.update_driver(uid, {'role': role, 'verification_level': 1, 'status': 'basic', 'basic_onboarding_completed': 1})
    token = reg.create_session(uid)
    return uid, token


def client(token):
    app = FastAPI(); app.include_router(marketplace.mp_router, prefix='/api/v1/market')
    return TestClient(app, headers={'Authorization': 'Bearer ' + token})


def body(kind, operation=None):
    payload = dict(from_city='Хоргос', to_city='Алматы', price=4500, currency='USD')
    future = (date.today() + timedelta(days=7)).isoformat()
    if kind == 'cargos':
        payload.update(cargo_desc='ТЕСТ: электросамокаты', cargo_type='tent', weight_tons=25,
                       volume_m3=150, pickup_date=future, payment_type='any')
    else:
        payload.update(truck_type='tent', departure=future, capacity_tons=25, available_m3=150)
    if operation is not None: payload['client_id'] = operation
    return payload


@pytest.fixture(autouse=True)
def no_external_push(monkeypatch):
    from api import saved_searches
    monkeypatch.setattr(saved_searches, 'notify_matching_users', lambda *a, **k: None)


@pytest.mark.parametrize('kind,role,table,owner_col', [('cargos','client','cargos','owner_id'),('trips','driver','trips','driver_id')])
def test_created_response_lost_restart_and_replay(kind, role, table, owner_col):
    uid, token = actor(role); payload = body(kind, 'lost_' + uuid4().hex)
    first = client(token).post('/api/v1/market/' + kind, json=payload)
    assert first.status_code == 200, first.text
    created = first.json()  # Транспорт потерял этот ответ: следующий экземпляр не получает его.
    restarted = client(token)
    replay = restarted.post('/api/v1/market/' + kind, json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.json() == created
    with get_conn() as c:
        assert c.execute(f'SELECT count(*) FROM {table} WHERE {owner_col}=?', (uid,)).fetchone()[0] == 1


@pytest.mark.parametrize('kind,role', [('cargos','client'),('trips','driver')])
def test_concurrent_retries_return_one_result(kind, role):
    uid, token = actor(role); payload = body(kind, 'race_' + uuid4().hex)
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: client(token).post('/api/v1/market/' + kind, json=payload), range(6)))
    assert all(r.status_code == 200 for r in responses), [r.status_code for r in responses]
    assert len({r.json()['id'] for r in responses}) == 1
    with get_conn() as c:
        owner_col = 'owner_id' if kind == 'cargos' else 'driver_id'
        assert c.execute(f'SELECT count(*) FROM {kind} WHERE {owner_col}=?', (uid,)).fetchone()[0] == 1


@pytest.mark.parametrize('kind,role', [('cargos','client'),('trips','driver')])
def test_changed_content_conflicts_without_second_listing(kind, role):
    uid, token = actor(role); payload = body(kind, 'conflict_' + uuid4().hex); api = client(token)
    original = api.post('/api/v1/market/' + kind, json=payload).json()
    conflict = api.post('/api/v1/market/' + kind, json={**payload, 'price': 4600})
    assert conflict.status_code == 409
    assert conflict.json()['detail']['error'] == 'PUBLICATION_IDEMPOTENCY_CONFLICT'
    assert conflict.json()['detail']['original_result'] == original
    assert api.post('/api/v1/market/' + kind, json=payload).json() == original


def test_other_owner_cannot_receive_first_result_and_wrong_role_stays_forbidden():
    _, token_a = actor('client'); _, token_b = actor('client'); _, token_driver = actor('driver')
    payload = body('cargos', 'owner_' + uuid4().hex)
    a = client(token_a).post('/api/v1/market/cargos', json=payload).json()
    b = client(token_b).post('/api/v1/market/cargos', json=payload).json()
    assert a['id'] != b['id']
    forbidden = client(token_driver).post('/api/v1/market/cargos', json=payload)
    assert forbidden.status_code == 403
    assert 'original_result' not in forbidden.text


@pytest.mark.parametrize('kind,role', [('cargos','client'),('trips','driver')])
def test_old_client_without_key_retains_contract(kind, role):
    _, token = actor(role); api = client(token); payload = body(kind)
    one = api.post('/api/v1/market/' + kind, json=payload); two = api.post('/api/v1/market/' + kind, json=payload)
    assert one.status_code == two.status_code == 200
    assert set(one.json()) == {'id','ok'}
    assert one.json()['id'] != two.json()['id']


def test_replay_does_not_repeat_push_or_revalidate_expired_business_date(monkeypatch):
    from api import saved_searches
    calls=[]; monkeypatch.setattr(saved_searches, 'notify_matching_users', lambda *a, **kw: calls.append(kw))
    _, token=actor('client'); api=client(token); payload=body('cargos','push_'+uuid4().hex)
    first=api.post('/api/v1/market/cargos',json=payload)
    def expired(*args): raise AssertionError('Нельзя заново проверять дату уже сохранённой операции')
    monkeypatch.setattr(marketplace, '_validate_future_date', expired)
    assert api.post('/api/v1/market/cargos',json=payload).json()==first.json()
    assert len(calls)==1


@pytest.mark.parametrize('kind,role', [('cargos','client'),('trips','driver')])
def test_operation_record_failure_rolls_back_listing(monkeypatch, kind, role):
    from database import publication_operations
    uid, token = actor(role)
    def fail(*args): raise RuntimeError('Проверочный отказ перед сохранением результата')
    monkeypatch.setattr(publication_operations, 'record', fail)
    api=client(token)
    with pytest.raises(RuntimeError):
        api.post('/api/v1/market/' + kind, json=body(kind,'rollback_'+uuid4().hex))
    with get_conn() as c:
        owner_col='owner_id' if kind=='cargos' else 'driver_id'
        assert c.execute(f'SELECT count(*) FROM {kind} WHERE {owner_col}=?',(uid,)).fetchone()[0]==0
        assert c.execute('SELECT count(*) FROM marketplace_publication_operations WHERE owner_user_id=?',(uid,)).fetchone()[0]==0


@pytest.mark.parametrize('kind,role,field', [('cargos','client','from_point_name'),('trips','driver','transit')])
def test_invalid_unicode_is_explicit_422_without_changing_original(kind, role, field):
    import json
    _, token=actor(role);api=client(token);payload=body(kind,'unicode_'+uuid4().hex)
    original=api.post('/api/v1/market/'+kind,json=payload).json()
    invalid=api.post('/api/v1/market/'+kind,content=json.dumps({**payload,field:'\ud800'}),headers={'Content-Type':'application/json'})
    assert invalid.status_code==422
    assert invalid.json()['detail']['error']=='PUBLICATION_INVALID_BODY'
    assert api.post('/api/v1/market/'+kind,json=payload).json()==original
