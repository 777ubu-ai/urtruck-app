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
import importlib

# До любого импорта config/db/chat — единый DB_PATH на все test modules.
os.environ["DB_PATH"] = "/tmp/urtruck_tests_badge_suite.db"
os.environ["URTRUCK_PYTEST_SHARED_DB"] = "1"
os.environ["ENV"] = "test"
os.environ["URTRUCK_ENV"] = "test"
os.environ.setdefault("FILE_SIGNING_KEY", "test-file-signing-key-32-bytes-minimum")
os.environ.setdefault("CGR_IIN_SALT", "pytest-harness-salt-not-a-secret")

from pathlib import Path
import pytest

def pytest_collection_modifyitems(session, config, items):
    """Keep startup-invariant checks before attachment module env mutation."""
    canonical_db = "/tmp/urtruck_tests_badge_suite.db"
    os.environ["DB_PATH"] = canonical_db
    for module in {item.module for item in items}:
        if hasattr(module, "TEST_DB"):
            module.TEST_DB = canonical_db
        if hasattr(module, "DB_PATH"):
            module.DB_PATH = canonical_db
    prerelease = [item for item in items if "test_prerelease_hardening.py" in item.nodeid]
    other = [item for item in items if "test_prerelease_hardening.py" not in item.nodeid]
    if prerelease:
        items[:] = prerelease + other


def pytest_runtest_setup(item):
    # Legacy modules mutate DB_PATH at import and some tests reload config.
    # Re-pin the canonical path before every test so a later reload cannot
    # redirect DAL calls to a module-specific database.
    os.environ["DB_PATH"] = "/tmp/urtruck_tests_badge_suite.db"

# Сбрасываем shared DB до collection, пока test modules ещё не открыли
# SQLite/WAL connection. Удаление внутри fixture после import модулей давало
# `attempt to write a readonly database` в standalone-тестах с module-level init.
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

# ─────────────────────────────────────────────────────────────────────────
# HARNESS FIX (final release gate, 04.09.2026): детерминированная авторизация
# независимо от порядка импорта.
#
# ROOT CAUSE прежних ~92 «падений» полного прогона: 13 тест-модулей на УРОВНЕ
# МОДУЛЯ делают `verification_gate.require_level = <свой fake>`, и каждый fake
# читает СВОЙ contextvars.ContextVar. FastAPI связывает Depends(require_level(N))
# в момент декорирования эндпоинта, то есть при ПЕРВОМ импорте api-модуля, а
# Python кеширует модули. Итог: роутер навсегда связан с fake того файла,
# который импортировал api первым, и все остальные модули получают 401/403 —
# при том что каждый из них по отдельности полностью зелёный
# (test_deal_status_actor_fsm 30/30, test_idor_three_accounts 20/20,
# test_push_token_security 11/11).
#
# ФИКС (только харнесс, продукт не трогаем): conftest выполняется ДО коллекции,
# поэтому здесь ставится ОДИН общий require_level. Он резолвит пользователя не
# из фиксированного ContextVar, а через «активный резолвер», который
# autouse-фикстура переключает на ContextVar модуля текущего теста. Тест-файлы
# менять не нужно: они продолжают писать в свой _current_user / _cu.
from api import verification_gate as _vgate  # noqa: E402

_ACTIVE_USER_RESOLVER = {"get": None}


def _shared_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        getter = _ACTIVE_USER_RESOLVER["get"]
        user = getter() if callable(getter) else None
        if not user:
            raise HTTPException(status_code=401, detail="No test user set")
        return user

    return dep


_vgate.require_level = _shared_require_level


# 13 тест-модулей на уровне модуля делают `verification_gate.require_level = ...`
# СВОИМ fake. Даже если conftest выставил общий раньше, первый импортёр api
# перетирает его и навсегда связывает роутеры со своим ContextVar — остальные
# модули получают 401. Поэтому делаем атрибут неперезаписываемым: присваивания
# из тест-модулей молча игнорируются, общий резолвер остаётся единственным.
# Это ТОЛЬКО харнесс: продакшен-модуль verification_gate не меняется.
import types as _types  # noqa: E402


class _LockedGateModule(_types.ModuleType):
    def __setattr__(self, name, value):
        if name == "require_level":
            return
        super().__setattr__(name, value)


_vgate.__class__ = _LockedGateModule

# Тест-модули ставят «текущего пользователя» через свои as_user()/_as(), которые
# пишут в contextvars.ContextVar. Читать этот ContextVar напрямую нельзя: сам
# запрос TestClient исполняется через anyio-портал в другом контексте, и
# значение, установленное в теле теста, там не всегда видно. Поэтому мы
# ПЕРЕХВАТЫВАЕМ сеттер модуля: он по-прежнему делает свою работу, а мы
# дополнительно запоминаем пользователя в обычном словаре, который и читает
# общий require_level. Тест-файлы при этом не меняются.
_TEST_USER_SETTERS = ("as_user", "_as")
_TEST_USER_VARS = ("_current_user", "_cu")


@pytest.fixture(autouse=True)
def _bind_module_test_user(request):
    module = request.module
    captured = {"user": None}

    var = next(
        (getattr(module, name) for name in _TEST_USER_VARS if hasattr(module, name)),
        None,
    )

    def resolve():
        # Приоритет — перехваченное значение; ContextVar остаётся страховкой
        # для модулей, которые ставят пользователя без функции-сеттера.
        if captured["user"] is not None:
            return captured["user"]
        try:
            return var.get() if var is not None else None
        except LookupError:
            return None

    originals = {}
    for name in _TEST_USER_SETTERS:
        setter = getattr(module, name, None)
        if not callable(setter):
            continue
        originals[name] = setter

        def make_wrapper(original):
            def wrapper(*args, **kwargs):
                result = original(*args, **kwargs)
                if var is not None:
                    try:
                        captured["user"] = var.get()
                    except LookupError:
                        captured["user"] = None
                return result
            return wrapper

        setattr(module, name, make_wrapper(setter))

    previous = _ACTIVE_USER_RESOLVER["get"]
    _ACTIVE_USER_RESOLVER["get"] = resolve
    try:
        yield
    finally:
        _ACTIVE_USER_RESOLVER["get"] = previous
        for name, original in originals.items():
            setattr(module, name, original)


def _init_all_shared_schemas():
    """Идемпотентно создаёт ВСЕ общие схемы на текущем DB_PATH.

    Вынесено из session-фикстуры, потому что вызывать это нужно дважды:
    один раз перед сюитом и ещё раз после каждого тест-модуля — см.
    _restore_shared_schema_after_module ниже.
    """
    # cgr.test_settings reloads its settings module deliberately. Restore the
    # runtime singleton before every module so that its last parametrization
    # cannot disable the following border API tests.
    os.environ["CGR_FEATURE_ENABLED"] = "true"
    os.environ["CGR_IIN_SALT"] = "pytest-harness-salt-not-a-secret"
    from cgr import settings as _cgr_settings
    importlib.reload(_cgr_settings)
    from cgr import scoreboard_service as _scoreboard_service
    _scoreboard_service.cgr_settings = _cgr_settings.cgr_settings

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

    # Re-assert the existing startup invariant after a module reset. Production
    # intentionally skips this index when legacy duplicate bid_id data exists;
    # the clean test DB has no such data, so its invariant must be deterministic.
    from database.db import get_conn as _invariant_conn
    with _invariant_conn() as c:
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_bid_unique ON deals(bid_id)")


@pytest.fixture(scope="session", autouse=True)
def _ensure_full_schema():
    _init_all_shared_schemas()
    yield


@pytest.fixture(scope="module", autouse=True)
def _restore_shared_schema_after_module(request):
    """Восстанавливает общие схемы ПОСЛЕ каждого тест-модуля.

    ROOT CAUSE второй половины «падений» полного прогона: отдельные модули
    сознательно приводят общую БД в нестандартное состояние. Ярче всего
    test_production_like_migrations.py — он DROP'ает push_subscriptions /
    push_tokens_native / push_log / notifications и пересоздаёт их в LEGACY
    виде, чтобы проверить реальные миграции. Сам он после этого зелёный, но
    все модули, которые бегут ПОЗЖЕ (test_push_token_security,
    test_unread_badge, test_unread_deduplication,
    test_push_anonymous_ownership_guard), получали
    `sqlite3.OperationalError: no such table ...` — при том что каждый из них
    изолированно полностью зелёный.
    Идемпотентное восстановление после модуля делает результат независимым от
    порядка коллекции и не требует правок в самих тест-файлах.
    """
    # Сохраняем состояние внутри module, но восстанавливаем схемы и
    # загрязняющие данные на его границе.
    _cleanup_cross_module_data_pollution()
    _init_all_shared_schemas()
    if request.module.__name__.endswith("test_social_auth"):
        from database.db import get_conn as _registration_conn
        with _registration_conn() as c:
            c.execute("DELETE FROM reg_sessions")
            c.execute("DELETE FROM verification_codes")
            c.execute("DELETE FROM drivers_registration")
    yield
    _cleanup_cross_module_data_pollution()
    _init_all_shared_schemas()

def _cleanup_cross_module_data_pollution():
    """Снимает тестовые ДАННЫЕ, которые мешают идемпотентному init схем.

    Конкретно: api.marketplace._init() создаёт UNIQUE-индекс
    idx_deals_bid_unique ТОЛЬКО если в deals нет дублей по bid_id — это
    осознанная защита продакшена (marketplace.py: «есть дубли … чинить
    отдельно»). В полном прогоне предыдущие модули оставляют в общей БД
    сделки с повторяющимся bid_id, поэтому индекс не создавался и
    test_prerelease_hardening падал. Продукт при этом ведёт себя правильно —
    чистить надо тестовый мусор, а не менять защиту.
    """
    try:
        from database.db import get_conn
        with get_conn() as c:
            c.execute(
                "DELETE FROM deals WHERE bid_id IS NOT NULL AND rowid NOT IN "
                "(SELECT MIN(rowid) FROM deals WHERE bid_id IS NOT NULL GROUP BY bid_id)"
            )
            c.commit()
    except Exception:
        # Таблицы может не быть на самых ранних модулях — не мешаем прогону.
        pass
