# -*- coding: utf-8 -*-
"""P0-A (аудит 2026-09-05): деградация маркетплейса при НЕДОСТУПНОМ geo-каталоге.

Прод-инцидент-класс: деплой копирует только backend/*, и если каталог не
доехал (нет backend/data/geo-catalog.json, нет ../shared), ленивый импорт
делал health зелёным, а первый create_cargo/фильтр — 500.

Контракт после фикса:
  * create_cargo / create_trip РАБОТАЮТ в деградации: легаси-значения,
    location_id = NULL (как до Task 3) — сделки не теряются;
  * нефильтрованная лента работает (каталог не читается);
  * маршрутный фильтр отдаёт честную 503 (не пустую ленту, не 500).
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_geo_degrade.db")
if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

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

import pytest                                                      # noqa: E402
from api import marketplace as mp                                  # noqa: E402
from api.marketplace import mp_router                              # noqa: E402
from database.db import get_conn                                   # noqa: E402
from services import geo_catalog                                   # noqa: E402

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

MARKET = "/api/v1/market"


def _as(uid="degrade-owner"):
    _current_user.set({
        "id": uid, "full_name": "Degrade Owner", "phone": "+702",
        "verification_level": 1,
    })


def _clear_caches():
    for fn in (geo_catalog._raw, geo_catalog._countries, geo_catalog._locations,
               geo_catalog._alias_index, geo_catalog._global_alias_index):
        fn.cache_clear()


@pytest.fixture
def catalog_missing(monkeypatch):
    """Симуляция «каталог не доехал в прод»: _catalog_path кидает
    FileNotFoundError, все lru-кэши сброшены до и после."""
    _clear_caches()

    def _boom():
        raise FileNotFoundError("geo-catalog.json не найден (симуляция прод-раскладки)")

    monkeypatch.setattr(geo_catalog, "_catalog_path", _boom)
    monkeypatch.setattr(mp, "_CATALOG_WARNED", False)
    yield
    _clear_caches()


def _cargo_body(**extra):
    body = {
        "from_city": "Иу", "to_city": "Алматы",
        "cargo_desc": "Degradation probe", "cargo_type": "tent",
        "weight_tons": 20, "volume_m3": 86,
        "price": 100000, "currency": "USD",
        "from_country": "CN", "to_country": "KZ",
        "from_point_name": "Иу", "to_point_name": "Алматы",
    }
    body.update(extra)
    return body


def test_create_cargo_degrades_instead_of_500(catalog_missing):
    _as()
    r = client.post(f"{MARKET}/cargos", json=_cargo_body())
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    with get_conn() as c:
        row = dict(c.execute(
            "SELECT from_country, from_location_id, to_location_id "
            "FROM cargos WHERE id = ?", (cid,)).fetchone())
    # Легаси-поведение: страна сохранена как прислал клиент, location_id NULL.
    assert row["from_country"] == "CN"
    assert row["from_location_id"] is None
    assert row["to_location_id"] is None


def test_create_trip_degrades_instead_of_500(catalog_missing):
    _as()
    r = client.post(f"{MARKET}/trips", json={
        "from_city": "Иу", "to_city": "Алматы",
        "truck_type": "tent", "capacity_tons": 20, "available_m3": 86,
        "price": 90000, "currency": "USD",
        "from_country": "CN", "to_country": "KZ",
        "from_point_name": "Иу", "to_point_name": "Алматы",
    })
    assert r.status_code == 200, r.text
    with get_conn() as c:
        row = dict(c.execute(
            "SELECT from_location_id FROM trips WHERE id = ?",
            (r.json()["id"],)).fetchone())
    assert row["from_location_id"] is None


def test_unfiltered_feed_still_works(catalog_missing):
    r = client.get(f"{MARKET}/cargos", params={"limit": 5})
    assert r.status_code == 200, r.text
    assert "cargos" in r.json()


def test_route_filter_returns_honest_503_not_empty_feed(catalog_missing):
    for params in (
        {"origin_country_id": "CN", "limit": 1},
        {"origin_country_id": "CN", "origin_location_id": "cn-yiwu", "limit": 1},
    ):
        r = client.get(f"{MARKET}/cargos", params=params)
        assert r.status_code == 503, (params, r.status_code, r.text)
        assert "справочник" in r.json()["detail"]
    r = client.get(f"{MARKET}/trips", params={"origin_country_id": "CN"})
    assert r.status_code == 503, r.text


def test_recovery_after_catalog_restored(catalog_missing, monkeypatch):
    """После восстановления каталога (следующий деплой) резолв снова работает
    без рестарта модулей — кэши в фикстуре сброшены."""
    monkeypatch.undo()  # снять _boom
    _clear_caches()
    _as()
    r = client.post(f"{MARKET}/cargos", json=_cargo_body())
    assert r.status_code == 200, r.text
    with get_conn() as c:
        row = dict(c.execute(
            "SELECT from_location_id FROM cargos WHERE id = ?",
            (r.json()["id"],)).fetchone())
    assert row["from_location_id"] == "cn-yiwu"
