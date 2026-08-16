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
