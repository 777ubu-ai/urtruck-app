"""Push-recovery track, Phase 4: trip.gps_lost / trip.gps_restored.

Root cause fixed: these two event types were declared in
services/push_gateway.py's CRITICAL_EVENTS/PUSH_EVENT_CATALOG but NOTHING
ever produced them — no watchdog, no scheduler job. Built on top of REAL,
already-maintained data: deal_tracking.last_signal_at is updated by every
genuine ping from POST /deals/{id}/location (not invented telemetry).

Contract under test (api/marketplace.py check_gps_heartbeats_job /
update_deal_location, scheduler/jobs.py gps_heartbeat_check_job):
  healthy -> stale threshold -> ONE gps_lost
  still stale -> no spam (repeated scheduler ticks fire nothing more)
  fresh valid update -> ONE gps_restored
  inactive trip (not in_progress/at_border, or tracking not approved) -> no event

Run from backend/:
    DB_PATH=/tmp/urtruck_test_gps_lost.db python -m tests.test_gps_lost_restored
Exit != 0 on any failure. Compatible with pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_gps_lost.db")
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

from api.marketplace import mp_router, check_gps_heartbeats_job
from tests.auth_harness import override_require_level

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
override_require_level(app, fake_require_level(1))
client = TestClient(app)

SHIPPER = "test-shipper-gps"
DRIVER = "test-driver-gps"


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def seed_deal(status="in_progress"):
    cargo_id, bid_id, deal_id = new_id(), new_id(), new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, SHIPPER, "+700", "Owner", "Almaty", "Astana", "Test cargo", "tent", 3000, 0, "taken"),
        )
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, bid_id, SHIPPER, DRIVER, "Almaty", "Astana", 3000, status),
        )
    return deal_id


def approve_tracking(deal_id):
    as_user(SHIPPER)
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 200
    as_user(DRIVER)
    r = client.post(f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"})
    assert r.status_code == 200, r.text


def send_ping(deal_id):
    as_user(DRIVER)
    return client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 43.2, "lng": 76.9})


def gps_events(deal_id):
    with get_conn() as c:
        rows = c.execute(
            "SELECT event_type FROM deal_tracking_events WHERE deal_id=? AND event_type IN ('gps_lost','gps_restored') "
            "ORDER BY id",
            (deal_id,),
        ).fetchall()
    return [r["event_type"] for r in rows]


def make_stale(deal_id, minutes=30):
    with get_conn() as c:
        c.execute(
            "UPDATE deal_tracking SET last_signal_at = datetime(CURRENT_TIMESTAMP, ?) WHERE deal_id=?",
            (f"-{minutes} minutes", deal_id),
        )


def test_healthy_to_stale_fires_one_gps_lost():
    d = seed_deal("in_progress")
    approve_tracking(d)
    assert send_ping(d).status_code == 200
    make_stale(d)

    stats = check_gps_heartbeats_job()
    assert stats["fired"] == 1
    assert gps_events(d) == ["gps_lost"]


def test_still_stale_does_not_spam():
    d = seed_deal("in_progress")
    approve_tracking(d)
    assert send_ping(d).status_code == 200
    make_stale(d)

    check_gps_heartbeats_job()
    check_gps_heartbeats_job()
    check_gps_heartbeats_job()
    assert gps_events(d) == ["gps_lost"], "repeated ticks while still stale must not fire a second gps_lost"


def test_fresh_ping_after_lost_fires_one_gps_restored():
    d = seed_deal("in_progress")
    approve_tracking(d)
    assert send_ping(d).status_code == 200
    make_stale(d)
    check_gps_heartbeats_job()
    assert gps_events(d) == ["gps_lost"]

    r = send_ping(d)
    assert r.status_code == 200
    assert gps_events(d) == ["gps_lost", "gps_restored"]

    # A further ping after already-restored must not fire a second gps_restored.
    r2 = send_ping(d)
    assert r2.status_code == 200
    assert gps_events(d) == ["gps_lost", "gps_restored"], "an already-healthy deal must not re-fire gps_restored on every ping"


def test_inactive_trip_never_fires():
    d = seed_deal("accepted")  # not in_progress/at_border — tracking never approved either
    stats = check_gps_heartbeats_job()
    assert gps_events(d) == []
    # sanity: the job ran but found nothing for this deal specifically
    with get_conn() as c:
        row = c.execute("SELECT status FROM deal_tracking WHERE deal_id=?", (d,)).fetchone()
    assert row is None, "no tracking row exists at all for a deal that never requested GPS"


def test_no_signal_yet_is_not_treated_as_lost():
    """A deal with tracking approved but the driver has never sent a single
    ping (last_signal_at IS NULL) is a different, unaddressed situation from
    'was healthy, went stale' — must not be misclassified as gps_lost."""
    d = seed_deal("in_progress")
    approve_tracking(d)
    stats = check_gps_heartbeats_job()
    assert gps_events(d) == []


if __name__ == "__main__":
    import traceback

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"OK   {t.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL {t.__name__}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
