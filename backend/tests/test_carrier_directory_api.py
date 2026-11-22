"""Права и совместимость старых клиентов в единой ленте."""
from datetime import datetime, timezone

from database import external_freight_dal as dal
from services.carrier_directory import publish_contacts
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from api import external_freight
from api.verification_gate import require_admin

_actor = None


def _actor_dep():
    actor = _actor
    if not actor:
        raise HTTPException(status_code=401, detail="auth_required")
    return actor


def _admin_dep():
    actor = _actor
    if not actor or actor.get("role") not in {"admin", "support"}:
        raise HTTPException(status_code=403, detail="admin_required")
    return actor


app = FastAPI()
app.include_router(external_freight.router, prefix="/api/v1/external-freight")
for route in external_freight.router.routes:
    dependant = getattr(route, "dependant", None)
    for dependency in getattr(dependant, "dependencies", []) if dependant else []:
        if getattr(dependency.call, "__name__", "") == "dependency":
            app.dependency_overrides[dependency.call] = _actor_dep
        elif dependency.call is require_admin:
            app.dependency_overrides[dependency.call] = _admin_dep
client = TestClient(app)


def test_contacts_share_counter_and_feed_only_for_capable_client(monkeypatch, tmp_path):
    global _actor
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED', 'true')
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path / 'external.sqlite3'))
    monkeypatch.setenv('EXTERNAL_CARRIER_DIRECTORY_DB', str(tmp_path / 'catalog.sqlite3'))
    dal.init_schema()
    publish_contacts([{'id': 'carrier_00000000000000000001', 'name': 'Synthetic Carrier', 'record_type': 'carrier',
        'phones': ['+77000000001'], 'emails': [], 'city': 'Алматы', 'availability': 'unknown',
        'publication_status': 'ready_for_directory_import', 'provenance': [], 'iin': 'private'}], tmp_path / 'catalog.sqlite3')
    _actor = None

    assert client.get('/api/v1/external-freight/directory').status_code == 401
    _actor = {'id': 'driver', 'role': 'driver'}
    assert client.get('/api/v1/external-freight/directory').status_code == 403
    assert client.get('/api/v1/external-freight/count?include_carriers=true').json()['count'] == 0
    _actor = {'id': 'client', 'role': 'client'}
    assert client.get('/api/v1/external-freight/count').json()['count'] == 0
    assert client.get('/api/v1/external-freight/count?include_carriers=true').json()['count'] == 1
    assert client.get('/api/v1/external-freight').json()['items'] == []
    response = client.get('/api/v1/external-freight?include_carriers=true')
    assert response.status_code == 200
    item = response.json()['items'][0]
    assert item['kind'] == 'carrier_contact' and item['availability'] == 'unknown'
    assert item['expires_at'] is None and item['source_published_at'] is None
    assert 'iin' not in item
    assert client.get('/api/v1/external-freight?include_carriers=true&saved_only=true').json()['items'] == []
    assert client.get('/api/v1/external-freight?include_carriers=true&origin=Алматы').json()['items'] == []
    assert client.get('/api/v1/external-freight?include_carriers=true&cursor=carrier:1').json()['items'] == []
    assert client.get('/api/v1/external-freight?cursor=carrier:1').status_code == 422
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED', 'false')
    assert client.get('/api/v1/external-freight/directory').status_code == 404
    _actor = None


def test_legacy_first_page_reuses_currency_snapshot_without_caching_cards(monkeypatch, tmp_path):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path / 'external.sqlite3'))
    dal.init_schema()
    real_utc = dal._utc
    now = datetime(2026, 11, 22, 12, 0, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(dal, '_utc', lambda value=None: now if value is None else real_utc(value))
    with dal.get_conn() as conn:
        conn.execute(
            """INSERT INTO external_freight_items (
                id, kind, source_id, source_message_id, source_published_at, ingested_at, updated_at,
                expires_at, original_text, source_revision, amount, currency, price_state, status
            ) VALUES ('a', 'cargo', 'test', 'a', '2020-01-01', '2020-01-01', '2020-01-01',
                '2999-01-01', 'Test', '1', 100, 'USD', 'known', 'active')"""
        )
    first = dal.list_items(kind='cargo')
    assert first['price_currencies'] == ['USD']
    assert first['price_sort_available']
    with dal.get_conn() as conn:
        conn.execute("UPDATE external_freight_items SET currency='CNY' WHERE id='a'")
    same_bucket = dal.list_items(kind='cargo')
    assert same_bucket['items'][0]['currency'] == 'CNY'
    assert same_bucket['price_currencies'] == ['USD']
    assert dal.list_items(kind='cargo', sort='price_asc')['price_currencies'] == ['CNY']
    now = now.replace(second=16)
    assert dal.list_items(kind='cargo')['price_currencies'] == ['CNY']
