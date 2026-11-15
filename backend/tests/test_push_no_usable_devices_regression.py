"""Отсутствие совместимого устройства не является ошибкой провайдера."""
import pytest
from tests.test_scheduled_notifications_integrated import env
from database import db
from services import push_sender

@pytest.mark.parametrize('legacy_expo', [False, True])
def test_inline_no_targets_is_skipped_without_provider_call(env, legacy_expo):
    with db.get_conn() as c:
        c.execute("UPDATE push_devices SET enabled=0 WHERE user_id='owner'")
        if legacy_expo:
            c.execute("INSERT INTO push_devices(user_id,device_id,platform,push_provider,push_token,enabled) VALUES ('owner','old-expo','android','expo','legacy',1)")
    push_sender.send('owner','Тест','Тест',event_id='bid:isolated:created',event_type='bid.created',kind='bid')
    with db.get_conn() as c:
        row=c.execute("SELECT status,last_error FROM push_outbox WHERE event_id='bid:isolated:created' AND recipient_user_id='owner'").fetchone()
    assert (row['status'],row['last_error'])==('skipped_no_devices','no_active_devices')
    assert env==[]
