import json
import pytest
from api import marketplace
from database.db import get_conn
from services import push_gateway
from tests.test_deal_status_actor_fsm import seed_deal, deal_status, DRIVER, SHIPPER


def counts(deal_id):
    key=f'deal:{deal_id}:status:in_progress'
    with get_conn() as c:
        return (
            c.execute('SELECT count(*) FROM push_outbox WHERE event_id=?',(key,)).fetchone()[0],
            c.execute('SELECT count(*) FROM notifications WHERE event_key=?',(key,)).fetchone()[0],
            c.execute("SELECT count(*) FROM deal_events WHERE deal_id=? AND event_type='deal.status_changed'",(deal_id,)).fetchone()[0],
        )


def test_status_survives_provider_failure_with_durable_events_and_no_duplicates(monkeypatch):
    d=seed_deal('accepted',from_country='KZ',to_country='KZ')
    attempts=[]
    def failed(*args,**kwargs):
        attempts.append(1)
        raise RuntimeError('provider offline')
    monkeypatch.setattr(marketplace,'send_to_user',failed)
    assert marketplace.update_deal_status(d,'in_progress',{'id':DRIVER})['ok']
    assert deal_status(d)=='in_progress'
    assert counts(d)==(1,1,1)
    assert marketplace.update_deal_status(d,'in_progress',{'id':DRIVER})['ok']
    assert counts(d)==(1,1,1)
    assert len(attempts)==1
    with get_conn() as c:
        row=c.execute('SELECT recipient_user_id,payload FROM push_outbox WHERE event_id=?',(f'deal:{d}:status:in_progress',)).fetchone()
    assert row['recipient_user_id']==SHIPPER
    assert json.loads(row['payload'])['data']['deal_id']==d


def test_queue_failure_rolls_back_status_tracking_and_event_intent(monkeypatch):
    d=seed_deal('accepted',from_country='KZ',to_country='KZ')
    def failed(*args,**kwargs):raise RuntimeError('injected queue storage failure')
    monkeypatch.setattr(push_gateway,'enqueue_event',failed)
    with pytest.raises(RuntimeError):marketplace.update_deal_status(d,'in_progress',{'id':DRIVER})
    assert deal_status(d)=='accepted'
    assert counts(d)==(0,0,0)
    with get_conn() as c:
        assert c.execute('SELECT count(*) FROM deal_tracking WHERE deal_id=?',(d,)).fetchone()[0]==0
