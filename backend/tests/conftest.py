"""QA harness fix для совместного прогона тестового сюита.

Проблема: каждый тестовый файл задаёт СВОЙ DB_PATH через
os.environ.setdefault(...) и делает unlink(DB_PATH) на уровне модуля (во
время коллекции pytest). При этом config.DB_PATH и большинство _init()
(chat, marketplace, push, notifications) — модульного уровня (читаются/
выполняются ОДИН раз при первом импорте). Это рассинхронит схему.

Harness унифицирует DB_PATH до import тест-модулей и после collection заново
создаёт все общие схемы, включая CGR/border tables. Последнее важно для
рекурсивного CI: test_border_dashboard импортирует cgr_dal при collection,
а session fixture затем удаляет DB; без повторного init_cgr_schema() тест
получал ложный `no such table: border_checkpoints`.
"""
import os

# До любого импорта config/db/chat — единый DB_PATH на все test modules.
os.environ["DB_PATH"] = "/tmp/urtruck_tests_badge_suite.db"
os.environ.setdefault("FILE_SIGNING_KEY", "test-file-signing-key-32-bytes-minimum")
os.environ.setdefault("CGR_IIN_SALT", "pytest-harness-salt-not-a-secret")

from pathlib import Path
import pytest


@pytest.fixture(scope="session", autouse=True)
def _ensure_full_schema():
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
    from database import db as dbm
    from database import registration_dal
    from database import cgr_dal
    from database import reviews_dal

    dbm.init_db()
    registration_dal.init_registration_schema()
    reviews_dal.init_reviews_schema()
    # CGR tables are part of the production startup schema and must be restored
    # here as well after the harness removes the DB following test collection.
    cgr_dal.init_cgr_schema()
    cgr_dal.seed_border_checkpoints_from_legacy()

    import api.chat as chat
    chat._init()
    import api.push as push_api
    push_api._init_schema()
    import api.marketplace as marketplace
    marketplace._init()
    import api.notifications as notifications
    notifications._init()

    # deal_events immutable timeline schema used by status-FSM tests.
    _deal_room_schema = Path(__file__).resolve().parent.parent / "database" / "schemas" / "deal_room_schema.sql"
    if _deal_room_schema.exists():
        from database.db import get_conn
        with get_conn() as c:
            c.executescript(_deal_room_schema.read_text(encoding="utf-8"))
    yield
