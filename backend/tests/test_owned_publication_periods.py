"""Миграция выполняется только на изолированной SQLite, с управляемым временем."""
from datetime import datetime, timedelta
import sqlite3
import pytest
from services import owned_publication_periods as periods

NOW = datetime(2026, 11, 11, 6, 0)


def database():
    c = sqlite3.connect(':memory:')
    c.row_factory = sqlite3.Row
    c.executescript('''CREATE TABLE cargos(id TEXT PRIMARY KEY,owner_id TEXT,status TEXT,published_at TEXT,created_at TEXT);
                      CREATE TABLE trips(id TEXT PRIMARY KEY,driver_id TEXT,status TEXT,published_at TEXT,created_at TEXT);
                      INSERT INTO cargos VALUES('c1','u1','active','2020-01-01','2019-01-01');
                      INSERT INTO cargos VALUES('c2','u1','cancelled','2020-01-01','2019-01-01');
                      INSERT INTO trips VALUES('t1','u2','active','2020-01-01','2019-01-01');
                      INSERT INTO trips VALUES('t2','u2','completed','2020-01-01','2019-01-01');''')
    return c


def test_grace_dry_run_and_migration_preserve_original_rows():
    c = database()
    before = [tuple(x) for x in c.execute('SELECT * FROM cargos ORDER BY id')]
    dry = periods.inventory(c, enabled_at=NOW)
    assert len(dry) == 2
    assert all(periods._parse(x['expires_at']) == NOW + timedelta(days=30) for x in dry)
    assert not periods.is_enabled(c)
    periods.activate(c, enabled_at=NOW)
    assert periods.is_enabled(c)
    assert [tuple(x) for x in c.execute('SELECT * FROM cargos ORDER BY id')] == before
    assert c.execute('SELECT count(*) FROM owned_publication_periods').fetchone()[0] == 2
    with pytest.raises(ValueError):
        periods.activate(c, enabled_at=NOW + timedelta(days=1))
    assert c.execute('SELECT count(*) FROM owned_publication_periods').fetchone()[0] == 2


def test_migration_can_be_rolled_back_without_replacing_the_database():
    c = database()
    c.execute('BEGIN IMMEDIATE')
    periods.activate(c, enabled_at=NOW)
    c.rollback()
    assert not periods.is_enabled(c)
    assert c.execute('SELECT count(*) FROM cargos').fetchone()[0] == 2


def lifecycle_database():
    c = database()
    c.executescript('''
      ALTER TABLE cargos ADD COLUMN taken_by TEXT;
      ALTER TABLE trips ADD COLUMN booked_by TEXT;
      CREATE TABLE drivers_registration(id TEXT PRIMARY KEY, role TEXT, status TEXT);
      INSERT INTO drivers_registration VALUES('u1','client','approved'),('u2','driver','approved');
      CREATE TABLE deals(id TEXT PRIMARY KEY,cargo_id TEXT,trip_id TEXT,status TEXT);
      CREATE TABLE bids(id TEXT PRIMARY KEY,cargo_id TEXT,trip_id TEXT,status TEXT);
      CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id TEXT,type TEXT,title TEXT,body TEXT,icon TEXT,url TEXT,event_key TEXT);
      CREATE UNIQUE INDEX unique_notification_event ON notifications(user_id,event_key) WHERE event_key IS NOT NULL;
      INSERT INTO bids VALUES('b1','c1',NULL,'expired');
    ''')
    periods.activate(c, enabled_at=NOW)
    return c


@pytest.mark.parametrize('kind,listing_id,owner', [('cargo','c1','u1'),('trip','t1','u2')])
def test_expiry_notification_renewal_and_idempotency(kind, listing_id, owner):
    c = lifecycle_database()
    at = NOW + timedelta(days=30)
    old = c.execute('SELECT period_id FROM owned_publication_periods WHERE kind=? AND listing_id=?',(kind,listing_id)).fetchone()[0]
    assert periods.expire_due(c, now=at-timedelta(microseconds=1)) == []
    result = periods.expire_due(c, now=at)
    assert (kind,listing_id) in result
    assert periods.expire_due(c, now=at+timedelta(seconds=1)) == []
    assert c.execute('SELECT COUNT(*) FROM notifications WHERE user_id=?',(owner,)).fetchone()[0] == 1
    renewed = periods.renew(c, kind=kind, listing_id=listing_id, owner_id=owner, expected_period_id=old, now=at)
    again = periods.renew(c, kind=kind, listing_id=listing_id, owner_id=owner, expected_period_id=old, now=at+timedelta(seconds=5))
    assert again == renewed
    assert periods._parse(renewed['expires_at']) == at + timedelta(days=30)
    assert c.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == 'expired'
    periods.expire_due(c, now=at+timedelta(days=30))
    assert c.execute('SELECT COUNT(*) FROM notifications WHERE user_id=?',(owner,)).fetchone()[0] == 2


def test_boundary_does_not_depend_on_sqlite_julianday_rounding():
    c = lifecycle_database()
    c.create_function('julianday', 1, lambda _: 1.0)
    at = NOW + timedelta(days=30)
    assert periods.expire_due(c, now=at-timedelta(microseconds=1)) == []
    assert set(periods.expire_due(c, now=at)) == {('cargo','c1'), ('trip','t1')}


@pytest.mark.parametrize('locale', ['RU','KK','EN','ZH','TR','UZ','KY','TG','BE'])
@pytest.mark.parametrize('kind,owner', [('cargo','u1'),('trip','u2')])
def test_expiry_inbox_has_each_supported_locale_for_both_roles(kind, owner, locale):
    c = lifecycle_database()
    c.execute('CREATE TABLE push_devices(id INTEGER PRIMARY KEY,user_id TEXT,locale TEXT,enabled INTEGER,last_seen_at TEXT)')
    c.execute('INSERT INTO push_devices VALUES(1,?,?,1,?)', (owner, locale, '2026-11-11'))
    periods.expire_due(c, now=NOW+timedelta(days=30))
    row = c.execute('SELECT title,body FROM notifications WHERE user_id=?', (owner,)).fetchone()
    assert tuple(row) == periods.EXPIRY_TEXT[locale]
    assert all(row) and (locale == 'RU' or tuple(row) != periods.EXPIRY_TEXT['RU'])


def test_blocked_owner_deals_and_wrong_owner_cannot_renew():
    c = lifecycle_database()
    at = NOW + timedelta(days=30)
    original = c.execute("SELECT period_id FROM owned_publication_periods WHERE kind='cargo' AND listing_id='c1'").fetchone()[0]
    c.execute("INSERT INTO deals VALUES('d1','c1',NULL,'in_progress')")
    periods.expire_due(c, now=at)
    assert c.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == 'active'
    assert c.execute("SELECT status FROM deals WHERE id='d1'").fetchone()[0] == 'in_progress'
    with pytest.raises(PermissionError):
        periods.renew(c,kind='cargo',listing_id='c1',owner_id='stranger',expected_period_id=original,now=at)
    c.execute("UPDATE deals SET status='completed' WHERE id='d1'")
    c.execute("UPDATE cargos SET status='expired' WHERE id='c1'")
    with pytest.raises(ValueError):
        periods.renew(c,kind='cargo',listing_id='c1',owner_id='u1',expected_period_id=original,now=at)


def test_empty_legacy_occupancy_is_not_treated_as_a_blocking_deal():
    c = lifecycle_database()
    c.execute("UPDATE cargos SET taken_by='' WHERE id='c1'")
    c.execute("UPDATE trips SET booked_by='' WHERE id='t1'")
    assert set(periods.expire_due(c, now=NOW+timedelta(days=30))) == {('cargo','c1'),('trip','t1')}
    assert c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0] == 2


def test_failed_notification_rolls_back_expiry_even_if_caller_catches_error():
    c = lifecycle_database()
    c.executescript('''CREATE TRIGGER fail_notification BEFORE INSERT ON notifications
                       BEGIN SELECT RAISE(ABORT, 'notification failed'); END;''')
    with pytest.raises(sqlite3.IntegrityError):
        periods.expire_due(c, now=NOW+timedelta(days=30))
    c.commit()
    assert c.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == 'active'
    assert c.execute("SELECT status FROM trips WHERE id='t1'").fetchone()[0] == 'active'
    assert c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0] == 0


@pytest.mark.parametrize('kind,listing_id,owner', [('cargo','c1','u1'),('trip','t1','u2')])
def test_legacy_republish_never_reports_success_for_an_expired_period(monkeypatch, kind, listing_id, owner):
    from contextlib import contextmanager
    from fastapi import HTTPException
    from api import marketplace
    c = lifecycle_database()
    c.execute('ALTER TABLE cargos ADD COLUMN pickup_date TEXT')
    c.execute('ALTER TABLE trips ADD COLUMN departure TEXT')
    periods.expire_due(c, now=NOW+timedelta(days=30))
    @contextmanager
    def connection():
        yield c
    monkeypatch.setattr(marketplace, 'get_conn', connection)
    handler = marketplace.republish_cargo if kind == 'cargo' else marketplace.republish_trip
    with pytest.raises(HTTPException) as failure:
        handler(listing_id, user={'id': owner})
    assert failure.value.status_code == 409
    table = 'cargos' if kind == 'cargo' else 'trips'
    assert c.execute(f'SELECT status FROM {table} WHERE id=?', (listing_id,)).fetchone()[0] == 'expired'


@pytest.mark.parametrize('kind,listing_id,owner',[('cargo','c1','u1'),('trip','t1','u2')])
def test_owner_archive_and_hide_never_delete_or_change_related_data(kind, listing_id, owner):
    c = lifecycle_database()
    periods.expire_due(c,now=NOW+timedelta(days=30))
    assert periods.disposition(c,kind=kind,listing_id=listing_id,owner_id=owner,action='archive')['hidden'] is False
    with pytest.raises(PermissionError):
        periods.disposition(c,kind=kind,listing_id=listing_id,owner_id='stranger',action='hide')
    assert periods.disposition(c,kind=kind,listing_id=listing_id,owner_id=owner,action='hide')['hidden'] is True
    table = 'cargos' if kind == 'cargo' else 'trips'
    assert c.execute(f'SELECT status FROM {table} WHERE id=?',(listing_id,)).fetchone()[0] == 'expired'
    assert c.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == 'expired'


@pytest.mark.parametrize('status',['cancelled','unpublished','completed','taken'])
def test_closed_listing_cannot_be_renewed(status):
    c = lifecycle_database()
    period_id = c.execute("SELECT period_id FROM owned_publication_periods WHERE kind='cargo' AND listing_id='c1'").fetchone()[0]
    c.execute('UPDATE cargos SET status=? WHERE id=?',(status,'c1'))
    with pytest.raises(ValueError):
        periods.renew(c,kind='cargo',listing_id='c1',owner_id='u1',expected_period_id=period_id,now=NOW+timedelta(days=30))
    assert c.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == status


def test_unavailable_owner_never_gets_renewed_or_notified():
    c = lifecycle_database()
    period_id = c.execute("SELECT period_id FROM owned_publication_periods WHERE kind='cargo' AND listing_id='c1'").fetchone()[0]
    c.execute("UPDATE drivers_registration SET status='deleted' WHERE id='u1'")
    periods.expire_due(c,now=NOW+timedelta(days=30))
    assert c.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == 'expired'
    assert c.execute("SELECT count(*) FROM notifications WHERE user_id='u1'").fetchone()[0] == 0
    with pytest.raises(ValueError):
        periods.renew(c,kind='cargo',listing_id='c1',owner_id='u1',expected_period_id=period_id,now=NOW+timedelta(days=30))


def test_expiry_is_in_app_only_and_does_not_create_push_outbox():
    c = lifecycle_database()
    c.execute('CREATE TABLE push_outbox(event_id TEXT)')
    periods.expire_due(c,now=NOW+timedelta(days=30))
    assert c.execute('SELECT count(*) FROM notifications').fetchone()[0] == 2
    assert c.execute('SELECT count(*) FROM push_outbox').fetchone()[0] == 0
    keys = [r[0] for r in c.execute('SELECT event_key FROM notifications')]
    assert all(k.startswith('listing-expired:') for k in keys)


def test_owner_api_hides_only_own_expired_item_and_keeps_rows(monkeypatch):
    from contextlib import contextmanager
    from api import marketplace
    c = lifecycle_database()
    periods.expire_due(c,now=NOW+timedelta(days=30))
    c.commit()

    @contextmanager
    def connection():
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise

    monkeypatch.setattr(marketplace,'get_conn',connection)
    before = marketplace.my_listings(kind='cargo',section='history',limit=50,offset=0,user={'id':'u1'})
    assert before['total'] == 2
    assert any(item['id'] == 'c1' and item.get('publication_period_id') for item in before['items'])
    target = marketplace.my_listings(kind='cargo',section='history',limit=50,offset=0,listing_id='c1',user={'id':'u1'})
    assert [item['id'] for item in target['items']] == ['c1']
    other_target = marketplace.my_listings(kind='cargo',section='history',limit=50,offset=0,listing_id='c1',user={'id':'stranger'})
    assert other_target['items'] == []
    with pytest.raises(Exception) as other:
        marketplace._publication_action('cargo','c1',{'id':'stranger'},'hide')
    assert other.value.status_code == 403
    assert marketplace._publication_action('cargo','c1',{'id':'u1'},'hide')['ok']
    after = marketplace.my_listings(kind='cargo',section='history',limit=50,offset=0,user={'id':'u1'})
    assert after['total'] == after['history_total'] == 1
    assert all(item['id'] != 'c1' for item in after['items'])
    assert c.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == 'expired'
    assert c.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == 'expired'


def test_concurrent_renewal_is_idempotent_on_disk(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    source = lifecycle_database()
    periods.expire_due(source,now=NOW+timedelta(days=30))
    source.commit()
    path = tmp_path / 'synthetic.sqlite3'
    target = sqlite3.connect(path)
    source.backup(target)
    target.close()
    period_id = source.execute("SELECT period_id FROM owned_publication_periods WHERE kind='cargo' AND listing_id='c1'").fetchone()[0]
    barrier = Barrier(2)
    def request():
        conn = sqlite3.connect(path,timeout=5)
        conn.row_factory = sqlite3.Row
        barrier.wait()
        conn.execute('BEGIN IMMEDIATE')
        try:
            result = periods.renew(conn,kind='cargo',listing_id='c1',owner_id='u1',expected_period_id=period_id,now=NOW+timedelta(days=30))
            conn.commit()
            return result
        finally:
            conn.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: request(),range(2)))
    assert results[0] == results[1]
    check = sqlite3.connect(path)
    assert check.execute("SELECT count(*) FROM cargos WHERE id='c1'").fetchone()[0] == 1
    assert check.execute("SELECT count(*) FROM notifications WHERE user_id='u1'").fetchone()[0] == 1


@pytest.mark.parametrize('kind,listing_id,owner',[('cargo','c1','u1'),('trip','t1','u2')])
def test_http_owner_renewal_is_idempotent_and_rejects_strangers(tmp_path, monkeypatch, kind, listing_id, owner):
    from contextlib import contextmanager
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api import marketplace
    source = lifecycle_database()
    periods.expire_due(source,now=NOW+timedelta(days=30))
    source.commit()
    path = tmp_path / 'synthetic-api.sqlite3'
    dest = sqlite3.connect(path)
    source.backup(dest)
    dest.close()
    period_id = source.execute('SELECT period_id FROM owned_publication_periods WHERE kind=? AND listing_id=?',(kind,listing_id)).fetchone()[0]
    @contextmanager
    def connection():
        conn = sqlite3.connect(path,timeout=5)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    monkeypatch.setattr(marketplace,'get_conn',connection)
    actor = {'id': 'stranger'}
    app = FastAPI()
    app.include_router(marketplace.mp_router,prefix='/market')
    for route in marketplace.mp_router.routes:
        if '/publication/' in getattr(route,'path',''):
            for dependency in route.dependant.dependencies:
                app.dependency_overrides[dependency.call] = lambda: actor
    client = TestClient(app)
    url = f"/market/{'cargos' if kind == 'cargo' else 'trips'}/{listing_id}/publication/renew"
    assert client.post(url,json={'period_id':period_id}).status_code == 403
    actor['id'] = owner
    first = client.post(url,json={'period_id':period_id})
    second = client.post(url,json={'period_id':period_id})
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()['ok'] is True


def test_real_cleanup_path_expires_both_roles_without_opening_app():
    from services import bid_expiry
    c = lifecycle_database()
    c.executescript('''
      ALTER TABLE cargos ADD COLUMN pickup_date TEXT;
      ALTER TABLE trips ADD COLUMN departure TEXT;
      ALTER TABLE bids ADD COLUMN bidder_id TEXT;
      ALTER TABLE bids ADD COLUMN updated_at TEXT;
      ALTER TABLE bids ADD COLUMN created_at TEXT;
      ALTER TABLE bids ADD COLUMN amount REAL;
    ''')
    at = NOW + timedelta(days=30)
    first = bid_expiry.expire_stale_marketplace(now=at,conn=c)
    second = bid_expiry.expire_stale_marketplace(now=at,conn=c)
    assert first['expired_cargos'] == ['c1']
    assert first['expired_trips'] == ['t1']
    assert not second['expired_cargos'] and not second['expired_trips']
    assert c.execute('SELECT count(*) FROM notifications').fetchone()[0] == 2


def test_background_job_calls_expiry_only_after_activation(tmp_path, monkeypatch):
    import config
    from scheduler import jobs
    from services import bid_expiry
    path = tmp_path/'synthetic-scheduler.sqlite3'
    conn = sqlite3.connect(path)
    conn.execute('CREATE TABLE owned_publication_policy(id INTEGER PRIMARY KEY,enabled INTEGER,enabled_at TEXT)')
    conn.commit(); conn.close()
    monkeypatch.setattr(config,'DB_PATH',str(path))
    calls = []
    monkeypatch.setattr(bid_expiry,'expire_stale_marketplace',lambda: calls.append('run'))
    jobs.owned_publication_expiry_job()
    assert calls == []
    conn=sqlite3.connect(path)
    conn.execute("INSERT INTO owned_publication_policy VALUES(1,1,'2026-11-11T00:00:00Z')")
    conn.commit(); conn.close()
    jobs.owned_publication_expiry_job()
    assert calls == ['run']
