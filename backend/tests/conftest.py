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
os.environ.setdefault("DB_PATH", "/tmp/urtruck_tests_badge_suite.db")
os.environ["URTRUCK_ENV"] = "test"
os.environ["ENV"] = "test"
os.environ["BETA_MODE"] = "true"
os.environ.setdefault("FILE_SIGNING_KEY", "test-file-signing-key-32-bytes-minimum")
os.environ.setdefault("CGR_IIN_SALT", "pytest-harness-salt-not-a-secret")
# 2026-09-08 harness fix: marks that conftest.py has claimed DB_PATH and owns
# the unlink+full-schema-rebuild below (session-scoped, runs once after
# collection). Individual test files that also support standalone execution
# (`python -m tests.test_X`) check this before doing their own destructive
# `Path(DB_PATH).unlink()` — under pytest they must NOT repeat it (that
# unlink-per-file-at-import-time race, layered on top of this fixture, was
# the confirmed root cause of the order-dependent DB "no such table" class
# of failures — see tests/auth_harness.py for the sibling auth-side fix and
# the integration audit report for the full reproduction).
os.environ["URTRUCK_TEST_HARNESS_OWNS_DB"] = "1"

from pathlib import Path
import pytest

# Some modules initialise their schema at import time during pytest collection
# (before fixtures run). Bootstrap the two foundational schemas here so those
# imports cannot bind to an empty database.
from database import db as _collection_db
from database import registration_dal as _collection_registration
_collection_db.init_db()
_collection_registration.init_registration_schema()


def _rebuild_all_schemas():
    """Idempotent: every call here is CREATE TABLE/INDEX IF NOT EXISTS (or an
    equivalent guarded migration), so re-running this mid-session is safe and
    cheap (local SQLite, no network) — see _reassert_schema_before_each_test
    below for why that matters.
    """
    from database import db as dbm
    from database import registration_dal
    from database import cgr_dal

    dbm.init_db()
    registration_dal.init_registration_schema()
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
    # favorites (driver+cargo избранное) — тот же класс бага, что и у CGR
    # выше: _init() модульного уровня выполняется при import ВО ВРЕМЯ
    # коллекции, а этот fixture затем удаляет файл БД и пересоздаёт общие
    # схемы — без повторного вызова здесь `favorites` таблицы бы не было
    # при полном прогоне suite (только при изолированном запуске одного файла).
    import api.favorites as favorites
    favorites._init()

    # deal_events immutable timeline schema used by status-FSM tests.
    _deal_room_schema = Path(__file__).resolve().parent.parent / "database" / "schemas" / "deal_room_schema.sql"
    if _deal_room_schema.exists():
        from database.db import get_conn
        with get_conn() as c:
            c.executescript(_deal_room_schema.read_text(encoding="utf-8"))


@pytest.fixture(scope="session", autouse=True)
def _ensure_full_schema():
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
    _rebuild_all_schemas()
    yield


@pytest.fixture(autouse=True)
def _reassert_schema_before_each_test(_ensure_full_schema):
    # 2026-09-08 harness fix: the session-scoped rebuild above runs exactly
    # once. In investigating the 92 order-dependent failures, one concrete
    # cause was confirmed (a test doing `importlib.reload(config)` with an
    # ineffective restore — fixed at its source in test_prerelease_hardening.py)
    # but bisection showed the DB-missing-table failures needed that AND
    # something earlier in the same run to reproduce — i.e. more than one
    # thing was capable of disturbing shared state mid-session, and fixing
    # every individual instance one at a time doesn't bound how many more
    # there are. Given every call in _rebuild_all_schemas() is a cheap,
    # idempotent CREATE-IF-NOT-EXISTS against a local SQLite file, re-running
    # it before EVERY test (not just once per session) is a safety net that
    # makes the whole class of "something upstream silently broke the schema"
    # failures structurally impossible, regardless of the exact mechanism —
    # rather than chasing each remaining interaction individually.
    _rebuild_all_schemas()
    yield
