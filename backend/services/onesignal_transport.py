"""Изолированный QA2 транспорт. Для проверенных подписок QA2; production использует прямой native gateway.

Подписка должна поступать только из проверенного серверного registry.
Клиентский arbitrary external_id не является подтверждением личности.
"""
import os
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx

APP_ID = "e6f77ac9-aac9-4e7d-be68-a5d805e95fbf"
ENDPOINT = "https://api.onesignal.com/notifications?c=push"


@dataclass(frozen=True)
class OneSignalResult:
    status: str
    message_id: Optional[str] = None
    error_code: Optional[str] = None
    retryable: bool = False


class OneSignalTransport:
    def __init__(self, *, env=None, post=None, get=None):
        settings = os.environ if env is None else env
        self._enabled = (
            settings.get("URTRUCK_ENV") == "qa2"
            and settings.get("URTRUCK_PUSH_PROVIDER") == "onesignal"
            and settings.get("ONESIGNAL_QA2_APP_ID") == APP_ID
        )
        self._api_key = settings.get("ONESIGNAL_QA2_API_KEY", "")
        self._post = post or self._post_ipv4
        self._get = get or self._get_ipv4

    @staticmethod
    def _post_ipv4(url, **kwargs):
        # QA2 API key permits the server IPv4 /32. Dual-stack DNS can otherwise
        # select IPv6 and fail authorization despite a valid credential.
        # Keep TLS verification and the IP allowlist; do not widen credentials.
        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        with httpx.Client(transport=transport, trust_env=False) as client:
            return client.post(url, **kwargs)

    @staticmethod
    def _get_ipv4(url, **kwargs):
        with httpx.Client(transport=httpx.HTTPTransport(local_address="0.0.0.0"), trust_env=False) as client:
            return client.get(url, **kwargs)

    def verify_subscription(self, *, subscription_id, onesignal_user_id, native_token, platform):
        """Verify provider-side app, platform, token and opt-in; never trust a client alias."""
        if not self.ready:
            return "onesignal_not_configured"
        try:
            subscription = str(uuid.UUID(subscription_id))
            identity = str(uuid.UUID(onesignal_user_id))
        except (ValueError, TypeError, AttributeError):
            return "invalid_subscription"
        expected_type = {"android": "AndroidPush", "ios": "iOSPush"}.get(platform)
        if not expected_type or not isinstance(native_token, str) or not native_token:
            return "invalid_subscription"
        try:
            response = self._get(
                f"https://api.onesignal.com/apps/{APP_ID}/users/by/onesignal_id/{identity}",
                headers={"Authorization": "Key " + self._api_key}, timeout=10.0,
            )
            if response.status_code != 200:
                return "subscription_verification_unavailable"
            result = response.json()
            if not isinstance(result, dict) or not isinstance(result.get("subscriptions"), list):
                return "subscription_verification_unavailable"
            for row in result["subscriptions"]:
                if not isinstance(row, dict) or row.get("id") != subscription:
                    continue
                same_token = (row.get("token") == native_token if platform == "android"
                              else str(row.get("token") or "").lower() == native_token.lower())
                if (row.get("app_id") == APP_ID and row.get("type") == expected_type
                        and row.get("enabled") is True and row.get("notification_types") == 1 and same_token):
                    return None
                return "subscription_mismatch"
            return "subscription_mismatch"
        except (httpx.RequestError, ValueError):
            return "subscription_verification_unavailable"

    @property
    def ready(self):
        return self._enabled and bool(self._api_key.strip())

    def send(self, *, subscription_id, event_id, title, body, data, badge=None, ttl=None):
        if not self.ready:
            return OneSignalResult("failed", error_code="onesignal_not_configured")
        try:
            subscription = str(uuid.UUID(subscription_id))
        except (ValueError, TypeError, AttributeError):
            return OneSignalResult("failed", error_code="invalid_subscription")
        if not isinstance(event_id, str) or not event_id.strip():
            return OneSignalResult("failed", error_code="missing_event_id")
        if not isinstance(data, dict):
            return OneSignalResult("failed", error_code="invalid_data")
        if badge is not None and (type(badge) is not int or badge < 0):
            return OneSignalResult("failed", error_code="invalid_badge")
        # Одна серверная доставка одному устройству получает постоянный ключ.
        delivery_key = str(uuid.uuid5(uuid.UUID(APP_ID), event_id + ":" + subscription))
        payload = {
            "app_id": APP_ID,
            "include_subscription_ids": [subscription],
            "target_channel": "push",
            "headings": {"en": title},
            "contents": {"en": body},
            "data": {**data, "event_id": event_id},
            "priority": 10,
            "existing_android_channel_id": "urtruck_messages_v2",
            "ttl": 3600 if ttl is None else max(0, min(2592000, int(ttl))),
            "ios_sound": "default",
            "idempotency_key": delivery_key,
        }
        if badge is not None:
            payload.update(ios_badgeType="SetTo", ios_badgeCount=badge)
            payload["data"]["badge"] = badge
        room = data.get("room_id")
        if data.get("type") in ("chat_message", "chat_attachment") and isinstance(room, str) and room:
            payload.update(thread_id="chat:" + room, android_group="chat:" + room)
        try:
            response = self._post(
                ENDPOINT, headers={"Authorization": "Key " + self._api_key},
                json=payload, timeout=10.0,
            )
        except httpx.RequestError:
            # Не сохранять exception: он может содержать headers/секреты.
            return OneSignalResult("failed", error_code="network_error", retryable=True)
        if not 200 <= response.status_code < 300:
            code = response.status_code
            return OneSignalResult("failed", error_code=f"http_{code}",
                                   retryable=code in (408, 425, 429) or 500 <= code <= 599)
        try:
            result = response.json()
        except ValueError:
            return OneSignalResult("failed", error_code="invalid_provider_response", retryable=True)
        if not isinstance(result, dict) or not result.get("id"):
            return OneSignalResult("failed", error_code="no_recipients")
        if result.get("errors"):
            # Единственный адресат: partial failure требует отдельной диагностики;
            # безусловный retry может создать повторное уведомление.
            return OneSignalResult("failed", message_id=str(result["id"]),
                                   error_code="recipient_error")
        return OneSignalResult("accepted", message_id=str(result["id"]))
