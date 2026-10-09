import unittest
from unittest.mock import patch
import httpx
from services.onesignal_transport import APP_ID, OneSignalTransport

SUB = "2baf4778-511e-4a9d-a791-8b278c196e55"
ENV = {"URTRUCK_ENV": "qa2", "URTRUCK_PUSH_PROVIDER": "onesignal",
       "ONESIGNAL_QA2_APP_ID": APP_ID, "ONESIGNAL_QA2_API_KEY": "unit-test-only"}

class TransportTests(unittest.TestCase):
    def request(self, transport, **extra):
        return transport.send(subscription_id=SUB, event_id="event-1", title="Test",
                              body="QA test", data={"type": "chat_message", "room_id": "room-1"}, **extra)

    def test_production_and_missing_config_cannot_send(self):
        for env in ({}, {**ENV, "URTRUCK_ENV": "production"}, {**ENV, "ONESIGNAL_QA2_API_KEY": ""}):
            def forbidden(*args, **kwargs): self.fail("unexpected network request")
            self.assertEqual(self.request(OneSignalTransport(env=env, post=forbidden)).error_code,
                             "onesignal_not_configured")

    def test_idempotency_and_absolute_server_badge(self):
        requests = []
        def post(url, **kw):
            requests.append(kw["json"])
            return httpx.Response(200, json={"id": SUB})
        transport = OneSignalTransport(env=ENV, post=post)
        self.assertEqual(self.request(transport, badge=3).status, "accepted")
        self.request(transport, badge=0)
        self.assertEqual(requests[0]["idempotency_key"], requests[1]["idempotency_key"])
        self.assertEqual(requests[1]["ios_badgeCount"], 0)
        self.assertEqual(requests[0]["include_subscription_ids"], [SUB])
        self.assertNotIn("included_segments", requests[0])
        self.assertEqual(requests[0]["thread_id"], "chat:room-1")

    def test_http_200_without_message_id_is_not_success(self):
        transport = OneSignalTransport(env=ENV, post=lambda *a, **k: httpx.Response(200, json={"id": ""}))
        self.assertEqual(self.request(transport).error_code, "no_recipients")

    def test_partial_error_is_not_claimed_as_delivery(self):
        transport = OneSignalTransport(env=ENV, post=lambda *a, **k: httpx.Response(200, json={"id": SUB, "errors": ["invalid recipient"]}))
        self.assertEqual(self.request(transport).error_code, "recipient_error")

    def test_retry_classification(self):
        for status, retry in ((401, False), (400, False), (429, True), (503, True)):
            transport = OneSignalTransport(env=ENV, post=lambda *a, **k: httpx.Response(status))
            self.assertEqual(self.request(transport).retryable, retry)

    def test_network_and_invalid_response(self):
        def fail(*a, **k): raise httpx.ConnectError("unit-test")
        self.assertTrue(self.request(OneSignalTransport(env=ENV, post=fail)).retryable)
        transport = OneSignalTransport(env=ENV, post=lambda *a, **k: httpx.Response(200, text="invalid"))
        self.assertEqual(self.request(transport).error_code, "invalid_provider_response")

    def test_invalid_subscription_and_badge_never_send(self):
        def forbidden(*a, **k): self.fail("unexpected network request")
        transport = OneSignalTransport(env=ENV, post=forbidden)
        self.assertEqual(self.request(transport, badge=-1).error_code, "invalid_badge")
        result = transport.send(subscription_id="other-user", event_id="e", title="T", body="B", data={})
        self.assertEqual(result.error_code, "invalid_subscription")

    def test_default_client_uses_allowlisted_address_family(self):
        calls = []
        def transport_factory(**kwargs):
            calls.append(kwargs)
            def provider(request):
                self.assertEqual(request.url.host, "api.onesignal.com")
                self.assertEqual(request.headers["authorization"], "Key unit-test-only")
                return httpx.Response(200, json={"id": SUB})
            return httpx.MockTransport(provider)
        with patch("services.onesignal_transport.httpx.HTTPTransport", side_effect=transport_factory):
            self.assertEqual(self.request(OneSignalTransport(env=ENV)).status, "accepted")
        self.assertEqual(calls, [{"local_address": "0.0.0.0"}])
