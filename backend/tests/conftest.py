"""QA harness fix для совместного прогона badge-desync тестов.

Проблема: test_unread_badge.py и test_deal_rooms.py каждый задаёт СВОЙ
DB_PATH через os.environ.setdefault(...) и делает unlink(DB_PATH) на уровне
модуля (во время коллекции pytest). При этом config.DB_PATH и api.chat._init()
— модульного уровня (читаются/выполняются ОДИН раз при первом импорте). При
совместном прогоне это рассинхронит схему → "no such table: chat_rooms"
(по отдельности оба файла зелёные).

Фикс (только тестовый харнесс, продакшен-код не трогаем):
1) Унифицируем DB_PATH ДО импорта тест-модулей (их setdefault станет no-op).
2) Session-autouse fixture пересоздаёт схему ПОСЛЕ коллекции (после
   module-level unlink'ов) — финальное состояние перед запуском тестов.
   chat._init() идемпотентен (chat_schema.sql = CREATE TABLE IF NOT EXISTS
   + guarded-миграция), поэтому повторный вызов безопасен.
"""
import os

# До любого импорта config/db/chat — единый DB_PATH на оба файла.
os.environ["DB_PATH"] = "/tmp/urtruck_tests_badge_suite.db"

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
    yield
