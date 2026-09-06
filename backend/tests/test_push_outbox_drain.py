"""Evidence tests for the production push_outbox drain and retry contract."""
import json
import pytest

from database.db import get_conn
from services import push_gateway


@pytest.fixture(autouse=True)
def _isolated_push_outbox_rows():
    # The canonical suite contains legacy tests that intentionally leave
    # pending push rows for later assertions. These worker tests own the
    # queue during each case so batch counts remain deterministic.
    with get_conn() as conn:
        conn.execute("DELETE FROM push_outbox")
        conn.execute("DELETE FROM push_delivery_log")
    yield


def _insert_event(event_id: str, recipient: str = "user-push-drain") -> int:
    payload = {"title": "UrTruck", "body": event_id, "data": {"event_id": event_id}}
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO push_outbox(event_id, event_type, recipient_user_id, payload)
            VALUES (?, 'chat.message', ?, ?)
            """,
            (event_id, recipient, json.dumps(payload)),
        )
        return int(cur.lastrowid)


def _row(row_id: int):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM push_outbox WHERE id=?", (row_id,)).fetchone()


def _make_due(row_id: int):
    with get_conn() as conn:
        conn.execute(
            "UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE id=?",
            (row_id,),
        )


def test_transient_failure_is_retried_and_then_processed(monkeypatch):
    row_id = _insert_event("push-drain-transient")
    calls = []

    def send_once(*args, **kwargs):
        calls.append(1)
        return {"sent": 0}

    monkeypatch.setattr(push_gateway, "send_to_devices", send_once)
    first = push_gateway.process_pending_once(lambda *args, **kwargs: {})
    pending = _row(row_id)
    assert first == {"picked": 1, "sent": 0, "failed": 1, "dead": 0}
    assert pending["status"] == "pending"
    assert pending["attempt_count"] == 1
    assert pending["next_attempt_at"] is not None

    _make_due(row_id)
    monkeypatch.setattr(push_gateway, "send_to_devices", lambda *args, **kwargs: {"sent": 1})
    second = push_gateway.process_pending_once(lambda *args, **kwargs: {})
    sent = _row(row_id)
    assert second == {"picked": 1, "sent": 1, "failed": 0, "dead": 0}
    assert sent["status"] == "sent"
    assert sent["attempt_count"] == 2
    assert len(calls) == 1


def test_permanent_exception_is_bounded_and_does_not_block_following_event(monkeypatch):
    dead_id = _insert_event("push-drain-permanent")
    following_id = _insert_event("push-drain-following")

    def always_fails(*args, **kwargs):
        raise RuntimeError("provider permanently unavailable")

    monkeypatch.setattr(push_gateway, "send_to_devices", always_fails)
    for _ in range(push_gateway.PUSH_OUTBOX_MAX_ATTEMPTS):
        _make_due(dead_id)
        push_gateway.process_pending_once(lambda *args, **kwargs: {}, limit=1)

    dead = _row(dead_id)
    assert dead["status"] == "dead"
    assert dead["attempt_count"] == push_gateway.PUSH_OUTBOX_MAX_ATTEMPTS
    assert "provider permanently unavailable" in dead["last_error"]

    monkeypatch.setattr(push_gateway, "send_to_devices", lambda *args, **kwargs: {"sent": 1})
    _make_due(following_id)
    result = push_gateway.process_pending_once(lambda *args, **kwargs: {}, limit=2)
    assert result["sent"] == 1
    assert _row(following_id)["status"] == "sent"


def test_replay_does_not_redeliver_sent_event(monkeypatch):
    row_id = _insert_event("push-drain-replay")
    calls = []

    def send_once(*args, **kwargs):
        calls.append(1)
        return {"sent": 1}

    monkeypatch.setattr(push_gateway, "send_to_devices", send_once)
    first = push_gateway.process_pending_once(lambda *args, **kwargs: {})
    second = push_gateway.process_pending_once(lambda *args, **kwargs: {})
    assert first["sent"] == 1
    assert second["picked"] == 0
    assert len(calls) == 1
    assert _row(row_id)["status"] == "sent"


def test_restart_recovers_expired_processing_claim(monkeypatch):
    row_id = _insert_event("push-drain-restart")
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE push_outbox
               SET status='processing', processing_started_at=datetime(CURRENT_TIMESTAMP, '-600 seconds')
             WHERE id=?
            """,
            (row_id,),
        )

    monkeypatch.setattr(push_gateway, "send_to_devices", lambda *args, **kwargs: {"sent": 1})
    result = push_gateway.process_pending_once(lambda *args, **kwargs: {})
    assert result["picked"] == 1
    assert _row(row_id)["status"] == "sent"
