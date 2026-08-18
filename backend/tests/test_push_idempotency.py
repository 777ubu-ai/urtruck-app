from services import push_sender


def test_push_sender_skips_successfully_delivered_event(monkeypatch):
    monkeypatch.setattr(push_sender, "_already_delivered", lambda user_id, event_key: True)
    monkeypatch.setattr(
        push_sender,
        "_send_web",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("web provider must not run")),
    )
    monkeypatch.setattr(
        push_sender,
        "_send_native",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("native provider must not run")),
    )

    result = push_sender.send(
        "user-1",
        "GPS",
        "Tracking enabled",
        kind="tracking_approved",
        data={"event_key": "gps:deal-1:tracking_approved:2026-08-15T03:00:00"},
        url="/deals/deal-1",
    )

    assert result["deduped"] is True
    assert result["total"] == 0
