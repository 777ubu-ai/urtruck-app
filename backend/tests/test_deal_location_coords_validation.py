"""Финальный аудит §31 (2026-09-14): POST /deals/{id}/location принимал
координаты ВНЕ допустимого диапазона.

Root cause: `DealLocationIn` в api/marketplace.py объявлял `lat: float` /
`lng: float` без границ, в отличие от `RoutePoint` в api/routing.py, где
`Field(ge=-90, le=90)` / `Field(ge=-180, le=180)` стояли изначально.
Подтверждено реальным HTTP-прогоном: `{"lat": 0, "lng": 999}` → HTTP 200,
и `lng=999.0` оставался в `deal_locations`.

Почему это важно, а не косметика: эта точка отдаётся грузоотправителю через
GET /deals/{id}/location и рисуется на карте как есть — клиент диапазон
НЕ проверяет (RouteMap.js, DealWorkspaceScreenV2.js, TrackTruckScreen.js
читают `result.location` напрямую), а POST /routing/road-route такую точку
отвергает (422) — то есть полилиния/ETA молча ломались, а «последняя
позиция машины» как доказательство по сделке становилась мусором. Сервер —
единственное место, где это можно гарантировать для ЛЮБОГО клиента
(web / Expo Go / нативная сборка / фоновый location task).

Запуск из backend/:
    DB_PATH=/tmp/urtruck_test_deal_loc_coords.db python -m tests.test_deal_location_coords_validation
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_deal_loc_coords.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u
    return dep


from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database.db import get_conn, new_id

ddb.init_db()

_deal_room_schema = ROOT / "database" / "schemas" / "deal_room_schema.sql"
if _deal_room_schema.exists():
    with get_conn() as _c:
        _c.executescript(_deal_room_schema.read_text(encoding="utf-8"))

from api.marketplace import mp_router
from tests.auth_harness import override_require_level

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
override_require_level(app, fake_require_level(1))
client = TestClient(app)

SHIPPER = "test-shipper-loc-coords"
DRIVER = "test-driver-loc-coords"


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def seed_active_deal():
    """Сделка в in_progress с уже активным трекингом — единственное состояние,
    в котором POST /location вообще доходит до валидации тела."""
    cargo_id, bid_id, deal_id = new_id(), new_id(), new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, SHIPPER, "+700", "Owner", "Almaty", "Astana", "Coords cargo", "tent", 3000, 0, "taken"),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, bid_id, SHIPPER, DRIVER, "Almaty", "Astana", 3000, "in_progress"),
        )
    as_user(SHIPPER)
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 200
    as_user(DRIVER)
    assert client.post(
        f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"}
    ).status_code == 200
    return deal_id


def post_location(deal_id, body):
    as_user(DRIVER)
    return client.post(f"/api/v1/market/deals/{deal_id}/location", json=body)


def stored_point(deal_id):
    with get_conn() as c:
        row = c.execute("SELECT lat, lng FROM deal_locations WHERE deal_id = ?", (deal_id,)).fetchone()
    return (row["lat"], row["lng"]) if row else None


def test_valid_point_is_accepted_and_stored():
    d = seed_active_deal()
    r = post_location(d, {"lat": 43.238, "lng": 76.889})
    assert r.status_code == 200, r.text
    assert stored_point(d) == (43.238, 76.889)


def test_out_of_range_latitude_rejected():
    d = seed_active_deal()
    for bad_lat in (999, 90.5, -90.5, -1000):
        r = post_location(d, {"lat": bad_lat, "lng": 0})
        assert r.status_code == 422, f"lat={bad_lat} -> {r.status_code} {r.text}"
    assert stored_point(d) is None, "невалидная широта не должна попадать в deal_locations"


def test_out_of_range_longitude_rejected():
    d = seed_active_deal()
    for bad_lng in (999, 180.5, -180.5, -1000):
        r = post_location(d, {"lat": 0, "lng": bad_lng})
        assert r.status_code == 422, f"lng={bad_lng} -> {r.status_code} {r.text}"
    assert stored_point(d) is None, "невалидная долгота не должна попадать в deal_locations"


def test_boundary_values_still_allowed():
    """Границы включительно — ровно как у RoutePoint (ge/le, не gt/lt)."""
    d = seed_active_deal()
    for lat, lng in ((90, 180), (-90, -180), (0, 0)):
        r = post_location(d, {"lat": lat, "lng": lng})
        assert r.status_code == 200, f"({lat},{lng}) -> {r.status_code} {r.text}"


def test_bad_point_never_overwrites_last_good_point():
    """Регрессия самого опасного следствия: мусорная точка не должна затирать
    последнюю достоверную позицию машины (она — доказательство по сделке)."""
    d = seed_active_deal()
    assert post_location(d, {"lat": 43.238, "lng": 76.889}).status_code == 200
    assert post_location(d, {"lat": 0, "lng": 999}).status_code == 422
    assert stored_point(d) == (43.238, 76.889)


def test_non_numeric_coords_rejected():
    d = seed_active_deal()
    assert post_location(d, {"lat": "abc", "lng": 0}).status_code == 422
    assert post_location(d, {"lat": None, "lng": None}).status_code == 422
    assert post_location(d, {}).status_code == 422


def test_contract_matches_routing_routepoint():
    """Одно правило на весь бэкенд: границы deal-локации обязаны совпадать с
    RoutePoint из api/routing.py, иначе точка, принятая трекингом, окажется
    невалидной для road-route (и полилиния сломается молча)."""
    from api.marketplace import DealLocationIn
    from api.routing import RoutePoint

    for field in ("lat", "lng"):
        deal_meta = repr(DealLocationIn.model_fields[field].metadata)
        route_meta = repr(RoutePoint.model_fields[field].metadata)
        assert deal_meta == route_meta, f"{field}: deal={deal_meta} routing={route_meta}"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ✓ {fn.__name__}")
    print("ALL GREEN")
