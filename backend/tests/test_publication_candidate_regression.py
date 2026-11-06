"""Контрольная форма и реальные проверки bearer/роли на отдельной тестовой БД."""
from datetime import datetime
import pytest
import api.marketplace as marketplace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.marketplace import mp_router
from database import registration_dal as reg
from database.db import get_conn


@pytest.fixture(autouse=True)
def control_date(monkeypatch):
    # Контрольная дата остаётся воспроизводимой после октября 2026 года.
    class FrozenDateTime(datetime):
        @classmethod
        def utcnow(cls):
            return cls(2026, 10, 19, 12)
    monkeypatch.setattr(marketplace, 'datetime', FrozenDateTime)


def _client(role):
    guest = reg.create_guest()
    uid = guest['id'] if isinstance(guest, dict) else guest
    reg.update_driver(uid, {'role': role, 'verification_level': 1, 'status': 'basic', 'basic_onboarding_completed': 1})
    app = FastAPI()
    app.include_router(mp_router, prefix='/api/v1/market')
    client = TestClient(app)
    client.headers['Authorization'] = 'Bearer ' + reg.create_session(uid)
    return client, uid


def _body():
    return dict(from_city='Хоргос', to_city='Алматы', cargo_desc='электросамокаты', cargo_type='tent',
                weight_tons=25, volume_m3=150, pickup_date='2026-10-25', price=4500, currency='USD', payment_type='any',
                from_country='CN', to_country='KZ')


def test_control_cargo_persists_and_is_published_for_shipper(monkeypatch):
    from services import push_sender
    monkeypatch.setattr(push_sender, 'send', lambda *a, **k: {'ok': True})
    client, uid = _client('client')
    result = client.post('/api/v1/market/cargos', json=_body())
    assert result.status_code == 200, result.text
    cid = result.json()['id']
    with get_conn() as c:
        row = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cid,)).fetchone())
    assert row['owner_id'] == uid
    for key, value in _body().items():
        assert row[key] == value, key
    assert row['status'] == 'active'
    assert client.get('/api/v1/market/cargos/' + cid).json()['id'] == cid


def test_cargo_creation_retry_is_visible_to_counterparty_in_public_feed(monkeypatch):
    """A lost response retry must preserve one real listing visible to drivers."""
    from api import saved_searches
    monkeypatch.setattr(saved_searches, 'notify_matching_users', lambda *a, **k: None)
    owner, uid = _client('client')
    driver, _ = _client('driver')
    payload = {
        **_body(),
        'from_city': 'Алматы',
        'to_city': 'Астана',
        'cargo_desc': 'Оборудование в деревянных ящиках',
        'pickup_date': '2026-10-25',
        'client_id': 'device-feed-chain-cargo-1',
    }

    created = owner.post('/api/v1/market/cargos', json=payload)
    assert created.status_code == 200, created.text
    cargo_id = created.json()['id']

    # Simulate an HTTP response lost on the client and a retry with the same
    # operation key. The retry must not create a second listing or push event.
    replay = owner.post('/api/v1/market/cargos', json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.json() == created.json()
    with get_conn() as c:
        row = dict(c.execute('SELECT * FROM cargos WHERE id=?', (cargo_id,)).fetchone())
        assert c.execute('SELECT count(*) FROM cargos WHERE owner_id=?', (uid,)).fetchone()[0] == 1
    assert row['status'] == 'active'
    assert row['published_at'] is not None
    assert row['owner_id'] == uid

    feed = driver.get('/api/v1/market/cargos?from_city=Алматы&to_city=Астана&limit=200')
    assert feed.status_code == 200, feed.text
    assert cargo_id in {item['id'] for item in feed.json()['cargos']}
    detail = driver.get('/api/v1/market/cargos/' + cargo_id)
    assert detail.status_code == 200, detail.text
    assert detail.json()['id'] == cargo_id
    assert detail.json()['cargo_desc'] == payload['cargo_desc']


def test_driver_trip_creation_is_visible_to_shipper_in_public_feed():
    """The symmetric driver publication path must reach the public feed."""
    driver, uid = _client('driver')
    shipper, _ = _client('client')
    payload = {
        'from_city': 'Алматы',
        'to_city': 'Астана',
        'truck_type': 'tent',
        'capacity_tons': 20,
        'available_m3': 80,
        'price': 300,
        'currency': 'USD',
        'departure': '2026-10-25',
        'client_id': 'device-feed-chain-trip-1',
    }
    created = driver.post('/api/v1/market/trips', json=payload)
    assert created.status_code == 200, created.text
    trip_id = created.json()['id']
    replay = driver.post('/api/v1/market/trips', json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.json() == created.json()
    with get_conn() as c:
        row = dict(c.execute('SELECT * FROM trips WHERE id=?', (trip_id,)).fetchone())
        assert c.execute('SELECT count(*) FROM trips WHERE driver_id=?', (uid,)).fetchone()[0] == 1
    assert row['status'] == 'active'
    assert row['published_at'] is not None

    feed = shipper.get('/api/v1/market/trips?from_city=Алматы&to_city=Астана&limit=200')
    assert feed.status_code == 200, feed.text
    assert trip_id in {item['id'] for item in feed.json()['trips']}
    detail = shipper.get('/api/v1/market/trips/' + trip_id)
    assert detail.status_code == 200, detail.text
    assert detail.json()['id'] == trip_id


def test_driver_control_cargo_rejected_without_writes():
    client, uid = _client('driver')
    result = client.post('/api/v1/market/cargos', json=_body())
    assert result.status_code == 403
    detail = result.json()['detail']
    assert detail['error'] == 'ROLE_NOT_ALLOWED'
    assert detail['your_role'] == 'driver'
    assert detail['allowed_roles'] == ['client']
    with get_conn() as c:
        assert c.execute('SELECT count(*) FROM cargos WHERE owner_id=?', (uid,)).fetchone()[0] == 0


def test_expired_bearer_control_cargo_rejected():
    client, uid = _client('client')
    client.headers['Authorization'] = 'Bearer expired-test-session'
    assert client.post('/api/v1/market/cargos', json=_body()).status_code == 401
    with get_conn() as c:
        assert c.execute('SELECT count(*) FROM cargos WHERE owner_id=?', (uid,)).fetchone()[0] == 0
