"""Полные producer/sender/gateway с SQLite; заменена только внешняя сеть."""
import concurrent.futures
import json
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config
from api import chat, marketplace, notifications, push as push_api, saved_searches
from database import db, registration_dal
from services import notification_policy as policy, scheduled_notifications as jobs, push_gateway as gateway, push_sender as sender


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'DB_PATH', str(tmp_path/'push.db'))
    monkeypatch.setenv('PUSH_OUTBOX_CUTOFF_ID','0')
    db.init_db(); registration_dal.init_registration_schema(); marketplace._init(); chat._init()
    push_api._init_schema(); notifications._init(); saved_searches._init()
    calls=[]
    def send(provider, token, title, body, data, badge=None):
        calls.append({'provider':provider.name,'event_id':data.get('event_id'),'url':data.get('url'),'token':token})
        return gateway.ProviderResult(provider.name,'sent',message_id='synthetic-accepted')
    monkeypatch.setattr(gateway.FCMProvider,'send',send)
    monkeypatch.setattr(gateway.APNsProvider,'send',send)
    with db.get_conn() as c:
        for uid,role in [('owner','client'),('driver','driver')]:
            c.execute("INSERT INTO drivers_registration(id,phone,full_name,role,status,updated_at) VALUES (?,?,?,?,?,?)",(uid,uid,'Тест',role,'approved',(datetime.utcnow()-timedelta(days=4)).isoformat()))
            c.execute("INSERT INTO notification_preferences(user_id,no_bids,inactivity,listing_lifecycle) VALUES (?,1,1,1)",(uid,))
            c.execute("INSERT INTO push_devices(user_id,device_id,platform,push_provider,push_token,locale,enabled) VALUES (?,?,?,?,?,?,1)",(uid,'device-'+uid,'android','fcm','fcm-'+uid+'x'*100,'EN'))
    return calls


def cargo(eid='cargo', *, age=19, status='active', cached=0, published=None, timestamp_format='iso'):
    created=datetime.utcnow()-timedelta(hours=age)
    text=created.isoformat() if timestamp_format=='iso' else created.strftime('%Y-%m-%d %H:%M:%S')
    with db.get_conn() as c:
        c.execute("INSERT INTO cargos(id,owner_id,status,from_city,to_city,pickup_date,bids_count,created_at,published_at,cargo_desc,weight_tons) VALUES (?,?,?,?,?,?,?,?,?,?,?)",(eid,'owner',status,'Город A','Город B','2000-01-01',cached,text,published,'Тест',1))
    return created


def count(table, where='1=1'):
    with db.get_conn() as c:return c.execute('SELECT COUNT(*) FROM '+table+' WHERE '+where).fetchone()[0]


def outbox_row(event_id, user_id):
    with db.get_conn() as c:
        return c.execute("SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (event_id, user_id)).fetchone()


def test_repeat_and_after_21_hours_are_one_event_and_delivery(env):
    cargo()
    assert jobs.no_bids_job()==1
    assert jobs.no_bids_job()==0
    assert jobs.no_bids_job(now=datetime.utcnow()+timedelta(hours=21))==0
    assert count('notifications',"type='no_bids'")==1
    assert count('push_outbox')==1
    assert gateway.process_pending_once()['sent']==1
    assert gateway.process_pending_once()['picked']==0
    assert len(env)==1 and env[0]['event_id']=='no_bids:cargo:cargo' and env[0]['url']=='/cargos/cargo'


def test_parallel_scheduler_claims_one_logical_event(env):
    cargo()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        result=list(pool.map(lambda _:jobs.no_bids_job(),range(2)))
    assert sum(result)==1
    assert count('notifications',"type='no_bids'")==count('push_outbox')==1
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:gateway.process_pending_once(),range(2)))
    assert len(env)==1


@pytest.mark.parametrize('shape',['iso','sqlite'])
def test_minute_old_publication_is_not_18_hours_old(env,shape):
    cargo(age=1/60,timestamp_format=shape)
    assert jobs.no_bids_job()==0 and count('push_outbox')==0


@pytest.mark.parametrize('age',[0,21,72])
@pytest.mark.parametrize('shape',['iso','sqlite'])
def test_legacy_attempts_are_preserved_without_replay(env,age,shape):
    cargo();stamp=datetime.utcnow()-timedelta(hours=age)
    with db.get_conn() as c:c.execute("INSERT INTO push_log(user_id,kind,data_json,created_at,native_sent) VALUES ('owner','no_bids',?,?,1)",(json.dumps({'cargo_id':'cargo'}),stamp.isoformat() if shape=='iso' else stamp.strftime('%Y-%m-%d %H:%M:%S')))
    assert jobs.no_bids_job()==0
    assert count('push_log')==1 and count('push_outbox')==0
    assert count('notification_event_claims',"state='legacy_seen'")==1


def test_legacy_inbox_is_not_replayed(env):
    cargo();notifications.create_notification('owner','no_bids','Тест','Тест',event_key='no_bids:cargo:cargo')
    assert jobs.no_bids_job()==0 and count('push_outbox')==0


def test_actual_bid_beats_cached_zero_and_late_candidate(env):
    cargo()
    with db.get_conn() as c:c.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('bid','cargo','driver',100,'pending')")
    assert jobs.queue_no_bids('cargo','cargo') is False and count('push_outbox')==0


@pytest.mark.parametrize('mutation',["UPDATE cargos SET status='closed'", "INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('late','cargo','driver',100,'pending')"])
def test_late_close_or_bid_suppresses_queued_delivery(env,mutation):
    cargo();assert jobs.no_bids_job()==1
    with db.get_conn() as c:c.execute(mutation)
    assert gateway.process_pending_once()['skipped']==1
    assert env==[] and count('push_outbox',"status='skipped_policy'")==1


def test_default_off_then_opt_out_before_worker(env):
    cargo()
    with db.get_conn() as c:c.execute("DELETE FROM notification_preferences WHERE user_id='owner'")
    assert jobs.no_bids_job()==0
    with db.get_conn() as c:c.execute("INSERT INTO notification_preferences(user_id,no_bids) VALUES ('owner',1)")
    assert jobs.no_bids_job()==1
    with db.get_conn() as c:c.execute("UPDATE notification_preferences SET no_bids=0 WHERE user_id='owner'")
    assert gateway.process_pending_once()['skipped']==1 and env==[]


def test_notify_false_for_immediate_digest_and_delayed_delivery(env):
    cargo(age=1)
    with db.get_conn() as c:c.execute("INSERT INTO saved_searches(user_id,from_city,to_city,notify) VALUES ('driver','Город A','Город B',0)")
    assert saved_searches.notify_matching_users('Город A','Город B',cargo_id='cargo')==0
    assert jobs.reminders_job()['route_match']==0
    with db.get_conn() as c:c.execute("UPDATE saved_searches SET notify=1")
    assert saved_searches.notify_matching_users('Город A','Город B',cargo_id='cargo')==1
    with db.get_conn() as c:c.execute("UPDATE saved_searches SET notify=0")
    gateway.process_pending_once()
    assert not any(x['event_id']=='saved_search:cargo' for x in env)


def test_two_entities_and_two_devices_keep_independent_ids(env):
    cargo();cargo('cargo-2')
    with db.get_conn() as c:c.execute("INSERT INTO push_devices(user_id,device_id,platform,push_provider,push_token,locale,enabled) VALUES ('owner','ios-owner','ios','apns',?,'ZH',1)",('a'*64,))
    assert jobs.no_bids_job()==2
    assert gateway.process_pending_once()['sent']==2
    assert len(env)==4 and len({x['event_id'] for x in env})==2


def test_sender_and_worker_share_claim_under_concurrent_send(env,monkeypatch):
    import threading
    barrier=threading.Event();started=threading.Event();original=gateway.FCMProvider.send
    def slow(*a,**k):started.set();assert barrier.wait(5);return original(*a,**k)
    monkeypatch.setattr(gateway.FCMProvider,'send',slow)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        future=pool.submit(sender.send,'owner','Операция','Тест',data={'event_key':'bid:test:created','event':'bid.created'},kind='bid')
        assert started.wait(5)
        assert gateway.process_pending_once()['picked']==0
        assert sender.send('owner','Операция','Тест',data={'event_key':'bid:test:created'},kind='bid')['duplicate'] is True
        barrier.set();assert future.result()['sent']==1
    assert len(env)==1


def test_operational_push_survives_all_optional_preferences_off(env):
    with db.get_conn() as c:c.execute("UPDATE notification_preferences SET no_bids=0,inactivity=0,listing_lifecycle=0")
    for event in ['chat.message','bid.accepted','deal.status.delivered']:
        sender.send('owner','Операция','Тест',kind='chat' if event.startswith('chat') else 'bid',data={'event_key':event+':synthetic','event':event})
    assert len(env)==3


def test_deal_transition_uses_catalog_priority_and_ttl(env):
    gateway.enqueue_event('deal:test:delivered','deal_status','owner',{'data':{'event':'deal.status.delivered'}})
    with db.get_conn() as c:row=c.execute("SELECT * FROM push_outbox WHERE event_id='deal:test:delivered'").fetchone()
    assert row['event_type']=='deal.status.delivered' and row['priority']=='critical'
    assert (datetime.fromisoformat(row['expires_at'])-datetime.utcnow()).total_seconds()>47*3600


def test_lifecycle_ignores_old_route_and_never_claims_active_listing_removed(env):
    cargo(age=48);assert jobs.lifecycle_job()==0
    with db.get_conn() as c:c.execute("UPDATE cargos SET created_at=?",((datetime.utcnow()-timedelta(days=29,hours=1)).isoformat(),))
    assert jobs.lifecycle_job()==0
    assert count('notifications',"type='listing_lifecycle'")==0


def test_republication_and_edit_do_not_rearm_no_bids(env):
    cargo();assert jobs.no_bids_job()==1
    with db.get_conn() as c:c.execute("UPDATE cargos SET published_at=?,cargo_desc='Изменение'",((datetime.utcnow()-timedelta(hours=20)).isoformat(),))
    assert jobs.no_bids_job()==0 and count('push_outbox')==1


def test_preferences_are_authenticated_and_account_scoped(env):
    app=FastAPI();app.include_router(push_api.push_router);client=TestClient(app)
    assert client.get('/preferences').status_code==401
    app.dependency_overrides[push_api.get_user]=lambda:{'id':'driver'}
    assert client.patch('/preferences',json={'no_bids':False}).json()['preferences']['no_bids'] is False
    assert policy.preferences('owner')['no_bids'] is True


def force_due():
    with db.get_conn() as c:c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE status='retry'")


def test_partial_two_device_timeout_retries_only_unconfirmed_device(env,monkeypatch):
    with db.get_conn() as c:c.execute("INSERT INTO push_devices(user_id,device_id,platform,push_provider,push_token,locale,enabled) VALUES ('owner','other-phone','android','fcm',?,'RU',1)",('fcm-second-'+'z'*100,))
    original=gateway.FCMProvider.send;attempts={}
    def flaky(provider,token,*a,**kw):
        attempts[token]=attempts.get(token,0)+1
        if token.startswith('fcm-second') and attempts[token]==1:
            return gateway.ProviderResult('fcm','failed',error_code='network_error',retryable=True)
        return original(provider,token,*a,**kw)
    monkeypatch.setattr(gateway.FCMProvider,'send',flaky)
    sender.send('owner','Операция','Тест',kind='bid',data={'event_key':'partial-event'})
    assert count('push_outbox',"status='retry'")==1
    force_due();assert gateway.process_pending_once()['sent']==1
    assert sorted(attempts.values())==[1,2]
    assert count('push_delivery_log',"status='sent'")==2 and count('push_outbox')==1


def test_timeout_retry_keeps_id_and_has_bounded_attempts(env,monkeypatch):
    attempts=[]
    def timeout(provider,token,title,body,data,badge=None):
        attempts.append(data['event_id'])
        return gateway.ProviderResult('fcm','failed',error_code='network_error',retryable=True)
    monkeypatch.setattr(gateway.FCMProvider,'send',timeout)
    sender.send('owner','Операция','Тест',kind='bid',data={'event_key':'ambiguous-timeout'})
    for _ in range(8):force_due();gateway.process_pending_once()
    assert len(attempts)==gateway.MAX_OUTBOX_ATTEMPTS
    assert set(attempts)=={'ambiguous-timeout'} and count('push_outbox',"status='dead'")==1
    # Нельзя утверждать exactly-once показ: timeout мог наступить после приёма ОС.


def test_restart_reclaims_expired_worker_lease(env):
    gateway.enqueue_event('crashed-event','bid.created','owner',{'title':'Тест','body':'Тест','data':{}})
    with db.get_conn() as c:
        c.execute("UPDATE push_outbox SET status='processing',claimed_at=datetime(CURRENT_TIMESTAMP,'-6 minutes'),locked_by='old-worker'")
    assert gateway.process_pending_once()['picked']==0
    force_due();assert gateway.process_pending_once()['sent']==1
    assert len(env)==1


def test_web_success_is_not_repeated_when_native_retries(env,monkeypatch):
    import sys,types
    web=[]
    monkeypatch.setattr(sender,'PUSH_MOCK_WEB',False)
    monkeypatch.setitem(sys.modules,'pywebpush',types.SimpleNamespace(webpush=lambda **kw:web.append(json.loads(kw['data']))))
    with db.get_conn() as c:c.execute("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,active) VALUES ('owner','https://example.invalid/test','test','test',1)")
    original=gateway.FCMProvider.send;n=[0]
    def flaky(provider,*a,**kw):
        n[0]+=1
        return gateway.ProviderResult('fcm','failed',error_code='network_error',retryable=True) if n[0]==1 else original(provider,*a,**kw)
    monkeypatch.setattr(gateway.FCMProvider,'send',flaky)
    sender.send('owner','Операция','Тест',kind='bid',data={'event_key':'web-and-native'},url='/cargos/cargo')
    force_due();assert gateway.process_pending_once()['sent']==1
    assert len(web)==1 and web[0]['url']=='/cargos/cargo' and len(env)==1
    assert count('push_web_delivery_log')==1


def test_web_only_failure_is_retried_by_worker(env,monkeypatch):
    import sys,types
    calls=[]
    monkeypatch.setattr(sender,'PUSH_MOCK_WEB',False)
    def webpush(**kw):
        calls.append(json.loads(kw['data']))
        if len(calls)==1:raise TimeoutError('synthetic')
    monkeypatch.setitem(sys.modules,'pywebpush',types.SimpleNamespace(webpush=webpush))
    with db.get_conn() as c:
        c.execute("UPDATE push_devices SET enabled=0 WHERE user_id='owner'")
        c.execute("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,active) VALUES ('owner','https://example.invalid/web','test','test',1)")
    sender.send('owner','Операция','Тест',data={'event_key':'web-only'})
    force_due();assert gateway.process_pending_once()['sent']==1
    assert len(calls)==2 and {r['data']['event_id'] for r in calls}=={'web-only'} and env==[]


def test_trip_owner_and_existing_bid_follow_same_rule(env):
    with db.get_conn() as c:
        c.execute("INSERT INTO trips(id,driver_id,from_city,to_city,status,created_at) VALUES ('trip','driver','Город A','Город B','active',?)",((datetime.utcnow()-timedelta(hours=20)).strftime('%Y-%m-%d %H:%M:%S'),))
    assert jobs.no_bids_job()==1
    gateway.process_pending_once();assert env[0]['url']=='/trips/trip'
    assert env[0]['event_id']=='no_bids:trip:trip'
    with db.get_conn() as c:c.execute("INSERT INTO bids(id,trip_id,bidder_id,amount,status) VALUES ('trip-bid','trip','owner',100,'pending')")
    assert jobs.no_bids_job()==0


def test_auto_renewed_publication_keeps_no_bids_identity_and_fallback(env,monkeypatch):
    monkeypatch.setattr(db,'_maybe_expire_marketplace',lambda c:None)
    now=datetime.utcnow();cargo(age=25*24,published=(now-timedelta(hours=1)).isoformat())
    assert jobs.no_bids_job(now=now)==0
    with db.get_conn() as c:c.execute("UPDATE cargos SET published_at=?",((now-timedelta(days=30)).isoformat(),))
    assert jobs.no_bids_job(now=now)==1
    fallback=(now-timedelta(hours=19)).isoformat()
    with db.get_conn() as c:
        c.execute("UPDATE cargos SET published_at=NULL,created_at=?",(fallback,))
        assert policy.publication_time(dict(c.execute("SELECT * FROM cargos").fetchone()))==datetime.fromisoformat(fallback)
    assert jobs.no_bids_job(now=now)==0


def test_queue_failure_rolls_back_claim_and_inbox(env,monkeypatch):
    cargo()
    def unavailable(*a,**kw):raise RuntimeError('synthetic-outbox-failure')
    monkeypatch.setattr(gateway,'enqueue_event',unavailable)
    with pytest.raises(RuntimeError):jobs.queue_no_bids('cargo','cargo')
    assert count('notification_event_claims')==count('notifications')==count('push_outbox')==0


def test_event_type_label_is_not_reused_as_business_identity(env):
    for _ in range(2):sender.send('owner','Новая ставка','Тест',kind='bid',data={'event':'bid.created'})
    assert len(env)==2 and len({x['event_id'] for x in env})==2


def test_cold_standalone_worker_initializes_inbox_before_write_transaction(env):
    import os,subprocess,sys
    cargo()
    child={**os.environ,'DB_PATH':config.DB_PATH,'ENV':'test','URTRUCK_ENV':'test'}
    result=subprocess.run([sys.executable,'-c',"from services.scheduled_notifications import no_bids_job; print(no_bids_job())"],env=child,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    assert result.stdout.strip().splitlines()[-1]=='1'
    assert count('push_outbox')==1


def test_invalid_device_does_not_cancel_other_devices_transient_retry(env,monkeypatch):
    with db.get_conn() as c:c.execute("INSERT INTO push_devices(user_id,device_id,platform,push_provider,push_token,locale,enabled) VALUES ('owner','second-ios','ios','apns',?,'EN',1)",('b'*64,))
    attempts={'fcm':0,'apns':0}
    def invalid(self,*a,**kw):
        attempts['fcm']+=1
        return gateway.ProviderResult('fcm','failed',error_code='invalid_token',retryable=False)
    original=gateway.APNsProvider.send
    def transient(self,*a,**kw):
        attempts['apns']+=1
        return gateway.ProviderResult('apns','failed',error_code='network_error',retryable=True) if attempts['apns']==1 else original(self,*a,**kw)
    monkeypatch.setattr(gateway.FCMProvider,'send',invalid);monkeypatch.setattr(gateway.APNsProvider,'send',transient)
    sender.send('owner','Операция','Тест',data={'event_key':'mixed-permanent-transient'})
    assert count('push_outbox',"status='retry'")==1
    force_due();assert gateway.process_pending_once()['sent']==1
    assert attempts=={'fcm':1,'apns':2}


def test_web_attempt_is_bounded_below_five_minute_claim_lease(env,monkeypatch):
    import sys,types
    calls=[]
    monkeypatch.setattr(sender,'PUSH_MOCK_WEB',False)
    monkeypatch.setattr(sender,'_web_subscriptions',lambda _uid:[{'id':str(i),'endpoint':'https://example.invalid','p256dh':'x','auth':'y'} for i in range(25)])
    monkeypatch.setitem(sys.modules,'pywebpush',types.SimpleNamespace(webpush=lambda **kw:calls.append(kw)))
    assert sender._send_web('owner','Title','Body',{'event_id':'bounded-web'},1)==sender.WEB_PUSH_TARGETS_PER_ATTEMPT
    assert len(calls)==10 and all(call['timeout']==20 for call in calls)
    assert sender.WEB_PUSH_TARGETS_PER_ATTEMPT*sender.WEB_PUSH_TIMEOUT_SECONDS < 5*60


def _insert_web_targets(user_id, count):
    with db.get_conn() as c:
        c.executemany(
            "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,active) VALUES (?,?,?,?,1)",
            [(user_id, f"https://example.invalid/sub-{i:03d}", "key", "auth") for i in range(count)],
        )


def test_web_push_advances_past_confirmed_prefix_for_eleven_subscriptions(env, monkeypatch):
    import sys, types
    _insert_web_targets('owner', 11)
    calls = []
    monkeypatch.setattr(sender, 'PUSH_MOCK_WEB', False)
    monkeypatch.setitem(sys.modules, 'pywebpush', types.SimpleNamespace(
        webpush=lambda **kw: calls.append(kw['subscription_info']['endpoint'])
    ))

    # Five attempts reproduce the old bug: slicing before delivery-log lookup
    # would invoke only the first ten subscriptions on every call.
    for _ in range(5):
        sender._send_web('owner', 'Title', 'Body', {'event_id': 'web-11'}, 1)

    assert len(calls) == 11
    assert len(set(calls)) == 11
    assert count('push_web_delivery_log', "event_id='web-11'") == 11


def test_web_push_more_than_fifty_targets_resumes_from_persistent_ledger(env, monkeypatch):
    import sys, types
    _insert_web_targets('owner', 61)
    calls = []
    monkeypatch.setattr(sender, 'PUSH_MOCK_WEB', False)
    monkeypatch.setitem(sys.modules, 'pywebpush', types.SimpleNamespace(
        webpush=lambda **kw: calls.append(kw['subscription_info']['endpoint'])
    ))

    for batch in range(7):
        result = sender._send_web_batch('owner', 'Title', 'Body', {'event_id': 'web-61'}, 1)
        assert result['failed'] == 0
        assert result['sent'] == (10 if batch < 6 else 1 if batch == 6 else 0)
        if batch == 2:
            # The delivery ledger, not process-local cursor state, owns progress.
            import importlib
            importlib.reload(sender)

    assert len(calls) == 61
    assert len(set(calls)) == 61
    assert count('push_web_delivery_log', "event_id='web-61'") == 61


def test_successful_web_batches_do_not_consume_provider_retry_budget(env, monkeypatch):
    import sys, types
    _insert_web_targets('owner', 61)
    calls = []
    monkeypatch.setattr(sender, 'PUSH_MOCK_WEB', False)
    monkeypatch.setitem(sys.modules, 'pywebpush', types.SimpleNamespace(
        webpush=lambda **kw: calls.append(kw['subscription_info']['endpoint'])
    ))
    event_id = 'web-progress-budget'
    gateway.enqueue_event(event_id, 'test.event', 'owner', {'title': 'T', 'body': 'B', 'data': {}})

    for batch in range(7):
        stats = gateway.process_pending_once()
        assert stats['picked'] == 1
        if batch < 6:
            assert stats['retry'] == 1
            row = outbox_row(event_id, 'owner')
            assert row['status'] == 'retry' and row['attempt_count'] == 0
            with db.get_conn() as c:
                c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?", (event_id,))
            if batch == 2:
                import importlib
                importlib.reload(sender)
        else:
            assert stats['sent'] == 1

    row = outbox_row(event_id, 'owner')
    assert row['status'] == 'sent' and row['attempt_count'] == 1
    assert len(calls) == 61 and len(set(calls)) == 61
    assert count('push_web_delivery_log', f"event_id='{event_id}'") == 61
    assert gateway.process_pending_once()['picked'] == 0


def test_web_partial_failure_retries_only_unconfirmed_targets(env, monkeypatch):
    import sys, types
    _insert_web_targets('owner', 11)
    calls = []
    failed_once = set()
    monkeypatch.setattr(sender, 'PUSH_MOCK_WEB', False)

    def webpush(**kw):
        endpoint = kw['subscription_info']['endpoint']
        calls.append(endpoint)
        if endpoint.endswith('sub-000') and endpoint not in failed_once:
            failed_once.add(endpoint)
            raise TimeoutError('synthetic timeout')

    monkeypatch.setitem(sys.modules, 'pywebpush', types.SimpleNamespace(webpush=webpush))
    event_id = 'web-partial-failure'
    gateway.enqueue_event(event_id, 'test.event', 'owner', {'title': 'T', 'body': 'B', 'data': {}})

    first = gateway.process_pending_once()
    assert first['retry'] == 1
    row = outbox_row(event_id, 'owner')
    assert row['attempt_count'] == 1
    with db.get_conn() as c:
        c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?", (event_id,))

    assert gateway.process_pending_once()['sent'] == 1
    row = outbox_row(event_id, 'owner')
    assert row['status'] == 'sent'
    assert count('push_web_delivery_log', f"event_id='{event_id}'") == 11
    # Ten targets were tried in batch one; only the failed first target and
    # the never-tried eleventh target were eligible for the next batch.
    assert calls.count('https://example.invalid/sub-001') == 1
    assert calls.count('https://example.invalid/sub-010') == 1
    assert calls.count('https://example.invalid/sub-000') == 2
    assert len(calls) == 12
