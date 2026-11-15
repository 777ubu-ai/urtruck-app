"""Чтение одного предложения не читает другие предложения объявления."""
import pytest
from tests.test_scheduled_notifications_integrated import env
from api import notifications

@pytest.mark.parametrize('kind', ['cargos','trips'])
def test_open_bid_marks_only_its_event(env,kind):
    for bid in ('bid-one','bid-two'):
        notifications.create_notification('owner','bid_created','Тест',url=f'/{kind}/shared?bid={bid}',event_key=f'bid:{bid}:created')
        notifications.create_notification('driver','bid_created','Тест',url=f'/{kind}/shared?bid={bid}',event_key=f'bid:{bid}:created')
    assert notifications.unread_badge_snapshot('owner')['badge']==2
    notifications.mark_notifications_read_by_urls('owner',[f'/{kind}/shared'],bid_id='bid-one')
    assert [n['event_key'] for n in notifications.unread_badge_snapshot('owner')['notifications']]==['bid:bid-two:created']
    assert notifications.unread_badge_snapshot('driver')['badge']==2

@pytest.mark.parametrize('kind', ['cargos','trips'])
def test_detail_endpoint_forwards_bid_id(env,monkeypatch,kind):
    from api import marketplace
    from tests.test_scheduled_notifications_integrated import cargo
    from database import db
    if kind=='cargos':
        cargo('shared',age=1)
    else:
        with db.get_conn() as c:
            c.execute("INSERT INTO trips(id,driver_id,from_city,to_city,status) VALUES ('shared','owner','A','B','active')")
    monkeypatch.setattr(marketplace,'_maybe_user',lambda _: {'id':'owner','role':'client'})
    for bid in ('bid-one','bid-two'):
        notifications.create_notification('owner','bid_created','Тест',url=f'/{kind}/shared?bid={bid}',event_key=f'bid:{bid}:created')
    if kind=='cargos': marketplace.get_cargo('shared',authorization='test',bid_id='bid-one')
    else: marketplace.get_trip('shared',authorization='test',bid_id='bid-one')
    assert [n['event_key'] for n in notifications.unread_badge_snapshot('owner')['notifications']]==['bid:bid-two:created']
