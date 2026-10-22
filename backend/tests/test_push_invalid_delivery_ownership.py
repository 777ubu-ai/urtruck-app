"""Запоздалая ошибка доставки не отключает новую регистрацию. Только тестовая БД."""
from uuid import uuid4
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import push
from database import registration_dal as reg
from database.db import get_conn
from services import push_gateway as gateway


def _register(token=None, device=None, owner=None):
    if owner is None:
        guest = reg.create_guest()
        uid = guest['id'] if isinstance(guest, dict) else guest
        owner = uid, reg.create_session(uid)
    app = FastAPI()
    app.include_router(push.push_router, prefix='/push')
    client = TestClient(app)
    token = token or 'fcm-test-' + uuid4().hex
    device = device or 'device-' + uuid4().hex
    result = client.post('/push/register-native', headers={'Authorization': 'Bearer ' + owner[1]},
                         json={'token':token,'provider':'fcm','platform':'android','device_id':device})
    assert result.status_code == 200, result.text
    return owner, token, device, gateway.active_devices(owner[0])[0]


def _status(token):
    with get_conn() as c:
        native = c.execute('SELECT active,user_id FROM push_tokens_native WHERE token=?', (token,)).fetchone()
        device = c.execute('SELECT enabled,user_id,failure_count FROM push_devices WHERE push_token=?', (token,)).fetchone()
    return tuple(native), tuple(device)


def _invalid(owner, snapshot):
    gateway.log_delivery(None, owner[0], snapshot, gateway.ProviderResult('fcm','failed',error_code='invalid_token',retryable=False))


def test_invalid_native_disables_registry_and_legacy_alias_without_delete():
    owner, token, _, snapshot = _register()
    _invalid(owner, snapshot)
    native, device = _status(token)
    assert native == (0, owner[0])
    assert device[0] == 0


def test_stale_invalid_does_not_disable_reassigned_owner():
    owner, token, device, snapshot = _register()
    new_owner, _, _, _ = _register(token, device)
    _invalid(owner, snapshot)
    native, registry = _status(token)
    assert native == (1,new_owner[0])
    assert registry == (1,new_owner[0],0)


def test_stale_invalid_does_not_disable_same_owner_reregistration():
    owner, token, device, snapshot = _register()
    _register(token, device, owner)
    _invalid(owner, snapshot)
    native, registry = _status(token)
    assert native == (1,owner[0])
    assert registry == (1,owner[0],0)


@pytest.mark.parametrize('code,retryable',[('network_error',True),('rate_limited',True),('server_error',True),('invalid_credentials',False),('provider_not_configured',False)])
def test_temporary_or_provider_errors_keep_current_token_active(code,retryable):
    owner, token, _, snapshot = _register()
    gateway.log_delivery(None,owner[0],snapshot,gateway.ProviderResult('fcm','failed',error_code=code,retryable=retryable))
    native, registry = _status(token)
    assert native == (1,owner[0])
    assert registry[0] == 1


def test_retryable_invalid_label_does_not_disable_token():
    owner, token, _, snapshot = _register()
    gateway.log_delivery(None,owner[0],snapshot,gateway.ProviderResult('fcm','failed',error_code='invalid_token',retryable=True))
    assert _status(token)[0] == (1,owner[0])
    assert _status(token)[1][0] == 1


def test_onesignal_transport_updates_metrics_without_invalidating_native_token():
    owner, token, _, snapshot = _register()
    gateway.log_delivery(None,owner[0],snapshot,gateway.ProviderResult('onesignal','sent'))
    with get_conn() as c:
        assert c.execute('SELECT last_success_at FROM push_devices WHERE push_token=?',(token,)).fetchone()[0]
    gateway.log_delivery(None,owner[0],snapshot,gateway.ProviderResult('onesignal','failed',error_code='invalid_token',retryable=False))
    assert _status(token)[0] == (1,owner[0])
    assert _status(token)[1] == (1,owner[0],1)
