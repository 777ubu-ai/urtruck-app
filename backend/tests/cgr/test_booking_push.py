"""Регрессии пушей для привязанной брони CarGoRuqsat."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cgr import booking_service


def test_called_booking_change_sends_throttled_push(monkeypatch):
    sent = []
    logged = []

    monkeypatch.setattr(booking_service.cgr_dal, "should_send_push", lambda *a, **k: True)
    monkeypatch.setattr(booking_service.cgr_dal, "log_push_sent", lambda *a, **k: logged.append((a, k)))

    import api.push
    monkeypatch.setattr(api.push, "send_to_user", lambda *a, **k: sent.append((a, k)))

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
    assert "Ваша очередь подошла" in sent[0][0][1]
    assert sent[0][1]["kind"] == "queue"
    assert len(logged) == 1


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

