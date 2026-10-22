"""Старая уникальность номера мигрирует без потери полей и внешних связей."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pytest

from database import vehicles_dal


@pytest.fixture
def legacy(tmp_path, monkeypatch):
    path = tmp_path / 'vehicles-legacy.db'
    schema = (Path(vehicles_dal.__file__).parent / 'vehicles_schema.sql').read_text()
    schema = schema.replace('UNIQUE(owner_user_id, vehicle_registration_country_code, license_plate)',
                            'UNIQUE(owner_user_id, license_plate)')
    with sqlite3.connect(path) as c:
        c.executescript(schema)
        c.execute('ALTER TABLE vehicles ADD COLUMN legacy_note TEXT')
        c.execute('CREATE INDEX legacy_vehicle_note ON vehicles(legacy_note)')
        c.executescript('''CREATE TABLE vehicle_links(vehicle_id TEXT REFERENCES vehicles(id));
          CREATE TABLE vehicle_audit(vehicle_id TEXT);
          CREATE TRIGGER legacy_vehicle_update AFTER UPDATE ON vehicles BEGIN
            INSERT INTO vehicle_audit VALUES(NEW.id); END;''')
        c.execute("INSERT INTO vehicles(id,owner_user_id,vehicle_registration_country_code,vehicle_type,body_type,make,model,license_plate,payload_tons,cargo_volume_m3,legacy_note) VALUES('original','owner','KZ','truck','tent','Volvo','FH','777ABC',25,150,'сохранить')")
        c.execute("INSERT INTO vehicle_links VALUES('original')")
    @contextmanager
    def connection():
        with sqlite3.connect(path) as c:
            c.row_factory = sqlite3.Row
            c.execute('PRAGMA foreign_keys=ON')
            yield c
    monkeypatch.setattr(vehicles_dal, 'get_conn', connection)
    return path


def test_legacy_identity_keeps_rows_columns_indexes_triggers_and_links(legacy):
    with sqlite3.connect(legacy) as c:
        before = c.execute('SELECT * FROM vehicles').fetchall()
    vehicles_dal.init_vehicles_schema()
    vehicles_dal.init_vehicles_schema()
    with sqlite3.connect(legacy) as c:
        assert c.execute('SELECT * FROM vehicles').fetchall() == before
        assert c.execute('SELECT * FROM vehicle_links').fetchall() == [('original',)]
        assert c.execute('PRAGMA foreign_key_check').fetchall() == []
        assert c.execute("SELECT name FROM sqlite_master WHERE name='legacy_vehicle_note'").fetchone()
        payload = dict(zip(
            [r[1] for r in c.execute('PRAGMA table_info(vehicles)')], before[0]))
    payload = {k:v for k,v in payload.items() if k not in ('id','owner_user_id','created_at','updated_at','legacy_note')}
    payload['vehicle_registration_country_code'] = 'CN'
    second = vehicles_dal.upsert_vehicle('owner', payload)
    assert second['id'] != 'original'
    assert len(vehicles_dal.list_vehicles('owner')) == 2
    assert vehicles_dal.get_vehicle('another-owner', 'original') is None
    vehicles_dal.upsert_vehicle('owner', {**payload,'cargo_volume_m3':140}, second['id'])
    with sqlite3.connect(legacy) as c:
        assert c.execute('SELECT vehicle_id FROM vehicle_audit').fetchall() == [(second['id'],)]
        assert c.execute('PRAGMA quick_check').fetchone()[0] == 'ok'


def test_migration_failure_rolls_back_original_table(legacy, monkeypatch):
    original = vehicles_dal.get_conn
    @contextmanager
    def failing_connection():
        with original() as conn:
            class Failing:
                def execute(self, sql, *args):
                    if sql.startswith('ALTER TABLE vehicles_identity_migration RENAME'):
                        raise sqlite3.OperationalError('проверочный отказ перед rename')
                    return conn.execute(sql, *args)
                def __getattr__(self, name):
                    return getattr(conn, name)
            yield Failing()
    monkeypatch.setattr(vehicles_dal, 'get_conn', failing_connection)
    with pytest.raises(sqlite3.OperationalError):
        vehicles_dal.init_vehicles_schema()
    with sqlite3.connect(legacy) as c:
        assert c.execute('SELECT id,legacy_note FROM vehicles').fetchall() == [('original','сохранить')]
        assert c.execute('SELECT * FROM vehicle_links').fetchall() == [('original',)]
        assert c.execute("SELECT name FROM sqlite_master WHERE name='vehicles_identity_migration'").fetchone() is None
        assert c.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
