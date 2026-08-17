"""P0-9 (08.08.2026): запуск приложения / парсер Della не должен
автоматически заносить произвольные (scraped) телефоны в permanent blacklist.

Раньше della_parser.run_parse() на каждом старте вытаскивал слепым regex
любой телефон со страницы Della и db.blacklist_add()'ил его → блок живых
людей и обнуление скоринга. Тест фиксирует: run_parse() без явного
SEED_DEMO_BLACKLIST не добавляет НИ ОДНОЙ записи, и в модуле не осталось
авто-заноса результатов веб-скрейпинга.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_della.db python -m tests.test_della_no_autoblacklist
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_della.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()


def _blacklist_count():
    from database.db import get_conn
    with get_conn() as c:
        try:
            return c.execute("SELECT COUNT(*) AS n FROM blacklist").fetchone()["n"]
        except Exception:
            return 0


def test_run_parse_without_seed_adds_nothing():
    os.environ.pop("SEED_DEMO_BLACKLIST", None)
    before = _blacklist_count()
    from parsers import della_parser
    added = della_parser.run_parse()
    after = _blacklist_count()
    assert added == 0, f"run_parse() без SEED_DEMO_BLACKLIST должен добавить 0, добавил {added}"
    assert after == before, f"blacklist изменился: {before} -> {after}"


def test_run_parse_has_no_scrape_autoblock_code():
    """Статически убеждаемся, что авто-занос результата _search_della в
    blacklist_add удалён из run_parse (защита от регресса «вернули обратно»)."""
    src = (ROOT / "parsers" / "della_parser.py").read_text(encoding="utf-8")
    # run_parse не должен содержать вызова blacklist_add внутри real-search
    # блока. Грубая, но надёжная проверка: строки '_search_della("претензия'
    # + следующий за ним blacklist_add больше не сосуществуют.
    assert 'real = _search_della(' not in src, (
        "P0-9 регресс: авто-скрейп real=_search_della(...) вернулся в run_parse"
    )


def test_startup_does_not_call_della_parse():
    """main.py на старте не должен вызывать della_parse()."""
    src = (ROOT / "main.py").read_text(encoding="utf-8")
    # допускается упоминание в комментарии, но не активный вызов
    active_lines = [ln for ln in src.splitlines()
                    if "della_parse()" in ln and not ln.strip().startswith("#")]
    assert not active_lines, f"main.py всё ещё вызывает della_parse() на старте: {active_lines}"


if __name__ == "__main__":
    fails = 0
    for fn in [test_run_parse_without_seed_adds_nothing,
               test_run_parse_has_no_scrape_autoblock_code,
               test_startup_does_not_call_della_parse]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
