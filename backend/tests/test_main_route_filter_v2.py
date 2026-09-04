"""Main Route Filter V2 — server-side маршрутный фильтр (Task 3).

Покрывает матрицу §22 ТЗ для ГРУЗОВ и РЕЙСОВ одинаково:
  whole country → whole country | country → city | city → country |
  city → city | border → city, плюс коридоры CN→KZ / CN→RU / CN→DE / CN→NL.

Плюс:
  §15 фильтрация выполняется в SQL (проверяем, что ответ уже отфильтрован,
      а не «прислали всё, отфильтруем на телефоне»);
  §17 пагинация не смешивает страницы и не теряет записи;
  §21 сервер отклоняет country/location из разных стран;
  §16 маршрутный фильтр пересекается с cargo_type/truck_type.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_route_filter.db")
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

from api.marketplace import mp_router                              # noqa: E402
from services import geo_catalog                                   # noqa: E402

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

OWNER = "route-filter-owner"
MARKET = "/api/v1/market"


def _as(uid=OWNER):
    _current_user.set({
        "id": uid, "full_name": "Route Owner", "phone": "+700",
        "verification_level": 1,
    })


def _mk_cargo(origin, destination, cargo_type="tent", desc="Route probe"):
    """origin/destination = (country_id, location_id | None)."""
    oc, ol = origin
    dc, dl = destination
    body = {
        "from_city": geo_catalog.localized_name(geo_catalog.get_location(ol)) if ol
                     else geo_catalog.localized_name(geo_catalog.get_country(oc)),
        "to_city": geo_catalog.localized_name(geo_catalog.get_location(dl)) if dl
                   else geo_catalog.localized_name(geo_catalog.get_country(dc)),
        "cargo_desc": desc, "cargo_type": cargo_type,
        "price": 100000, "currency": "USD",
        "weight_tons": 20, "volume_m3": 86,
        "from_country": oc, "to_country": dc,
        "from_point_name": geo_catalog.localized_name(geo_catalog.get_location(ol)) if ol else None,
        "to_point_name": geo_catalog.localized_name(geo_catalog.get_location(dl)) if dl else None,
    }
    _as()
    r = client.post(f"{MARKET}/cargos", json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _mk_trip(origin, destination, truck_type="tent"):
    oc, ol = origin
    dc, dl = destination
    body = {
        "from_city": geo_catalog.localized_name(geo_catalog.get_location(ol)) if ol
                     else geo_catalog.localized_name(geo_catalog.get_country(oc)),
        "to_city": geo_catalog.localized_name(geo_catalog.get_location(dl)) if dl
                   else geo_catalog.localized_name(geo_catalog.get_country(dc)),
        "truck_type": truck_type, "capacity_tons": 20, "available_m3": 86,
        "price": 90000, "currency": "USD",
        "from_country": oc, "to_country": dc,
        "from_point_name": geo_catalog.localized_name(geo_catalog.get_location(ol)) if ol else None,
        "to_point_name": geo_catalog.localized_name(geo_catalog.get_location(dl)) if dl else None,
    }
    _as()
    r = client.post(f"{MARKET}/trips", json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _cargos(**params):
    r = client.get(f"{MARKET}/cargos", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _trips(**params):
    r = client.get(f"{MARKET}/trips", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ── фикстурные маршруты, создаются один раз ────────────────────────────────
YIWU = ("CN", "cn-yiwu")
CN_ANY = ("CN", None)
ALMATY = ("KZ", "kz-almaty")
KZ_ANY = ("KZ", None)
MOSCOW = ("RU", "ru-moscow")
BERLIN = ("DE", "de-berlin")
ROTTERDAM = ("NL", "nl-rotterdam")
NUR_ZHOLY = ("KZ", "kz-nur-zholy")

IDS = {}


def _seed():
    if IDS:
        return
    IDS["cargo_cn_kz"] = _mk_cargo(CN_ANY, KZ_ANY)            # whole → whole
    IDS["cargo_cn_almaty"] = _mk_cargo(CN_ANY, ALMATY)        # country → city
    IDS["cargo_yiwu_kz"] = _mk_cargo(YIWU, KZ_ANY)            # city → country
    IDS["cargo_yiwu_almaty"] = _mk_cargo(YIWU, ALMATY)        # city → city
    IDS["cargo_border_almaty"] = _mk_cargo(NUR_ZHOLY, ALMATY)  # border → city
    IDS["cargo_yiwu_moscow"] = _mk_cargo(YIWU, MOSCOW)        # CN → RU
    IDS["cargo_yiwu_berlin"] = _mk_cargo(YIWU, BERLIN)        # CN → DE
    IDS["cargo_yiwu_rotterdam"] = _mk_cargo(YIWU, ROTTERDAM)  # CN → NL
    IDS["cargo_yiwu_almaty_ref"] = _mk_cargo(YIWU, ALMATY, cargo_type="ref")
    IDS["trip_cn_kz"] = _mk_trip(CN_ANY, KZ_ANY)
    IDS["trip_cn_almaty"] = _mk_trip(CN_ANY, ALMATY)
    IDS["trip_yiwu_kz"] = _mk_trip(YIWU, KZ_ANY)
    IDS["trip_yiwu_almaty"] = _mk_trip(YIWU, ALMATY)
    IDS["trip_border_almaty"] = _mk_trip(NUR_ZHOLY, ALMATY)
    IDS["trip_yiwu_moscow"] = _mk_trip(YIWU, MOSCOW)
    IDS["trip_yiwu_berlin"] = _mk_trip(YIWU, BERLIN)
    IDS["trip_yiwu_rotterdam"] = _mk_trip(YIWU, ROTTERDAM)
    IDS["trip_yiwu_almaty_ref"] = _mk_trip(YIWU, ALMATY, truck_type="ref")


# ══════════════════════ location_id пишется при создании ══════════════════

def test_location_ids_persisted_on_create():
    """Без записанного location_id фильтр по городу сравнивал бы текст."""
    _seed()
    got = _cargos(origin_country_id="CN", origin_location_id="cn-yiwu", limit=100)
    assert got["cargos"], "город отгрузки не нашёлся по location_id"
    for row in got["cargos"]:
        assert row["from_location_id"] == "cn-yiwu", row


# ══════════════════════ §22 матрица: LOADS ════════════════════════════════

def test_loads_whole_country_to_whole_country():
    _seed()
    got = _cargos(origin_country_id="CN", destination_country_id="KZ", limit=100)
    ids = {c["id"] for c in got["cargos"]}
    # WHOLE COUNTRY scope включает и «весь Китай», и конкретные точки внутри.
    assert IDS["cargo_cn_kz"] in ids
    assert IDS["cargo_yiwu_almaty"] in ids
    # cargo_border_almaty — это KZ→KZ (КПП Нур Жолы → Алматы), в scope
    # «Весь Китай → Весь Казахстан» он попадать НЕ должен: страна отгрузки
    # другая. Его проверяет test_loads_border_crossing_to_city.
    assert IDS["cargo_border_almaty"] not in ids
    # И НЕ включает другие страны назначения.
    assert IDS["cargo_yiwu_berlin"] not in ids
    assert IDS["cargo_yiwu_moscow"] not in ids


def test_loads_country_to_city():
    _seed()
    ids = {c["id"] for c in _cargos(
        origin_country_id="CN", destination_country_id="KZ",
        destination_location_id="kz-almaty", limit=100)["cargos"]}
    assert IDS["cargo_cn_almaty"] in ids
    assert IDS["cargo_yiwu_almaty"] in ids
    # «Весь Казахстан» без города НЕ должен попадать в фильтр по Алматы.
    assert IDS["cargo_cn_kz"] not in ids
    assert IDS["cargo_yiwu_kz"] not in ids


def test_loads_city_to_country():
    _seed()
    ids = {c["id"] for c in _cargos(
        origin_country_id="CN", origin_location_id="cn-yiwu",
        destination_country_id="KZ", limit=100)["cargos"]}
    assert IDS["cargo_yiwu_kz"] in ids
    assert IDS["cargo_yiwu_almaty"] in ids
    assert IDS["cargo_cn_kz"] not in ids


def test_loads_city_to_city():
    _seed()
    ids = {c["id"] for c in _cargos(
        origin_country_id="CN", origin_location_id="cn-yiwu",
        destination_country_id="KZ", destination_location_id="kz-almaty",
        limit=100)["cargos"]}
    assert IDS["cargo_yiwu_almaty"] in ids
    assert IDS["cargo_yiwu_kz"] not in ids
    assert IDS["cargo_cn_almaty"] not in ids


def test_loads_border_crossing_to_city():
    """§9: КПП — отдельный тип точки, а не город с тем же именем."""
    _seed()
    ids = {c["id"] for c in _cargos(
        origin_country_id="KZ", origin_location_id="kz-nur-zholy",
        destination_country_id="KZ", destination_location_id="kz-almaty",
        limit=100)["cargos"]}
    assert ids == {IDS["cargo_border_almaty"]}, ids


def test_loads_international_corridors():
    _seed()
    for dest_country, dest_loc, expected in [
        ("KZ", "kz-almaty", "cargo_yiwu_almaty"),
        ("RU", "ru-moscow", "cargo_yiwu_moscow"),
        ("DE", "de-berlin", "cargo_yiwu_berlin"),
        ("NL", "nl-rotterdam", "cargo_yiwu_rotterdam"),
    ]:
        ids = {c["id"] for c in _cargos(
            origin_country_id="CN", origin_location_id="cn-yiwu",
            destination_country_id=dest_country,
            destination_location_id=dest_loc, limit=100)["cargos"]}
        assert IDS[expected] in ids, (dest_country, dest_loc, ids)
        assert len(ids) >= 1


# ══════════════════════ §22 матрица: TRUCKS ═══════════════════════════════

def test_trucks_whole_country_to_whole_country():
    _seed()
    ids = {t["id"] for t in _trips(
        origin_country_id="CN", destination_country_id="KZ", limit=100)["trips"]}
    assert IDS["trip_cn_kz"] in ids
    assert IDS["trip_yiwu_almaty"] in ids
    assert IDS["trip_yiwu_berlin"] not in ids


def test_trucks_country_to_city():
    _seed()
    ids = {t["id"] for t in _trips(
        origin_country_id="CN", destination_country_id="KZ",
        destination_location_id="kz-almaty", limit=100)["trips"]}
    assert IDS["trip_cn_almaty"] in ids
    assert IDS["trip_yiwu_almaty"] in ids
    assert IDS["trip_cn_kz"] not in ids


def test_trucks_city_to_country():
    _seed()
    ids = {t["id"] for t in _trips(
        origin_country_id="CN", origin_location_id="cn-yiwu",
        destination_country_id="KZ", limit=100)["trips"]}
    assert IDS["trip_yiwu_kz"] in ids
    assert IDS["trip_cn_kz"] not in ids


def test_trucks_city_to_city():
    _seed()
    ids = {t["id"] for t in _trips(
        origin_country_id="CN", origin_location_id="cn-yiwu",
        destination_country_id="KZ", destination_location_id="kz-almaty",
        limit=100)["trips"]}
    assert IDS["trip_yiwu_almaty"] in ids
    assert IDS["trip_yiwu_kz"] not in ids


def test_trucks_border_crossing_to_city():
    _seed()
    ids = {t["id"] for t in _trips(
        origin_country_id="KZ", origin_location_id="kz-nur-zholy",
        destination_country_id="KZ", destination_location_id="kz-almaty",
        limit=100)["trips"]}
    assert ids == {IDS["trip_border_almaty"]}, ids


def test_trucks_international_corridors():
    _seed()
    for dest_country, dest_loc, expected in [
        ("KZ", "kz-almaty", "trip_yiwu_almaty"),
        ("RU", "ru-moscow", "trip_yiwu_moscow"),
        ("DE", "de-berlin", "trip_yiwu_berlin"),
        ("NL", "nl-rotterdam", "trip_yiwu_rotterdam"),
    ]:
        ids = {t["id"] for t in _trips(
            origin_country_id="CN", origin_location_id="cn-yiwu",
            destination_country_id=dest_country,
            destination_location_id=dest_loc, limit=100)["trips"]}
        assert IDS[expected] in ids, (dest_country, dest_loc, ids)


# ══════════════════════ §16 композиция фильтров ═══════════════════════════

def test_route_filter_intersects_with_body_type():
    """«Иу → Алматы → Тент» — пересечение, а не объединение."""
    _seed()
    base = dict(origin_country_id="CN", origin_location_id="cn-yiwu",
                destination_country_id="KZ", destination_location_id="kz-almaty",
                limit=100)
    tent = {c["id"] for c in _cargos(**base, cargo_type="tent")["cargos"]}
    ref = {c["id"] for c in _cargos(**base, cargo_type="ref")["cargos"]}
    assert IDS["cargo_yiwu_almaty"] in tent
    assert IDS["cargo_yiwu_almaty_ref"] not in tent
    assert IDS["cargo_yiwu_almaty_ref"] in ref
    assert IDS["cargo_yiwu_almaty"] not in ref
    assert not (tent & ref)

    t_tent = {t["id"] for t in _trips(**base, truck_type="tent")["trips"]}
    t_ref = {t["id"] for t in _trips(**base, truck_type="ref")["trips"]}
    assert IDS["trip_yiwu_almaty"] in t_tent
    assert IDS["trip_yiwu_almaty_ref"] in t_ref
    assert not (t_tent & t_ref)


# ══════════════════════ §21 валидация ════════════════════════════════════

def test_location_must_belong_to_country():
    """country=Germany + city=Almaty нельзя принять молча."""
    r = client.get(f"{MARKET}/cargos", params={
        "origin_country_id": "DE", "origin_location_id": "kz-almaty"})
    assert r.status_code == 400, r.text
    assert "kz-almaty" in r.text

    r = client.get(f"{MARKET}/trips", params={
        "destination_country_id": "DE", "destination_location_id": "kz-almaty"})
    assert r.status_code == 400, r.text


def test_unknown_country_and_location_rejected():
    for params in (
        {"origin_country_id": "XX"},
        {"origin_country_id": "CN", "origin_location_id": "cn-nowhere"},
        {"origin_location_id": "cn-yiwu"},          # локация без страны
    ):
        r = client.get(f"{MARKET}/cargos", params=params)
        assert r.status_code == 400, (params, r.status_code, r.text)


def test_whole_country_scope_is_not_a_fake_city():
    """§4: «Весь Китай» = country задан, location пуст. Валидно и не 400."""
    r = client.get(f"{MARKET}/cargos", params={"origin_country_id": "CN"})
    assert r.status_code == 200, r.text
    assert geo_catalog.validate_scope("CN", None) == ("CN", None)
    assert geo_catalog.get_location("cn-whole") is None, (
        "whole-country scope не должен существовать как локация каталога")


# ══════════════════════ §15 / §17 сервер-сайд и пагинация ═════════════════

def test_filtering_happens_server_side():
    """Ответ обязан быть УЖЕ отфильтрован: клиент не получает чужие страны."""
    _seed()
    got = _cargos(origin_country_id="CN", origin_location_id="cn-yiwu",
                  destination_country_id="DE", limit=100)
    assert got["cargos"], "коридор CN→DE пуст"
    for row in got["cargos"]:
        assert row["from_location_id"] == "cn-yiwu", row
        assert (row["to_country"] or "").upper() == "DE", row


def test_pagination_does_not_lose_or_duplicate_rows():
    """§17: страницы не смешиваются и не теряют записи."""
    _seed()
    for _ in range(25):
        _mk_cargo(YIWU, ALMATY, desc="Pagination probe")
    scope = dict(origin_country_id="CN", origin_location_id="cn-yiwu",
                 destination_country_id="KZ", destination_location_id="kz-almaty")

    seen, offset, pages = [], 0, 0
    while pages < 20:
        page = _cargos(**scope, limit=5, offset=offset)
        seen.extend(c["id"] for c in page["cargos"])
        pages += 1
        if not page["has_more"]:
            break
        # next_offset считает СЕРВЕР — клиент не выводит его как offset+limit.
        assert page["next_offset"] > offset, page["next_offset"]
        offset = page["next_offset"]

    assert len(seen) == len(set(seen)), "страницы дублируют записи"
    full = _cargos(**scope, limit=100)["cargos"]
    assert set(seen) == {c["id"] for c in full}, (
        f"постранично {len(set(seen))}, разом {len(full)} — записи теряются")


def test_total_matching_is_reported_honestly():
    """Раньше total = len(result) — «найдено N» врало на каждой странице."""
    _seed()
    page = _cargos(origin_country_id="CN", origin_location_id="cn-yiwu",
                   destination_country_id="KZ",
                   destination_location_id="kz-almaty", limit=3)
    assert len(page["cargos"]) <= 3
    assert page["total"] == len(page["cargos"])
    assert page["total_matching"] >= len(page["cargos"])
    assert page["has_more"] is True


def test_limit_is_clamped():
    """Клиент не должен уметь попросить 10 000 записей одним запросом."""
    _seed()
    page = _cargos(origin_country_id="CN", limit=100000)
    assert len(page["cargos"]) <= 100
