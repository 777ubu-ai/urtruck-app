import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_dual_compatibility.db")

from database import db as ddb
from database.db import get_conn
from services import push_gateway, push_sender

ddb.init_db()


def _device(registry_id, provider, device_id, token=None):
    return {
        "id": registry_id, "user_id": "owner-A", "device_id": device_id,
        "platform": "android", "app_id": "com.urtruck.app",
        "push_provider": provider, "push_token": token or f"{provider}-{registry_id}",
        "locale": "ru",
    }


def test_dual_prefers_native_for_same_owner_and_installation():
    rows = [
        _device(1, "fcm", "install-1"),
        _device(2, "expo", "install-1"),
        _device(3, "expo", "install-2"),
    ]
    selected = push_gateway._select_devices_for_mode(rows, "dual")
    assert [(row["id"], row["push_provider"]) for row in selected] == [(1, "fcm"), (3, "expo")]


def test_dual_fails_closed_for_ambiguous_expo_ids_when_native_exists():
    rows = [_device(1, "apns", None), _device(2, "expo", "install-2"),
            _device(3, "expo", None)]
    assert push_gateway._select_devices_for_mode(rows, "dual") == rows[:1]


def test_dual_keeps_expo_only_owner_and_deduplicates_identical_tokens():
    rows = [_device(1, "expo", None, "ExpoPushToken[one]"),
            _device(2, "expo", None, "ExpoPushToken[one]")]
    selected = push_gateway._select_devices_for_mode(rows, "dual")
    assert [row["id"] for row in selected] == [1]


def test_dual_keeps_only_latest_expo_token_per_installation():
    newest = _device(10, "expo", "install-rotated", "ExpoPushToken[new]")
    older = _device(9, "expo", "install-rotated", "ExpoPushToken[old]")
    other_app = {**_device(8, "expo", "install-rotated", "ExpoPushToken[qa]"),
                 "app_id": "com.urtruck.app.qa2"}
    selected = push_gateway._select_devices_for_mode([newest, older, other_app], "dual")
    assert [row["id"] for row in selected] == [10, 8]


def test_dual_keeps_only_latest_native_token_per_installation():
    newest = _device(10, "fcm", "install-rotated", "fcm-new")
    older = _device(9, "fcm", "install-rotated", "fcm-old")
    selected = push_gateway._select_devices_for_mode([newest, older], "dual")
    assert [row["id"] for row in selected] == [10]
    # Existing native-only rollout keeps its previous registry semantics.
    assert [row["id"] for row in push_gateway._select_devices_for_mode([newest, older], "native")] == [10, 9]


def test_dual_native_rotation_fails_closed_when_app_id_is_missing():
    newest = {**_device(10, "fcm", "install-rotated", "fcm-new"), "app_id": None}
    qa_app = {**_device(8, "fcm", "install-rotated", "fcm-qa"),
              "app_id": "com.urtruck.app.qa2"}
    selected = push_gateway._select_devices_for_mode([newest, qa_app], "dual")
    # Unknown and known app identities cannot prove an installation duplicate.
    assert [row["id"] for row in selected] == [10, 8]


def test_dual_keeps_both_known_native_apps_on_same_device_id():
    production = _device(1, "fcm", "shared-device-id")
    qa = {**_device(2, "fcm", "shared-device-id"), "app_id": "com.urtruck.app.qa2"}
    assert [row["id"] for row in push_gateway._select_devices_for_mode(
        [production, qa], "dual"
    )] == [1, 2]


def test_dual_matches_native_only_within_same_app_and_platform():
    native = _device(1, "fcm", "install-1")
    production_expo = _device(2, "expo", "install-1")
    qa_expo = {**_device(3, "expo", "install-1"), "app_id": "com.urtruck.app.qa2"}
    ios_expo = {**_device(4, "expo", "install-1"), "platform": "ios"}
    selected = push_gateway._select_devices_for_mode([native, production_expo, qa_expo, ios_expo], "dual")
    assert [row["id"] for row in selected] == [1, 3, 4]


def test_dual_treats_missing_app_id_as_ambiguous_same_installation():
    native = _device(1, "fcm", "install-1")
    legacy_missing_app = {**_device(2, "expo", "install-1"), "app_id": None}
    qa_native = {**_device(3, "fcm", "install-2"), "app_id": None}
    qa_expo = {**_device(4, "expo", "install-2"), "app_id": "com.urtruck.app.qa2"}

    # A missing app ID cannot prove that the Expo row belongs to another app.
    assert [row["id"] for row in push_gateway._select_devices_for_mode(
        [native, legacy_missing_app, qa_native, qa_expo], "dual"
    )] == [1, 3]


def test_dual_keeps_expo_installation_when_both_known_app_ids_differ():
    native = _device(1, "fcm", "install-1")
    qa_expo = {**_device(2, "expo", "install-1"), "app_id": "com.urtruck.app.qa2"}
    assert [row["id"] for row in push_gateway._select_devices_for_mode(
        [native, qa_expo], "dual"
    )] == [1, 2]


def test_dual_fallback_requires_exact_installation_identity():
    native = _device(1, "fcm", "install-1")
    fallback = {**_device(2, "expo", "install-1", "ExpoPushToken[legacy]"),
                "app_id": None}
    other_app = {**_device(3, "expo", "install-1", "ExpoPushToken[qa]"),
                 "app_id": "com.urtruck.app.qa2"}
    assert push_gateway._expo_fallbacks_for_mode([native, fallback, other_app], "dual") == {}
    native_unknown = {**native, "app_id": None}
    assert push_gateway._expo_fallbacks_for_mode(
        [native_unknown, fallback], "dual"
    ) == {}


def test_dual_fallback_uses_proven_same_app_before_ambiguous_expo_row():
    native = _device(1, "fcm", "install-1")
    exact = _device(2, "expo", "install-1", "ExpoPushToken[prod]")
    ambiguous = {**_device(3, "expo", "install-1", "ExpoPushToken[unknown]"),
                 "app_id": None}
    other_app = {**_device(4, "expo", "install-1", "ExpoPushToken[qa]"),
                 "app_id": "com.urtruck.app.qa2"}
    assert push_gateway._expo_fallbacks_for_mode(
        [native, ambiguous, other_app, exact], "dual"
    ) == {1: exact}


def test_dual_sends_expo_only_after_provider_confirms_native_token_invalid(monkeypatch):
    rows = [_device(1, "fcm", "install-1"),
            _device(2, "expo", "install-1", "ExpoPushToken[legacy]")]

    class InvalidNative:
        def supports_platform(self, platform):
            return True

        def validate_token(self, token):
            return True

        def send(self, token, title, body, data, badge=None):
            return push_gateway.ProviderResult("fcm", "failed", response={"UNREGISTERED": True},
                                               error_code="invalid_token", retryable=False)

    monkeypatch.setattr(push_gateway, "active_devices", lambda user_id: rows)
    monkeypatch.setattr(push_gateway, "notification_already_read", lambda user_id, data: False)
    monkeypatch.setattr(push_gateway, "_already_sent_to_device", lambda event_id, registry_id: False)
    monkeypatch.setattr(push_gateway, "log_delivery", lambda *args: None)
    monkeypatch.setattr(push_gateway, "FCMProvider", InvalidNative)
    monkeypatch.setattr(push_gateway, "APNsProvider", InvalidNative)
    expo_requests = []

    def expo_send(tokens, *args, **kwargs):
        expo_requests.extend(tokens)
        return {"tickets": [{"status": "ok", "id": "legacy-accepted"}]}

    result = push_gateway.send_to_devices(
        "owner-A", "t", "b", {"event_id": "event-fallback"}, 1,
        mode="dual", expo_send_one=expo_send,
    )
    assert expo_requests == ["ExpoPushToken[legacy]"]
    assert result["devices"] == 1 and result["sent"] == 1
    assert result["providers"] == {"expo": 1}


def test_dual_does_not_fallback_on_unconfirmed_local_native_failure(monkeypatch):
    rows = [_device(1, "fcm", "install-1"),
            _device(2, "expo", "install-1", "ExpoPushToken[legacy]")]

    class LocallyInvalidNative:
        def supports_platform(self, platform):
            return True

        def validate_token(self, token):
            return False

    monkeypatch.setattr(push_gateway, "active_devices", lambda user_id: rows)
    monkeypatch.setattr(push_gateway, "notification_already_read", lambda user_id, data: False)
    monkeypatch.setattr(push_gateway, "_already_sent_to_device", lambda event_id, registry_id: False)
    monkeypatch.setattr(push_gateway, "log_delivery", lambda *args: None)
    monkeypatch.setattr(push_gateway, "FCMProvider", LocallyInvalidNative)
    monkeypatch.setattr(push_gateway, "APNsProvider", LocallyInvalidNative)
    expo_requests = []
    result = push_gateway.send_to_devices(
        "owner-A", "t", "b", {"event_id": "event-local-failure"}, 1,
        mode="dual", expo_send_one=lambda tokens, *args, **kwargs: expo_requests.extend(tokens),
    )
    assert expo_requests == []
    assert result["sent"] == 0 and result["devices"] == 1


def test_native_mode_never_selects_expo_rows():
    rows = [_device(1, "fcm", "install-1"), _device(2, "expo", "install-2")]
    assert push_gateway._select_devices_for_mode(rows, "native") == rows[:1]


def test_expo_provider_treats_provider_confirmed_unregistered_token_as_invalid():
    provider = push_gateway.ExpoProvider(
        lambda tokens, *args, **kwargs: {
            "tickets": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]
        }
    )
    result = provider.send("ExpoPushToken[token]", "title", "body", {}, badge=0)
    assert result.status == "failed"
    assert result.error_code == "invalid_token"
    assert result.retryable is False


def test_expo_provider_records_ticket_id_for_delivery_evidence():
    provider = push_gateway.ExpoProvider(
        lambda tokens, *args, **kwargs: {"tickets": [{"status": "ok", "id": "ticket-1"}]}
    )
    result = provider.send("ExpoPushToken[token]", "title", "body", {}, badge=0)
    assert result.status == "sent"
    assert result.message_id == "ticket-1"


def test_legacy_expo_send_does_not_inject_an_unconfigured_bearer_secret(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return SimpleNamespace(status_code=200, json=lambda: {"data": [{"status": "ok", "id": "ticket"}]})

    monkeypatch.setattr(push_sender.httpx, "post", fake_post)
    result = push_sender._send_expo_detailed(
        ["ExpoPushToken[legacy]"], "title", "body", {"event_id": "evt"}, badge=1
    )

    assert result["sent"] == 1
    assert captured["url"] == push_sender.EXPO_ENDPOINT
    assert "Authorization" not in captured["headers"]


def test_dual_gateway_sends_once_per_installation(monkeypatch):
    rows = [_device(1, "fcm", "install-1"), _device(2, "expo", "install-1"),
            _device(3, "expo", "install-2", "ExpoPushToken[expo-3]")]
    delivered = []

    class FakeNative:
        def supports_platform(self, platform):
            return True

        def validate_token(self, token):
            return True

        def send(self, token, title, body, data, badge=None):
            return push_gateway.ProviderResult("fcm", "sent", message_id="fcm-accepted")

    monkeypatch.setattr(push_gateway, "active_devices", lambda user_id: rows)
    monkeypatch.setattr(push_gateway, "notification_already_read", lambda user_id, data: False)
    monkeypatch.setattr(push_gateway, "_already_sent_to_device", lambda event_id, registry_id: False)
    monkeypatch.setattr(push_gateway, "log_delivery", lambda event_id, user_id, device, result: delivered.append((device["id"], result.provider)))
    monkeypatch.setattr(push_gateway, "FCMProvider", FakeNative)
    monkeypatch.setattr(push_gateway, "APNsProvider", FakeNative)
    expo_requests = []

    def expo_send(tokens, *args, **kwargs):
        expo_requests.extend(tokens)
        return {"tickets": [{"status": "ok", "id": "expo-accepted"}]}

    result = push_gateway.send_to_devices(
        "owner-A", "t", "b", {"event_id": "event-1"}, 1,
        mode="dual", expo_send_one=expo_send,
    )
    assert result["devices"] == 2
    assert result["sent"] == 2
    assert result["providers"] == {"fcm": 1, "expo": 1}
    assert expo_requests == ["ExpoPushToken[expo-3]"]
    assert delivered == [(1, "fcm"), (3, "expo")]


def test_inline_outbox_lease_excludes_worker_and_duplicate_inline_sender():
    event_id = f"dual-lease:{uuid.uuid4()}"
    user_id = f"owner:{uuid.uuid4()}"
    assert push_gateway.enqueue_event(event_id, "chat.message", user_id,
                                      {"title": "t", "body": "b", "data": {}})
    inline_lock = push_gateway.claim_inline_event(event_id, user_id)
    assert inline_lock
    assert push_gateway.claim_inline_event(event_id, user_id) is None
    with get_conn() as c:
        row = c.execute("SELECT id,status,locked_by FROM push_outbox WHERE event_id=?", (event_id,)).fetchone()
    assert row["status"] == "processing"
    assert row["locked_by"] == inline_lock
    assert push_gateway._claim_row(row["id"]) is None
    push_gateway.finish_inline_event(event_id, user_id, inline_lock, "pending", "transient")
    with get_conn() as c:
        row = c.execute("SELECT status,claimed_at,locked_by FROM push_outbox WHERE event_id=?", (event_id,)).fetchone()
    assert row["status"] == "pending"
    assert row["claimed_at"] is None and row["locked_by"] is None


def test_web_delivery_ledger_suppresses_duplicate_inline_event(monkeypatch):
    from services import push_sender

    user_id = f"web-owner:{uuid.uuid4()}"
    event_id = f"web-event:{uuid.uuid4()}"
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,active) VALUES(?,?,?,?,1)",
            (user_id, f"https://push.example/{uuid.uuid4()}", "public-key", "auth-secret"),
        )
    monkeypatch.setattr(push_sender, "PUSH_MOCK_WEB", True)
    assert push_sender._send_web(user_id, "t", "b", {}, 1, event_id=event_id) == 1
    assert push_sender._send_web(user_id, "t", "b", {}, 1, event_id=event_id) == 0
    with get_conn() as c:
        rows = c.execute(
            "SELECT status,provider,device_registry_id FROM push_delivery_log WHERE event_id=?",
            (event_id,),
        ).fetchall()
    assert len(rows) == 1
    assert rows[0]["status"] == "sent" and rows[0]["provider"] == "web"
    assert rows[0]["device_registry_id"] < 0


def test_web_delivery_lease_fences_stale_sender_after_takeover():
    from services import push_sender

    user_id = f"web-lease-owner:{uuid.uuid4()}"
    event_id = f"web-lease-event:{uuid.uuid4()}"
    subscription_id = -abs(uuid.uuid4().int % 1000000 + 1)
    first = push_sender._claim_web_delivery(event_id, user_id, subscription_id)
    assert first
    with get_conn() as c:
        c.execute("UPDATE push_delivery_log SET created_at=datetime(CURRENT_TIMESTAMP, '-6 minutes') WHERE id=?", (first[0],))

    second = push_sender._claim_web_delivery(event_id, user_id, subscription_id)
    assert second and second[0] == first[0] and second[1] != first[1]
    push_sender._finish_web_delivery(first[0], first[1], sent=True)
    with get_conn() as c:
        row = c.execute("SELECT status,provider_message_id FROM push_delivery_log WHERE id=?", (first[0],)).fetchone()
    assert row["status"] == "processing" and row["provider_message_id"] == second[1]

    push_sender._finish_web_delivery(second[0], second[1], sent=True)
    with get_conn() as c:
        row = c.execute("SELECT status FROM push_delivery_log WHERE id=?", (first[0],)).fetchone()
    assert row["status"] == "sent"


def test_webpush_uses_bounded_http_timeout(monkeypatch):
    from services import push_sender

    user_id = f"web-timeout-owner:{uuid.uuid4()}"
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,active) VALUES(?,?,?,?,1)",
            (user_id, f"https://push.example/{uuid.uuid4()}", "public-key", "auth-secret"),
        )
    captured = {}
    monkeypatch.setattr(push_sender, "PUSH_MOCK_WEB", False)
    monkeypatch.setattr(push_sender, "_web_subscriptions", lambda _: [{
        "id": 1234567, "endpoint": "https://push.example/sub", "p256dh": "key", "auth": "auth"
    }])

    def fake_webpush(**kwargs):
        captured.update(kwargs)

    import types
    monkeypatch.setitem(sys.modules, "pywebpush", types.SimpleNamespace(webpush=fake_webpush))
    assert push_sender._send_web(user_id, "t", "b", {}, 0) == 1
    assert captured["timeout"] == 30


def test_dual_sender_finishes_native_before_slow_web_phase(monkeypatch):
    from services import push_sender

    events = []
    monkeypatch.setattr(push_gateway, "PUSH_PROVIDER_MODE", "dual")
    monkeypatch.setattr(push_sender, "_compute_recipient_badge", lambda _: 0)
    monkeypatch.setattr(push_sender, "_already_delivered", lambda *args: False)
    monkeypatch.setattr(push_sender, "notification_reference", lambda *args: {})
    monkeypatch.setattr(push_gateway, "enrich_event_data", lambda event_type, data: data)
    monkeypatch.setattr(push_gateway, "enqueue_event", lambda *args: True)
    monkeypatch.setattr(push_gateway, "claim_inline_event", lambda *args: "inline-lock")
    monkeypatch.setattr(push_sender, "_send_native", lambda *args, **kwargs: (
        events.append("native") or {"sent": 1, "devices": 1, "already_delivered": 0,
                                    "retryable": False, "errors": {}}
    ))
    monkeypatch.setattr(push_sender, "_send_web", lambda *args, **kwargs: events.append("web") or 0)
    monkeypatch.setattr(push_gateway, "finish_inline_event", lambda *args: events.append("finish"))
    monkeypatch.setattr(push_sender, "_log", lambda *args: None)

    push_sender.send("owner-A", "t", "b", event_id=f"ordered:{uuid.uuid4()}")
    assert events == ["native", "web", "finish"]


def test_dual_retryable_failure_is_not_hidden_by_permanent_peer(monkeypatch):
    rows = [_device(1, "fcm", "install-1"),
            _device(2, "expo", "install-2", "ExpoPushToken[expo-2]")]

    class TransientNative:
        def supports_platform(self, platform):
            return True

        def validate_token(self, token):
            return True

        def send(self, token, title, body, data, badge=None):
            return push_gateway.ProviderResult("fcm", "failed", error_code="network_error", retryable=True)

    monkeypatch.setattr(push_gateway, "active_devices", lambda user_id: rows)
    monkeypatch.setattr(push_gateway, "notification_already_read", lambda user_id, data: False)
    monkeypatch.setattr(push_gateway, "_already_sent_to_device", lambda event_id, registry_id: False)
    monkeypatch.setattr(push_gateway, "log_delivery", lambda *args, **kwargs: None)
    monkeypatch.setattr(push_gateway, "FCMProvider", TransientNative)
    monkeypatch.setattr(push_gateway, "APNsProvider", TransientNative)
    result = push_gateway.send_to_devices(
        "owner-A", "t", "b", {"event_id": "event-mixed"}, 1, mode="dual",
        expo_send_one=lambda *args, **kwargs: {
            "tickets": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]
        },
    )
    assert result["retryable"] is True
    assert result["errors"]["network_error"] == 1
    assert result["errors"]["invalid_token"] == 1
