"""Release gate for the native-only FCM/APNs push path."""
from pathlib import Path
import re

BACKEND = Path(__file__).resolve().parent.parent


def _read(rel: str) -> str:
    return (BACKEND / rel).read_text(encoding="utf-8")


def test_sender_uses_native_gateway_only():
    sender = _read("services/push_sender.py")
    gateway = _read("services/push_gateway.py")
    assert "push_gateway.send_to_devices(" in sender
    assert "push_gateway.active_devices(" in sender
    assert "FCM_MOCK" not in sender
    assert "_send_native_legacy" not in sender
    assert "https://exp.host/--/api" not in sender
    assert "ExpoPushProvider" not in sender
    assert "SUPPORTED_PUSH_PROVIDER_MODES = {\"native\"}" in gateway
    assert 'd.get("push_provider") in ("fcm", "apns")' in gateway


def test_legacy_rows_are_ignored_not_deleted():
    gateway = _read("services/push_gateway.py")
    assert 'd.get("push_provider") in ("fcm", "apns")' in gateway
    assert "DELETE FROM push_devices" not in gateway
    assert "legacy_ignored" in _read("services/push_sender.py")


def test_provider_configuration_and_invalid_token_are_truthful():
    gateway = _read("services/push_gateway.py")
    assert 'error_code="provider_not_configured"' in gateway
    assert 'error_code="invalid_token"' in gateway
    assert "retryable" in gateway
    assert "push_delivery_log" in gateway
    assert "MAX_OUTBOX_ATTEMPTS = 5" in gateway
    assert "next_attempt_at=datetime" in gateway


def test_android_system_notification_contract():
    gateway = _read("services/push_gateway.py")
    assert '"notification": {"title": title, "body": body}' in gateway
    assert '"priority": "HIGH"' in gateway
    assert '"channel_id": NATIVE_PUSH_CHANNEL_ID' in gateway


def test_no_expo_push_service_or_legacy_modes_in_backend():
    paths = [
        BACKEND / "services/push_gateway.py",
        BACKEND / "services/push_sender.py",
        BACKEND / "api/push.py",
        BACKEND / "api/qa.py",
        BACKEND / "scheduler/jobs.py",
    ]
    text = "\n".join(path.read_text(encoding="utf-8") for path in paths)
    for forbidden in (
        "getExpoPushTokenAsync",
        "ExponentPushToken",
        "https://exp.host/--/api",
        "ExpoPushProvider",
        "PUSH_PROVIDER_MODE=expo",
        "PUSH_PROVIDER_MODE=dual",
        "poll_expo_receipts",
        "_send_expo",
    ):
        assert forbidden not in text, forbidden
