# -*- coding: utf-8 -*-
"""P1-B (аудит 2026-09-05): backfill location_id реально запускается и после
него легаси-объявление находится маршрутным фильтром.

Легаси-строка = как в реальной БД до Task 3: маршрут свободным текстом,
страна в lowercase, location_id = NULL. Раньше backfill-скрипт существовал,
но никем не вызывался — такие объявления навсегда выпадали из фильтра по
городу. Теперь main.py startup() вызывает backfill() после init-схем.
"""
import contextvars
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_backfill_startup.db")
if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from api import verification_gate                                  # noqa: E402

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min):
    from fastapi import HTTPException

    def dep():
        user = _current_user.get()
        if not user:
            raise HTTPException(status_code=401, detail="No test user")
        return user

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI                                        # noqa: E402
from fastapi.testclient import TestClient                          # noqa: E402
from database import db as ddb                                     # noqa: E402

ddb.init_db()

from api import marketplace as mp                                  # noqa: E402
from api.marketplace import mp_router                              # noqa: E402
from backfill_location_ids import backfill                         # noqa: E402
from database.db import get_conn                                   # noqa: E402

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)
MARKET = "/api/v1/market"


def _insert_legacy_cargo() -> str:
    """Сырой INSERT в обход API — так выглядит строка, созданная ДО Task 3:
    свободный текст, страна lowercase, location_id отсутствует."""
    cid = f"legacy-{uuid.uuid4().hex[:10]}"
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, currency, status, "
            "from_country, to_country, from_point_name, to_point_name, "
            "from_location_id, to_location_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', "
            "?, ?, NULL, NULL, NULL, NULL)",
            (cid, "legacy-owner", "Legacy Owner",
             "Алматы, 🇰🇿", "Москва",
             "Legacy backfill probe", "tent", 500000, "KZT",
             "kz", "ru"))
        c.commit()
    return cid


def test_dry_run_counts_without_writing():
    cid = _insert_legacy_cargo()
    stats = backfill(dry_run=True)
    assert stats["dry_run"] is True
    assert stats["cargos"]["scanned"] >= 1
    assert stats["cargos"]["updated"] >= 1  # would-update
    with get_conn() as c:
        row = dict(c.execute(
            "SELECT from_location_id FROM cargos WHERE id = ?", (cid,)).fetchone())
    assert row["from_location_id"] is None, "dry-run не должен писать в БД"


def test_legacy_row_found_by_city_filter_after_startup_backfill():
    cid = _insert_legacy_cargo()
    # «Старт» backend'а: init-схемы (idempotent-миграции marketplace —
    # UPPER(from_country), published_at) и затем backfill(), ровно в том
    # порядке, что в main.py startup().
    mp._init()
    stats = backfill()
    assert stats["cargos"]["updated"] >= 1, stats

    with get_conn() as c:
        row = dict(c.execute(
            "SELECT from_country, from_location_id, to_location_id "
            "FROM cargos WHERE id = ?", (cid,)).fetchone())
    assert row["from_location_id"] == "kz-almaty", row
    assert row["to_location_id"] == "ru-moscow", row

    got = client.get(f"{MARKET}/cargos", params={
        "origin_country_id": "KZ", "origin_location_id": "kz-almaty",
        "limit": 100,
    })
    assert got.status_code == 200, got.text
    ids = {r["id"] for r in got.json()["cargos"]}
    assert cid in ids, "легаси-объявление обязано находиться фильтром по городу"


def test_backfill_is_idempotent():
    backfill()
    again = backfill()
    # Второй прогон не находит новых кандидатов на обновление среди уже
    # заполненных строк (unresolved могут оставаться — они и должны).
    assert again["cargos"]["updated"] == 0, again
    assert again["trips"]["updated"] == 0, again
