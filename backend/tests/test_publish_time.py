"""published_at tracking on cargos/trips republish (PR2, 03.08.2026).

Проверяем: миграция идемпотентна, published_at растёт при republish, старые
отменённые ставки не восстанавливаются, объект снова виден в публичной ленте.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_publish_time.db python -m tests.test_publish_time
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_publish_time.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate
from tests.marketplace_harness import set_test_actor
import contextvars

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

from api.marketplace import mp_router
from database.db import get_conn as _get_conn_for_setup

_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with _get_conn_for_setup() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))

_notif_schema_path = ROOT / "database" / "notifications_schema.sql"
if _notif_schema_path.exists():
    with _get_conn_for_setup() as _c_notif:
        _c_notif.executescript(_notif_schema_path.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def as_user(uid: str):
    actor = set_test_actor(uid, role="driver" if "driver" in uid else "client")
    _current_user.set(actor)


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def get_cargo(cargo_id):
    from database.db import get_conn
    with get_conn() as c:
        return dict(c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone())


def get_trip(trip_id):
    from database.db import get_conn
    with get_conn() as c:
        return dict(c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone())


def test_migration_idempotent_and_backfilled():
    print("\n=== test_migration_idempotent_and_backfilled ===")
    from database.db import get_conn
    from api.marketplace import _init
    # Повторный вызов _init() не должен падать (идемпотентная миграция).
    _init()
    _init()
    with get_conn() as c:
        ccols = {r["name"] for r in c.execute("PRAGMA table_info(cargos)").fetchall()}
        tcols = {r["name"] for r in c.execute("PRAGMA table_info(trips)").fetchall()}
    expect("published_at" in ccols, "cargos.published_at column exists")
    expect("published_at" in tcols, "trips.published_at column exists")


def test_create_sets_published_at():
    print("\n=== test_create_sets_published_at ===")
    as_user("owner-pub-1")
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Moscow", "cargo_desc": "Test", "price": 1000,
    })
    expect(r.status_code == 200, f"create cargo 200 (got {r.status_code} {r.text})")
    cargo_id = r.json()["id"]
    cargo = get_cargo(cargo_id)
    expect(cargo["published_at"] is not None, "published_at set on create")
    expect(cargo["published_at"] == cargo["created_at"], "published_at == created_at right after creation")


def test_unpublish_republish_cycle():
    print("\n=== test_unpublish_republish_cycle ===")
    from database.db import get_conn, new_id

    owner = "owner-pub-2"
    driver = "driver-pub-2"
    as_user(owner)
    cargo_id = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Moscow", "cargo_desc": "Furniture load", "price": 2000,
    }).json()["id"]

    # Живая ставка на груз — после unpublish должна стать cancelled.
    as_user(driver)
    bid_id = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 1800}).json()["id"]

    as_user(owner)
    r = client.patch(f"/api/v1/market/cargos/{cargo_id}/unpublish")
    expect(r.status_code == 200, f"unpublish 200 (got {r.status_code} {r.text})")
    expect(get_cargo(cargo_id)["status"] == "unpublished", "status=unpublished after unpublish")

    with get_conn() as c:
        bid_status = c.execute("SELECT status FROM bids WHERE id = ?", (bid_id,)).fetchone()["status"]
    expect(bid_status == "cancelled", f"bid cancelled after unpublish (got {bid_status})")

    # Искусственно «состариваем» published_at, чтобы гарантированно проверить
    # рост значения без гонки по времени (CURRENT_TIMESTAMP — секундная точность).
    with get_conn() as c:
        c.execute("UPDATE cargos SET published_at = '2020-01-01 00:00:00' WHERE id = ?", (cargo_id,))
    old_published_at = get_cargo(cargo_id)["published_at"]
    expect(old_published_at == "2020-01-01 00:00:00", "published_at backdated for the test")

    r = client.patch(f"/api/v1/market/cargos/{cargo_id}/republish")
    expect(r.status_code == 200, f"republish 200 (got {r.status_code} {r.text})")
    cargo = get_cargo(cargo_id)
    expect(cargo["status"] == "active", "status=active after republish")
    expect(cargo["published_at"] > old_published_at,
           f"published_at grew after republish ({old_published_at} -> {cargo['published_at']})")

    # Старая отменённая ставка не восстанавливается.
    with get_conn() as c:
        bid_status_after = c.execute("SELECT status FROM bids WHERE id = ?", (bid_id,)).fetchone()["status"]
    expect(bid_status_after == "cancelled", f"old bid stays cancelled after republish (got {bid_status_after})")

    # Объект снова виден в публичной ленте.
    r = client.get("/api/v1/market/cargos", params={"status": "active"})
    ids = [c["id"] for c in r.json()["cargos"]]
    expect(cargo_id in ids, "republished cargo visible again in public feed")


def test_trip_republish_sets_published_at():
    print("\n=== test_trip_republish_sets_published_at ===")
    from database.db import get_conn

    driver = "driver-pub-3"
    as_user(driver)
    trip_id = client.post("/api/v1/market/trips", json={
        "from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 3000,
    }).json()["id"]
    trip = get_trip(trip_id)
    expect(trip["published_at"] is not None, "trip published_at set on create")

    r = client.patch(f"/api/v1/market/trips/{trip_id}/unpublish")
    expect(r.status_code == 200, f"trip unpublish 200 (got {r.status_code} {r.text})")

    with get_conn() as c:
        c.execute("UPDATE trips SET published_at = '2020-01-01 00:00:00' WHERE id = ?", (trip_id,))

    r = client.patch(f"/api/v1/market/trips/{trip_id}/republish")
    expect(r.status_code == 200, f"trip republish 200 (got {r.status_code} {r.text})")
    trip = get_trip(trip_id)
    expect(trip["published_at"] > "2020-01-01 00:00:00", "trip published_at grew after republish")

    r = client.get("/api/v1/market/trips", params={"status": "active"})
    ids = [t["id"] for t in r.json()["trips"]]
    expect(trip_id in ids, "republished trip visible again in public feed")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_migration_idempotent_and_backfilled()
    test_create_sets_published_at()
    test_unpublish_republish_cycle()
    test_trip_republish_sets_published_at()
    print("\nAll published_at tests passed.")
