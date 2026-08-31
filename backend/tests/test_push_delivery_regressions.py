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
