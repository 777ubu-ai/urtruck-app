"""Release gate for native-first push with guarded legacy compatibility."""
from pathlib import Path
import re

BACKEND = Path(__file__).resolve().parent.parent


def _read(rel: str) -> str:
    return (BACKEND / rel).read_text(encoding="utf-8")


def test_sender_uses_gateway_with_native_and_dual_modes():
    sender = _read("services/push_sender.py")
    gateway = _read("services/push_gateway.py")
    assert "push_gateway.send_to_devices(" in sender
    assert "push_gateway.active_devices(" in sender
    assert "FCM_MOCK" not in sender
    assert "_send_native_legacy" not in sender
    assert 'EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"' in sender
    assert "ExpoPushProvider" not in sender
    assert 'SUPPORTED_PUSH_PROVIDER_MODES = {"native", "dual"}' in gateway
    assert "_select_devices_for_mode" in gateway
    assert '"expo": ExpoProvider(expo_send_one) if expo_send_one else None' in gateway


def test_legacy_rows_are_retained_and_only_selected_in_dual_mode():
    gateway = _read("services/push_gateway.py")
    assert 'if mode == "native":' in gateway
    assert 'if mode != "dual":' in gateway
    assert 'device.get("push_provider") != "expo"' in gateway
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


def test_expo_service_is_backend_only_and_client_never_registers_expo_tokens():
    text = "\n".join(path.read_text(encoding="utf-8") for path in [
        BACKEND / "api/push.py", BACKEND / "api/qa.py",
        BACKEND / "scheduler/jobs.py",
        BACKEND.parent / "src/utils/push.js",
    ])
    for forbidden in (
        "getExpoPushTokenAsync",
        "ExponentPushToken",
        "https://exp.host/--/api",
        "ExpoPushProvider",
    ):
        assert forbidden not in text, forbidden
    sender = _read("services/push_sender.py")
    assert "https://exp.host/--/api/v2/push/send" in sender
    assert 'mode=mode, provider_filter=' in sender
