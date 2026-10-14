import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
PRODUCTION = [
    ROOT / "backend/services/push_gateway.py",
    ROOT / "backend/services/push_sender.py",
    ROOT / "backend/api/push.py",
    ROOT / "src/utils/push.js",
]
CLIENT_FORBIDDEN = (
    "getExpoPushTokenAsync",
    "ExponentPushToken",
)

def test_direct_native_push_contract_has_no_expo_service():
    text = "\n".join(p.read_text(encoding="utf-8") for p in PRODUCTION[2:])
    for needle in CLIENT_FORBIDDEN:
        assert needle not in text, needle
    sender = PRODUCTION[1].read_text(encoding="utf-8")
    assert "https://exp.host/--/api/v2/push/send" in sender
    assert "_select_devices_for_mode" in PRODUCTION[0].read_text(encoding="utf-8")

def test_gateway_supports_native_first_and_guarded_dual():
    ns = {}
    source = (ROOT / "backend/services/push_gateway.py").read_text(encoding="utf-8")
    match = re.search(r"SUPPORTED_PUSH_PROVIDER_MODES\s*=\s*\{([^}]*)\}", source)
    assert match and '"native"' in match.group(1)
    assert '"dual"' in match.group(1)

def test_gateway_contract_keeps_truthful_failure_and_retry_hooks():
    source = (ROOT / "backend/services/push_gateway.py").read_text(encoding="utf-8")
    assert 'error_code="provider_not_configured"' in source
    assert 'error_code="invalid_token"' in source
    assert "retryable" in source
    assert "push_delivery_log" in source
