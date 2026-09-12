"""Push-outbox drain-worker behavioral tests (push-recovery track).

Root cause fixed: services.push_gateway.enqueue_event() was already called on
every event_key'd send (services/push_sender.py `send()`), but nothing ever
called process_pending_once() in production — rows piled up 'pending'
forever with zero retries whenever the inline synchronous send failed, and
even when it succeeded the row was never marked 'sent', so a worker (once
wired) would have re-sent it. This file proves, against the REAL functions
and a real (temp) SQLite push_outbox/push_devices — not source-regex — that:

  1. a pending event is delivered
  2. a transient provider failure retries (with backoff, not immediately)
  3. a retry eventually succeeds
  4. a successful event is never sent twice
  5. max attempts reaches a terminal 'dead' state
  6. a poison event (handler that raises) does not block the next event
  7. a worker restart (stale 'processing' row from a crash) resumes delivery
  8. repeated worker execution is idempotent
  9. token/device ownership is undisturbed by a successful delivery
  10. two concurrent workers cannot both claim/double-send the same row
  11. the immediate/inline fast path (services.push_sender.send) marking its
      own outbox row 'sent' on success is what stops the worker from ever
      re-sending it — the actual delivery-ownership contract, end to end.

Provider responses are simulated via a fake `expo_send_one` callback — the
exact seam services.push_sender._send_native already hands push_gateway in
production for the Expo path (see push_gateway.ExpoProvider.send()) — so no
real network call is made and no Expo/FCM/APNs behavior is invented.
"""
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_outbox_drain.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from database.db import get_conn
from services import push_gateway
import api.push as push_api  # noqa: F401  — import runs _init_schema() (push_outbox etc.)


# ───────────────────────── fixtures / helpers ─────────────────────────
def _make_user_with_device(provider="expo"):
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    device_id = uuid.uuid4().hex
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_devices (user_id, device_id, platform, push_provider, push_token, enabled) "
            "VALUES (?,?,?,?,?,1)",
            (uid, device_id, "android" if provider != "apns" else "ios", provider, token),
        )
    return uid, token


def _enqueue(uid, event_key, event_type="test.event"):
    ok = push_gateway.enqueue_event(event_key, event_type, uid, {"title": "T", "body": "B", "data": {}})
    assert ok, "enqueue_event should have inserted a fresh row"
    return event_key


def _row(event_key, uid):
    with get_conn() as c:
        return c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (event_key, uid)
        ).fetchone()


def _always_ok(tokens, title, body, data, badge=None):
    return {"sent": len(tokens), "tickets": [{"status": "ok", "id": f"ticket-{i}"} for i in range(len(tokens))]}


def _always_fail_transient(tokens, title, body, data, badge=None):
    return {"sent": 0, "tickets": [{"status": "error", "details": {"error": "RATE_LIMIT_EXCEEDED"}}], "error": "rate_limited"}


class _FlakyThenOk:
    """Fails N times, then succeeds — 'retry eventually succeeds'."""

    def __init__(self, fail_times):
        self.fail_times = fail_times
        self.calls = 0

    def __call__(self, tokens, title, body, data, badge=None):
        self.calls += 1
        if self.calls <= self.fail_times:
            return {"sent": 0, "tickets": [{"status": "error", "details": {"error": "transient"}}], "error": "transient"}
        return {"sent": len(tokens), "tickets": [{"status": "ok"}] * len(tokens)}


def _poison(tokens, title, body, data, badge=None):
    raise RuntimeError("simulated poison event — malformed provider response")


def _force_due(event_key):
    """Test-only: collapse the backoff window so the next drain tick
    considers this row due again, instead of sleeping in the test."""
    with get_conn() as c:
        c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?", (event_key,))


# I18N-16 (2026-09-13): every test in this file shares one process-wide
# SQLite DB with every other backend test file (same pattern documented in
# tests/test_durable_event_delivery.py's own _reset_outbox() helper), and
# several tests below call process_pending_once() with NO per-recipient
# filter — `stats["picked"]`/`stats["failed"]` reflect the ENTIRE outbox
# table, not just rows this test created. Any other test file that enqueues
# a real push_outbox row (any user with a real push_devices row + an
# event_key'd send — e.g. test_bid_actions.py, test_live_deal_push_
# lifecycle.py) and happens to run before this file, in whatever order the
# full suite collects tests, can leave a stray 'pending' row that a test
# here then trips over. Confirmed by direct bisection against the
# pre-i18n-16 base commit (72fb8217) that this cross-file leak already
# existed before this track touched anything — e.g. `pytest
# tests/test_live_deal_push_lifecycle.py tests/test_push_outbox_drain.py`
# alone already failed on that base commit. The reason the full suite
# passed clean there is incidental: test_durable_event_delivery.py's own
# _reset_outbox() (same rationale, same fix) happens to run between the
# polluting files and this one in default alphabetical collection order —
# this file must not depend on that coincidence to pass. Not a workaround
# for a product bug — the actual delivery-ownership contract these tests
# verify is real and untouched; this is purely test-hygiene for the shared
# SQLite harness, matching test_durable_event_delivery.py's own established
# convention instead of inventing a new one.
import pytest


@pytest.fixture(autouse=True)
def _clean_outbox_before_each_test():
    with get_conn() as c:
        c.execute("DELETE FROM push_outbox")
        c.execute("DELETE FROM push_delivery_log")
    yield


# ───────────────────────── tests ─────────────────────────
def test_1_pending_event_is_delivered():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-deliver-1")
    stats = push_gateway.process_pending_once(_always_ok, limit=10)
    assert stats["sent"] == 1
    row = _row(ek, uid)
    assert row["status"] == "sent"
    assert row["sent_at"] is not None


def test_2_transient_provider_failure_retries():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-retry-1")
    stats = push_gateway.process_pending_once(_always_fail_transient, limit=10)
    assert stats["failed"] == 1
    row = _row(ek, uid)
    assert row["status"] == "pending"
    assert row["attempt_count"] == 1
    assert row["next_attempt_at"] is not None
    # An immediate second tick must NOT re-pick it — backoff must actually delay.
    stats2 = push_gateway.process_pending_once(_always_fail_transient, limit=10)
    assert stats2["picked"] == 0, "bounded exponential backoff must delay the retry"


def test_3_retry_eventually_succeeds():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-retry-2")
    flaky = _FlakyThenOk(fail_times=2)
    for _ in range(3):
        push_gateway.process_pending_once(flaky, limit=10)
        _force_due(ek)
    row = _row(ek, uid)
    assert row["status"] == "sent"
    assert flaky.calls == 3


def test_4_successful_event_not_sent_twice():
    uid, _ = _make_user_with_device()
    _enqueue(uid, "evt-once-1")
    calls = {"n": 0}

    def counting_ok(tokens, title, body, data, badge=None):
        calls["n"] += 1
        return _always_ok(tokens, title, body, data, badge)

    push_gateway.process_pending_once(counting_ok, limit=10)
    push_gateway.process_pending_once(counting_ok, limit=10)
    push_gateway.process_pending_once(counting_ok, limit=10)
    assert calls["n"] == 1, "a row already 'sent' must never be picked again"


def test_5_max_attempts_reaches_dead():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-dead-1")
    for _ in range(push_gateway.MAX_OUTBOX_ATTEMPTS):
        push_gateway.process_pending_once(_always_fail_transient, limit=10)
        _force_due(ek)
    row = _row(ek, uid)
    assert row["status"] == "dead"
    assert row["attempt_count"] == push_gateway.MAX_OUTBOX_ATTEMPTS
    stats = push_gateway.process_pending_once(_always_fail_transient, limit=10)
    assert stats["picked"] == 0, "a dead row must never be resurrected"


def test_6_poison_event_does_not_block_following_event():
    uid1, _ = _make_user_with_device()
    uid2, _ = _make_user_with_device()
    ek1 = _enqueue(uid1, "evt-poison-1")
    ek2 = _enqueue(uid2, "evt-poison-2")
    stats = push_gateway.process_pending_once(_poison, limit=10)
    assert stats["picked"] == 2
    assert stats["failed"] == 2, "both must hit the same attempt/backoff ladder, not crash the batch"
    row1, row2 = _row(ek1, uid1), _row(ek2, uid2)
    assert row1["status"] == "pending" and row2["status"] == "pending"
    assert row1["last_error"] and "poison" in row1["last_error"]


def test_7_worker_restart_resumes_pending_event():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-restart-1")
    # No in-memory worker state survives a real process restart — only this
    # DB row does. Simulate a worker that claimed the row then crashed
    # before finishing it.
    with get_conn() as c:
        c.execute(
            "UPDATE push_outbox SET status='processing', claimed_at=datetime(CURRENT_TIMESTAMP, '-10 minutes') "
            "WHERE event_id=?",
            (ek,),
        )
    stats = push_gateway.process_pending_once(_always_ok, limit=10)
    assert stats["sent"] == 1, "a stale 'processing' row from a crashed worker must be reclaimed and delivered"
    assert _row(ek, uid)["status"] == "sent"


def test_8_repeated_worker_execution_is_idempotent():
    uid, _ = _make_user_with_device()
    _enqueue(uid, "evt-idempotent-1")
    r1 = push_gateway.process_pending_once(_always_ok, limit=10)
    r2 = push_gateway.process_pending_once(_always_ok, limit=10)
    r3 = push_gateway.process_pending_once(_always_ok, limit=10)
    assert r1["sent"] == 1
    assert r2 == {"picked": 0, "sent": 0, "failed": 0, "dead": 0}
    assert r3 == {"picked": 0, "sent": 0, "failed": 0, "dead": 0}


def test_9_token_device_ownership_preserved():
    uid, token = _make_user_with_device()
    _enqueue(uid, "evt-owner-1")
    push_gateway.process_pending_once(_always_ok, limit=10)
    with get_conn() as c:
        device = c.execute("SELECT * FROM push_devices WHERE push_token=?", (token,)).fetchone()
    assert device["user_id"] == uid
    assert device["enabled"] == 1, "a successful delivery must not disturb device ownership/enabled state"


def test_10_two_workers_cannot_double_send_same_event():
    uid, _ = _make_user_with_device()
    ek = _enqueue(uid, "evt-race-1")
    with get_conn() as c:
        row_id = c.execute("SELECT id FROM push_outbox WHERE event_id=?", (ek,)).fetchone()["id"]
    claimed_1 = push_gateway._claim_row(row_id)
    claimed_2 = push_gateway._claim_row(row_id)
    assert claimed_1 is not None
    assert claimed_2 is None, "a second concurrent claim of the same row must lose the race"


def test_11_immediate_success_prevents_worker_duplicate(monkeypatch):
    """End-to-end proof of the delivery-ownership contract: services.push_sender.send()
    delivering successfully through the inline fast path must mark its own
    outbox row 'sent' so a later worker tick never re-sends the same push."""
    from services import push_sender

    uid, _ = _make_user_with_device()
    calls = {"native": 0}

    def fake_send_native(user_id, title, body, data, badge=None):
        calls["native"] += 1
        return 1, 1  # (sent, total_devices) — push-closure track signature

    monkeypatch.setattr(push_sender, "_send_web", lambda *a, **k: 0)
    monkeypatch.setattr(push_sender, "_send_native", fake_send_native)

    result = push_sender.send(
        uid, "New bid", "3500$ Almaty->Yiwu",
        kind="bid",
        data={"event_key": "bid:cargo-1:created"},
        url="/cargos/cargo-1",
    )
    assert result["native"] == 1
    assert calls["native"] == 1

    row = _row("bid:cargo-1:created", uid)
    assert row is not None
    assert row["status"] == "sent", "immediate fast-path success must mark the outbox row sent"

    stats = push_gateway.process_pending_once(_always_ok, limit=10)
    assert stats["picked"] == 0
    assert calls["native"] == 1, "worker must not have re-invoked native delivery for an already-sent event"


if __name__ == "__main__":
    import traceback

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            if "monkeypatch" in t.__code__.co_varnames[: t.__code__.co_argcount]:
                import pytest as _pytest

                class _MP:
                    def setattr(self, obj, name, value):
                        setattr(obj, name, value)

                t(_MP())
            else:
                t()
            print(f"OK   {t.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL {t.__name__}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
