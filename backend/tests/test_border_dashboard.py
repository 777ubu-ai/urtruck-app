"""Border-dashboard v1 (08.08.2026): /borders/best и /borders/countries
на РЕАЛЬНЫХ CGR-данных. Критично (ТЗ): никаких фейковых цифр — stale/no_data
исключаются из «лучшего перехода», агрегаты честные.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_border.db CGR_FEATURE_ENABLED=true CGR_IIN_SALT=x \
      python -m tests.test_border_dashboard
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_border.db")
os.environ.setdefault("CGR_FEATURE_ENABLED", "true")
os.environ.setdefault("CGR_IIN_SALT", "test-salt")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()
from database import cgr_dal
cgr_dal.init_cgr_schema()

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.borders import borders_router

app = FastAPI()
app.include_router(borders_router, prefix="/api/v1/borders")
client = TestClient(app)


def _make_stale(code):
    """Сдвигает fetched_at последней записи КПП в прошлое (>60 мин)."""
    from database.db import get_conn
    with get_conn() as c:
        c.execute(
            "UPDATE cgr_scoreboard SET fetched_at = datetime('now','-3 hours') "
            "WHERE checkpoint_code = ?", (code,))


def setup_data():
    cgr_dal.upsert_checkpoint("Тест Свободный", country_to="CN", code="t_free")
    cgr_dal.upsert_checkpoint("Тест Загруженный", country_to="CN", code="t_busy")
    cgr_dal.upsert_checkpoint("Тест Нет Данных", country_to="CN", code="t_nodata")
    cgr_dal.upsert_checkpoint("Тест Устаревший", country_to="RU", code="t_stale")
    cgr_dal.insert_scoreboard_entry("t_free", "IN", 5, None)
    cgr_dal.insert_scoreboard_entry("t_busy", "IN", 90, None)
    cgr_dal.insert_scoreboard_entry("t_stale", "IN", 1, None)  # маленькая, но устаревшая
    _make_stale("t_stale")
    # t_nodata — без scoreboard


def test_best_picks_freshest_lowest_and_excludes_stale_nodata():
    setup_data()
    r = client.get("/api/v1/borders/best", params={"country": "CN"})
    assert r.status_code == 200, r.text
    best = r.json()["best"]
    assert best is not None, "должен быть лучший переход по свежим данным"
    assert best["code"] == "t_free", best
    assert best["load_status"] == "free"
    assert best["trucks_in_queue"] == 5
    assert best["source_type"] == "official"


def test_best_excludes_stale_even_if_smallest_queue():
    """t_stale имеет очередь 1 (меньше t_free=5), но устаревшая → не должна
    победить и вообще попадать в кандидаты (страна RU, отдельно проверим)."""
    r = client.get("/api/v1/borders/best", params={"country": "RU"})
    assert r.status_code == 200, r.text
    assert r.json()["best"] is None, "stale-данные не должны давать 'лучший переход'"


def test_countries_aggregate_honest():
    r = client.get("/api/v1/borders/countries")
    assert r.status_code == 200, r.text
    by = {c["country"]: c for c in r.json()["countries"]}
    assert "CN" in by
    cn = by["CN"]
    assert cn["crossings"] == 3, cn
    assert cn["free"] >= 1, cn          # t_free
    assert cn["very_busy"] >= 1, cn     # t_busy (90)
    assert cn["no_data"] >= 1, cn       # t_nodata
    # RU: единственный КПП устаревший → не свободный, а no_data-бакет
    ru = by["RU"]
    assert ru["free"] == 0, ru
    assert ru["no_data"] >= 1, ru


def test_best_no_data_returns_null_not_fake():
    """Страна без единого свежего КПП → best=null (не выдумываем цифры)."""
    r = client.get("/api/v1/borders/best", params={"country": "UZ"})
    assert r.status_code == 200, r.text
    assert r.json()["best"] is None


if __name__ == "__main__":
    fails = 0
    for fn in [test_best_picks_freshest_lowest_and_excludes_stale_nodata,
               test_best_excludes_stale_even_if_smallest_queue,
               test_countries_aggregate_honest,
               test_best_no_data_returns_null_not_fake]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
