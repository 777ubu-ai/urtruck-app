"""Права и совместимость старых клиентов в единой ленте."""
from database import external_freight_dal as dal
from services.carrier_directory import publish_contacts
from . import test_external_freight_feed as feed


def test_contacts_share_counter_and_feed_only_for_capable_client(monkeypatch, tmp_path):
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED', 'true')
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path / 'external.sqlite3'))
    monkeypatch.setenv('EXTERNAL_CARRIER_DIRECTORY_DB', str(tmp_path / 'catalog.sqlite3'))
    dal.init_schema()
    publish_contacts([{'id': 'carrier_00000000000000000001', 'name': 'Synthetic Carrier', 'record_type': 'carrier',
        'phones': ['+77000000001'], 'emails': [], 'city': 'Алматы', 'availability': 'unknown',
        'publication_status': 'ready_for_directory_import', 'provenance': [], 'iin': 'private'}], tmp_path / 'catalog.sqlite3')
    feed._actor = None
    assert feed.client.get('/api/v1/external-freight/directory').status_code == 401
    feed._actor = {'id': 'driver', 'role': 'driver'}
    assert feed.client.get('/api/v1/external-freight/directory').status_code == 403
    assert feed.client.get('/api/v1/external-freight/count?include_carriers=true').json()['count'] == 0
    feed._actor = {'id': 'client', 'role': 'client'}
    assert feed.client.get('/api/v1/external-freight/count').json()['count'] == 0
    assert feed.client.get('/api/v1/external-freight/count?include_carriers=true').json()['count'] == 1
    assert feed.client.get('/api/v1/external-freight').json()['items'] == []
    response = feed.client.get('/api/v1/external-freight?include_carriers=true')
    assert response.status_code == 200
    item = response.json()['items'][0]
    assert item['kind'] == 'carrier_contact' and item['availability'] == 'unknown'
    assert item['expires_at'] is None and item['source_published_at'] is None
    assert 'iin' not in item
    assert feed.client.get('/api/v1/external-freight?include_carriers=true&saved_only=true').json()['items'] == []
    assert feed.client.get('/api/v1/external-freight?include_carriers=true&origin=Алматы').json()['items'] == []
    assert feed.client.get('/api/v1/external-freight?include_carriers=true&cursor=carrier:1').json()['items'] == []
    assert feed.client.get('/api/v1/external-freight?cursor=carrier:1').status_code == 422
    monkeypatch.setenv('EXTERNAL_FREIGHT_FEED_ENABLED', 'false')
    assert feed.client.get('/api/v1/external-freight/directory').status_code == 404
    feed._actor = None
