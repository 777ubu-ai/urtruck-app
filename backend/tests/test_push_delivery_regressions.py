from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_native_invalid_token_is_deactivated_by_gateway():
    src = (ROOT / 'backend/services/push_gateway.py').read_text(encoding='utf-8')
    assert 'error_code="invalid_token"' in src
    assert "invalidated_reason = 'invalid_token'" in src


def test_trip_bid_push_targets_driver_id():
    src = (ROOT / 'backend/api/marketplace.py').read_text(encoding='utf-8')
    assert 'post_notifs.append((row["driver_id"]' in src
    # Push-closure track: send_to_user() call now carries kind/data (durable
    # event_key wiring), not the old bare 4-arg call.
    assert 'send_to_user(recipient, title, text, url=url, kind="bid",' in src


def test_push_info_has_safe_registration_counts():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert '"native_android"' in src
    assert '"native_ios"' in src
    assert '"web_active"' in src


def test_native_push_uses_dedicated_audible_android_channel():
    src = (ROOT / 'backend/services/push_gateway.py').read_text(encoding='utf-8')
    assert 'NATIVE_PUSH_CHANNEL_ID = "urtruck_messages_v2"' in src
    assert '"sound": "default"' in src
    assert '"priority": "HIGH"' in src
    assert '"channel_id": NATIVE_PUSH_CHANNEL_ID' in src


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


def test_direct_push_diagnostics_are_native_only():
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')

    assert 'def send_native_debug(' in sender
    assert 'push_gateway.send_to_devices(' in sender


def test_native_gateway_contract_is_present():
    gateway = (ROOT / 'backend/services/push_gateway.py').read_text(encoding='utf-8')
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    schema = (ROOT / 'backend/database/push_schema.sql').read_text(encoding='utf-8')

    assert 'PUSH_PROVIDER_MODE' in gateway
    assert 'class PushProvider' in gateway
    assert 'class FCMProvider' in gateway
    assert 'class APNsProvider' in gateway
    assert 'class ExpoProvider' not in gateway
    assert 'def enqueue_event(' in gateway
    assert 'def send_to_devices(' in gateway
    assert 'CREATE TABLE IF NOT EXISTS push_devices' in schema
    assert 'CREATE TABLE IF NOT EXISTS push_outbox' in schema
    assert 'CREATE TABLE IF NOT EXISTS push_delivery_log' in schema
    assert 'push_gateway.send_to_devices(' in sender


def test_qa_direct_push_can_select_provider():
    qa = (ROOT / 'backend/api/qa.py').read_text(encoding='utf-8')
    sender = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')

    assert 'provider: Optional[str] = None' in qa
    assert 'provider=body.provider' in qa
    assert 'provider: Optional[str] = None' in sender
