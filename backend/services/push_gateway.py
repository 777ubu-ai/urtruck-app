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


# Push/Outbox/Localization repair (2026-09-11), item 3 ("error
# classification" applies here as much as it does to FCM). Expo's own
# documented ticket-level error codes
# (https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors) —
# only these two are permanent (retrying can never succeed): a token Expo
# has confirmed dead, or a request too large for Expo to ever accept
# regardless of retry. Everything else (rate limiting, Expo's own
# transient failures, an unrecognized/future code) defaults to
# retryable=True — the safe direction to be wrong in, since a row
# process_pending_once wrongly keeps retrying just costs a few more
# bounded attempts before going dead anyway, while wrongly marking a
# transient failure permanent throws away a delivery that could have
# succeeded on retry. Previously this was hardcoded retryable=False for
# EVERY Expo failure with no classification at all — confirmed via
# test_push_outbox_drain.py's own transient-failure fixture, which this
# fix keeps passing.
_EXPO_PERMANENT_ERRORS = {"DeviceNotRegistered", "MessageTooBig"}


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
        retryable = str(details.get("error") or "") not in _EXPO_PERMANENT_ERRORS
        return ProviderResult("expo", "failed", response=ticket, error_code=str(error_code), retryable=retryable)


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
    app-wide default (EN — never RU, per i18n-16 item 2) when the user has
    no device with a locale on file (older client, or a client that never
    sent one)."""
    from services.push_i18n import normalize_locale
    for device in active_devices(user_id):
        if device.get("locale"):
            return normalize_locale(device["locale"])
    return normalize_locale(None)


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
    already_delivered = 0
    by_provider: dict[str, int] = {}
    # Push/Outbox/Localization repair (2026-09-11), item 2/1: ProviderResult.
    # retryable existed and was correctly set by every provider (e.g.
    # FCMProvider returns retryable=False for provider_not_configured/
    # invalid_credentials/invalid_token) but nothing downstream ever read
    # it — process_pending_once retried EVERY non-fully-delivered row
    # through the full exponential-backoff ladder regardless, so a
    # permanently-misconfigured provider (FCM with no real credentials —
    # the "FCM mode = MOCK" runtime state) burned all 5 attempts (~150s)
    # for every single event before finally going 'dead', instead of
    # failing fast. Track it here so process_pending_once can skip straight
    # to 'dead' when nothing about a retry could ever succeed.
    undelivered_all_permanent = True
    attempted_any = False
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
            continue
        attempted_any = True
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
        elif result.retryable:
            undelivered_all_permanent = False
    return {
        "sent": sent,
        "already_delivered": already_delivered,
        "providers": by_provider,
        "devices": len(devices),
        "mode": mode,
        # True only when at least one device was actually attempted, none
        # of them delivered, and every failure among them was non-retryable
        # — i.e. retrying this exact row again cannot ever change the
        # outcome. False (never "give up early") when nothing was attempted
        # at all (e.g. every device already delivered on a prior attempt,
        # or none matched a configured provider) so an ambiguous case never
        # short-circuits a row that might still legitimately succeed.
        "permanent_failure": attempted_any and sent == 0 and undelivered_all_permanent,
    }


MAX_OUTBOX_ATTEMPTS = 5
STALE_PROCESSING_MINUTES = 5


def _reclaim_stale_processing(c) -> int:
    """A worker that crashed (or was killed) between claiming a row
    (status='processing') and finishing it would otherwise leave that row
    stuck forever — process_pending_once only ever SELECTs status='pending'.
    Reclaim anything that has been 'processing' longer than a worker could
    plausibly still be legitimately running (a single send_to_devices call is
    a handful of HTTP requests with a 10s timeout each, never minutes)."""
    cur = c.execute(
        "UPDATE push_outbox SET status='pending', claimed_at=NULL "
        "WHERE status='processing' AND claimed_at IS NOT NULL "
        "AND claimed_at <= datetime(CURRENT_TIMESTAMP, ?)",
        (f"-{STALE_PROCESSING_MINUTES} minutes",),
    )
    return cur.rowcount


def _claim_row(row_id: int) -> Optional[dict[str, Any]]:
    """Atomically flip exactly one pending row to 'processing' and return it,
    or None if it was already claimed by someone else (another worker tick,
    another process) between the earlier SELECT and this UPDATE. The
    `WHERE status='pending'` clause plus checking `rowcount` is what makes
    this safe under concurrent callers — see test for two workers racing the
    same row."""
    with get_conn() as c:
        cur = c.execute(
            "UPDATE push_outbox SET status='processing', claimed_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND status='pending'",
            (row_id,),
        )
        if cur.rowcount != 1:
            return None
        row = c.execute("SELECT * FROM push_outbox WHERE id=?", (row_id,)).fetchone()
        return dict(row) if row else None


def _finish_row(row_id: int, attempt: int, sent: bool, error: Optional[str], permanent: bool = False) -> str:
    """Apply the terminal/retry decision for one claimed row. Shared by both
    the normal (no delivery) and exception (poison event) paths so a handler
    that always raises still hits the same MAX_OUTBOX_ATTEMPTS→dead ceiling
    instead of retrying forever with no backoff.

    `permanent` (item 1/2 of the push/outbox repair): when every device this
    attempt touched failed with a non-retryable provider error (see
    send_to_devices's "permanent_failure"), go straight to 'dead' instead of
    burning through the remaining backoff attempts first — nothing about
    retrying an unconfigured/invalid-credential provider or an invalid
    token can change on its own between now and attempt 5. Never applies
    to a poison-event/exception path (permanent defaults False there) — an
    exception says nothing about whether THIS specific failure would recur,
    so that path keeps the full backoff ladder.
    """
    with get_conn() as c:
        if sent:
            c.execute(
                "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, attempt_count=?, claimed_at=NULL WHERE id=?",
                (attempt, row_id),
            )
            return "sent"
        if permanent or attempt >= MAX_OUTBOX_ATTEMPTS:
            c.execute(
                "UPDATE push_outbox SET status='dead', failed_at=CURRENT_TIMESTAMP, attempt_count=?, last_error=?, claimed_at=NULL WHERE id=?",
                (attempt, (error or "delivery_not_confirmed")[:500], row_id),
            )
            return "dead"
        delay = min(300, 2 ** attempt * 5)
        c.execute(
            "UPDATE push_outbox SET status='pending', attempt_count=?, next_attempt_at=datetime(CURRENT_TIMESTAMP, ?), last_error=?, claimed_at=NULL WHERE id=?",
            (attempt, f"+{delay} seconds", (error or "delivery_not_confirmed")[:500], row_id),
        )
        return "failed"


def process_pending_once(expo_send_one, limit: int = 100) -> dict[str, int]:
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
        candidate_ids = [
            r["id"]
            for r in c.execute(
                """
                SELECT id FROM push_outbox
                WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
                ORDER BY CASE priority WHEN 'critical' THEN 0 ELSE 1 END, created_at
                LIMIT ?
                """,
                (bounded_limit,),
            ).fetchall()
        ]

    stats = {"picked": 0, "sent": 0, "failed": 0, "dead": 0}
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
            # badge=None (Expo: the "badge" field is omitted entirely when
            # None, so the OS keeps showing whatever stale number it already
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
            result = send_to_devices(
                row["recipient_user_id"],
                payload.get("title") or "UrTruck",
                payload.get("body") or "",
                payload.get("data") or payload,
                badge,
                expo_send_one=expo_send_one,
            )
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
            confirmed = int(result.get("sent", 0) or 0) + int(result.get("already_delivered", 0) or 0)
            fully_delivered = total_devices > 0 and confirmed >= total_devices
            permanent = (not fully_delivered) and bool(result.get("permanent_failure"))
            error = None
            if permanent:
                error = f"permanent_provider_failure (mode={result.get('mode')})"
            outcome = _finish_row(row["id"], attempt, sent=fully_delivered, error=error, permanent=permanent)
        except Exception as exc:
            # Poison event (malformed payload, provider client raising outside
            # its own try/except, etc.) — must not crash the worker or loop
            # forever without backoff; goes through the exact same
            # attempt/backoff/dead ladder as an ordinary delivery failure.
            # permanent stays False here deliberately — see _finish_row's
            # docstring on why an exception must not skip the backoff ladder.
            outcome = _finish_row(row["id"], attempt, sent=False, error=str(exc))
        stats[outcome] += 1
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
                "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, claimed_at=NULL "
                "WHERE event_id=? AND recipient_user_id=? AND status IN ('pending','processing')",
                (event_id, recipient_user_id),
            )
            return cur.rowcount > 0
    except Exception:
        return False


RECEIPT_MIN_AGE_MINUTES = 15  # Expo's own guidance: receipts are not reliably available before this
RECEIPT_MAX_AGE_DAYS = 1      # Expo retains receipts ~1 day; querying older rows would waste a call for nothing


def poll_pending_receipts(expo_receipts_fn, limit: int = 50) -> dict[str, int]:
    """Bounded, once-per-row Expo delivery-receipt reconciliation (push-
    recovery track, Phase 5).

    Complements the immediate ticket-level DeviceNotRegistered handling
    services.push_sender._send_expo already does (that only sees errors Expo
    already knows about at send time) — some invalid-token errors only
    surface in the DELAYED receipt, not the immediate ticket. Each
    push_delivery_log row is queried at MOST ONCE (receipt_checked_at guard
    below, set unconditionally whether or not Expo had an answer yet), in a
    bounded age window (RECEIPT_MIN_AGE_MINUTES..RECEIPT_MAX_AGE_DAYS) — this
    can never grow into an unbounded query or re-poll the same row forever.
    A row whose receipt never resolves in that window simply stays
    delivered_at=NULL — no retry loop, no aggressive polling.
    """
    bounded_limit = max(1, min(int(limit or 50), 200))
    with get_conn() as c:
        rows = [
            dict(r)
            for r in c.execute(
                """
                SELECT id, device_registry_id, provider_message_id FROM push_delivery_log
                WHERE provider = 'expo' AND status = 'sent' AND delivered_at IS NULL
                  AND receipt_checked_at IS NULL AND provider_message_id IS NOT NULL
                  AND sent_at IS NOT NULL
                  AND sent_at <= datetime(CURRENT_TIMESTAMP, ?)
                  AND sent_at >= datetime(CURRENT_TIMESTAMP, ?)
                LIMIT ?
                """,
                (f"-{RECEIPT_MIN_AGE_MINUTES} minutes", f"-{RECEIPT_MAX_AGE_DAYS} days", bounded_limit),
            ).fetchall()
        ]

    stats = {"checked": 0, "delivered": 0, "invalid_token": 0, "errors": 0}
    if not rows:
        return stats

    # Same ticket could theoretically repeat across rows; a dict is fine —
    # we only need the row to update per ticket, not a list of duplicates.
    by_ticket = {r["provider_message_id"]: r for r in rows}
    try:
        result = expo_receipts_fn(list(by_ticket.keys())) or {}
    except Exception:
        return stats  # transient provider failure — rows stay unchecked, next tick retries them
    receipts = result.get("receipts") or {}

    with get_conn() as c:
        for ticket_id, row in by_ticket.items():
            stats["checked"] += 1
            c.execute(
                "UPDATE push_delivery_log SET receipt_checked_at = CURRENT_TIMESTAMP WHERE id = ?",
                (row["id"],),
            )
            receipt = receipts.get(ticket_id)
            if not receipt:
                continue  # not resolved yet / Expo has no record for it — leave delivered_at NULL
            if receipt.get("status") == "ok":
                c.execute(
                    "UPDATE push_delivery_log SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (row["id"],),
                )
                stats["delivered"] += 1
                continue
            details = receipt.get("details") or {}
            if details.get("error") == "DeviceNotRegistered" and row.get("device_registry_id"):
                c.execute(
                    "UPDATE push_devices SET enabled = 0, invalidated_at = CURRENT_TIMESTAMP, "
                    "invalidated_reason = 'expo_receipt_device_not_registered' WHERE id = ?",
                    (row["device_registry_id"],),
                )
                stats["invalid_token"] += 1
            else:
                stats["errors"] += 1
        c.commit()
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
    return {
        "mode": PUSH_PROVIDER_MODE,
        "fcm": {"configured": bool((FCM_PROJECT_ID or (_service_account_info() or {}).get("project_id")) and _service_account_info())},
        "apns": {"configured": bool(APNS_KEY_ID and APNS_TEAM_ID and APNS_AUTH_KEY_P8 and APNS_BUNDLE_ID), "sandbox": APNS_USE_SANDBOX},
        "registry": counts,
    }
