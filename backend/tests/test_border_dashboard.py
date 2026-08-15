"""Border dashboard: real CGR data only, no fake numbers.

The shared pytest harness seeds the real legacy checkpoint catalogue before each
module. These tests therefore assert the facts introduced by this module (fresh,
very busy, stale/no-data) without assuming an artificial total number of country
crossings.
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
    cgr_dal.insert_scoreboard_entry("t_stale", "IN", 1, None)
    _make_stale("t_stale")


def test_best_picks_freshest_lowest_and_excludes_stale_nodata():
    setup_data()
    r = client.get("/api/v1/borders/best", params={"country": "CN"})
    assert r.status_code == 200, r.text
    best = r.json()["best"]
    assert best is not None
    assert best["code"] == "t_free", best
    assert best["load_status"] == "free"
    assert best["trucks_in_queue"] == 5
    assert best["source_type"] == "official"


def test_best_excludes_stale_even_if_smallest_queue():
    r = client.get("/api/v1/borders/best", params={"country": "RU"})
    assert r.status_code == 200, r.text
    assert r.json()["best"] is None, "stale/unavailable rows must not produce a best crossing"


def test_countries_aggregate_honest():
    r = client.get("/api/v1/borders/countries")
    assert r.status_code == 200, r.text
    by = {c["country"]: c for c in r.json()["countries"]}
    assert "CN" in by and "RU" in by

    cn = by["CN"]
    # Shared harness may seed additional real catalogue checkpoints. We only
    # require our three test checkpoints to be included and classified honestly.
    assert cn["crossings"] >= 3, cn
    assert cn["free"] >= 1, cn
    assert cn["very_busy"] >= 1, cn
    assert cn["no_data"] >= 1, cn

    ru = by["RU"]
    # t_stale has queue=1 but is 3h old; it may not inflate the free bucket.
    assert ru["no_data"] >= 1, ru


def test_best_no_data_returns_null_not_fake():
    r = client.get("/api/v1/borders/best", params={"country": "UZ"})
    assert r.status_code == 200, r.text
    assert r.json()["best"] is None


def test_legacy_list_does_not_expose_stale_queue_as_live():
    r = client.get("/api/v1/borders", params={"country": "RU"})
    assert r.status_code == 200, r.text
    row = next(item for item in r.json()["borders"] if item["id"] == "t_stale")
    assert row["freshness"] == "stale"
    assert row["trucks_in_queue"] is None
    assert row["updated_at"] is not None
    assert row["source_type"] == "official"


if __name__ == "__main__":
    setup_data()
    tests = [
        test_best_picks_freshest_lowest_and_excludes_stale_nodata,
        test_best_excludes_stale_even_if_smallest_queue,
        test_countries_aggregate_honest,
        test_best_no_data_returns_null_not_fake,
        test_legacy_list_does_not_expose_stale_queue_as_live,
    ]
    fails = 0
    for fn in tests:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
