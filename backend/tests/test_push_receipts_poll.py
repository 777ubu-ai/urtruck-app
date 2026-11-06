"""Expo delivery-receipt reconciliation tests (push-recovery track, Phase 5).

Exercises the REAL services.push_gateway.poll_pending_receipts against a
real (temp) SQLite push_delivery_log/push_devices — not source-regex.
Confirms: bounded age window, exactly-once-per-row polling
(receipt_checked_at), 'ok' -> delivered_at, DeviceNotRegistered -> device
deactivated, an unresolved receipt stays unconfirmed without being
re-polled, and a transient provider failure leaves rows untouched for the
next tick to retry (rather than marking them checked and losing them).
"""
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_receipts_poll.db")
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
import api.push as push_api  # noqa: F401 — runs _init_schema() (push_delivery_log etc.)


def _make_device():
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO push_devices (user_id, device_id, platform, push_provider, push_token, enabled) "
            "VALUES (?,?,?,?,?,1)",
            (uid, uuid.uuid4().hex, "android", "expo", token),
        )
        device_registry_id = cur.lastrowid
    return uid, token, device_registry_id


def _log_row(device_registry_id, ticket_id, sent_minutes_ago):
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO push_delivery_log "
            "(event_id, recipient_user_id, device_registry_id, provider, provider_message_id, status, sent_at) "
            "VALUES (?,?,?,?,?,?, datetime(CURRENT_TIMESTAMP, ?))",
            (None, "u1", device_registry_id, "expo", ticket_id, "sent", f"-{sent_minutes_ago} minutes"),
        )
        return cur.lastrowid


def _row(row_id):
    with get_conn() as c:
        return c.execute("SELECT * FROM push_delivery_log WHERE id=?", (row_id,)).fetchone()


def _device(device_registry_id):
    with get_conn() as c:
        return c.execute("SELECT * FROM push_devices WHERE id=?", (device_registry_id,)).fetchone()


def test_resolved_ok_receipt_marks_delivered():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-ok-1", sent_minutes_ago=20)

    def fake_receipts(ids):
        return {"receipts": {"ticket-ok-1": {"status": "ok"}}, "error": None}

    stats = push_gateway.poll_pending_receipts(fake_receipts, limit=10)
    assert stats == {"checked": 1, "delivered": 1, "invalid_token": 0, "errors": 0}
    row = _row(row_id)
    assert row["delivered_at"] is not None
    assert row["receipt_checked_at"] is not None


def test_device_not_registered_deactivates_device():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-dnr-1", sent_minutes_ago=20)

    def fake_receipts(ids):
        return {"receipts": {"ticket-dnr-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}, "error": None}

    stats = push_gateway.poll_pending_receipts(fake_receipts, limit=10)
    assert stats["invalid_token"] == 1
    device = _device(dev_id)
    assert device["enabled"] == 0
    assert device["invalidated_reason"] == "expo_receipt_device_not_registered"
    row = _row(row_id)
    assert row["delivered_at"] is None
    assert row["receipt_checked_at"] is not None


def test_unresolved_receipt_stays_unconfirmed_but_checked_once():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-pending-1", sent_minutes_ago=20)
    calls = {"n": 0}

    def fake_receipts(ids):
        calls["n"] += 1
        return {"receipts": {}, "error": None}  # Expo has no answer yet

    push_gateway.poll_pending_receipts(fake_receipts, limit=10)
    row = _row(row_id)
    assert row["delivered_at"] is None
    assert row["receipt_checked_at"] is not None, "must be marked checked even when unresolved — this is the once-per-row guard"

    # A second tick must not pick this row up again.
    push_gateway.poll_pending_receipts(fake_receipts, limit=10)
    assert calls["n"] == 1, "an already-checked row must never be queried a second time"


def test_row_too_young_is_not_polled_yet():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-young-1", sent_minutes_ago=2)  # below RECEIPT_MIN_AGE_MINUTES

    def fail_if_called(ids):
        raise AssertionError("must not query a receipt before the minimum age window")

    stats = push_gateway.poll_pending_receipts(fail_if_called, limit=10)
    assert stats["checked"] == 0
    assert _row(row_id)["receipt_checked_at"] is None


def test_row_too_old_is_never_polled():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-old-1", sent_minutes_ago=60 * 24 * 3)  # 3 days — beyond RECEIPT_MAX_AGE_DAYS

    def fail_if_called(ids):
        raise AssertionError("must not query a receipt past the max age window")

    stats = push_gateway.poll_pending_receipts(fail_if_called, limit=10)
    assert stats["checked"] == 0
    assert _row(row_id)["receipt_checked_at"] is None


def test_provider_failure_leaves_rows_for_next_tick():
    _, _, dev_id = _make_device()
    row_id = _log_row(dev_id, "ticket-fail-1", sent_minutes_ago=20)

    def raising_receipts(ids):
        raise RuntimeError("network error")

    stats = push_gateway.poll_pending_receipts(raising_receipts, limit=10)
    assert stats == {"checked": 0, "delivered": 0, "invalid_token": 0, "errors": 0}
    row = _row(row_id)
    assert row["receipt_checked_at"] is None, "a transient provider failure must not mark rows as checked — must retry next tick"


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
