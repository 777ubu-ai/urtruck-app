"""Непрочитанная архивная карточка не исчезает за пределом списка."""
from datetime import datetime, timedelta
import pytest
from tests.test_scheduled_notifications_integrated import env, cargo
from api import marketplace, notifications
from database import db

@pytest.mark.parametrize('event_key', [True, False])
def test_old_unread_bid_is_returned_to_both_participants(env, event_key):
    cargo('paged-cargo',age=1)
    now=datetime(2026,11,15,12)
    with db.get_conn() as c:
        for i in range(51):
            ts=(now-timedelta(minutes=i)).isoformat()
            c.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",(f'page-bid-{i:02}','paged-cargo','driver',100,'expired',ts,ts))
    for uid in ('owner','driver'):
        notifications.create_notification(uid,'bid_created','Тест',url='/cargos/paged-cargo?bid=page-bid-50',event_key='bid:page-bid-50:created' if event_key else None)
    for uid, field in [('owner','incoming_bids'),('driver','my_bids')]:
        result=marketplace.my_dashboard({'id':uid})
        ids=[r['id'] for r in result[field]]
        assert 'page-bid-50' in ids
        assert len(ids)==len(set(ids))
    notifications.mark_notifications_read_by_urls('owner', ['/cargos/paged-cargo'])
    assert 'page-bid-50' in [r['id'] for r in marketplace.my_dashboard({'id':'owner'})['incoming_bids']]
    assert 'page-bid-50' in [r['id'] for r in marketplace.my_dashboard({'id':'driver'})['my_bids']]
    notifications.create_notification('outsider','bid_created','Тест',url='/cargos/paged-cargo?bid=page-bid-50',event_key='bid:page-bid-50:created')
    outsider=marketplace.my_dashboard({'id':'outsider'})
    assert not outsider['my_bids'] and not outsider['incoming_bids']

def test_old_completed_deal_remains_visible_after_read_for_both(env):
    now=datetime(2026,11,15,12)
    with db.get_conn() as c:
        for i in range(51):
            ts=(now-timedelta(minutes=i)).isoformat()
            c.execute("INSERT INTO deals(id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",(f'page-deal-{i:02}',f'bid-{i:02}','owner','driver','A','B',100,'completed',ts,ts))
    for uid in ('owner','driver'):
        notifications.create_notification(uid,'deal_status','Тест',url='/deals/page-deal-50',event_key='deal:page-deal-50:status:completed')
    for uid in ('owner','driver'):
        assert 'page-deal-50' in [row['id'] for row in marketplace.my_dashboard({'id':uid})['my_deals']]
        assert notifications.unread_badge_snapshot(uid)['badge']==1
    notifications.mark_notifications_read_by_urls('owner',['/deals/page-deal-50'])
    assert notifications.unread_badge_snapshot('owner')['badge']==0
    assert notifications.unread_badge_snapshot('driver')['badge']==1
    assert 'page-deal-50' in [row['id'] for row in marketplace.my_dashboard({'id':'owner'})['my_deals']]
    assert not marketplace.my_dashboard({'id':'outsider'})['my_deals']
