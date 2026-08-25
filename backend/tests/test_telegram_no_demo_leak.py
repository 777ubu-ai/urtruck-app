"""#289: telegram_parser.run() в DEMO-режиме НЕ пишет фейковые записи в БД.

До фикса: scheduler каждые 6ч вызывал run_demo_parse() → 9 demo-сообщений
писались в telegram_mentions + 3 из них авто-blacklist'ились через
process_message(). Фиксируем: DEMO-режим без SEED_DEMO_BLACKLIST не трогает БД.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_tg.db python -m pytest tests/test_telegram_no_demo_leak.py -v
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_tg.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()


def _mention_count():
    from database.db import get_conn
    with get_conn() as c:
        try:
            return c.execute("SELECT COUNT(*) AS n FROM telegram_mentions").fetchone()["n"]
        except Exception:
            return 0


def _blacklist_count():
    from database.db import get_conn
    with get_conn() as c:
        try:
            return c.execute("SELECT COUNT(*) AS n FROM blacklist").fetchone()["n"]
        except Exception:
            return 0


def test_demo_mode_without_seed_flag_writes_nothing():
    """DEMO-режим без SEED_DEMO_BLACKLIST=true → 0 записей в БД."""
    os.environ.pop("SEED_DEMO_BLACKLIST", None)
    # Убеждаемся что мы в demo mode
    import config
    # Без TG_API_ID/HASH → TELEGRAM_DEMO_MODE=True
    orig_id = os.environ.pop("TG_API_ID", None)
    orig_hash = os.environ.pop("TG_API_HASH", None)
    try:
        # Перезагрузить config чтобы TELEGRAM_DEMO_MODE обновился
        import importlib
        importlib.reload(config)
        assert config.TELEGRAM_DEMO_MODE, "Должен быть DEMO_MODE без credentials"

        before_mentions = _mention_count()
        before_bl = _blacklist_count()

        from parsers import telegram_parser
        importlib.reload(telegram_parser)
        result = telegram_parser.run()

        assert result == 0, f"run() в DEMO без SEED_DEMO должен вернуть 0, вернул {result}"
        assert _mention_count() == before_mentions, "telegram_mentions изменились"
        assert _blacklist_count() == before_bl, "blacklist изменился"
    finally:
        if orig_id:
            os.environ["TG_API_ID"] = orig_id
        if orig_hash:
            os.environ["TG_API_HASH"] = orig_hash


def test_demo_mode_with_seed_flag_processes_messages():
    """DEMO-режим с SEED_DEMO_BLACKLIST=true → обрабатывает demo-сообщения."""
    os.environ["SEED_DEMO_BLACKLIST"] = "true"
    os.environ.pop("TG_API_ID", None)
    os.environ.pop("TG_API_HASH", None)
    try:
        import config
        import importlib
        importlib.reload(config)
        assert config.TELEGRAM_DEMO_MODE

        from parsers import telegram_parser
        importlib.reload(telegram_parser)
        result = telegram_parser.run()

        assert result > 0, f"С SEED_DEMO_BLACKLIST должны обработать demo-сообщения"
    finally:
        os.environ.pop("SEED_DEMO_BLACKLIST", None)


def test_demo_phones_not_in_production_blacklist_by_default():
    """Фейковые телефоны из DEMO_MESSAGES не должны быть в blacklist без флага."""
    os.environ.pop("SEED_DEMO_BLACKLIST", None)
    from parsers.telegram_parser import DEMO_MESSAGES
    from database.db import get_conn

    # Очищаем blacklist
    with get_conn() as c:
        c.execute("DELETE FROM blacklist")

    # Запускаем приложение как в проде (без SEED_DEMO)
    from blacklist.manager import seed_demo_blacklist
    seed_demo_blacklist()

    # Проверяем что фейковые телефоны не попали
    demo_phones = ["+79991234567", "+77771112233", "+77772223344"]
    with get_conn() as c:
        for phone in demo_phones:
            row = c.execute(
                "SELECT 1 FROM blacklist WHERE phone = ?", (phone,)
            ).fetchone()
            assert row is None, f"Фейковый телефон {phone} попал в blacklist без SEED_DEMO"
