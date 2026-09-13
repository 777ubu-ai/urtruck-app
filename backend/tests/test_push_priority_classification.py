"""Push-forensic track — CRITICAL_EVENTS producer-string fix.

Root cause: services/push_gateway.py's CRITICAL_EVENTS (read by
enqueue_event() to classify outbox priority) listed "trip.*"/"deal.cancelled"
names that no producer has ever emitted — deal-status pushes use
f"deal.status.{new_status}" (api/marketplace.py's _transition_deal), GPS
pushes use the bare "gps_lost"/"gps_restored" (_tracking_notify). Every
event except "bid.accepted" therefore silently fell through to "normal"
outbox priority since this set was introduced — undetected because nothing
asserted outbox priority for these events. test_gps_lost_restored.py's own
docstring already flagged the sibling half of this bug (these events were
"declared but nothing ever produced them"); this is the producer-string
mismatch that made that flag matter for priority classification too.

CI contract: top-level `def test_*` (not a class) — see other push test
files in this directory for why.
"""
import os

os.environ.setdefault("ENV", "test")


def test_critical_events_match_actual_producer_strings():
    """CRITICAL_EVENTS must contain the exact `event` strings producers
    pass (f"deal.status.{new_status}" for deal transitions, bare
    "gps_lost" for GPS drop) — not stale "trip.*" names nothing emits."""
    from services import push_gateway

    assert "bid.accepted" in push_gateway.CRITICAL_EVENTS
    assert "gps_lost" in push_gateway.CRITICAL_EVENTS
    assert "deal.status.in_progress" in push_gateway.CRITICAL_EVENTS
    assert "deal.status.delivered" in push_gateway.CRITICAL_EVENTS
    assert "deal.status.completed" in push_gateway.CRITICAL_EVENTS
    # The stale, never-emitted strings must be gone — their presence was
    # the bug (silently made these events "normal" priority forever).
    assert "trip.started" not in push_gateway.CRITICAL_EVENTS
    assert "trip.gps_lost" not in push_gateway.CRITICAL_EVENTS
    assert "trip.delivered" not in push_gateway.CRITICAL_EVENTS
    assert "trip.completed" not in push_gateway.CRITICAL_EVENTS


def test_enqueue_event_actually_assigns_critical_priority_for_real_events(monkeypatch):
    """Behavioral, not just set-membership: enqueue_event() must actually
    classify a real deal-status/gps event as priority='critical' end to
    end, using the REAL function — not a re-implementation of the check."""
    import uuid
    from database.db import get_conn
    from services import push_gateway

    for event_type in ("deal.status.delivered", "gps_lost", "bid.accepted"):
        recipient = "push-prio-test-" + uuid.uuid4().hex[:8]
        event_id = f"prio-test:{uuid.uuid4().hex}"
        ok = push_gateway.enqueue_event(event_id, event_type, recipient, {"title": "T", "body": "B", "data": {}})
        assert ok, f"enqueue_event should insert a fresh row for {event_type}"
        with get_conn() as c:
            row = c.execute(
                "SELECT priority FROM push_outbox WHERE event_id = ? AND recipient_user_id = ?",
                (event_id, recipient),
            ).fetchone()
        assert row["priority"] == "critical", f"{event_type} must enqueue with critical priority, got {row['priority']!r}"


def test_deal_status_events_not_in_critical_set_stay_normal_priority():
    """Sanity check the fix isn't over-broad — a status this app doesn't
    treat as safety/completion-critical (e.g. at_border) stays 'normal'."""
    import uuid
    from database.db import get_conn
    from services import push_gateway

    recipient = "push-prio-test-" + uuid.uuid4().hex[:8]
    event_id = f"prio-test:{uuid.uuid4().hex}"
    push_gateway.enqueue_event(event_id, "deal.status.at_border", recipient, {"title": "T", "body": "B", "data": {}})
    with get_conn() as c:
        row = c.execute(
            "SELECT priority FROM push_outbox WHERE event_id = ? AND recipient_user_id = ?",
            (event_id, recipient),
        ).fetchone()
    assert row["priority"] == "normal"
