"""QA harness fix для совместного прогона тестового сюита.

Проблема: каждый тестовый файл задаёт СВОЙ DB_PATH через
os.environ.setdefault(...) и делает unlink(DB_PATH) на уровне модуля (во
время коллекции pytest). При этом config.DB_PATH и большинство _init()
(chat, marketplace, push, notifications) — модульного уровня (читаются/
выполняются ОДИН раз при первом импорте). При совместном прогоне это
рассинхронит схему → "no such table: chat_rooms"/"no such table: cargos"
(по отдельности каждый файл зелёный).

Фикс (только тестовый харнесс, продакшен-код не трогаем):
1) Унифицируем DB_PATH ДО импорта тест-модулей (их setdefault станет no-op).
2) Session-autouse fixture пересоздаёт схему ПОСЛЕ коллекции (после
   module-level unlink'ов) — финальное состояние перед запуском тестов.
   Каждый _init() идемпотентен (CREATE TABLE IF NOT EXISTS + guarded-
   миграции), поэтому повторный вызов безопасен.

Аудит (Блок 7/8, 05.08.2026): раньше фикстура вызывала db/registration/
chat/push _init(), но НЕ api.marketplace._init() — который создаёт
cargos/bids/deals/price_events. Это ломало ЛЮБОЙ совместный pytest-прогон
тестов, трогающих маркетплейс ("no such table: cargos"), даже если каждый
файл был зелёным по отдельности (`python -m tests.X`). Добавлены
marketplace._init(), notifications._init() и deal_room_schema.sql
(deal_events — нужен новым тестам status-FSM). Минимальный точечный фикс —
не рефакторинг всей test-инфраструктуры, только починка того, что реально
падало."""
import os

# До любого импорта config/db/chat — единый DB_PATH на оба файла.
os.environ["DB_PATH"] = "/tmp/urtruck_tests_badge_suite.db"
os.environ.setdefault("FILE_SIGNING_KEY", "test-file-signing-key-32-bytes-minimum")

from pathlib import Path
import pytest


@pytest.fixture(scope="session", autouse=True)
def _ensure_full_schema():
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
    from database import db as dbm
    from database import registration_dal
    dbm.init_db()
    registration_dal.init_registration_schema()
    import api.chat as chat
    chat._init()  # идемпотентно: chat_schema.sql + миграция + спец-юзеры → chat_rooms
    # send_message шлёт пуш получателю → push_sender читает push_subscriptions /
    # push_tokens_native. Без их схемы совместный прогон падал "no such table".
    import api.push as push_api
    push_api._init_schema()
    # Блок 7/8 (аудит 05.08.2026): без этого — "no such table: cargos" на
    # ЛЮБОМ совместном прогоне тестов, трогающих маркетплейс (P1-7 находка).
    import api.marketplace as marketplace
    marketplace._init()
    import api.notifications as notifications
    notifications._init()
    # deal_events (immutable-timeline) — отдельная схема, используется
    # новыми тестами status-FSM (Блок 3) и accept_bid/accept_counter.
    _deal_room_schema = Path(__file__).resolve().parent.parent / "database" / "schemas" / "deal_room_schema.sql"
    if _deal_room_schema.exists():
        from database.db import get_conn
        with get_conn() as c:
            c.executescript(_deal_room_schema.read_text(encoding="utf-8"))
    yield
