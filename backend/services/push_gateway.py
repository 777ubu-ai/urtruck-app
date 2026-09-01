"""Native push gateway: FCM/APNs primary, Expo fallback.

This module is deliberately additive. Existing business call-sites still call
services.push_sender.send(), while the sender delegates native delivery here
according to PUSH_PROVIDER_MODE:

  expo   -> legacy Expo Push only
  native -> direct FCM/APNs only
  dual   -> direct FCM/APNs first, Expo only for devices without native token
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from database.db import get_conn

PUSH_PROVIDER_MODE = (os.getenv("PUSH_PROVIDER_MODE") or "expo").strip().lower()
NATIVE_PUSH_CHANNEL_ID = "urtruck_messages_v2"

FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")
FCM_SERVICE_ACCOUNT_JSON = os.getenv("FCM_SERVICE_ACCOUNT_JSON", "")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

APNS_KEY_ID = os.getenv("APNS_KEY_ID", "")
APNS_TEAM_ID = os.getenv("APNS_TEAM_ID", "")
APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "")
APNS_AUTH_KEY_P8 = os.getenv("APNS_AUTH_KEY_P8", "")
APNS_USE_SANDBOX = (os.getenv("APNS_USE_SANDBOX") or "").lower() in ("1", "true", "yes")

CRITICAL_EVENTS = {
    "bid.accepted",
    "trip.started",
    "trip.gps_lost",
    "trip.delivered",
    "trip.completed",
}

PUSH_EVENT_CATALOG = {
    "bid.created",
    "bid.countered",
    "bid.accepted",
    "bid.rejected",
    "bid.withdrawn",
    "chat.message",
    "chat.voice",
    "trip.started",
    "trip.status_changed",
    "trip.border",
    "trip.gps_lost",
    "trip.gps_restored",
    "trip.delivered",
    "trip.completed",
    "deal.cancelled",
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


def _service_account_info() -> Optional[dict[str, Any]]:
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
        assertion = jwt.encode(claim, info.get("private_key"), algorithm="RS256")
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
            return ProviderResult("fcm", "failed", error_code="provider_not_configured", retryable=False)
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": {str(k): "" if v is None else str(v) for k, v in (data or {}).items()},
                "android": {
                    "priority": "HIGH",
                    "notification": {
                        "channel_id": NATIVE_PUSH_CHANNEL_ID,
                        "sound": "default",
                        "notification_count": int(badge or 0),
                    },
                },
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
        if not (APNS_KEY_ID and APNS_TEAM_ID and APNS_AUTH_KEY_P8):
            return None
        try:
            import jwt  # PyJWT, optional until APNs is configured
        except Exception:
            return None
        return jwt.encode(
            {"iss": APNS_TEAM_ID, "iat": int(time.time())},
            APNS_AUTH_KEY_P8.replace("\\n", "\n"),
            algorithm="ES256",
            headers={"alg": "ES256", "kid": APNS_KEY_ID},
        )

    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        auth = self._jwt()
        topic = (data or {}).get("apns_topic") or APNS_BUNDLE_ID or (data or {}).get("app_id")
        if not auth or not topic:
            return ProviderResult("apns", "failed", error_code="provider_not_configured", retryable=False)
        host = "api.sandbox.push.apple.com" if APNS_USE_SANDBOX else "api.push.apple.com"
        payload = {
            "aps": {"alert": {"title": title, "body": body}, "sound": "default", "badge": int(badge or 0)},
            **{str(k): v for k, v in (data or {}).items() if k != "apns_topic"},
        }
        try:
            with httpx.Client(http2=True, timeout=10.0) as client:
                resp = client.post(
                    f"https://{host}/3/device/{token}",
                    headers={
                        "authorization": f"bearer {auth}",
                        "apns-topic": topic,
                        "apns-push-type": "alert",
                        "apns-priority": "10",
                    },
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


class ExpoProvider(PushProvider):
    name = "expo"

    def __init__(self, send_one):
        self._send_one = send_one

    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        result = self._send_one([token], title, body, data, badge=badge)
        if result.get("sent", 0) > 0:
            ticket = (result.get("tickets") or [{}])[0]
            return ProviderResult("expo", "sent", message_id=ticket.get("id"), response=ticket)
        ticket = (result.get("tickets") or [{}])[0]
        details = ticket.get("details") or {}
        error_code = result.get("error") or details.get("error") or ticket.get("message") or "send_failed"
        return ProviderResult("expo", "failed", response=ticket, error_code=str(error_code), retryable=False)


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


def enqueue_event(event_id: str, event_type: str, recipient_user_id: str, payload: dict, priority: Optional[str] = None) -> bool:
    if not (event_id and event_type and recipient_user_id):
        return False
    prio = priority or ("critical" if event_type in CRITICAL_EVENTS else "normal")
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO push_outbox(event_id, event_type, recipient_user_id, payload, priority)
            VALUES(?,?,?,?,?)
            ON CONFLICT(event_id, recipient_user_id) DO NOTHING
            """,
            (event_id, event_type, recipient_user_id, _json_dumps(payload), prio),
        )
        return c.total_changes > 0


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
    except Exception:
        return


def _dedupe_for_dual(devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    native_keys = {
        d.get("device_id")
        for d in devices
        if d.get("device_id") and d.get("push_provider") in ("fcm", "apns")
    }
    selected = []
    for d in devices:
        if d.get("push_provider") == "expo" and d.get("device_id") in native_keys:
            continue
        selected.append(d)
    return selected


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
    expo_send_one,
    mode: Optional[str] = None,
    provider_filter: Optional[str] = None,
) -> dict[str, Any]:
    mode = (mode or PUSH_PROVIDER_MODE or "expo").lower()
    if mode not in ("expo", "native", "dual"):
        mode = "expo"

    devices = active_devices(user_id)
    if not devices:
        return {"sent": 0, "providers": {}, "devices": 0, "mode": mode}

    if mode == "expo":
        devices = [d for d in devices if d.get("push_provider") == "expo"]
    elif mode == "native":
        devices = [d for d in devices if d.get("push_provider") in ("fcm", "apns")]
    else:
        devices = _dedupe_for_dual(devices)
    if provider_filter in ("expo", "fcm", "apns"):
        devices = [d for d in devices if d.get("push_provider") == provider_filter]

    providers = {
        "fcm": FCMProvider(),
        "apns": APNsProvider(),
        "expo": ExpoProvider(expo_send_one),
    }
    sent = 0
    by_provider: dict[str, int] = {}
    event_id = (data or {}).get("event_id") or (data or {}).get("event_key")
    for device in devices:
        if _already_sent_to_device(event_id, device.get("id")):
            continue
        provider_name = device.get("push_provider")
        provider = providers.get(provider_name)
        if not provider:
            continue
        token = device.get("push_token") or ""
        platform = device.get("platform")
        if not provider.supports_platform(platform) or not provider.validate_token(token):
            result = ProviderResult(provider_name, "failed", error_code="invalid_token", retryable=False)
        else:
            result = provider.send(token, title, body, data, badge=badge)
        log_delivery(event_id, user_id, device, result)
        if result.status == "sent":
            sent += 1
            by_provider[provider_name] = by_provider.get(provider_name, 0) + 1
    return {"sent": sent, "providers": by_provider, "devices": len(devices), "mode": mode}


def process_pending_once(expo_send_one, limit: int = 100) -> dict[str, int]:
    """Process one small outbox batch.

    Business actions can enqueue rows inside their transaction, then a worker
    calls this function after commit. It retries only retryable provider errors;
    non-retryable rows become dead.
    """
    picked = []
    with get_conn() as c:
        rows = c.execute(
            """
            SELECT * FROM push_outbox
            WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
            ORDER BY CASE priority WHEN 'critical' THEN 0 ELSE 1 END, created_at
            LIMIT ?
            """,
            (max(1, min(int(limit or 100), 500)),),
        ).fetchall()
        picked = [dict(r) for r in rows]
        for row in picked:
            c.execute("UPDATE push_outbox SET status = 'processing' WHERE id = ? AND status = 'pending'", (row["id"],))

    stats = {"picked": len(picked), "sent": 0, "failed": 0, "dead": 0}
    for row in picked:
        try:
            payload = json.loads(row["payload"] or "{}")
            result = send_to_devices(
                row["recipient_user_id"],
                payload.get("title") or "UrTruck",
                payload.get("body") or "",
                payload.get("data") or payload,
                payload.get("badge"),
                expo_send_one=expo_send_one,
            )
            status = "sent" if result.get("sent", 0) else "pending"
            attempt = int(row["attempt_count"] or 0) + 1
            if status == "sent":
                stats["sent"] += 1
                with get_conn() as c:
                    c.execute("UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, attempt_count=? WHERE id=?", (attempt, row["id"]))
                continue
            if attempt >= 5:
                stats["dead"] += 1
                with get_conn() as c:
                    c.execute(
                        "UPDATE push_outbox SET status='dead', failed_at=CURRENT_TIMESTAMP, attempt_count=?, last_error=? WHERE id=?",
                        (attempt, "delivery_not_confirmed", row["id"]),
                    )
                continue
            stats["failed"] += 1
            delay = min(300, 2 ** attempt * 5)
            with get_conn() as c:
                c.execute(
                    "UPDATE push_outbox SET status='pending', attempt_count=?, next_attempt_at=datetime(CURRENT_TIMESTAMP, ?), last_error=? WHERE id=?",
                    (attempt, f"+{delay} seconds", "delivery_not_confirmed", row["id"]),
                )
        except Exception as exc:
            stats["failed"] += 1
            with get_conn() as c:
                c.execute(
                    "UPDATE push_outbox SET status='pending', attempt_count=attempt_count+1, last_error=? WHERE id=?",
                    (str(exc)[:500], row["id"]),
                )
    return stats


def info() -> dict[str, Any]:
    counts = {"devices_active": 0, "expo": 0, "fcm": 0, "apns": 0, "outbox_pending": 0, "outbox_dead": 0}
    try:
        with get_conn() as c:
            counts["devices_active"] = int(c.execute("SELECT COUNT(*) FROM push_devices WHERE enabled = 1").fetchone()[0])
            for provider in ("expo", "fcm", "apns"):
                counts[provider] = int(c.execute(
                    "SELECT COUNT(*) FROM push_devices WHERE enabled = 1 AND push_provider = ?",
                    (provider,),
                ).fetchone()[0])
            counts["outbox_pending"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'pending'").fetchone()[0])
            counts["outbox_dead"] = int(c.execute("SELECT COUNT(*) FROM push_outbox WHERE status = 'dead'").fetchone()[0])
    except Exception:
        pass
    fcm_project_id = FCM_PROJECT_ID or (_service_account_info() or {}).get("project_id")
    fcm_configured = bool(fcm_project_id and _service_account_info())
    apns_configured = bool(APNS_KEY_ID and APNS_TEAM_ID and APNS_AUTH_KEY_P8 and APNS_BUNDLE_ID)
    return {
        "mode": PUSH_PROVIDER_MODE,
        "gateway_provider": "native_fcm_apns",
        "fcm": {
            "configured": fcm_configured,
            "live": fcm_configured,
            "project_id": fcm_project_id or None,
        },
        "apns": {
            "configured": apns_configured,
            "live": apns_configured,
            "sandbox": APNS_USE_SANDBOX,
        },
        "expo_fallback": PUSH_PROVIDER_MODE in ("expo", "dual"),
        "registry": counts,
    }
