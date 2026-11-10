"""Права и совместимость старых клиентов в единой ленте."""
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


def test_large_combined_feed_counts_and_filtered_pages(monkeypatch, tmp_path):
    from datetime import datetime, timezone
    global _actor
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED', 'true')
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path / 'external.sqlite3'))
    monkeypatch.setenv('EXTERNAL_CARRIER_DIRECTORY_DB', str(tmp_path / 'catalog.sqlite3'))
    dal.init_schema()
    now = datetime.now(timezone.utc).isoformat()
    for i, origin in enumerate(('Алматы', 'Алматы', 'Астана')):
        dal.import_records([{'source_id': 'synthetic', 'source_message_id': str(i), 'segment_id': '0',
            'kind': 'vehicle', 'source_published_at': now, 'original_text': 'машина +7 777 000 00 00', 'contacts': ['+7 777 000 00 00'], 'origin': origin,
            'destination': 'Ташкент', 'classification_status': 'approved', 'status': 'active'}])
    publish_contacts([{'id': f'carrier_{i:020x}', 'name': 'Synthetic', 'record_type': 'carrier',
        'phones': ['+77000000001'], 'emails': [], 'availability': 'unknown',
        'publication_status': 'ready_for_directory_import', 'provenance': []} for i in range(1251)],
        tmp_path / 'catalog.sqlite3')
    _actor = {'id': 'synthetic-client', 'role': 'client'}
    first = client.get('/api/v1/external-freight', params={'include_carriers': 'true', 'include_counts': 'true', 'limit': 50}).json()
    assert first['counts'] == {'total': 1254, 'offers': 3, 'carriers': 1251}
    assert len(first['items']) == 50
    items = list(first['items'])
    cursor = first['next_cursor']
    while cursor:
        page = client.get('/api/v1/external-freight', params={'include_carriers': 'true', 'limit': 50, 'cursor': cursor}).json()
        items.extend(page['items'])
        cursor = page['next_cursor']
    ids = [item['id'] for item in items]
    assert len(ids) == len(set(ids)) == first['counts']['total']
    assert sum(item.get('kind') == 'carrier_contact' for item in items) == 1251
    filtered = client.get('/api/v1/external-freight', params={'include_carriers': 'true', 'include_counts': 'true', 'origin': 'Алматы', 'limit': 50}).json()
    assert filtered['counts'] == {'total': 2, 'offers': 2, 'carriers': 0}
    assert len(filtered['items']) == 2
    for filters, expected in [
        ({'destination': 'Ташкент'}, 3), ({'body_query': 'машина'}, 3),
        ({'origin': 'Несуществующий'}, 0), ({'saved_only': 'true'}, 0),
        ({'sort': 'price_asc'}, 3), ({'published_from': '2000-01-01T00:00:00Z'}, 3),
        ({'published_to': '2000-01-01T00:00:00Z'}, 0),
    ]:
        page = client.get('/api/v1/external-freight', params={'include_carriers': 'true', 'include_counts': 'true', 'limit': 50, **filters}).json()
        assert page['counts'] == {'total': expected, 'offers': expected, 'carriers': 0}
        assert len(page['items']) == expected
    assert 'counts' not in client.get('/api/v1/external-freight', params={'limit': 1}).json()
    _actor = None
