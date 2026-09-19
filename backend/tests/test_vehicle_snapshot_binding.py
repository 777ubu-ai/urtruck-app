import sqlite3

from api.marketplace import _vehicle_snapshot_for_deal


def _conn():
    c = sqlite3.connect(':memory:')
    c.row_factory = sqlite3.Row
    return c


def test_vehicle_snapshot_prefers_trip_bound_vehicle():
    c = _conn()
    c.execute('CREATE TABLE trips (id TEXT PRIMARY KEY, vehicle_id TEXT)')
    c.execute('CREATE TABLE vehicles (id TEXT PRIMARY KEY, owner_user_id TEXT, vehicle_registration_country_code TEXT, make TEXT, model TEXT, license_plate TEXT, updated_at TEXT)')
    c.execute("INSERT INTO vehicles VALUES ('v1','driver-1','KZ','Volvo','FH','111AAA02','2026-09-19')")
    c.execute("INSERT INTO vehicles VALUES ('v2','driver-1','KZ','Scania','R450','222BBB02','2026-09-19')")
    c.execute("INSERT INTO trips VALUES ('t1','v2')")
    snap = _vehicle_snapshot_for_deal(c, 'driver-1', trip_id='t1')
    assert snap['id'] == 'v2'
    assert snap['license_plate'] == '222BBB02'


def test_vehicle_snapshot_uses_only_vehicle_when_unambiguous():
    c = _conn()
    c.execute('CREATE TABLE trips (id TEXT PRIMARY KEY, vehicle_id TEXT)')
    c.execute('CREATE TABLE vehicles (id TEXT PRIMARY KEY, owner_user_id TEXT, vehicle_registration_country_code TEXT, make TEXT, model TEXT, license_plate TEXT, updated_at TEXT)')
    c.execute("INSERT INTO vehicles VALUES ('v1','driver-1','KZ','Volvo','FH','111AAA02','2026-09-19')")
    snap = _vehicle_snapshot_for_deal(c, 'driver-1')
    assert snap['id'] == 'v1'
    assert snap['license_plate'] == '111AAA02'


def test_vehicle_snapshot_fails_closed_when_multiple_unbound_vehicles():
    c = _conn()
    c.execute('CREATE TABLE trips (id TEXT PRIMARY KEY, vehicle_id TEXT)')
    c.execute('CREATE TABLE vehicles (id TEXT PRIMARY KEY, owner_user_id TEXT, vehicle_registration_country_code TEXT, make TEXT, model TEXT, license_plate TEXT, updated_at TEXT)')
    c.execute("INSERT INTO vehicles VALUES ('v1','driver-1','KZ','Volvo','FH','111AAA02','2026-09-19')")
    c.execute("INSERT INTO vehicles VALUES ('v2','driver-1','KZ','Scania','R450','222BBB02','2026-09-19')")
    assert _vehicle_snapshot_for_deal(c, 'driver-1') == {}


def test_vehicle_snapshot_is_rollback_compatible_without_vehicles_table():
    c = _conn()
    c.execute('CREATE TABLE trips (id TEXT PRIMARY KEY)')
    assert _vehicle_snapshot_for_deal(c, 'driver-1') == {}
