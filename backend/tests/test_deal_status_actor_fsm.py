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


def test_terminal_status_does_not_change():
    d = seed_deal("delivered", from_country="KZ", to_country="KZ")
    r = patch_status(d, "in_progress", DRIVER)
    assert r.status_code == 409, r.text
    assert deal_status(d) == "delivered"
    r2 = patch_status(d, "cancelled", SHIPPER)
    assert r2.status_code == 409, r2.text
    assert deal_status(d) == "delivered"


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


if __name__ == "__main__":
    fails = 0
    for fn in [test_shipper_cannot_start_trip, test_shipper_cannot_set_at_border,
               test_shipper_cannot_set_delivered, test_driver_can_start_trip,
               test_driver_can_set_at_border_for_international,
               test_driver_cannot_set_at_border_for_domestic,
               test_driver_can_deliver_domestic_directly_from_in_progress,
               test_driver_cannot_deliver_international_without_border,
               test_driver_can_deliver_international_from_at_border,
               test_stranger_gets_403, test_repeat_status_is_idempotent_noop,
               test_skip_steps_gives_409, test_terminal_status_does_not_change,
               test_unknown_status_400, test_cancel_allowed_for_both_parties_from_accepted,
               test_cancel_mid_transit_allowed_both_and_audited]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
