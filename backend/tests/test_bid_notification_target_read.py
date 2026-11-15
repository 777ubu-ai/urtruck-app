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

@pytest.mark.parametrize('kind', ['cargos', 'trips'])
def test_bidder_can_read_hidden_active_listing_without_reading_other_bid(env, monkeypatch, kind):
    from fastapi import HTTPException
    from api import marketplace
    from tests.test_scheduled_notifications_integrated import cargo
    from database import db

    if kind == 'cargos':
        cargo('hidden-shared', age=1)
    else:
        with db.get_conn() as c:
            c.execute("INSERT INTO trips(id,driver_id,from_city,to_city,status) VALUES ('hidden-shared','owner','A','B','active')")
    field = 'cargo_id' if kind == 'cargos' else 'trip_id'
    with db.get_conn() as c:
        for bid in ('hidden-one', 'hidden-two'):
            c.execute(f"INSERT INTO bids(id,{field},bidder_id,amount,status) VALUES (?,?,'driver',100,'rejected')", (bid, 'hidden-shared'))
    for bid in ('hidden-one', 'hidden-two'):
        notifications.create_notification('driver', 'bid_rejected', 'Тест', url=f'/{kind}/hidden-shared', event_key=f'bid:{bid}:rejected')
        notifications.create_notification('owner', 'bid_created', 'Тест', url=f'/{kind}/hidden-shared', event_key=f'bid:{bid}:created')
    monkeypatch.setattr(marketplace, '_public_cargo_ok' if kind == 'cargos' else '_public_trip_ok', lambda row: False)
    monkeypatch.setattr(marketplace, '_maybe_user', lambda token: {'id': token} if token else None)
    detail = marketplace.get_cargo if kind == 'cargos' else marketplace.get_trip
    with pytest.raises(HTTPException) as denied:
        detail('hidden-shared', authorization='outsider', bid_id='hidden-one')
    assert denied.value.status_code == 404
    detail('hidden-shared', authorization='driver', bid_id='hidden-one')
    assert [n['event_key'] for n in notifications.unread_badge_snapshot('driver')['notifications']] == ['bid:hidden-two:rejected']
    assert notifications.unread_badge_snapshot('owner')['badge'] == 2
