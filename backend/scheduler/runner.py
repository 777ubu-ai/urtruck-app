"""Управляемый entrypoint: конфигурация до импорта scheduler и provider."""
import argparse
import json
import os
from pathlib import Path
import runpy
import sqlite3


def load_environment(path, environ=None):
    target=os.environ if environ is None else environ
    # Совместимо с загрузчиком API: внешнее окружение имеет приоритет.
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            key,value=line.split('=',1)
            target.setdefault(key.strip(),value.strip())


def check_configuration():
    if (os.getenv('URTRUCK_ENV') or os.getenv('ENV')) not in ('production','qa2','qa','test'):
        raise RuntimeError('scheduler_environment_not_explicit')
    db_path=os.getenv('DB_PATH')
    if not db_path or not os.getenv('URTRUCK_SCHEDULER_LOCK'):
        raise RuntimeError('scheduler_database_or_lock_not_explicit')
    with sqlite3.connect('file:'+str(Path(db_path).resolve())+'?mode=ro',uri=True) as c:
        c.execute('PRAGMA query_only=ON')
        required={'notifications','push_outbox','notification_preferences','notification_event_claims','push_web_delivery_log'}
        present={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not required.issubset(present):
            raise RuntimeError('scheduler_schema_migration_required')
    if os.getenv('URTRUCK_REQUIRE_APNS','1') not in ('0','false'):
        from services.push_gateway import APNsProvider
        provider=APNsProvider()
        # Подпись JWT локальная: сеть, push и импорт API не выполняются.
        from services.push_gateway import APNS_BUNDLE_ID
        try:
            ready=bool(APNS_BUNDLE_ID and provider._jwt())
        except Exception:
            ready=False
        if not ready:
            raise RuntimeError('scheduler_apns_pre_http_not_ready')
    return {'configuration':'ready','schema':'ready','provider_check':'local_only'}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    env_file=os.getenv('URTRUCK_ENV_FILE') or str(Path(__file__).resolve().parents[1]/'.env')
    load_environment(env_file)
    result=check_configuration()
    if args.check:
        print(json.dumps(result))
    else:
        # API может иметь флаг 0, чтобы job исполнял только этот worker.
        os.environ['URTRUCK_ENABLE_SCHEDULER']='1'
        runpy.run_module('scheduler.jobs',run_name='__main__')


if __name__=='__main__':
    main()
