"""Native push gateway: direct FCM/APNs delivery.

This module is deliberately additive. Existing business call-sites still call
services.push_sender.send(), while the sender delegates native delivery here
The only supported mode is ``native``. Device rows with legacy providers are
kept for audit/migration but are never selected for delivery.
"""
from __future__ import annotations

import base64
import json
import os
import random
import re
import time
from contextlib import nullcontext
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from database.db import get_conn

PUSH_PROVIDER_MODE = (os.getenv("PUSH_PROVIDER_MODE") or "native").strip().lower()
SUPPORTED_PUSH_PROVIDER_MODES = {"native"}
NATIVE_PUSH_CHANNEL_ID = "urtruck_messages_v2"

FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")
FCM_SERVICE_ACCOUNT_JSON = os.getenv("FCM_SERVICE_ACCOUNT_JSON", "")
# systemd EnvironmentFile treats backslashes as escapes.  A service-account
# JSON contains ``\\n`` inside its PEM, so storing raw JSON there silently
# corrupts the private key.  QA2 writes this transport-safe representation.
FCM_SERVICE_ACCOUNT_JSON_BASE64 = os.getenv("FCM_SERVICE_ACCOUNT_JSON_BASE64", "")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

APNS_KEY_ID = os.getenv("APNS_KEY_ID", "")
APNS_TEAM_ID = os.getenv("APNS_TEAM_ID", "")
APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "")
APNS_AUTH_KEY_P8 = os.getenv("APNS_AUTH_KEY_P8", "")
# A systemd EnvironmentFile consumes backslashes, which corrupts a raw
# multi-line P8.  QA2 stores this one-line transport form and decodes it only
# in process memory.  The legacy raw variable remains supported for existing
# non-QA deployments.
APNS_AUTH_KEY_P8_BASE64 = os.getenv("APNS_AUTH_KEY_P8_BASE64", "")
APNS_USE_SANDBOX = (os.getenv("APNS_USE_SANDBOX") or "").lower() in ("1", "true", "yes")

# Push-forensic finding (STT/push-hardening track): this set is read by
# enqueue_event() (below) to classify outbox priority — it must contain the
# ACTUAL `event_type` strings producers pass, not an aspirational catalog.
# It previously listed "trip.*"/"deal.cancelled" names that no caller has
# ever emitted (deal-status pushes use f"deal.status.{new_status}", GPS
# pushes use the bare "gps_lost"/"gps_restored", see api/marketplace.py's
# _transition_deal / _tracking_notify) — meaning every event except
# "bid.accepted" silently fell through to "normal" priority since this set
# was introduced, undetected because nothing asserted outbox priority for
# them (test_gps_lost_restored.py's own docstring already flagged the
# "declared but nothing ever produced them" half of this; this fixes the
# producer-string mismatch that made the flag matter). Corrected 1:1 to the
# real strings for the same events this set always intended to cover
# (trip start / GPS lost / delivered / completed) — no new events added.
CRITICAL_EVENTS = {
    "bid.accepted",
    "bid.counter_accepted",
    "deal.status.in_progress",
    "gps_lost",
    "deal.status.delivered",
    "deal.status.completed",
}

PUSH_EVENT_CATALOG = {
    "bid.created",
    "bid.countered",
    "bid.counter_accepted",
    "bid.accepted",
    "bid.rejected",
    "bid.withdrawn",
    "chat.message",
    "chat.voice",
    "deal.status.in_progress",
    "deal.status.at_border",
    "gps_lost",
    "gps_restored",
    "deal.status.delivered",
    "deal.status.completed",
    "deal.status.cancelled",
}


@dataclass
class ProviderResult:
    provider: str
    status: str
    message_id: Optional[str] = None
    response: Optional[dict[str, Any]] = None
    error_code: Optional[str] = None
    retryable: bool = False


def mask_token(token: str) -> str:
    if not token:
        return ""
    token = str(token)
    if len(token) <= 12:
        return token[:4] + "..."
    return f"{token[:10]}...{token[-6:]}"


def _json_dumps(value: Any) -> str:
    return json.dumps(value or {}, ensure_ascii=False, separators=(",", ":"))[:4000]


def _apns_auth_key() -> tuple[Optional[str], Optional[str]]:
    """Read the P8 without exposing it, preferring transport-safe base64.

    The error code is intentionally non-secret and is used only by the
    operator-only configuration summary.  A malformed value must fail closed;
    it is never sent to APNs and never falls back to a possibly stale raw key.
    """
    encoded = (APNS_AUTH_KEY_P8_BASE64 or "").strip()
    if encoded:
        try:
            return base64.b64decode(encoded, validate=True).decode("utf-8"), None
        except (ValueError, UnicodeDecodeError):
            return None, "auth_key_base64_invalid"
    raw = (APNS_AUTH_KEY_P8 or "").strip()
    if not raw:
        return None, "auth_key_missing"
    return raw.replace("\\n", "\n"), None


def _apns_private_key_valid(key: Optional[str]) -> bool:
    if not key:
        return False
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        private_key = serialization.load_pem_private_key(key.encode("utf-8"), password=None)
        return isinstance(private_key, ec.EllipticCurvePrivateKey) and private_key.curve.name == "secp256r1"
    except Exception:
        return False


def _safe_collapse_key(value: Any) -> Optional[str]:
    """Return a provider-safe collapse key or None.

    APNs limits ``apns-collapse-id`` to 64 bytes.  Keep only a conservative
    identifier alphabet; this also prevents a user supplied message body from
    becoming an OS grouping key.
    """
    if not isinstance(value, str):
        return None
    key = re.sub(r"[^A-Za-z0-9:_.-]", "", value.strip())[:64]
    return key or None


def _event_ttl_seconds(event_type: str, payload: Optional[dict[str, Any]] = None) -> int:
    """Classify delivery freshness, not business-record retention.

    Push is only a signal: the in-app notification and backend state stay
    durable.  A delayed ephemeral signal is worse than no push because it
    opens stale work.  This policy intentionally accepts no caller-provided
    TTL, so untrusted payload data cannot extend a notification indefinitely.
    """
    data = (payload or {}).get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    kind = f"{event_type or ''} {data.get('type') or ''}".lower()
    if "deal.status.delivered" in kind or "deal.status.completed" in kind:
        return 48 * 60 * 60
    if "gps" in kind:
        return 5 * 60
    if "chat" in kind:
        return 24 * 60 * 60
    if "bid" in kind:
        return 30 * 60
    if "deal.status" in kind:
        return 24 * 60 * 60
    return 60 * 60


def _collapse_key(event_type: str, payload: Optional[dict[str, Any]] = None) -> Optional[str]:
    """Collapse only high-volume chat notifications within one room.

    Critical deal/GPS lifecycle updates must always remain individually visible
    and are consequently never collapsed.
    """
    if event_type in CRITICAL_EVENTS:
        return None
    payload = payload if isinstance(payload, dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    explicit = _safe_collapse_key(data.get("collapse_key"))
    if explicit:
        return explicit
    kind = f"{event_type or ''} {data.get('type') or ''}".lower()
    room_id = data.get("room_id")
    if "chat" in kind and isinstance(room_id, str):
        return _safe_collapse_key(f"chat:{room_id}")
    return None


def enrich_event_data(event_type: str, data: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Attach only non-sensitive transport controls to a provider payload.

    The timestamp is fixed at event creation, so a retry never gets a fresh
    TTL window.  Provider-only keys are stripped before the data reaches the
    client application.
    """
    safe = dict(data or {})
    ttl_seconds = _event_ttl_seconds(event_type, {"data": safe})
    key = _collapse_key(event_type, {"data": safe})
    safe["_push_expires_at"] = int(time.time()) + ttl_seconds
    if key:
        safe["collapse_key"] = key
    return safe


def _provider_data(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Do not expose backend-only transport metadata to the mobile client."""
    return {
        str(k): v for k, v in (data or {}).items()
        if k not in {"apns_topic", "_push_expires_at", "collapse_key"}
    }


def _remaining_ttl_seconds(data: Optional[dict[str, Any]]) -> Optional[int]:
    try:
        epoch = int((data or {}).get("_push_expires_at"))
    except (TypeError, ValueError):
        return None
    return max(0, epoch - int(time.time()))


def _service_account_info() -> Optional[dict[str, Any]]:
    encoded = FCM_SERVICE_ACCOUNT_JSON_BASE64.strip()
    if encoded:
        try:
            return json.loads(base64.b64decode(encoded, validate=True).decode("utf-8"))
        except Exception:
            return None
    raw = FCM_SERVICE_ACCOUNT_JSON.strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    path = GOOGLE_APPLICATION_CREDENTIALS.strip()
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _service_account_private_key_valid(info: Optional[dict[str, Any]]) -> bool:
    """Validate the PEM locally without logging or exporting key material."""
    if not info or not info.get("private_key"):
        return False
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        load_pem_private_key(str(info["private_key"]).encode("utf-8"), password=None)
        return True
    except Exception:
        return False


class PushProvider:
    name = "base"

    def supports_platform(self, platform: Optional[str]) -> bool:
        return True

    def validate_token(self, token: str) -> bool:
        return bool(token and len(str(token)) >= 8)

    def classify_error(self, status_code: int, body: Any) -> tuple[str, bool]:
        if status_code in (408, 425, 429, 500, 502, 503, 504):
            return f"http_{status_code}", True
        return f"http_{status_code}", False

    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        raise NotImplementedError


class FCMProvider(PushProvider):
    name = "fcm"

    def __init__(self):
        self._credential_error: Optional[str] = None

    def supports_platform(self, platform: Optional[str]) -> bool:
        return (platform or "").lower() == "android"

    def _access_token(self) -> Optional[str]:
        info = _service_account_info()
        if not info:
            return None
        try:
            import jwt  # PyJWT, optional until native mode is enabled in env
        except Exception:
            return None
        now = int(time.time())
        claim = {
            "iss": info.get("client_email"),
            "scope": "https://www.googleapis.com/auth/firebase.messaging",
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
        }
        try:
            assertion = jwt.encode(claim, info.get("private_key"), algorithm="RS256")
        except Exception:
            self._credential_error = "invalid_credentials"
            return None
        resp = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
            timeout=10.0,
        )
        if resp.status_code >= 400:
            return None
        return resp.json().get("access_token")

    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        project_id = FCM_PROJECT_ID or (_service_account_info() or {}).get("project_id")
        access_token = self._access_token()
        if not project_id or not access_token:
            return ProviderResult(
                "fcm",
                "failed",
                error_code=self._credential_error or "provider_not_configured",
                retryable=False,
            )
        collapse_key = _safe_collapse_key((data or {}).get("collapse_key"))
        ttl_seconds = _remaining_ttl_seconds(data)
        android = {
            "priority": "HIGH",
            "notification": {
                "channel_id": NATIVE_PUSH_CHANNEL_ID,
                "sound": "default",
                "notification_count": int(badge or 0),
            },
        }
        if collapse_key:
            android["collapse_key"] = collapse_key
            android["notification"]["tag"] = collapse_key
        if ttl_seconds is not None:
            android["ttl"] = f"{ttl_seconds}s"
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": {str(k): "" if v is None else str(v) for k, v in _provider_data(data).items()},
                "android": android,
            }
        }
        try:
            resp = httpx.post(
                f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=payload,
                timeout=10.0,
            )
        except Exception as exc:
            return ProviderResult("fcm", "failed", error_code="network_error", response={"error": str(exc)}, retryable=True)
        try:
            body_json = resp.json()
        except Exception:
            body_json = {"text": resp.text[:500]}
        if resp.status_code < 400:
            return ProviderResult("fcm", "sent", message_id=body_json.get("name"), response=body_json)
        code, retryable = self.classify_error(resp.status_code, body_json)
        details = json.dumps(body_json, ensure_ascii=False)
        if "UNREGISTERED" in details or "registration-token-not-registered" in details:
            code, retryable = "invalid_token", False
        if "THIRD_PARTY_AUTH_ERROR" in details or "SENDER_ID_MISMATCH" in details:
            code, retryable = "invalid_credentials", False
        return ProviderResult("fcm", "failed", response=body_json, error_code=code, retryable=retryable)


class APNsProvider(PushProvider):
    name = "apns"

    def supports_platform(self, platform: Optional[str]) -> bool:
        return (platform or "").lower() == "ios"

    def _jwt(self) -> Optional[str]:
        key, key_error = _apns_auth_key()
        if not (APNS_KEY_ID and APNS_TEAM_ID and key) or key_error:
            return None
        try:
            import jwt  # PyJWT, optional until APNs is configured
            return jwt.encode(
                {"iss": APNS_TEAM_ID, "iat": int(time.time())},
                key,
                algorithm="ES256",
                headers={"alg": "ES256", "kid": APNS_KEY_ID},
            )
        except Exception:
            return None

    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        auth = self._jwt()
        topic = (data or {}).get("apns_topic") or APNS_BUNDLE_ID or (data or {}).get("app_id")
        if not auth or not topic:
            return ProviderResult("apns", "failed", error_code="provider_not_configured", retryable=False)
        host = "api.sandbox.push.apple.com" if APNS_USE_SANDBOX else "api.push.apple.com"
        collapse_key = _safe_collapse_key((data or {}).get("collapse_key"))
        expires_at = (data or {}).get("_push_expires_at")
        aps = {"alert": {"title": title, "body": body}, "sound": "default", "badge": int(badge or 0)}
        if collapse_key:
            # thread-id groups the retained records in Notification Center;
            # apns-collapse-id replaces an older undismissed alert for the
            # same chat without coalescing critical business transitions.
            aps["thread-id"] = collapse_key
        payload = {
            "aps": aps,
            **_provider_data(data),
        }
        headers = {
            "authorization": f"bearer {auth}",
            "apns-topic": topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
        }
        if collapse_key:
            headers["apns-collapse-id"] = collapse_key
        try:
            headers["apns-expiration"] = str(max(0, int(expires_at)))
        except (TypeError, ValueError):
            pass
        try:
            with httpx.Client(http2=True, timeout=10.0) as client:
                resp = client.post(
                    f"https://{host}/3/device/{token}",
                    headers=headers,
                    json=payload,
                )
        except Exception as exc:
            return ProviderResult("apns", "failed", error_code="network_error", response={"error": str(exc)}, retryable=True)
        try:
            body_json = resp.json() if resp.text else {}
        except Exception:
            body_json = {"text": resp.text[:500]}
        if resp.status_code < 400:
            return ProviderResult("apns", "sent", message_id=resp.headers.get("apns-id"), response=body_json)
        code, retryable = self.classify_error(resp.status_code, body_json)
        reason = str(body_json.get("reason") or "")
        if reason in ("BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"):
            code, retryable = "invalid_token", False
        if reason in ("InvalidProviderToken", "ExpiredProviderToken", "Forbidden"):
            code, retryable = "invalid_credentials", False
        return ProviderResult("apns", "failed", response=body_json, error_code=code, retryable=retryable)


def active_devices(user_id: str) -> list[dict[str, Any]]:
    with get_conn() as c:
        rows = c.execute(
            """
            SELECT id, user_id, device_id, platform, app_id, push_provider, push_token,
                   locale, app_version, os_version, device_model
            FROM push_devices
            WHERE user_id = ? AND enabled = 1
            ORDER BY last_seen_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_recipient_locale(user_id: str) -> str:
    """Push-closure track: which language a system-generated push to this
    user should be written in. Reads `push_devices.locale` (most recently
    active device wins — ORDER BY last_seen_at DESC from active_devices())
    and normalizes it via push_i18n.normalize_locale(). Falls back to the
    app-wide default (RU) when the user has no device with a locale on file
    (older client, or a client that never sent one)."""
    from services.push_i18n import normalize_locale
    for device in active_devices(user_id):
        if device.get("locale"):
            return normalize_locale(device["locale"])
    return normalize_locale(None)


def enqueue_event(event_id: str, event_type: str, recipient_user_id: str, payload: dict, priority: Optional[str] = None, *, conn=None) -> bool:
    if not (event_id and event_type and recipient_user_id):
        return False
    prio = priority or ("critical" if event_type in CRITICAL_EVENTS else "normal")
    safe_payload = dict(payload or {})
    data = safe_payload.get("data")
    if not isinstance(data, dict):
        data = {}
    else:
        data = dict(data)
    data = enrich_event_data(event_type, data)
    collapse_key = _safe_collapse_key(data.get("collapse_key"))
    safe_payload["data"] = data
    ttl_seconds = _event_ttl_seconds(event_type, safe_payload)
    expires_epoch = data.get("_push_expires_at")
    with (nullcontext(conn) if conn is not None else get_conn()) as c:
        cursor = c.execute(
            """
            INSERT INTO push_outbox(event_id, event_type, recipient_user_id, payload, priority, expires_at, collapse_key)
            VALUES(?,?,?,?,?,datetime(?, 'unixepoch'),?)
            ON CONFLICT(event_id, recipient_user_id) DO NOTHING
            """,
            (event_id, event_type, recipient_user_id, _json_dumps(safe_payload), prio, int(expires_epoch), collapse_key),
        )
        return cursor.rowcount > 0


def log_delivery(event_id: Optional[str], user_id: str, device: dict, result: ProviderResult, attempt: int = 1) -> None:
    try:
        with get_conn() as c:
            cur = c.execute(
                """
                INSERT INTO push_delivery_log(
                  event_id, recipient_user_id, device_registry_id, device_id, provider, attempt,
                  provider_message_id, status, provider_response, sent_at, error_code, token_masked
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    event_id,
                    user_id,
                    device.get("id"),
                    device.get("device_id"),
                    result.provider,
                    attempt,
                    result.message_id,
                    result.status,
                    _json_dumps(result.response),
                    None,
                    result.error_code,
                    mask_token(device.get("push_token") or ""),
                ),
            )
            row_id = cur.lastrowid
            if result.status == "sent":
                c.execute(
                    "UPDATE push_delivery_log SET sent_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (row_id,),
                )
                c.execute(
                    "UPDATE push_devices SET last_success_at = CURRENT_TIMESTAMP, failure_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (device.get("id"),),
                )
            else:
                c.execute(
                    "UPDATE push_devices SET last_failure_at = CURRENT_TIMESTAMP, failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (device.get("id"),),
                )
                if result.error_code == "invalid_token":
                    c.execute(
                        "UPDATE push_devices SET enabled = 0, invalidated_at = CURRENT_TIMESTAMP, invalidated_reason = 'invalid_token' WHERE id = ?",
                        (device.get("id"),),
                    )
                    c.execute(
                        "UPDATE push_tokens_native SET active = 0, invalidated_at = CURRENT_TIMESTAMP, invalidated_reason = 'invalid_token' WHERE token = ?",
                        (device.get("push_token"),),
                    )
    except Exception:
        return


def _already_sent_to_device(event_id: Optional[str], device_registry_id: Optional[int]) -> bool:
    if not event_id or not device_registry_id:
        return False
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT 1 FROM push_delivery_log WHERE event_id = ? AND device_registry_id = ? AND status = 'sent' LIMIT 1",
                (event_id, device_registry_id),
            ).fetchone()
        return bool(row)
    except Exception:
        return False


def send_to_devices(
    user_id: str,
    title: str,
    body: str,
    data: dict,
    badge: Optional[int],
    mode: Optional[str] = None,
    provider_filter: Optional[str] = None,
) -> dict[str, Any]:
    mode = (mode or PUSH_PROVIDER_MODE or "native").lower()
    if mode not in SUPPORTED_PUSH_PROVIDER_MODES:
        # Never turn a typo/misconfiguration into an implicit provider fallback.
        return {"sent": 0, "providers": {}, "devices": 0, "mode": mode, "error": "invalid_provider_mode"}

    devices = active_devices(user_id)
    if not devices:
        return {"sent": 0, "providers": {}, "devices": 0, "mode": mode}

    devices = [d for d in devices if d.get("push_provider") in ("fcm", "apns")]
    if provider_filter in ("fcm", "apns"):
        devices = [d for d in devices if d.get("push_provider") == provider_filter]

    providers = {
        "fcm": FCMProvider(),
        "apns": APNsProvider(),
    }
    sent = 0
    already_delivered = 0
    by_provider: dict[str, int] = {}
    errors: dict[str, int] = {}
    retryable = True
    event_id = (data or {}).get("event_id") or (data or {}).get("event_key")
    for device in devices:
        if _already_sent_to_device(event_id, device.get("id")):
            already_delivered += 1
            continue
        device_title, device_body = title, body
        # System text may be tailored to each registered device. Free-form
        # chat/attachment text has no i18n_event and is forwarded unchanged.
        i18n_event = (data or {}).get("i18n_event")
        if i18n_event:
            try:
                from services.push_i18n import push_text
                localized = push_text(i18n_event, device.get("locale"), **((data or {}).get("i18n_params") or {}))
                if localized[0] is not None:
                    device_title, device_body = localized
            except Exception:
                pass
        provider_name = device.get("push_provider")
        provider = providers.get(provider_name)
        if not provider:
            errors["unsupported_provider"] = errors.get("unsupported_provider", 0) + 1
            continue
        token = device.get("push_token") or ""
        platform = device.get("platform")
        if not provider.supports_platform(platform) or not provider.validate_token(token):
            result = ProviderResult(provider_name, "failed", error_code="invalid_token", retryable=False)
        else:
            result = provider.send(token, device_title, device_body, data, badge=badge)
        log_delivery(event_id, user_id, device, result)
        if result.status == "sent":
            sent += 1
            by_provider[provider_name] = by_provider.get(provider_name, 0) + 1
        else:
            error_code = result.error_code or "provider_send_failed"
            errors[error_code] = errors.get(error_code, 0) + 1
            if not result.retryable:
                retryable = False
    return {
        "sent": sent,
        "already_delivered": already_delivered,
        "providers": by_provider,
        "devices": len(devices),
        "mode": mode,
        "errors": errors,
        # All failures must be transient before the outbox is allowed to
        # retry. A mixed multi-device send remains retryable only when the
        # outstanding devices have transient errors; invalid tokens are
        # deactivated by log_delivery and never reselected.
        "retryable": retryable,
    }


MAX_OUTBOX_ATTEMPTS = 5
STALE_PROCESSING_MINUTES = 5
WORKER_HEARTBEAT_STALE_SECONDS = 120
WORKER_NAME = "outbox_drain"
WORKER_ID = f"{WORKER_NAME}:{os.getpid()}"


def configured_outbox_cutoff_id() -> int:
    """Return a read-only cutoff that keeps legacy pending rows on hold."""
    raw = os.getenv("PUSH_OUTBOX_CUTOFF_ID", "").strip()
    if not raw:
        return 0
    try:
        return max(0, int(raw))
    except ValueError:
        return 0


def _reclaim_stale_processing(c) -> int:
    """A worker that crashed (or was killed) between claiming a row
    (status='processing') and finishing it would otherwise leave that row
    stuck forever — process_pending_once only ever SELECTs status='pending'.
    Reclaim anything that has been 'processing' longer than a worker could
    plausibly still be legitimately running (a single send_to_devices call is
    a handful of HTTP requests with a 10s timeout each, never minutes)."""
    # A cutoff is a strict safety boundary: historical QA rows stay held even
    # if a long-dead worker had claimed them before the cutoff was introduced.
    cur = c.execute(
        "UPDATE push_outbox SET status='retry', attempt_count=attempt_count+1, "
        "next_attempt_at=datetime(CURRENT_TIMESTAMP, '+10 seconds'), "
        "last_error='worker_lease_expired', claimed_at=NULL, locked_by=NULL "
        "WHERE status='processing' AND id > ? AND claimed_at IS NOT NULL "
        "AND claimed_at <= datetime(CURRENT_TIMESTAMP, ?) "
        "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
        (configured_outbox_cutoff_id(), f"-{STALE_PROCESSING_MINUTES} minutes"),
    )
    return cur.rowcount


def _expire_due_events(c) -> int:
    """Terminally expire stale pending notifications without touching data.

    Expiry is intentionally a distinct terminal status rather than ``dead``:
    it records that delivery was correctly suppressed by freshness policy, not
    that FCM/APNs failed.  A previously-claimed event is reclaimed first by
    the caller, so a crashed worker cannot bypass expiration.
    """
    cur = c.execute(
        "UPDATE push_outbox SET status='expired', failed_at=CURRENT_TIMESTAMP, "
        "last_error='notification_expired', claimed_at=NULL, locked_by=NULL "
        "WHERE status IN ('pending','retry') AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP"
    )
    return cur.rowcount


def _record_worker_heartbeat(c, *, picked: int = 0, error: Optional[str] = None) -> None:
    """Record only worker liveness; never payloads, user ids or tokens."""
    try:
        c.execute(
            """
            INSERT INTO push_worker_heartbeat(worker_name, last_heartbeat_at, last_batch_picked, last_error)
            VALUES(?, CURRENT_TIMESTAMP, ?, ?)
            ON CONFLICT(worker_name) DO UPDATE SET
              last_heartbeat_at=CURRENT_TIMESTAMP,
              last_batch_picked=excluded.last_batch_picked,
              last_error=excluded.last_error
            """,
            (WORKER_NAME, max(0, int(picked or 0)), (error or "")[:500] or None),
        )
    except Exception:
        # Legacy DB initialization must not fail merely because observability
        # is unavailable; the schema migration will make this succeed later.
        return


def _retry_delay_seconds(attempt: int, rng=None) -> int:
    """Exponential retry with bounded jitter, never below FCM's 10 seconds."""
    base = min(300, (2 ** max(1, int(attempt))) * 5)
    spread = min(60, max(1, base // 5))
    lower = max(10, base - spread)
    upper = min(300, base + spread)
    return (rng or random.SystemRandom()).randint(lower, upper)


def _claim_row(row_id: int) -> Optional[dict[str, Any]]:
    """Atomically flip exactly one pending row to 'processing' and return it,
    or None if it was already claimed by someone else (another worker tick,
    another process) between the earlier SELECT and this UPDATE. The
    `WHERE status='pending'` clause plus checking `rowcount` is what makes
    this safe under concurrent callers — see test for two workers racing the
    same row."""
    with get_conn() as c:
        cur = c.execute(
            "UPDATE push_outbox SET status='processing', claimed_at=CURRENT_TIMESTAMP, locked_by=? "
            "WHERE id=? AND status IN ('pending','retry')",
            (WORKER_ID, row_id),
        )
        if cur.rowcount != 1:
            return None
        row = c.execute("SELECT * FROM push_outbox WHERE id=?", (row_id,)).fetchone()
        return dict(row) if row else None


def _finish_row(
    row_id: int, attempt: int, sent: bool, error: Optional[str], *, partially_sent: bool = False,
    retryable: bool = True,
) -> str:
    """Apply the terminal/retry decision for one claimed row. Shared by both
    the normal (no delivery) and exception (poison event) paths so a handler
    that always raises still hits the same MAX_OUTBOX_ATTEMPTS→dead ceiling
    instead of retrying forever with no backoff."""
    with get_conn() as c:
        if sent:
            c.execute(
                "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, attempt_count=?, claimed_at=NULL, locked_by=NULL WHERE id=?",
                (attempt, row_id),
            )
            return "sent"
        if not retryable:
            terminal_status = "sent_partial" if partially_sent else "failed"
            c.execute(
                "UPDATE push_outbox SET status=?, failed_at=CURRENT_TIMESTAMP, attempt_count=?, last_error=?, claimed_at=NULL, locked_by=NULL WHERE id=?",
                (terminal_status, attempt, (error or "non_retryable_provider_error")[:500], row_id),
            )
            return "partial" if partially_sent else "failed"
        if attempt >= MAX_OUTBOX_ATTEMPTS:
            terminal_status = "sent_partial" if partially_sent else "dead"
            c.execute(
                "UPDATE push_outbox SET status=?, failed_at=CURRENT_TIMESTAMP, attempt_count=?, last_error=?, claimed_at=NULL, locked_by=NULL WHERE id=?",
                (terminal_status, attempt, (error or "delivery_not_confirmed")[:500], row_id),
            )
            return "partial" if partially_sent else "dead"
        delay = _retry_delay_seconds(attempt)
        c.execute(
            "UPDATE push_outbox SET status='retry', attempt_count=?, next_attempt_at=datetime(CURRENT_TIMESTAMP, ?), last_error=?, claimed_at=NULL, locked_by=NULL WHERE id=?",
            (attempt, f"+{delay} seconds", (error or "delivery_not_confirmed")[:500], row_id),
        )
        return "retry"


def _skip_row_without_devices(row_id: int, attempt: int) -> str:
    """Terminate an outbox row when the recipient has no registered device.

    This is not a provider failure: there was no delivery target to call. The
    in-app notification remains authoritative, while the push audit records a
    truthful terminal reason instead of retrying five times and inflating the
    release-blocking dead-letter count.
    """
    with get_conn() as c:
        c.execute(
            "UPDATE push_outbox SET status='skipped_no_devices', failed_at=CURRENT_TIMESTAMP, "
            "attempt_count=?, last_error='no_active_devices', claimed_at=NULL, locked_by=NULL WHERE id=?",
            (attempt, row_id),
        )
    return "skipped"


def process_pending_once(provider_send_one=None, limit: int = 100) -> dict[str, int]:
    """Process one small outbox batch. Safe to call repeatedly/concurrently
    (idempotent — a row already 'sent'/'dead', or already claimed by a
    concurrent caller, is simply skipped) and safe after a crash (stale
    'processing' rows are reclaimed first).

    Delivery ownership contract: the immediate/inline fast path
    (services.push_sender.send -> _send_native) marks its own outbox row
    'sent' via mark_event_sent() as soon as it succeeds, so a row only ever
    reaches this function's SELECT if the fast path never ran for it, or ran
    and failed. This function is therefore the sole retry owner for
    everything that is not already known-delivered — it never re-sends
    something the fast path already delivered.
    """
    bounded_limit = max(1, min(int(limit or 100), 500))
    with get_conn() as c:
        _reclaim_stale_processing(c)
        expired = _expire_due_events(c)
        candidate_ids = [
            r["id"]
            for r in c.execute(
                """
                SELECT id FROM push_outbox
                WHERE status IN ('pending','retry') AND id > ?
                  AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY CASE priority WHEN 'critical' THEN 0 ELSE 1 END, created_at
                LIMIT ?
                """,
                (configured_outbox_cutoff_id(), bounded_limit),
            ).fetchall()
        ]
        _record_worker_heartbeat(c, picked=len(candidate_ids))

    stats = {"picked": 0, "sent": 0, "retry": 0, "failed": 0, "dead": 0, "partial": 0, "skipped": 0, "expired": expired}
    for row_id in candidate_ids:
        row = _claim_row(row_id)
        if row is None:
            continue  # lost the race to another concurrent drain — not our row
        stats["picked"] += 1
        attempt = int(row["attempt_count"] or 0) + 1
        try:
            payload = json.loads(row["payload"] or "{}")
            # Retry-payload-integrity fix (push-closure track): the enqueued
            # payload (services/push_sender.py send() -> enqueue_event) never
            # included `badge` at all — every retried delivery silently sent
            # badge=None would omit the badge and leave stale OS state, so
            # had). Recompute fresh here rather than trying to persist a
            # static number: unread counts can legitimately change between
            # the original attempt and a retry minutes later, so a stored
            # value would risk being WRONG, not just missing.
            badge = payload.get("badge")
            if badge is None:
                try:
                    from services.push_sender import _compute_recipient_badge
                    badge = _compute_recipient_badge(row["recipient_user_id"])
                except Exception:
                    badge = None
            title = payload.get("title") or "UrTruck"
            body = payload.get("body") or ""
            data = payload.get("data") or payload
            if provider_send_one is not None:
                # Compatibility seam for deterministic unit tests only. The
                # runtime path always uses direct FCM/APNs below.
                devices = [
                    d for d in active_devices(row["recipient_user_id"])
                    if d.get("push_provider") in ("fcm", "apns")
                    and not _already_sent_to_device(row.get("event_id"), d.get("id"))
                ]
                tokens = [d.get("push_token") for d in devices if d.get("push_token")]
                callback_result = provider_send_one(tokens, title, body, data, badge=badge) if tokens else {"sent": 0}
                sent_count = int(callback_result.get("sent", 0) if isinstance(callback_result, dict) else callback_result)
                # The deterministic test seam represents an aggregate native
                # provider response. Persist the confirmed prefix in the same
                # delivery log used by direct FCM/APNs so a retry selects only
                # devices that were not confirmed by the prior attempt.
                for device in devices[:max(0, min(sent_count, len(devices)))]:
                    log_delivery(row.get("event_id"), row["recipient_user_id"], device, ProviderResult(device.get("push_provider") or "native", "sent"))
                result = {
                    "devices": len(tokens),
                    "sent": sent_count,
                    "already_delivered": 0,
                    "errors": (callback_result.get("errors") or {}) if isinstance(callback_result, dict) else {},
                    "error": callback_result.get("error") if isinstance(callback_result, dict) else None,
                    "retryable": bool(callback_result.get("retryable", True)) if isinstance(callback_result, dict) else True,
                }
            else:
                result = send_to_devices(row["recipient_user_id"], title, body, data, badge)
            # Multi-device fix (push-closure track): "sent" here must mean
            # EVERY currently-active device was reached, not merely at
            # least one — `result["sent"]` alone conflates "fully
            # delivered" with "partially delivered", which would close out
            # (mark 'sent', stop retrying) a row while one of the
            # recipient's devices never got it. `result["devices"]` is the
            # total targeted this attempt; per-device dedup already lives in
            # push_delivery_log/_already_sent_to_device, so a re-run of this
            # same row on the next tick only re-targets the device(s) that
            # did not yet succeed.
            total_devices = int(result.get("devices", 0) or 0)
            if total_devices == 0:
                outcome = _skip_row_without_devices(row["id"], attempt)
            else:
                confirmed = int(result.get("sent", 0) or 0) + int(result.get("already_delivered", 0) or 0)
                fully_delivered = confirmed >= total_devices
                failure_counts = result.get("errors") or {}
                failure_reason = ",".join(
                    f"{code}:{count}" for code, count in sorted(failure_counts.items())
                ) or result.get("error")
                outcome = _finish_row(
                    row["id"],
                    attempt,
                    sent=fully_delivered,
                    error=failure_reason,
                    partially_sent=confirmed > 0,
                    retryable=bool(result.get("retryable", True)),
                )
        except Exception as exc:
            # Poison event (malformed payload, provider client raising outside
            # its own try/except, etc.) — must not crash the worker or loop
            # forever without backoff; goes through the exact same
            # attempt/backoff/dead ladder as an ordinary delivery failure.
            outcome = _finish_row(row["id"], attempt, sent=False, error=str(exc), retryable=True)
        stats[outcome] += 1
    with get_conn() as c:
        _record_worker_heartbeat(c, picked=stats["picked"])
    return stats


def mark_event_sent(event_id: Optional[str], recipient_user_id: str) -> bool:
    """Called by the immediate/inline fast path right after a successful
    native send. Flips a still-pending/processing outbox row for this exact
    (event_id, recipient) straight to 'sent' so process_pending_once's
    `WHERE status='pending'` scan never re-sends it — this is the atomic
    claim/mark half of the delivery-ownership contract described on
    process_pending_once(). A no-op (returns False) when no event_key was
    used for this send (nothing was ever enqueued) or the row is already
    terminal (sent/dead) — never resurrects or re-marks a dead row.
    """
    if not event_id or not recipient_user_id:
        return False
    try:
        with get_conn() as c:
            cur = c.execute(
                "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, claimed_at=NULL, locked_by=NULL "
                "WHERE event_id=? AND recipient_user_id=? AND status IN ('pending','retry','processing')",
                (event_id, recipient_user_id),
            )
            return cur.rowcount > 0
    except Exception:
        return False


def info() -> dict[str, Any]:
    counts = {
        "devices_active": 0,
        "fcm": 0,
        "apns": 0,
        "outbox_pending": 0,
        "outbox_retry": 0,
        "outbox_pending_eligible": 0,
        "outbox_held_by_cutoff": 0,
        "outbox_processing": 0,
        "outbox_stale_processing": 0,
        "outbox_expired": 0,
        "outbox_dead": 0,
        "outbox_sent_partial": 0,
        "outbox_skipped_no_devices": 0,
        "oldest_eligible_pending_seconds": None,
    }
    observability: dict[str, Any] = {
        "cutoff_id": configured_outbox_cutoff_id(),
        "worker": {"last_heartbeat_at": None, "age_seconds": None, "stale": True},
        "delivery_errors_24h": {},
        "last_success_at": {"fcm": None, "apns": None},
        "delivery_24h": {
            "provider_accepted": 0,
            "client_received": 0,
            "notification_opened": 0,
            "provider_acceptance_rate": None,
            "avg_created_to_provider_accepted_seconds": None,
            "avg_provider_accepted_to_client_received_seconds": None,
        },
    }
    try:
        with get_conn() as c:
            counts["devices_active"] = int(c.execute("SELECT COUNT(*) FROM push_devices WHERE enabled = 1").fetchone()[0])
            for provider in ("fcm", "apns"):
                counts[provider] = int(c.execute(
                    "SELECT COUNT(*) FROM push_devices WHERE enabled = 1 AND push_provider = ?",
                    (provider,),
                ).fetchone()[0])
            counts["outbox_pending"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'pending'").fetchone()[0])
            counts["outbox_retry"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'retry'").fetchone()[0])
            cutoff = configured_outbox_cutoff_id()
            counts["outbox_pending_eligible"] = int(c.execute(
                "SELECT COUNT(*) FROM push_outbox WHERE status IN ('pending','retry') AND id > ? "
                "AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) "
                "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)", (cutoff,)
            ).fetchone()[0])
            counts["outbox_held_by_cutoff"] = int(c.execute(
                "SELECT COUNT(*) FROM push_outbox WHERE status IN ('pending','retry') AND id <= ?", (cutoff,)
            ).fetchone()[0])
            counts["outbox_processing"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status='processing'").fetchone()[0])
            counts["outbox_stale_processing"] = int(c.execute(
                "SELECT COUNT(*) FROM push_outbox WHERE status='processing' AND claimed_at IS NOT NULL "
                "AND claimed_at <= datetime(CURRENT_TIMESTAMP, ?)", (f"-{STALE_PROCESSING_MINUTES} minutes",)
            ).fetchone()[0])
            counts["outbox_expired"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status='expired'").fetchone()[0])
            counts["outbox_dead"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'dead'").fetchone()[0])
            counts["outbox_sent_partial"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'sent_partial'").fetchone()[0])
            counts["outbox_skipped_no_devices"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'skipped_no_devices'").fetchone()[0])
            oldest = c.execute(
                "SELECT CAST((julianday(CURRENT_TIMESTAMP) - julianday(MIN(created_at))) * 86400 AS INTEGER) "
                "FROM push_outbox WHERE status IN ('pending','retry') AND id > ? "
                "AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) "
                "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)", (cutoff,)
            ).fetchone()[0]
            counts["oldest_eligible_pending_seconds"] = max(0, int(oldest)) if oldest is not None else None
            heartbeat = c.execute(
                "SELECT last_heartbeat_at, CAST((julianday(CURRENT_TIMESTAMP) - julianday(last_heartbeat_at)) * 86400 AS INTEGER) AS age "
                "FROM push_worker_heartbeat WHERE worker_name='outbox_drain'"
            ).fetchone()
            if heartbeat:
                age = max(0, int(heartbeat["age"] or 0))
                observability["worker"] = {
                    "last_heartbeat_at": heartbeat["last_heartbeat_at"],
                    "age_seconds": age,
                    "stale": age > WORKER_HEARTBEAT_STALE_SECONDS,
                }
            error_rows = c.execute(
                "SELECT provider, COALESCE(error_code, 'unknown') AS error_code, COUNT(*) AS count "
                "FROM push_delivery_log WHERE status != 'sent' "
                "AND created_at >= datetime(CURRENT_TIMESTAMP, '-24 hours') "
                "GROUP BY provider, COALESCE(error_code, 'unknown')"
            ).fetchall()
            observability["delivery_errors_24h"] = {
                f"{row['provider']}:{row['error_code']}": int(row["count"]) for row in error_rows
            }
            for provider in ("fcm", "apns"):
                row = c.execute(
                    "SELECT MAX(last_success_at) FROM push_devices WHERE push_provider=?", (provider,)
                ).fetchone()
                observability["last_success_at"][provider] = row[0] if row else None
            delivery = c.execute(
                "SELECT COUNT(*) AS attempted, "
                "SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS accepted, "
                "SUM(CASE WHEN received_at IS NOT NULL THEN 1 ELSE 0 END) AS received, "
                "SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened "
                "FROM push_delivery_log WHERE created_at >= datetime(CURRENT_TIMESTAMP, '-24 hours')"
            ).fetchone()
            attempted = int(delivery["attempted"] or 0)
            accepted = int(delivery["accepted"] or 0)
            observability["delivery_24h"].update({
                "provider_accepted": accepted,
                "client_received": int(delivery["received"] or 0),
                "notification_opened": int(delivery["opened"] or 0),
                "provider_acceptance_rate": (accepted / attempted) if attempted else None,
            })
            latency = c.execute(
                "SELECT "
                "AVG((julianday(l.sent_at)-julianday(o.created_at))*86400.0) AS provider_seconds, "
                "AVG((julianday(l.received_at)-julianday(l.sent_at))*86400.0) AS receipt_seconds "
                "FROM push_delivery_log l LEFT JOIN push_outbox o "
                "ON o.event_id=l.event_id AND o.recipient_user_id=l.recipient_user_id "
                "WHERE l.created_at >= datetime(CURRENT_TIMESTAMP, '-24 hours') AND l.status='sent'"
            ).fetchone()
            if latency:
                provider_seconds = latency["provider_seconds"]
                receipt_seconds = latency["receipt_seconds"]
                observability["delivery_24h"]["avg_created_to_provider_accepted_seconds"] = (
                    round(float(provider_seconds), 3) if provider_seconds is not None else None
                )
                observability["delivery_24h"]["avg_provider_accepted_to_client_received_seconds"] = (
                    round(float(receipt_seconds), 3) if receipt_seconds is not None else None
                )
    except Exception:
        pass
    service_account = _service_account_info()
    fcm_private_key_valid = _service_account_private_key_valid(service_account)
    fcm_configured = bool(
        (FCM_PROJECT_ID or (service_account or {}).get("project_id"))
        and service_account
        and service_account.get("client_email")
        and service_account.get("private_key")
        and fcm_private_key_valid
    )
    fcm_errors = []
    if not (FCM_PROJECT_ID or (service_account or {}).get("project_id")):
        fcm_errors.append("project_id_missing")
    if not service_account:
        fcm_errors.append("service_account_missing_or_invalid")
    else:
        if not service_account.get("client_email"):
            fcm_errors.append("service_account_client_email_missing")
        if not service_account.get("private_key"):
            fcm_errors.append("service_account_private_key_missing")
        elif not fcm_private_key_valid:
            fcm_errors.append("service_account_private_key_invalid")
    try:
        import jwt  # noqa: F401
    except Exception:
        fcm_errors.append("pyjwt_missing")

    apns_key, apns_key_error = _apns_auth_key()
    apns_key_valid = _apns_private_key_valid(apns_key)
    apns_configured = bool(APNS_KEY_ID and APNS_TEAM_ID and APNS_BUNDLE_ID and apns_key_valid)
    apns_errors = []
    if not APNS_KEY_ID:
        apns_errors.append("key_id_missing")
    if not APNS_TEAM_ID:
        apns_errors.append("team_id_missing")
    if not APNS_BUNDLE_ID:
        apns_errors.append("bundle_id_missing")
    if apns_key_error:
        apns_errors.append(apns_key_error)
    elif apns_key and not apns_key_valid:
        apns_errors.append("auth_key_invalid")
    if not apns_configured and not apns_errors:
        apns_errors.append("apns_credentials_missing")
    config_errors = []
    if PUSH_PROVIDER_MODE not in SUPPORTED_PUSH_PROVIDER_MODES:
        config_errors.append("invalid_provider_mode")
    elif PUSH_PROVIDER_MODE == "native":
        if not fcm_configured:
            config_errors.append("fcm_not_configured")
        if not apns_configured:
            config_errors.append("apns_not_configured")

    return {
        "mode": PUSH_PROVIDER_MODE,
        "ready": not config_errors,
        "config_errors": config_errors,
        "fcm": {"configured": fcm_configured, "errors": fcm_errors},
        "apns": {"configured": apns_configured, "errors": apns_errors, "sandbox": APNS_USE_SANDBOX},
        "registry": counts,
        "observability": observability,
    }
