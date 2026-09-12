"""Direct FCM/APNs gateway behavioral tests (push-recovery track, Phase 3).

Exercises the REAL FCMProvider.send()/APNsProvider.send() (services.push_gateway)
against a mocked httpx transport -- never a real network call, never a real
Google/Apple credential. A throwaway RSA keypair (for the FCM service-account
JWT) and a throwaway EC keypair (for the APNs ES256 JWT) are generated
locally with `cryptography` purely so jwt.encode() has something structurally
valid to sign -- these are not, and must never become, real Firebase/Apple
credentials (see Phase 7 for the real credential-name contract).

This proves the gateway's own code (payload shape, host selection, error
classification, credential wiring) is correct and exercisable today,
independent of whether real production credentials are ever configured.
"""
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from services import push_gateway


# ───────────────────────── throwaway test keys ─────────────────────────
def _fake_rsa_private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def _fake_ec_private_key_pem() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


FAKE_FCM_SERVICE_ACCOUNT = json.dumps({
    "type": "service_account",
    "project_id": "urtruck-test",
    "private_key_id": "test-key-id",
    "private_key": _fake_rsa_private_key_pem(),
    "client_email": "test@urtruck-test.iam.gserviceaccount.com",
})
FAKE_APNS_KEY_P8 = _fake_ec_private_key_pem()


class _FakeResponse:
    def __init__(self, status_code, json_body=None, text="", headers=None):
        self.status_code = status_code
        self._json = json_body if json_body is not None else {}
        self.text = text or json.dumps(self._json)
        self.headers = headers or {}

    def json(self):
        return self._json


class _FakeHttpxClient:
    """Fake for `with httpx.Client(http2=True, timeout=10.0) as client: client.post(...)`."""

    def __init__(self, responder, **kwargs):
        self._responder = responder

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def post(self, url, headers=None, json=None):
        return self._responder(url, headers, json)


# ───────────────────────── FCM fixtures ─────────────────────────
@pytest.fixture
def fcm_configured(monkeypatch):
    monkeypatch.setattr(push_gateway, "FCM_PROJECT_ID", "urtruck-test")
    monkeypatch.setattr(push_gateway, "FCM_SERVICE_ACCOUNT_JSON", FAKE_FCM_SERVICE_ACCOUNT)
    monkeypatch.setattr(push_gateway, "GOOGLE_APPLICATION_CREDENTIALS", "")


def _mock_fcm_transport(monkeypatch, send_response):
    """oauth2 token exchange always succeeds; the actual FCM v1 send call
    returns whatever `send_response` (a _FakeResponse) says."""
    def fake_post(url, headers=None, json=None, data=None, timeout=None):
        if "oauth2.googleapis.com/token" in url:
            return _FakeResponse(200, {"access_token": "fake-access-token", "expires_in": 3600})
        if "fcm.googleapis.com" in url:
            assert headers["Authorization"] == "Bearer fake-access-token"
            fake_post.last_payload = json
            return send_response
        raise AssertionError(f"unexpected URL: {url}")

    fake_post.last_payload = None
    monkeypatch.setattr(push_gateway.httpx, "post", fake_post)
    return fake_post


def test_fcm_success(fcm_configured, monkeypatch):
    _mock_fcm_transport(monkeypatch, _FakeResponse(200, {"name": "projects/urtruck-test/messages/abc123"}))
    provider = push_gateway.FCMProvider()
    result = provider.send("fcm-token-1", "New bid", "3500$ Almaty->Yiwu", {"deal_id": "d1"}, badge=3)
    assert result.status == "sent"
    assert result.message_id == "projects/urtruck-test/messages/abc123"
    assert result.provider == "fcm"


def test_fcm_transient_error_is_retryable(fcm_configured, monkeypatch):
    _mock_fcm_transport(monkeypatch, _FakeResponse(503, {"error": {"status": "UNAVAILABLE"}}))
    provider = push_gateway.FCMProvider()
    result = provider.send("fcm-token-1", "T", "B", {}, badge=0)
    assert result.status == "failed"
    assert result.retryable is True
    assert result.error_code == "http_503"


def test_fcm_invalid_token_not_retryable(fcm_configured, monkeypatch):
    _mock_fcm_transport(
        monkeypatch,
        _FakeResponse(400, {"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}}),
    )
    provider = push_gateway.FCMProvider()
    result = provider.send("fcm-token-dead", "T", "B", {}, badge=0)
    assert result.status == "failed"
    assert result.error_code == "invalid_token"
    assert result.retryable is False


def test_fcm_invalid_credentials_classified_distinctly(fcm_configured, monkeypatch):
    _mock_fcm_transport(monkeypatch, _FakeResponse(403, {"error": {"status": "THIRD_PARTY_AUTH_ERROR"}}))
    provider = push_gateway.FCMProvider()
    result = provider.send("fcm-token-1", "T", "B", {}, badge=0)
    assert result.error_code == "invalid_credentials"
    assert result.retryable is False


def test_fcm_payload_carries_deeplink_data(fcm_configured, monkeypatch):
    sender = _mock_fcm_transport(monkeypatch, _FakeResponse(200, {"name": "x"}))
    provider = push_gateway.FCMProvider()
    provider.send(
        "fcm-token-1", "Bid accepted", "Deal ready", {"deal_id": "deal-42", "url": "/deals/deal-42", "kind": "bid_accepted"},
        badge=1,
    )
    payload = sender.last_payload
    msg = payload["message"]
    assert msg["data"]["deal_id"] == "deal-42"
    assert msg["data"]["url"] == "/deals/deal-42"
    assert msg["notification"] == {"title": "Bid accepted", "body": "Deal ready"}


def test_fcm_priority_channel_and_badge_shape(fcm_configured, monkeypatch):
    sender = _mock_fcm_transport(monkeypatch, _FakeResponse(200, {"name": "x"}))
    provider = push_gateway.FCMProvider()
    provider.send("fcm-token-1", "T", "B", {}, badge=7)
    android = sender.last_payload["message"]["android"]
    assert android["priority"] == "HIGH"
    assert android["notification"]["channel_id"] == push_gateway.NATIVE_PUSH_CHANNEL_ID
    assert android["notification"]["sound"] == "default"
    assert android["notification"]["notification_count"] == 7


def test_fcm_not_configured_fails_closed_without_network(monkeypatch):
    monkeypatch.setattr(push_gateway, "FCM_PROJECT_ID", "")
    monkeypatch.setattr(push_gateway, "FCM_SERVICE_ACCOUNT_JSON", "")
    monkeypatch.setattr(push_gateway, "GOOGLE_APPLICATION_CREDENTIALS", "")

    def fail_if_called(*a, **k):
        raise AssertionError("must not attempt a network call when unconfigured")

    monkeypatch.setattr(push_gateway.httpx, "post", fail_if_called)
    result = push_gateway.FCMProvider().send("tok", "T", "B", {}, badge=0)
    assert result.status == "failed"
    assert result.error_code == "provider_not_configured"


# ───────────────────────── APNs fixtures ─────────────────────────
@pytest.fixture
def apns_configured(monkeypatch):
    monkeypatch.setattr(push_gateway, "APNS_KEY_ID", "TESTKEYID1")
    monkeypatch.setattr(push_gateway, "APNS_TEAM_ID", "TESTTEAMID")
    monkeypatch.setattr(push_gateway, "APNS_BUNDLE_ID", "com.urtruck.app")
    monkeypatch.setattr(push_gateway, "APNS_AUTH_KEY_P8", FAKE_APNS_KEY_P8)


def _mock_apns_transport(monkeypatch, response):
    captured = {}

    def fake_client(*args, **kwargs):
        def responder(url, headers, json_body):
            captured["url"] = url
            captured["headers"] = headers
            captured["payload"] = json_body
            return response
        return _FakeHttpxClient(responder)

    monkeypatch.setattr(push_gateway.httpx, "Client", fake_client)
    return captured


def test_apns_success(apns_configured, monkeypatch):
    captured = _mock_apns_transport(monkeypatch, _FakeResponse(200, {}, headers={"apns-id": "apns-msg-1"}))
    result = push_gateway.APNsProvider().send("apns-token-1", "New bid", "3500$", {"deal_id": "d1"}, badge=2)
    assert result.status == "sent"
    assert result.message_id == "apns-msg-1"
    assert captured["headers"]["apns-push-type"] == "alert"
    assert captured["headers"]["apns-priority"] == "10"


def test_apns_bad_device_token_not_retryable(apns_configured, monkeypatch):
    _mock_apns_transport(monkeypatch, _FakeResponse(400, {"reason": "BadDeviceToken"}))
    result = push_gateway.APNsProvider().send("apns-bad-token", "T", "B", {}, badge=0)
    assert result.error_code == "invalid_token"
    assert result.retryable is False


def test_apns_unregistered_not_retryable(apns_configured, monkeypatch):
    _mock_apns_transport(monkeypatch, _FakeResponse(410, {"reason": "Unregistered"}))
    result = push_gateway.APNsProvider().send("apns-gone-token", "T", "B", {}, badge=0)
    assert result.error_code == "invalid_token"
    assert result.retryable is False


def test_apns_invalid_credentials_classified_distinctly(apns_configured, monkeypatch):
    _mock_apns_transport(monkeypatch, _FakeResponse(403, {"reason": "InvalidProviderToken"}))
    result = push_gateway.APNsProvider().send("apns-token-1", "T", "B", {}, badge=0)
    assert result.error_code == "invalid_credentials"
    assert result.retryable is False


def test_apns_payload_carries_deeplink_data(apns_configured, monkeypatch):
    captured = _mock_apns_transport(monkeypatch, _FakeResponse(200, {}, headers={"apns-id": "x"}))
    push_gateway.APNsProvider().send(
        "apns-token-1", "Bid accepted", "Deal ready",
        {"deal_id": "deal-42", "url": "/deals/deal-42", "kind": "bid_accepted"},
        badge=1,
    )
    payload = captured["payload"]
    assert payload["deal_id"] == "deal-42"
    assert payload["url"] == "/deals/deal-42"
    assert payload["kind"] == "bid_accepted"


def test_apns_sound_and_badge_in_aps(apns_configured, monkeypatch):
    captured = _mock_apns_transport(monkeypatch, _FakeResponse(200, {}, headers={"apns-id": "x"}))
    push_gateway.APNsProvider().send("apns-token-1", "T", "B", {}, badge=9)
    aps = captured["payload"]["aps"]
    assert aps["sound"] == "default"
    assert aps["badge"] == 9
    assert aps["alert"] == {"title": "T", "body": "B"}


def test_apns_sandbox_host(apns_configured, monkeypatch):
    monkeypatch.setattr(push_gateway, "APNS_USE_SANDBOX", True)
    captured = _mock_apns_transport(monkeypatch, _FakeResponse(200, {}, headers={"apns-id": "x"}))
    push_gateway.APNsProvider().send("apns-token-1", "T", "B", {}, badge=0)
    assert "api.sandbox.push.apple.com" in captured["url"]


def test_apns_production_host(apns_configured, monkeypatch):
    monkeypatch.setattr(push_gateway, "APNS_USE_SANDBOX", False)
    captured = _mock_apns_transport(monkeypatch, _FakeResponse(200, {}, headers={"apns-id": "x"}))
    push_gateway.APNsProvider().send("apns-token-1", "T", "B", {}, badge=0)
    assert captured["url"].startswith("https://api.push.apple.com/")
    assert "sandbox" not in captured["url"]


def test_apns_not_configured_fails_closed_without_network(monkeypatch):
    monkeypatch.setattr(push_gateway, "APNS_KEY_ID", "")
    monkeypatch.setattr(push_gateway, "APNS_TEAM_ID", "")
    monkeypatch.setattr(push_gateway, "APNS_AUTH_KEY_P8", "")

    def fail_if_called(*a, **k):
        raise AssertionError("must not attempt a network call when unconfigured")

    monkeypatch.setattr(push_gateway.httpx, "Client", fail_if_called)
    result = push_gateway.APNsProvider().send("tok", "T", "B", {}, badge=0)
    assert result.status == "failed"
    assert result.error_code == "provider_not_configured"
