"""Actual SQL expiry/outbox and API review localization, no provider network."""
import json
from datetime import datetime

import pytest
from api import reviews
from services import bid_expiry, push_gateway, push_i18n
from tests.test_bid_expiry import _db
from tests.test_reviews_atomic_duplicate import review_client


def expiry_db():
    c = _db()
    c.executescript('''
        ALTER TABLE bids ADD COLUMN bidder_id TEXT;
        ALTER TABLE cargos ADD COLUMN owner_id TEXT;
        ALTER TABLE trips ADD COLUMN driver_id TEXT;
        CREATE TABLE notifications(user_id TEXT,type TEXT,title TEXT,body TEXT,icon TEXT,url TEXT,event_key TEXT);
        CREATE UNIQUE INDEX event_dedup ON notifications(user_id,event_key) WHERE event_key IS NOT NULL;
        CREATE TABLE push_outbox(event_id TEXT,event_type TEXT,recipient_user_id TEXT,payload TEXT,priority TEXT,expires_at TEXT,collapse_key TEXT,UNIQUE(event_id,recipient_user_id));
        CREATE TABLE push_devices(id INTEGER, user_id TEXT, locale TEXT,enabled INTEGER,last_seen_at TEXT);
        INSERT INTO push_devices VALUES(1,'owner','EN',1,'2026-01-01');
        INSERT INTO push_devices VALUES(2,'bidder','ZH',1,'2026-01-01');
    ''')
    c.execute("INSERT INTO cargos(id,status,pickup_date,bids_count,owner_id) VALUES('cargo','active','2099-01-01',1,'owner')")
    c.execute("INSERT INTO bids(id,cargo_id,amount,status,created_at,updated_at,bidder_id) VALUES('bid','cargo',1000,'pending','2026-01-01','2026-01-01','bidder')")
    c.commit()
    return c


def test_expiry_atomic_events_for_both_participants_and_retry():
    c = expiry_db()
    with c:
        result = bid_expiry.expire_stale_marketplace(now=datetime(2026,1,10),conn=c)
    assert result['expired_bids'] == ['bid']
    rows = c.execute('SELECT * FROM notifications ORDER BY user_id').fetchall()
    assert len(rows) == 2
    assert 'Offer expired' in next(r['title'] for r in rows if r['user_id']=='owner')
    assert '报价已过期' in next(r['title'] for r in rows if r['user_id']=='bidder')
    queued = c.execute('SELECT * FROM push_outbox').fetchall()
    assert len(queued) == 2
    for row in queued:
        payload = json.loads(row['payload'])
        assert payload['data']['i18n_event'] == 'bid_expired'
        assert payload['data']['url'] == '/cargos/cargo?bid=bid'
    with c:
        assert bid_expiry.expire_stale_marketplace(now=datetime(2026,1,10),conn=c)['expired_bids'] == []
    assert c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0] == 2
    assert c.execute('SELECT COUNT(*) FROM push_outbox').fetchone()[0] == 2


def test_queue_failure_rolls_back_expiry_and_bell(monkeypatch):
    c = expiry_db()
    def failure(*a,**k): raise RuntimeError('outbox unavailable')
    monkeypatch.setattr(push_gateway, 'enqueue_event', failure)
    with pytest.raises(RuntimeError), c:
        bid_expiry.expire_stale_marketplace(now=datetime(2026,1,10),conn=c)
    assert c.execute("SELECT status FROM bids WHERE id='bid'").fetchone()[0] == 'pending'
    assert c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0] == 0


def test_bootstrap_waits_for_queue_instead_of_losing_the_event():
    c = expiry_db()
    c.execute('DROP TABLE push_outbox')
    assert bid_expiry.expire_stale_marketplace(now=datetime(2026,1,10),conn=c)['expired_bids'] == []
    assert c.execute("SELECT status FROM bids WHERE id='bid'").fetchone()[0] == 'pending'


@pytest.mark.parametrize('locale', ['RU','KK','EN','ZH'])
def test_new_secondary_templates_are_localized(locale):
    for event in ('bid_not_selected','bid_counter_declined','bid_expired','review_received','review_received_comment'):
        title,body = push_i18n.push_text(event,locale,amount='1000',rating=4,comment='原文 Привет')
        assert title and body and '{' not in title + body
        if event=='review_received_comment': assert body=='原文 Привет'
        if locale=='EN': assert not any('А'<=ch<='я' for ch in title)


def test_review_bell_before_push_and_original_comment_preserved(review_client, monkeypatch):
    client,_ = review_client
    import api.notifications, api.push
    calls=[]
    monkeypatch.setattr(push_gateway,'get_recipient_locale',lambda _: 'EN')
    monkeypatch.setattr(api.notifications,'create_notification',lambda *a,**k: calls.append(('bell',a,k)))
    monkeypatch.setattr(api.push,'send_to_user',lambda *a,**k: calls.append(('push',a,k)))
    r=client.post('/reviews',json={'trip_id':'deal-1','target_id':'target','target_role':'driver','rating':4,'text':'原文 Привет'})
    assert r.status_code == 200
    assert [x[0] for x in calls] == ['bell','push']
    assert calls[0][1][2]=='⭐ New review'
    assert calls[0][1][3]=='原文 Привет'
    assert calls[1][2]['data']['i18n_params']['comment']=='原文 Привет'
    assert calls[0][2]['event_key']==calls[1][2]['data']['event_key']
