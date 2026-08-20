"""Блок 3 аудита (P0-2): смена статуса сделки — раньше ЛЮБОЙ участник
(shipper ИЛИ driver) мог поставить любой разрешённый по FSM статус, включая
`in_progress`/`at_border`/`delivered` — то есть грузовладелец мог сам себе
подтвердить «Доставлено» без единого действия водителя. Теперь эти 4
перехода (accepted→in_progress, in_progress→at_border, in_progress→delivered,
at_border→delivered) разрешены ТОЛЬКО driver_id; `cancelled` — обеим сторонам
(продуктовое решение зафиксировано в комментарии у _DRIVER_ONLY_TRANSITIONS
в api/marketplace.py — сохраняем текущее поведение TripDetail.js).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_deal_fsm.db python -m tests.test_deal_status_actor_fsm
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_deal_fsm.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u
    return dep


verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database.db import get_conn

ddb.init_db()

# deal_events (immutable-timeline) живёт в отдельной схеме — без неё
# deal_room_dal.create_deal_event молча падает внутри try/except в
# update_deal_status, и mid_transit_cancel/request_id было бы нечем
# проверить.
_deal_room_schema = ROOT / "database" / "schemas" / "deal_room_schema.sql"
if _deal_room_schema.exists():
    from database.db import get_conn as _get_conn_for_setup
    with _get_conn_for_setup() as _c:
        _c.executescript(_deal_room_schema.read_text(encoding="utf-8"))

from api.marketplace import mp_router  # _init() создаёт cargos/bids/deals

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

SHIPPER = "test-shipper-fsm"
DRIVER = "test-driver-fsm"
STRANGER = "test-stranger-fsm"


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def seed_deal(status="accepted", from_country=None, to_country=None, amount=3000):
    from database.db import get_conn, new_id
    cargo_id, bid_id, deal_id = new_id(), new_id(), new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status, from_country, to_country) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, SHIPPER, "+700", "Owner", "Almaty", "Astana",
             "Test cargo", "tent", amount, 0, "taken", from_country, to_country),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, bid_id, SHIPPER, DRIVER, "Almaty", "Astana", amount, status),
        )
    return deal_id


def patch_status(deal_id, new_status, actor):
    as_user(actor)
    return client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": new_status})


def deal_status(deal_id):
    from database.db import get_conn
    with get_conn() as c:
        return c.execute("SELECT status FROM deals WHERE id = ?", (deal_id,)).fetchone()["status"]


def approve_tracking(deal_id):
    """Create the required shipper request + explicit driver consent."""
    as_user(SHIPPER)
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 200
    as_user(DRIVER)
    response = client.post(f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"})
    assert response.status_code == 200, response.text


# ───────────────────────── роль ─────────────────────────

def test_shipper_cannot_start_trip():
    d = seed_deal("accepted")
    r = patch_status(d, "in_progress", SHIPPER)
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["error"] == "ACTION_NOT_ALLOWED_FOR_ROLE"
    assert deal_status(d) == "accepted"


def test_shipper_cannot_set_at_border():
    d = seed_deal("in_progress", from_country="CN", to_country="KZ")
    r = patch_status(d, "at_border", SHIPPER)
    assert r.status_code == 403, r.text
    assert deal_status(d) == "in_progress"


def test_shipper_cannot_set_delivered():
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    r = patch_status(d, "delivered", SHIPPER)
    assert r.status_code == 403, r.text
    assert deal_status(d) == "in_progress"


def test_driver_can_start_trip():
    d = seed_deal("accepted")
    r = patch_status(d, "in_progress", DRIVER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "in_progress"


def test_start_trip_automatically_activates_tracking():
    d = seed_deal("accepted")
    r = patch_status(d, "in_progress", DRIVER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "in_progress"
    with get_conn() as c:
        tracking = c.execute(
            "SELECT status, locked_at, completed_at FROM deal_tracking WHERE deal_id = ?", (d,)
        ).fetchone()
    assert tracking["status"] == "active"
    assert tracking["locked_at"] is not None
    assert tracking["completed_at"] is None


def test_driver_can_set_at_border_for_international():
    d = seed_deal("in_progress", from_country="CN", to_country="KZ")
    r = patch_status(d, "at_border", DRIVER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "at_border"


def test_driver_cannot_set_at_border_for_domestic():
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    r = patch_status(d, "at_border", DRIVER)
    assert r.status_code == 409, f"внутренний рейс не должен пропускать at_border: {r.status_code} {r.text}"
    assert r.json()["detail"]["error"] == "ROUTE_NOT_INTERNATIONAL"
    assert deal_status(d) == "in_progress"


def test_driver_can_deliver_domestic_directly_from_in_progress():
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    r = patch_status(d, "delivered", DRIVER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "delivered"


def test_driver_cannot_deliver_international_without_border():
    d = seed_deal("in_progress", from_country="CN", to_country="KZ")
    r = patch_status(d, "delivered", DRIVER)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "ROUTE_REQUIRES_BORDER_STEP"
    assert deal_status(d) == "in_progress"


def test_driver_can_deliver_international_from_at_border():
    d = seed_deal("at_border", from_country="CN", to_country="KZ")
    r = patch_status(d, "delivered", DRIVER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "delivered"


def test_stranger_gets_403():
    d = seed_deal("accepted")
    r = patch_status(d, "in_progress", STRANGER)
    assert r.status_code == 403, r.text
    assert deal_status(d) == "accepted"


def test_repeat_status_is_idempotent_noop():
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    r = patch_status(d, "in_progress", DRIVER)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "status": "in_progress"}
    assert deal_status(d) == "in_progress"


def test_skip_steps_gives_409():
    d = seed_deal("accepted")
    r = patch_status(d, "delivered", DRIVER)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "INVALID_STATUS_TRANSITION"
    assert deal_status(d) == "accepted"


def test_completed_status_does_not_change():
    d = seed_deal("completed", from_country="KZ", to_country="KZ")
    r = patch_status(d, "in_progress", DRIVER)
    assert r.status_code == 409, r.text
    assert deal_status(d) == "completed"
    r2 = patch_status(d, "cancelled", SHIPPER)
    assert r2.status_code == 409, r2.text
    assert deal_status(d) == "completed"


def test_unknown_status_400():
    d = seed_deal("accepted")
    r = patch_status(d, "banana", DRIVER)
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["error"] == "INVALID_STATUS"


# ───────────────────────── cancelled — обе стороны, с аудитом ─────────────────────────

def test_cancel_allowed_for_both_parties_from_accepted():
    d1 = seed_deal("accepted")
    r1 = patch_status(d1, "cancelled", SHIPPER)
    assert r1.status_code == 200, r1.text
    d2 = seed_deal("accepted")
    r2 = patch_status(d2, "cancelled", DRIVER)
    assert r2.status_code == 200, r2.text


def test_cancel_mid_transit_allowed_both_and_audited():
    """Текущее продуктовое поведение (TripDetail.js) сохранено намеренно —
    см. комментарий у _DRIVER_ONLY_TRANSITIONS. Проверяем, что это не тихо:
    deal_events получает mid_transit_cancel=true."""
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    r = patch_status(d, "cancelled", SHIPPER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "cancelled"
    from database.db import get_conn
    with get_conn() as c:
        ev = c.execute(
            "SELECT payload_json FROM deal_events WHERE deal_id = ? AND event_type = 'deal.status_changed' "
            "ORDER BY created_at DESC LIMIT 1",
            (d,),
        ).fetchone()
    assert ev is not None, "deal_room_dal.create_deal_event не был вызван (или таблица deal_events не создана)"
    import json as _json
    payload = _json.loads(ev["payload_json"])
    assert payload.get("mid_transit_cancel") is True
    assert payload.get("old_status") == "in_progress"
    assert "request_id" in payload


def test_trip_status_endpoint_cannot_bypass_fsm_or_country_guard():
    """Пре-мёрдж ревью (05.08.2026, P0-блокер, независимый adversarial
    review): PATCH /trips/{id}/status раньше синхронизировал deals.status
    НАПРЯМУЮ, в обход всей FSM/country-guard — driver мог одним запросом
    сюда перескочить accepted→delivered, включая международный маршрут
    БЕЗ at_border. Регресс-тест на оба конкретных репро из ревью."""
    from database.db import get_conn, new_id

    # Репро 1: accepted -> delivered напрямую (пропуск in_progress/at_border).
    trip_id = new_id()
    d = seed_deal("accepted", from_country="KZ", to_country="KZ")
    with get_conn() as c:
        c.execute("INSERT INTO trips (id, driver_id, from_city, to_city, price, status) VALUES (?,?,?,?,?,?)",
                   (trip_id, DRIVER, "Almaty", "Astana", 3000, "booked"))
        c.execute("UPDATE deals SET trip_id = ? WHERE id = ?", (trip_id, d))
    as_user(DRIVER)
    r = client.patch(f"/api/v1/market/trips/{trip_id}/status", params={"new_status": "delivered"})
    assert r.status_code == 200, r.text  # сам trip-статус обновляется (legacy-совместимость)
    assert deal_status(d) == "accepted", (
        "БЛОКЕР-регресс: deals.status не должен перепрыгнуть в delivered в обход FSM "
        f"через /trips/status, получили {deal_status(d)!r}"
    )

    # Репро 2: международный маршрут, in_progress -> delivered БЕЗ at_border.
    trip_id2 = new_id()
    d2 = seed_deal("in_progress", from_country="CN", to_country="KZ")
    with get_conn() as c:
        c.execute("INSERT INTO trips (id, driver_id, from_city, to_city, price, status) VALUES (?,?,?,?,?,?)",
                   (trip_id2, DRIVER, "Urumqi", "Almaty", 5000, "in_transit"))
        c.execute("UPDATE deals SET trip_id = ? WHERE id = ?", (trip_id2, d2))
    as_user(DRIVER)
    r2 = client.patch(f"/api/v1/market/trips/{trip_id2}/status", params={"new_status": "delivered"})
    assert r2.status_code == 200, r2.text
    assert deal_status(d2) == "in_progress", (
        "БЛОКЕР-регресс: международный маршрут не должен доставляться в обход at_border "
        f"через /trips/status, получили {deal_status(d2)!r}"
    )


def test_concurrent_conflicting_patch_does_not_give_two_false_200():
    """Пре-мёрдж ревью (05.08.2026, P0-блокер, независимый adversarial
    review): SELECT-then-UPDATE без блокировки строки — 2 одновременных
    PATCH с разными new_status давали 18/30 (60%) двойных ложных HTTP 200.
    Conditional UPDATE (WHERE status=<прочитанный>) должен гарантировать,
    что ровно ОДИН из двух конкурентных запросов получает 200, второй —
    409 STATUS_CHANGED_CONCURRENTLY, и итоговый статус в БД соответствует
    именно победившему запросу (не «тихо один из двух»)."""
    import threading

    results = {}

    def _do(actor, target, key):
        d_local = threading.current_thread()
        try:
            as_user(actor)
            r = client.patch(f"/api/v1/market/deals/{shared_deal}/status", params={"new_status": target})
            results[key] = (r.status_code, r.json())
        except Exception as e:
            results[key] = ("EXC", str(e))

    conflicts_ok = 0
    for _ in range(15):
        shared_deal = seed_deal("in_progress", from_country="KZ", to_country="KZ")
        t1 = threading.Thread(target=_do, args=(DRIVER, "delivered", "A"))
        t2 = threading.Thread(target=_do, args=(DRIVER, "cancelled", "B"))
        t1.start(); t2.start()
        t1.join(); t2.join()
        codes = sorted(c for c, _ in results.values())
        final = deal_status(shared_deal)
        # Ровно один 200 + один 409/иной-код (никогда два одновременных 200
        # на взаимоисключающие терминальные статусы), и финальный статус в
        # БД обязан совпадать с тем запросом, который реально получил 200.
        two_hundreds = codes.count(200)
        assert two_hundreds <= 1, f"два конкурентных запроса получили 200 одновременно: {results}"
        if results["A"][0] == 200:
            assert final == "delivered", f"A получил 200, но в БД {final!r}"
        if results["B"][0] == 200:
            assert final == "cancelled", f"B получил 200, но в БД {final!r}"
        assert final in ("delivered", "cancelled"), f"неожиданный финальный статус: {final}"
        conflicts_ok += 1
    assert conflicts_ok == 15


def test_gps_is_locked_after_pickup_and_last_point_is_preserved():
    """GPS needs shipper request + driver consent; after pickup the driver
    cannot stop it or erase the last verified point."""
    deal_id = seed_deal("accepted", from_country="KZ", to_country="KZ")

    as_user(SHIPPER)
    request = client.post(f"/api/v1/market/deals/{deal_id}/tracking/request")
    assert request.status_code == 200, request.text
    assert request.json()["tracking"]["status"] == "pending"

    # A pending request is not consent and the truck is not yet in transit.
    as_user(DRIVER)
    blocked = client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 43.2, "lng": 76.9})
    assert blocked.status_code == 409, blocked.text
    approved = client.post(f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["tracking"]["status"] == "active"

    pickup = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "in_progress"})
    assert pickup.status_code == 200, pickup.text
    sent = client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 43.2, "lng": 76.9})
    assert sent.status_code == 200, sent.text
    as_user(SHIPPER)
    visible = client.get(f"/api/v1/market/deals/{deal_id}/location")
    assert visible.status_code == 200 and visible.json()["has_location"] is True

    as_user(DRIVER)
    stopped = client.post(f"/api/v1/market/deals/{deal_id}/tracking/stop")
    assert stopped.status_code == 409, stopped.text
    delivered = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "delivered"})
    assert delivered.status_code == 200, delivered.text
    as_user(SHIPPER)
    preserved = client.get(f"/api/v1/market/deals/{deal_id}/location")
    assert preserved.status_code == 200
    assert preserved.json()["has_location"] is True
    assert preserved.json()["deal_status"] == "delivered"


def test_gps_roles_are_strict():
    deal_id = seed_deal("accepted")
    as_user(DRIVER)
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 403
    as_user(SHIPPER)
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 200
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"}).status_code == 403
    as_user(STRANGER)
    assert client.get(f"/api/v1/market/deals/{deal_id}/tracking").status_code == 403


# Canonical delivery confirmation: delivered -> received -> completed.
def _cargo_status_for_deal(deal_id):
    with get_conn() as c:
        row = c.execute(
            "SELECT c.status FROM cargos c JOIN deals d ON d.cargo_id = c.id WHERE d.id = ?",
            (deal_id,),
        ).fetchone()
        return row["status"] if row else None


def _deal_event_count(deal_id):
    with get_conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM deal_events WHERE deal_id = ? AND event_type = 'deal.status_changed'",
            (deal_id,),
        ).fetchone()[0]


def test_shipper_can_confirm_received_after_delivered():
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    r = patch_status(d, "received", SHIPPER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "received"


def test_driver_cannot_confirm_received():
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    r = patch_status(d, "received", DRIVER)
    assert r.status_code == 403, r.text
    assert deal_status(d) == "delivered"


def test_shipper_cannot_complete_without_received():
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    r = patch_status(d, "completed", SHIPPER)
    assert r.status_code == 409, r.text
    assert deal_status(d) == "delivered"


def test_shipper_can_complete_after_received():
    d = seed_deal("received", from_country="KZ", to_country="KZ")
    r = patch_status(d, "completed", SHIPPER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "completed"


def test_driver_cannot_complete_from_delivered_or_received():
    d1 = seed_deal("delivered", from_country="KZ", to_country="KZ")
    assert patch_status(d1, "completed", DRIVER).status_code == 409
    assert deal_status(d1) == "delivered"
    d2 = seed_deal("received", from_country="KZ", to_country="KZ")
    assert patch_status(d2, "completed", DRIVER).status_code == 403
    assert deal_status(d2) == "received"


def test_repeated_received_is_idempotent_without_duplicate_event():
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    assert patch_status(d, "received", SHIPPER).status_code == 200
    before = _deal_event_count(d)
    r = patch_status(d, "received", SHIPPER)
    after = _deal_event_count(d)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "status": "received"}
    assert after == before, f"idempotent repeat created event: {before} -> {after}"
    assert deal_status(d) == "received"


def test_legacy_awaiting_confirmation_maps_to_delivered_then_received():
    d = seed_deal("awaiting_confirmation", from_country="KZ", to_country="KZ")
    r = patch_status(d, "received", SHIPPER)
    assert r.status_code == 200, r.text
    assert deal_status(d) == "received"


def test_cargo_is_not_completed_before_deal_completed():
    d = seed_deal("in_progress", from_country="KZ", to_country="KZ")
    assert _cargo_status_for_deal(d) == "taken"
    assert patch_status(d, "delivered", DRIVER).status_code == 200
    assert _cargo_status_for_deal(d) == "taken", "delivery must not finalize cargo"
    assert patch_status(d, "received", SHIPPER).status_code == 200
    assert _cargo_status_for_deal(d) == "taken", "receipt audit state must not finalize cargo yet"
    assert patch_status(d, "completed", SHIPPER).status_code == 200
    assert _cargo_status_for_deal(d) == "completed"


def test_completed_is_terminal():
    d = seed_deal("completed", from_country="KZ", to_country="KZ")
    assert patch_status(d, "in_progress", DRIVER).status_code == 409
    assert patch_status(d, "cancelled", SHIPPER).status_code == 409


if __name__ == "__main__":
    fails = 0
    tests = [fn for name, fn in list(globals().items()) if name.startswith("test_") and callable(fn)]
    for fn in tests:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
