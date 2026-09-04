"""Canonical-resolve маршрутной точки при СОЗДАНИИ груза и рейса (Task 3, GAP 1).

Формы CreateCargoScreen / CreateTripScreen отправляют структурированную
тройку (from_country / from_point_type / from_point_name) ТОЛЬКО когда
пользователь выбрал точку из реестра. При свободном вводе клиент присылает
from_country = null и один from_city — и объявление получало
location_id = NULL, то есть не участвовало в маршрутном фильтре по городу.

Здесь проверяется, что backend приводит точку к каталогу ПЕРЕД записью, и
что созданная запись реально находится новым фильтром. Второй пикер для
этого не нужен — форма не меняется.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_route_create.db")
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
from database.db import get_conn                                   # noqa: E402
from services import geo_catalog                                   # noqa: E402

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

MARKET = "/api/v1/market"
OWNER = "create-norm-owner"


def _as(uid=OWNER):
    _current_user.set({
        "id": uid, "full_name": "Creator", "phone": "+701",
        "verification_level": 1,
    })


def _cargo_payload(from_city, to_city, **extra):
    """Ровно та форма, что отправляет CreateCargoScreen при СВОБОДНОМ вводе:
    from_city/to_city заполнены, структурированная тройка = null."""
    body = {
        "from_city": from_city,
        "to_city": to_city,
        "cargo_desc": "Normalization probe",
        "cargo_type": "tent",
        "weight_tons": 20,
        "volume_m3": 86,
        "price": 100000,
        "currency": "USD",
        "from_country": None, "from_point_type": None, "from_point_name": None,
        "to_country": None, "to_point_type": None, "to_point_name": None,
    }
    body.update(extra)
    return body


def _trip_payload(from_city, to_city, **extra):
    body = {
        "from_city": from_city,
        "to_city": to_city,
        "truck_type": "tent",
        "capacity_tons": 20,
        "available_m3": 86,
        "price": 90000,
        "currency": "USD",
        "from_country": None, "from_point_type": None, "from_point_name": None,
        "to_country": None, "to_point_type": None, "to_point_name": None,
    }
    body.update(extra)
    return body


def _create_cargo(**kw):
    _as()
    r = client.post(f"{MARKET}/cargos", json=_cargo_payload(**kw))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _create_trip(**kw):
    _as()
    r = client.post(f"{MARKET}/trips", json=_trip_payload(**kw))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _row(table, rid):
    with get_conn() as c:
        return dict(c.execute(
            f"SELECT from_country, from_location_id, from_point_type, "
            f"to_country, to_location_id, to_point_type, from_city, to_city "
            f"FROM {table} WHERE id = ?", (rid,)).fetchone())


# ══════════════════ CREATE CARGO: Иу → Алматы ══════════════════

def test_new_cargo_yiwu_to_almaty_is_canonically_resolved():
    cid = _create_cargo(from_city="Иу", to_city="Алматы")
    row = _row("cargos", cid)
    # Ни одно из четырёх полей маршрутного scope не NULL.
    assert row["from_country"] == "CN", row
    assert row["from_location_id"] == "cn-yiwu", row
    assert row["to_country"] == "KZ", row
    assert row["to_location_id"] == "kz-almaty", row
    # location_type тоже разрешён (в легаси-словаре колонки).
    assert row["from_point_type"] == "city", row
    assert row["to_point_type"] == "city", row
    # Текст пользователя не переписан.
    assert row["from_city"] == "Иу", row


def test_new_cargo_is_found_by_route_filter():
    """Главное доказательство: свежесозданный груз участвует в фильтре."""
    cid = _create_cargo(from_city="Иу", to_city="Алматы")
    r = client.get(f"{MARKET}/cargos", params={
        "origin_country_id": "CN", "origin_location_id": "cn-yiwu",
        "destination_country_id": "KZ", "destination_location_id": "kz-almaty",
        "limit": 100})
    assert r.status_code == 200, r.text
    assert cid in {c["id"] for c in r.json()["cargos"]}, "груз не найден фильтром"
    # И в scope «вся страна» тоже.
    r2 = client.get(f"{MARKET}/cargos", params={
        "origin_country_id": "CN", "destination_country_id": "KZ", "limit": 100})
    assert cid in {c["id"] for c in r2.json()["cargos"]}


# ══════════════════ CREATE TRIP: Алматы → Москва ══════════════════

def test_new_trip_almaty_to_moscow_is_canonically_resolved():
    tid = _create_trip(from_city="Алматы", to_city="Москва")
    row = _row("trips", tid)
    assert row["from_country"] == "KZ", row
    assert row["from_location_id"] == "kz-almaty", row
    assert row["to_country"] == "RU", row
    assert row["to_location_id"] == "ru-moscow", row
    assert row["from_point_type"] == "city", row


def test_new_trip_is_found_by_route_filter():
    tid = _create_trip(from_city="Алматы", to_city="Москва")
    r = client.get(f"{MARKET}/trips", params={
        "origin_country_id": "KZ", "origin_location_id": "kz-almaty",
        "destination_country_id": "RU", "destination_location_id": "ru-moscow",
        "limit": 100})
    assert r.status_code == 200, r.text
    assert tid in {t["id"] for t in r.json()["trips"]}, "рейс не найден фильтром"


# ══════════════════ alias / ZH / RU → один location_id ══════════════════

def test_ru_en_zh_and_legacy_alias_resolve_to_one_location_id():
    """«Иу», «Yiwu», «义乌», «Иу, 🇨🇳» — одна и та же локация."""
    ids = {}
    for label, text in [("ru", "Иу"), ("en", "Yiwu"), ("zh", "义乌"),
                        ("legacy", "Иу, 🇨🇳")]:
        cid = _create_cargo(from_city=text, to_city="Алматы")
        ids[label] = _row("cargos", cid)["from_location_id"]
    assert set(ids.values()) == {"cn-yiwu"}, ids

    kz = {}
    for label, text in [("ru", "Алматы"), ("en", "Almaty"),
                        ("zh", "阿拉木图"), ("legacy", "Алматы, 🇰🇿")]:
        cid = _create_cargo(from_city=text, to_city="Москва")
        kz[label] = _row("cargos", cid)["from_location_id"]
    assert set(kz.values()) == {"kz-almaty"}, kz


def test_alias_created_records_are_all_found_by_one_filter():
    """Все написания попадают в ОДИН фильтр — иначе локализация делит ленту."""
    created = [
        _create_cargo(from_city=text, to_city="Алматы")
        for text in ("Иу", "Yiwu", "义乌", "Иу, 🇨🇳")
    ]
    r = client.get(f"{MARKET}/cargos", params={
        "origin_country_id": "CN", "origin_location_id": "cn-yiwu",
        "destination_country_id": "KZ", "destination_location_id": "kz-almaty",
        "limit": 100})
    found = {c["id"] for c in r.json()["cargos"]}
    assert set(created) <= found, set(created) - found


# ══════════════════ безопасное поведение на неизвестном ══════════════════

def test_unknown_place_keeps_legacy_value_and_null_location():
    """Неизвестной точке НЕ присваивается неправильный ID."""
    cid = _create_cargo(from_city="Мухосранск-2", to_city="Алматы")
    row = _row("cargos", cid)
    assert row["from_location_id"] is None, row
    assert row["from_country"] is None, row
    # Легаси-значение сохранено как есть — данные не потеряны.
    assert row["from_city"] == "Мухосранск-2", row
    # И такой груз всё ещё создаётся и виден без маршрутного фильтра.
    r = client.get(f"{MARKET}/cargos", params={"limit": 100})
    assert cid in {c["id"] for c in r.json()["cargos"]}


def test_ambiguous_place_without_country_is_not_guessed():
    """«Хоргос» — город и в CN, и в KZ. Сторону границы угадывать нельзя."""
    assert geo_catalog.resolve_location_global("Хоргос") is None
    cid = _create_cargo(from_city="Хоргос", to_city="Алматы")
    row = _row("cargos", cid)
    assert row["from_location_id"] is None, row
    # Но с явной страной от формы-реестра — разрешается однозначно.
    cid_cn = _create_cargo(from_city="Хоргос", to_city="Алматы",
                           from_country="CN", from_point_name="Хоргос")
    assert _row("cargos", cid_cn)["from_location_id"] == "cn-horgos"
    cid_kz = _create_cargo(from_city="Хоргос", to_city="Алматы",
                           from_country="KZ", from_point_name="Хоргос")
    assert _row("cargos", cid_kz)["from_location_id"] == "kz-khorgos-kz"


def test_client_country_is_never_silently_overridden():
    """country=DE + city=Алматы: страну не переписываем, локацию не ставим."""
    cid = _create_cargo(from_city="Алматы", to_city="Москва",
                        from_country="DE", from_point_name="Алматы")
    row = _row("cargos", cid)
    assert row["from_country"] == "DE", row
    assert row["from_location_id"] is None, (
        "локация из чужой страны присвоена — груз молча уехал бы в другую страну")


def test_registry_picker_path_still_works():
    """Форма, выбравшая точку из реестра, работает как раньше."""
    cid = _create_cargo(
        from_city="Иу", to_city="Алматы",
        from_country="CN", from_point_type="city", from_point_name="Иу",
        to_country="KZ", to_point_type="city", to_point_name="Алматы")
    row = _row("cargos", cid)
    assert row["from_location_id"] == "cn-yiwu", row
    assert row["to_location_id"] == "kz-almaty", row


def test_border_crossing_point_type_is_resolved():
    """КПП определяется как BORDER_CROSSING, а не как город."""
    cid = _create_cargo(from_city="Нур Жолы", to_city="Алматы")
    row = _row("cargos", cid)
    assert row["from_location_id"] == "kz-nur-zholy", row
    assert row["from_point_type"] == "border", row
    loc = geo_catalog.get_location(row["from_location_id"])
    assert loc["type"] == geo_catalog.BORDER_CROSSING
