from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_expo_invalid_credentials_does_not_deactivate_driver_token():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert 'if err == "DeviceNotRegistered"' in src
    assert 'if err in ("DeviceNotRegistered", "InvalidCredentials")' not in src
    assert 'expo ticket error' in src


def test_trip_bid_push_targets_driver_id():
    src = (ROOT / 'backend/api/marketplace.py').read_text(encoding='utf-8')
    assert 'post_notifs.append((row["driver_id"]' in src
    assert 'send_to_user(recipient, title, text, url=url)' in src


def test_push_info_has_safe_registration_counts():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert '"native_android"' in src
    assert '"native_ios"' in src
    assert '"web_active"' in src


def test_expo_push_uses_dedicated_audible_android_channel():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert 'NATIVE_PUSH_CHANNEL_ID = "urtruck_messages_v2"' in src
    assert '"sound": "default"' in src
    assert '"priority": "high"' in src
    assert '"channelId": NATIVE_PUSH_CHANNEL_ID' in src
    assert '"channelId": "default"' not in src


def test_qa_push_diagnostics_are_token_guarded_and_masked():
    qa = (ROOT / 'backend/api/qa.py').read_text(encoding='utf-8')
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')

    assert '@qa_router.post("/push/native-tokens")' in qa
    assert '@qa_router.post("/push/test-direct")' in qa
    assert qa.count('_require_agent_token(x_qa_agent_token)') >= 3
    assert 'native_token_diagnostics(uid)' in qa
    assert 'send_native_debug(' in qa
    assert '"token_masked": _mask_token(t.get("token"))' in sender
    assert '"token": t.get("token")' not in sender


def test_direct_push_diagnostics_return_expo_tickets_and_receipts():
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')

    assert 'def _send_expo_detailed(' in sender
    assert 'def expo_receipts(ticket_ids: list[str])' in sender
    assert 'https://exp.host/--/api/v2/push/getReceipts' in sender
    assert 'def send_native_debug(' in sender
    assert '"tickets": expo_result.get("tickets", [])' in sender


def test_native_gateway_contract_is_present():
    gateway = (ROOT / 'backend/services/push_gateway.py').read_text(encoding='utf-8')
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    schema = (ROOT / 'backend/database/push_schema.sql').read_text(encoding='utf-8')

    assert 'PUSH_PROVIDER_MODE' in gateway
    assert 'class PushProvider' in gateway
    assert 'class FCMProvider' in gateway
    assert 'class APNsProvider' in gateway
    assert 'class ExpoProvider' in gateway
    assert 'def enqueue_event(' in gateway
    assert 'def send_to_devices(' in gateway
    assert 'CREATE TABLE IF NOT EXISTS push_devices' in schema
    assert 'CREATE TABLE IF NOT EXISTS push_outbox' in schema
    assert 'CREATE TABLE IF NOT EXISTS push_delivery_log' in schema
    assert 'push_gateway.send_to_devices(' in sender


def test_push_info_reports_native_gateway_live_state_not_legacy_mock_label():
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    gateway = (ROOT / 'backend/services/push_gateway.py').read_text(encoding='utf-8')

    assert '"gateway_provider"' in sender
    assert '"fcm_configured"' in sender
    assert '"fcm_live"' in sender
    assert '"expo_fallback"' in sender
    assert '"legacy_fcm_http_key_configured"' in sender
    assert '"used_for_business_events": False' in sender
    assert '"fcm": {"mode": "MOCK" if FCM_MOCK else "REAL"}' not in sender

    assert '"gateway_provider": "native_fcm_apns"' in gateway
    assert '"live": fcm_configured' in gateway
    assert '"project_id": fcm_project_id or None' in gateway


def test_mobile_registers_native_device_push_token_for_fcm_apns():
    src = (ROOT / 'src/utils/push.js').read_text(encoding='utf-8')

    assert 'Notifications.getDevicePushTokenAsync()' in src
    assert "provider: 'expo'" in src
    assert "Platform.OS === 'android' ? 'fcm' : 'apns'" in src
    assert 'app_id: appId' in src
    assert 'locale,' in src
    assert 'os_version: Device.osVersion' in src


def test_qa_direct_push_can_select_provider():
    qa = (ROOT / 'backend/api/qa.py').read_text(encoding='utf-8')
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')

    assert 'provider: Optional[str] = None' in qa
    assert 'provider=body.provider' in qa
    assert 'provider: Optional[str] = None' in sender
