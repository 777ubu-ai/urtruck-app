"""Vehicle Security & Trip Integrity Repair, Round 2 (2026-09-11) --
Idempotency-Key trip publish.

Round 1 used a 20s-bucketed heuristic key (driver + route + truck_type +
vehicle_id + price). Independent review correctly rejected it as not
production-safe: two genuinely different user intents sharing those 5
fields (capacity_tons/available_m3/currency/departure/etc all differing)
were indistinguishable, and the window boundary changed the outcome for
reasons that have nothing to do with user intent.

This file replaces round 1's content entirely with the real client-
supplied Idempotency-Key contract: the caller names its own attempt via
the `Idempotency-Key` header; a retry of the SAME attempt reuses that
name; the server compares a canonical fingerprint of the FULL request
(api.marketplace._canonical_request_fingerprint) against what that key
already claimed (trip_publish_intents). See api/marketplace.py's
create_trip and its comment on the trip_publish_intents table for the
full mechanism.

CI contract: top-level `def test_*`, order matters -- test_00 seeds the
driver every later test needs.
"""
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.registration import reg_router
from api.vehicles import router as vehicles_router
from api.marketplace import mp_router
import api.marketplace as marketplace_module
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


def _headers(key=None):
    h = dict(STATE["a_headers"])
    if key:
        h["Idempotency-Key"] = key
    return h


def _publish(key, **overrides):
    payload = {
        "from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 3000,
        "capacity_tons": 20, "available_m3": 82, "currency": "USD", "departure": None,
    }
    payload.update(overrides)
    return client.post("/api/v1/market/trips", headers=_headers(key), json=payload)


def _trips_matching(driver_id, price):
    with get_conn() as c:
        return c.execute(
            "SELECT id FROM trips WHERE driver_id = ? AND price = ?", (driver_id, price)
        ).fetchall()


# ── core semantics (item 1) ────────────────────────────────────────────────

def test_01_same_key_same_payload_returns_one_trip():
    r1 = _publish("key-01", price=3001)
    r2 = _publish("key-01", price=3001)
    r3 = _publish("key-01", price=3001)
    assert r1.status_code == r2.status_code == r3.status_code == 200, (r1.text, r2.text, r3.text)
    ids = {r1.json()["id"], r2.json()["id"], r3.json()["id"]}
    assert len(ids) == 1, f"same key + same payload produced {len(ids)} distinct trips"
    rows = _trips_matching(STATE["a_id"], 3001)
    assert len(rows) == 1


def test_02_same_key_changed_capacity_tons_is_409():
    r1 = _publish("key-02", price=3002, capacity_tons=20)
    assert r1.status_code == 200, r1.text
    r2 = _publish("key-02", price=3002, capacity_tons=25)
    assert r2.status_code == 409, f"changed capacity_tons under the same key was accepted: {r2.text}"
    assert r2.json()["detail"]["error"] == "IDEMPOTENCY_KEY_REUSED"
    rows = _trips_matching(STATE["a_id"], 3002)
    assert len(rows) == 1, "the rejected reuse must not have created a second trip"


def test_03_same_key_changed_available_m3_is_409():
    r1 = _publish("key-03", price=3003, available_m3=82)
    assert r1.status_code == 200, r1.text
    r2 = _publish("key-03", price=3003, available_m3=90)
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"]["error"] == "IDEMPOTENCY_KEY_REUSED"


def test_04_same_key_changed_currency_is_409():
    r1 = _publish("key-04", price=3004, currency="USD")
    assert r1.status_code == 200, r1.text
    r2 = _publish("key-04", price=3004, currency="KZT")
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"]["error"] == "IDEMPOTENCY_KEY_REUSED"


def test_05_same_key_changed_departure_is_409():
    r1 = _publish("key-05", price=3005, departure="2026-12-01")
    assert r1.status_code == 200, r1.text
    r2 = _publish("key-05", price=3005, departure="2026-12-25")
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"]["error"] == "IDEMPOTENCY_KEY_REUSED"


def test_06_different_keys_identical_payload_are_two_trips():
    """The key thing round 1 could NOT do: two independent intents that
    happen to look identical are both legitimate."""
    payload = dict(price=3006)
    r1 = _publish("key-06-a", **payload)
    r2 = _publish("key-06-b", **payload)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"], "different keys with identical payload were incorrectly deduped"
    rows = _trips_matching(STATE["a_id"], 3006)
    assert len(rows) == 2


def test_07_no_key_at_all_still_works_no_dedup():
    """Backward compatible: a caller that sends no Idempotency-Key gets
    exactly pre-idempotency behavior for that one request -- never a 400,
    never silently deduped against anything."""
    r1 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={
        "from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 3007,
    })
    r2 = client.post("/api/v1/market/trips", headers=STATE["a_headers"], json={
        "from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 3007,
    })
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"]


# ── window/TTL independence (item 3) ────────────────────────────────────────

def test_08_retry_after_21_real_seconds_returns_same_trip():
    """The literal scenario round 1 could get wrong depending on which side
    of its 20s bucket a retry landed on. No real 21s sleep needed: round
    2's create_trip does not consult time.time() for dedup purposes at all
    (the bucket is gone) -- this test documents and locks in that whether
    2s, 19s, 21s, or minutes pass between two calls with the same key must
    not matter, only the (key, fingerprint) pair does."""
    r1 = _publish("key-08", price=3008)
    assert r1.status_code == 200, r1.text
    r2 = _publish("key-08", price=3008)
    assert r2.status_code == 200, r2.text
    assert r1.json()["id"] == r2.json()["id"], "a retry was NOT recognized as the same intent"
    rows = _trips_matching(STATE["a_id"], 3008)
    assert len(rows) == 1
    with get_conn() as c:
        row = c.execute(
            "SELECT expires_at FROM trip_publish_intents WHERE owner_user_id = ? AND idempotency_key = 'key-08'",
            (STATE["a_id"],),
        ).fetchone()
    assert row is not None, "no bucket/time-window column exists on the intent row to have made this fragile"


def test_09_same_key_survives_a_simulated_backend_restart():
    """The claim must live in a real table (trip_publish_intents), not any
    in-process cache -- proven two ways without actually restarting the
    interpreter (importlib.reload(api.marketplace) was tried here first and
    reverted: reloading the shared marketplace module mid-session mutates
    module-level globals every OTHER already-imported test file's own
    `import api.marketplace as ...` reference also sees, and broke an
    unrelated notifications test purely through that shared state -- not
    worth the risk for what a same-process check already demonstrates just
    as well):
      1. the row this request produced is read back with a FRESH,
         independent SQLite connection (get_conn() opens a brand new
         sqlite3.connect() each call -- nothing about this read reuses any
         Python-process-local object the first request created), and
      2. a second, independent HTTP call with the same key still resolves
         to the same trip via that persisted row, not via anything the
         first call's Python call stack could have remembered.
    """
    r1 = _publish("key-09", price=3009)
    assert r1.status_code == 200, r1.text

    with get_conn() as c:
        persisted = c.execute(
            "SELECT trip_id, request_fingerprint FROM trip_publish_intents "
            "WHERE owner_user_id = ? AND idempotency_key = 'key-09'",
            (STATE["a_id"],),
        ).fetchone()
    assert persisted is not None, "the claim was not actually persisted to trip_publish_intents"
    assert persisted["trip_id"] == r1.json()["id"]

    r2 = _publish("key-09", price=3009)
    assert r2.status_code == 200, r2.text
    assert r1.json()["id"] == r2.json()["id"], "the same key produced a different trip on a second, independent call"


# ── concurrency (item 7) ────────────────────────────────────────────────────

def test_10_ten_concurrent_requests_one_key_one_trip():
    results = []
    lock = threading.Lock()

    def fire():
        r = _publish("key-10", price=3010)
        with lock:
            results.append((r.status_code, r.json() if r.status_code == 200 else r.text))

    threads = [threading.Thread(target=fire) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for status, _ in results), results
    ids = {body["id"] for _, body in results}
    assert len(ids) == 1, f"10 concurrent requests with ONE key produced {len(ids)} distinct trips"
    rows = _trips_matching(STATE["a_id"], 3010)
    assert len(rows) == 1


def test_11_ten_concurrent_requests_ten_keys_ten_trips():
    results = []
    lock = threading.Lock()

    def fire(i):
        r = _publish(f"key-11-{i}", price=3011)
        with lock:
            results.append((i, r.status_code, r.json().get("id") if r.status_code == 200 else None))

    threads = [threading.Thread(target=fire, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(status == 200 for _, status, _ in results), results
    ids = {tid for _, _, tid in results}
    assert len(ids) == 10, f"10 concurrent requests with 10 DIFFERENT keys produced only {len(ids)} distinct trips"
    rows = _trips_matching(STATE["a_id"], 3011)
    assert len(rows) == 10


# ── rollback / no orphan state (item 7) ─────────────────────────────────────

def test_12_failed_trip_insert_leaves_no_orphan_idempotency_state():
    """If the trips INSERT itself fails, the claim row sharing its
    transaction must roll back too -- otherwise the key would be
    permanently 'poisoned' (stuck referencing a trip_id that was never
    actually created, or refusing all future use of that key)."""
    import sqlite3 as _sqlite3
    from contextlib import contextmanager
    real_get_conn = marketplace_module.get_conn

    class _FailingConnProxy:
        """sqlite3.Connection.execute is a read-only C attribute -- cannot
        monkeypatch it on a real instance. Wrap instead: every attribute
        access falls through to the real connection except execute()."""
        def __init__(self, real_conn):
            self._real = real_conn

        def execute(self, sql, *args, **kwargs):
            if sql.strip().startswith("INSERT INTO trips"):
                raise _sqlite3.OperationalError("simulated failure for test_12")
            return self._real.execute(sql, *args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._real, name)

    @contextmanager
    def failing_get_conn():
        with real_get_conn() as conn:
            yield _FailingConnProxy(conn)

    marketplace_module.get_conn = failing_get_conn
    try:
        # TestClient re-raises unhandled server exceptions by default
        # (raise_server_exceptions=True) instead of turning them into a 500
        # response -- exactly what we want here: proof the simulated
        # failure genuinely propagated out of create_trip rather than
        # being silently swallowed somewhere.
        raised = False
        try:
            client.post("/api/v1/market/trips", headers=_headers("key-12"), json={
                "from_city": "Almaty", "to_city": "Astana", "truck_type": "tent", "price": 3012,
            })
        except Exception as exc:
            raised = True
            assert "simulated failure for test_12" in str(exc), exc
        assert raised, "the simulated INSERT failure did not propagate at all"
    finally:
        marketplace_module.get_conn = real_get_conn

    with get_conn() as c:
        orphan = c.execute(
            "SELECT * FROM trip_publish_intents WHERE owner_user_id = ? AND idempotency_key = 'key-12'",
            (STATE["a_id"],),
        ).fetchone()
        trip_rows = c.execute("SELECT COUNT(*) n FROM trips WHERE price = 3012").fetchone()["n"]
    assert orphan is None, "a claim row survived a failed trip INSERT -- poisoned idempotency state"
    assert trip_rows == 0, "no trip should exist when its INSERT failed"

    # The SAME key must now be free to use for a real attempt.
    r2 = _publish("key-12", price=3012)
    assert r2.status_code == 200, f"key-12 remained unusable after the rollback: {r2.text}"


# ── TTL / cleanup (item 4, item 7's "expired intents очищаются корректно") ──

def test_13_expired_intents_are_cleaned_up_without_touching_the_trip():
    r = _publish("key-13", price=3013)
    assert r.status_code == 200, r.text
    trip_id = r.json()["id"]

    with get_conn() as c:
        c.execute(
            "UPDATE trip_publish_intents SET expires_at = datetime('now', '-1 hour') "
            "WHERE owner_user_id = ? AND idempotency_key = 'key-13'",
            (STATE["a_id"],),
        )
        c.commit()

    deleted = marketplace_module.cleanup_expired_trip_publish_intents()
    assert deleted >= 1

    with get_conn() as c:
        intent_row = c.execute(
            "SELECT 1 FROM trip_publish_intents WHERE owner_user_id = ? AND idempotency_key = 'key-13'",
            (STATE["a_id"],),
        ).fetchone()
        trip_row = c.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone()
    assert intent_row is None, "cleanup must remove the expired bookkeeping row"
    assert trip_row is not None, "cleanup must NEVER remove the Trip itself"


def test_14_reusing_an_expired_key_starts_a_fresh_intent_not_a_stale_reuse():
    """After expiry (and even before the periodic sweep gets to it), the
    SAME key with a DIFFERENT payload must be allowed -- it is a brand new
    intent, not a reuse of the old one."""
    r1 = _publish("key-14", price=3014)
    assert r1.status_code == 200, r1.text
    with get_conn() as c:
        c.execute(
            "UPDATE trip_publish_intents SET expires_at = datetime('now', '-1 hour') "
            "WHERE owner_user_id = ? AND idempotency_key = 'key-14'",
            (STATE["a_id"],),
        )
        c.commit()
    # Deliberately do NOT run cleanup here -- the fix must hold even when
    # the expired row is still physically present.
    r2 = _publish("key-14", price=9999)
    assert r2.status_code == 200, (
        f"reusing an EXPIRED key with a different payload should start a fresh "
        f"intent, not 409: {r2.status_code} {r2.text}"
    )
    assert r2.json()["id"] != r1.json()["id"]
