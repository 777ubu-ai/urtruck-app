"""Регрессии пушей для привязанной брони CarGoRuqsat."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cgr import booking_service


def test_called_booking_change_sends_throttled_push(monkeypatch):
    sent = []
    logged = []
    notified = []

    monkeypatch.setattr(booking_service.cgr_dal, "should_send_push", lambda *a, **k: True)
    monkeypatch.setattr(booking_service.cgr_dal, "log_push_sent", lambda *a, **k: logged.append((a, k)))

    import api.push
    import api.notifications
    monkeypatch.setattr(api.push, "send_to_user", lambda *a, **k: sent.append((a, k)))
    monkeypatch.setattr(api.notifications, "create_notification", lambda *a, **k: notified.append((a, k)))

    booking = {
        "id": 7,
        "urtruck_user_id": "driver-1",
        "cgr_booking_number": "555-XYZ-2026",
        "checkpoint_code": "horgos",
    }
    ok = booking_service._send_booking_change_push(
        booking,
        {"status": "called"},
        "active",
        4,
        "active",
        4,
    )

    assert ok is True
    assert sent[0][0][0] == "driver-1"
    # I18N-16 (2026-09-12): "driver-1" has no push_devices row in this test
    # (monkeypatched, no real DB insert), so get_recipient_locale() falls to
    # DEFAULT_LOCALE — EN, not RU, since that track changed the fallback for
    # exactly this "truly no locale data" case (never silently show Russian
    # to a user we know nothing about — i18n expansion spec item 2).
    assert "Your turn is up" in sent[0][0][1]
    assert sent[0][1]["kind"] == "queue"
    assert len(logged) == 1

    # Push-recovery track, Phase 4: a significant lifecycle event
    # (called/crossed/revoked) must ALSO reach the in-app Bell, with a
    # stable per-booking event_key so a re-run of the same transition
    # cannot duplicate it.
    assert len(notified) == 1, "queue_called must create exactly one Bell notification"
    n_args, n_kwargs = notified[0]
    assert n_args[0] == "driver-1"
    assert n_args[1] == "queue_called"
    assert n_kwargs.get("event_key") == "queue_called:7"


def test_position_only_change_does_not_reach_bell(monkeypatch):
    """Push-recovery track, Phase 4: queue position updates are exactly the
    high-frequency telemetry this track was told NOT to add to Bell —
    called/crossed/revoked (above) are the only CGR events that do."""
    sent = []
    notified = []
    monkeypatch.setattr(booking_service.cgr_dal, "should_send_push", lambda *a, **k: True)
    monkeypatch.setattr(booking_service.cgr_dal, "log_push_sent", lambda *a, **k: None)

    import api.push
    import api.notifications
    monkeypatch.setattr(api.push, "send_to_user", lambda *a, **k: sent.append((a, k)))
    monkeypatch.setattr(api.notifications, "create_notification", lambda *a, **k: notified.append((a, k)))

    ok = booking_service._send_booking_change_push(
        {"id": 9, "urtruck_user_id": "driver-2", "cgr_booking_number": "POS-1"},
        {"status": "in_queue"},
        "active",
        6,
        "active",
        3,  # position changed, no called/crossed/revoked
    )

    assert ok is True
    assert len(sent) == 1, "position change still gets a push"
    assert len(notified) == 0, "but must NOT create a Bell/notifications row"


def test_first_pending_to_active_without_event_is_silent(monkeypatch):
    monkeypatch.setattr(booking_service.cgr_dal, "should_send_push", lambda *a, **k: True)
    assert booking_service._send_booking_change_push(
        {"id": 8, "urtruck_user_id": "driver-1", "cgr_booking_number": "ABC"},
        {"status": "in_queue"},
        "pending",
        None,
        "active",
        None,
    ) is False

