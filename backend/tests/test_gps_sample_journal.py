import time
from concurrent.futures import ThreadPoolExecutor

from api import marketplace as mp
from database.db import get_conn
from tests.test_gps_lost_restored import seed_deal, approve_tracking, DRIVER, gps_events, make_stale


def test_retry_is_idempotent_and_older_capture_is_preserved():
    deal = seed_deal()
    approve_tracking(deal)
    now = int(time.time() * 1000)
    body = mp.DealLocationIn(lat=43, lng=76, captured_at_ms=now, sample_id="new")
    mp.update_deal_location(deal, body, user={"id": DRIVER})
    assert mp.update_deal_location(deal, body, user={"id": DRIVER})["deduplicated"]
    mp.update_deal_location(deal, mp.DealLocationIn(lat=42, lng=75, captured_at_ms=now - 60000, sample_id="old"), user={"id": DRIVER})
    with get_conn() as c:
        rows = c.execute("SELECT captured_at_ms FROM deal_location_samples WHERE deal_id=? ORDER BY captured_at_ms", (deal,)).fetchall()
        marker = c.execute("SELECT captured_at_ms FROM deal_locations WHERE deal_id=?", (deal,)).fetchone()
    assert [r[0] for r in rows] == [now - 60000, now]
    assert marker[0] == now


def test_concurrent_retry_creates_one_sample_and_one_restore(monkeypatch):
    monkeypatch.setattr(mp, "_tracking_notify", lambda *a, **k: None)
    deal = seed_deal()
    approve_tracking(deal)
    now = int(time.time() * 1000)
    mp.update_deal_location(deal, mp.DealLocationIn(lat=43, lng=76, captured_at_ms=now - 1800000), user={"id": DRIVER})
    mp.check_gps_heartbeats_job()
    body = mp.DealLocationIn(lat=44, lng=77, captured_at_ms=now, sample_id="concurrent")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: mp.update_deal_location(deal, body, user={"id": DRIVER}), range(2)))
    assert all(r["ok"] for r in results)
    assert gps_events(deal) == ["gps_lost", "gps_restored"]
    with get_conn() as c:
        assert c.execute("SELECT count(*) FROM deal_location_samples WHERE deal_id=? AND sample_id='concurrent'", (deal,)).fetchone()[0] == 1


def test_sample_id_collision_does_not_overwrite_and_terminal_deal_rejects():
    import pytest
    from fastapi import HTTPException
    deal = seed_deal()
    approve_tracking(deal)
    now = int(time.time() * 1000)
    body = mp.DealLocationIn(lat=43, lng=76, captured_at_ms=now, sample_id="immutable")
    mp.update_deal_location(deal, body, user={"id": DRIVER})
    with pytest.raises(HTTPException) as conflict:
        mp.update_deal_location(deal, body.model_copy(update={"lat": 44}), user={"id": DRIVER})
    assert conflict.value.status_code == 409
    with get_conn() as c:
        c.execute("UPDATE deals SET status='completed' WHERE id=?", (deal,))
    with pytest.raises(HTTPException) as stopped:
        mp.update_deal_location(deal, body, user={"id": DRIVER})
    assert stopped.value.status_code == 409
