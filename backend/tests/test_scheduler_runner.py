"""Проверка entrypoint без импорта API, записи данных и сетевых push."""
import sqlite3
import pytest
from scheduler import runner
from services import push_gateway


def test_environment_loader_preserves_external_values_and_pem_escapes(tmp_path):
    p=tmp_path/'backend.env';p.write_text('DB_PATH=/wrong\nAPNS_AUTH_KEY_P8=first\\nsecond\n# comment\n')
    env={'DB_PATH':'/isolated'};runner.load_environment(p,env)
    assert env['DB_PATH']=='/isolated' and env['APNS_AUTH_KEY_P8']=='first\\nsecond'


def test_configuration_check_is_read_only_and_rejects_missing_apns(tmp_path,monkeypatch):
    path=tmp_path/'db.sqlite'
    with sqlite3.connect(path) as c:
        for table in ['notifications','push_outbox','notification_preferences','notification_event_claims','push_web_delivery_log']:c.execute(f'CREATE TABLE {table}(id INTEGER)')
    monkeypatch.setenv('URTRUCK_ENV','test');monkeypatch.setenv('DB_PATH',str(path));monkeypatch.setenv('URTRUCK_SCHEDULER_LOCK',str(tmp_path/'lock'))
    monkeypatch.setenv('URTRUCK_REQUIRE_APNS','1');monkeypatch.setattr(push_gateway.APNsProvider,'_jwt',lambda self:None)
    before=path.read_bytes()
    with pytest.raises(RuntimeError,match='apns_pre_http'):runner.check_configuration()
    assert path.read_bytes()==before
    monkeypatch.setattr(push_gateway,'APNS_BUNDLE_ID','com.urtruck.app')
    monkeypatch.setattr(push_gateway.APNsProvider,'_jwt',lambda self:'synthetic-local-jwt')
    assert runner.check_configuration()['provider_check']=='local_only' and path.read_bytes()==before


def test_missing_schema_does_not_get_created_by_readiness_check(tmp_path,monkeypatch):
    p=tmp_path/'legacy.db';sqlite3.connect(p).close()
    monkeypatch.setenv('URTRUCK_ENV','test');monkeypatch.setenv('DB_PATH',str(p));monkeypatch.setenv('URTRUCK_SCHEDULER_LOCK',str(tmp_path/'lock'))
    with pytest.raises(RuntimeError,match='schema_migration_required'):runner.check_configuration()
    with sqlite3.connect(p) as c:assert c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]==0


def test_process_without_lock_exits_before_initial_parser(monkeypatch):
    from scheduler import jobs
    monkeypatch.setattr(jobs.db,'init_db',lambda:None)
    monkeypatch.setattr(jobs,'start_scheduler',lambda:None)
    def forbidden():raise AssertionError('Процесс без lock не должен запускать parser')
    monkeypatch.setattr(jobs,'parse_telegram_job',forbidden)
    assert jobs.run_scheduler_process()==1
