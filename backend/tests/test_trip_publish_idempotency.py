"""Vehicle Security & Trip Integrity Repair (2026-09-11) -- Publish
idempotency + concurrency.

POST /api/v1/market/trips had no idempotency guard at all: a double-tap on
"Publish route", a client network-retry, or two near-simultaneous submits
each created their own separate trip row. Fix: api/marketplace.py's
create_trip now claims a short-lived "publish intent" (driver + route +
truck_type + vehicle_id + price, bucketed into 20s windows) in a dedicated
trip_publish_intents table before writing the trips row; a second request
with the identical intent within the same window gets back the trip that
already exists instead of creating a second one. See _init()'s comment in
api/marketplace.py for why this is a separate table rather than a UNIQUE
index directly on trips (the first attempt broke unrelated tests via a
pre-existing published_at backfill -- documented there).

This file covers BOTH classes the task asks for:
  - sequential repeats (double-tap / retry-after-timeout emulation)
  - genuinely concurrent repeats (real OS threads hitting the TestClient
    at the same time) -- the property that actually matters: SQLite
    serializes the two INSERTs into trip_publish_intents at commit time
    regardless of thread scheduling, so this is not a "usually works"
    race mitigation, it's deterministic.

CI contract: top-level `def test_*`, order matters -- test_00 seeds the
driver + vehicle every later test needs.
"""
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.registration import reg_router
from api.vehicles import router as vehicles_router
from api.marketplace import mp_router
from database.db import get_conn
from database import vehicles_dal

vehicles_dal.init_vehicles_schema()

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(vehicles_router, prefix="/api/v1/driver/vehicles")
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

STATE: dict = {}


def _register_driver():
    r = client.post("/api/v1/register/guest")
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["token"]
    uid = body.get("id") or body.get("user_id") or (body.get("user") or {}).get("id")
    with get_conn() as c:
        c.execute(
            "UPDATE drivers_registration SET verification_level = 1, role = 'driver', status = 'approved' "
            "WHERE id = ?",
            (uid,),
        )
        c.commit()
    return uid, {"Authorization": f"Bearer {token}"}


def test_00_setup_driver():
    STATE["a_id"], STATE["a_headers"] = _register_driver()


def _trips_matching(driver_id, price):
    with get_conn() as c:
        return c.execute(
            "SELECT id FROM trips WHERE driver_id = ? AND price = ?", (driver_id, price)
        ).fetchall()


# ── sequential double-submit ───────────────────────────────────────────────

def test_01_double_tap_same_request_twice_creates_one_trip():
    payload = {"from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 2001}
    r1 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json=payload)
    r2 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json=payload)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    assert r1.json()["id"] == r2.json()["id"], "double-tap returned two different trip ids"
    rows = _trips_matching(STATE["a_id"], 2001)
    assert len(rows) == 1, f"double-tap created {len(rows)} trips instead of 1"


def test_02_three_rapid_identical_submits_still_one_trip():
    payload = {"from_city": "Almaty", "to_city": "Shymkent", "truck_type": "tent", "price": 2002}
    ids = set()
    for _ in range(3):
        r = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json=payload)
        assert r.status_code == 200, r.text
        ids.add(r.json()["id"])
    assert len(ids) == 1, f"3 rapid identical submits produced {len(ids)} distinct trip ids"
    rows = _trips_matching(STATE["a_id"], 2002)
    assert len(rows) == 1


def test_03_different_price_is_a_genuinely_different_trip_not_deduped():
    """The guard must key on the actual submitted content -- a real edit
    (different price) between two submits must NOT be collapsed into one."""
    base = {"from_city": "Almaty", "to_city": "Karaganda", "truck_type": "tent"}
    r1 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={**base, "price": 2003})
    r2 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={**base, "price": 2004})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"], "two different prices were incorrectly deduped into one trip"


def test_04_republishing_the_same_route_after_the_window_is_not_blocked():
    """This is NOT a permanent uniqueness constraint on route+price -- only
    a short-window double-submit guard. Proven directly against the real
    endpoint: monkeypatch api.marketplace.time.time() to jump forward past
    one 20s bucket between two otherwise-identical submits (no real sleep),
    and assert BOTH create a genuine, separate trip -- a driver deliberately
    re-publishing the same route later is normal, unrelated business, not
    a retry."""
    import api.marketplace as marketplace_module
    real_time = marketplace_module.time.time
    base_t = real_time()
    try:
        marketplace_module.time.time = lambda: base_t
        r1 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={
            "from_city": "Atyrau", "to_city": "Aktobe", "truck_type": "tent", "price": 2005,
        })
        assert r1.status_code == 200, r1.text

        marketplace_module.time.time = lambda: base_t + 25  # next 20s bucket
        r2 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={
            "from_city": "Atyrau", "to_city": "Aktobe", "truck_type": "tent", "price": 2005,
        })
        assert r2.status_code == 200, r2.text
    finally:
        marketplace_module.time.time = real_time

    assert r1.json()["id"] != r2.json()["id"], (
        "a resubmit in the NEXT window was incorrectly deduped -- the guard "
        "must only catch same-window repeats, never become a permanent lock"
    )
    rows = _trips_matching(STATE["a_id"], 2005)
    assert len(rows) == 2, f"expected 2 genuinely separate trips across windows, got {len(rows)}"


# ── real concurrency (OS threads, not sequential calls) ────────────────────

def test_05_concurrent_identical_publishes_create_exactly_one_trip():
    payload = {"from_city": "Taraz", "to_city": "Almaty", "truck_type": "tent", "price": 2006}
    results = []
    lock = threading.Lock()

    def fire():
        r = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json=payload)
        with lock:
            results.append((r.status_code, r.json() if r.status_code == 200 else r.text))

    threads = [threading.Thread(target=fire) for _ in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for status, _ in results), results
    ids = {body["id"] for _, body in results}
    assert len(ids) == 1, f"12 concurrent identical publishes returned {len(ids)} distinct trip ids: {ids}"
    rows = _trips_matching(STATE["a_id"], 2006)
    assert len(rows) == 1, f"12 concurrent identical publishes left {len(rows)} rows in trips"


def test_06_concurrent_distinct_publishes_all_succeed_independently():
    """The dedup guard must not throttle or drop unrelated concurrent
    publishes -- only ones that are actually the same intent."""
    results = []
    lock = threading.Lock()

    def fire(price):
        r = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={
            "from_city": "Almaty", "to_city": "Moscow", "truck_type": "tent", "price": price,
        })
        with lock:
            results.append((price, r.status_code, r.json().get("id") if r.status_code == 200 else None))

    prices = list(range(2100, 2110))
    threads = [threading.Thread(target=fire, args=(p,)) for p in prices]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for _, status, _ in results), results
    ids = [tid for _, _, tid in results]
    assert len(set(ids)) == len(prices), "distinct concurrent publishes collided into fewer trips than submitted"
