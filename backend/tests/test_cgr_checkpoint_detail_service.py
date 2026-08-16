import os
import sys
from datetime import date
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_cgr_lazy.db")
os.environ.setdefault("CGR_FEATURE_ENABLED", "true")
os.environ.setdefault("CGR_IIN_SALT", "test-lazy-cgr-salt")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import cgr_dal

ddb.init_db()
cgr_dal.init_cgr_schema()

from cgr.checkpoint_detail_service import _parse_booking_grid, _parse_capacity, catalog


DETAIL_HTML = """
<html><body>
<div class="card-body">
  <h4>Загруженность поста</h4>
  <div class="square-chart-container">
    <div class="square zag-level-1" title="Свободно на 17 авг&lt;br&gt;&lt;b&gt;за 1 МРП: 0&lt;br /&gt;за 100 МРП: 0&lt;/b&gt;"></div>
    <div class="square zag-level-6" title=" 18 авг&lt;br&gt;&lt;b&gt;Выходной день&lt;/b&gt;"></div>
    <div class="square zag-level-1" title="Свободно на 31 авг&lt;br&gt;&lt;b&gt;за 1 МРП: 0&lt;br /&gt;за 100 МРП: 0&lt;/b&gt;"></div>
    <div class="square zag-level-3" title="Свободно на 15 сен&lt;br&gt;&lt;b&gt;за 1 МРП: 48&lt;br /&gt;за 100 МРП: 0&lt;/b&gt;"></div>
    <div class="square zag-level-5" title="Свободно на 16 сен&lt;br&gt;&lt;b&gt;за 1 МРП: 201&lt;br /&gt;за 100 МРП: 3&lt;/b&gt;"></div>
  </div>
</div>
<div>Изменения лимитов C 01.08.2026 220 ТС/сутки</div>
</body></html>
"""


def test_booking_grid_finds_first_real_standard_slot():
    parsed = _parse_booking_grid(DETAIL_HTML, today=date(2026, 8, 16))
    assert parsed["nearest_standard"]["date"] == "2026-09-15"
    assert parsed["nearest_standard"]["standard_free"] == 48
    assert parsed["nearest_premium"]["date"] == "2026-09-16"
    assert parsed["nearest_premium"]["premium_free"] == 3
    aug31 = next(x for x in parsed["calendar"] if x["date"] == "2026-08-31")
    assert aug31["standard_free"] == 0


def test_capacity_uses_current_effective_limit():
    html = "C 01.07.2026 180 ТС/сутки C 01.08.2026 220 ТС/сутки C 01.10.2026 300 ТС/сутки"
    assert _parse_capacity(html, today=date(2026, 8, 16)) == 220


def test_catalog_is_local_db_only_shape():
    cgr_dal.upsert_checkpoint("Калжат - Дулаты", country_to="CN", code="kalzhat_dulaty")
    rows = catalog()
    found = next(x for x in rows if x["code"] == "kalzhat_dulaty")
    assert found == {
        "id": "kalzhat_dulaty",
        "code": "kalzhat_dulaty",
        "name": "Калжат - Дулаты",
        "country": "CN",
    }
