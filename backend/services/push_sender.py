"""Push sender with verified OneSignal and legacy Expo compatibility.

Web Push remains supported for browser subscriptions. FCM/APNs are preferred;
Expo rows are eligible only while the explicitly configured mode is ``dual``
and the gateway can distinguish them from native installations.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Optional

import httpx

from database.db import get_conn
from services import push_gateway

log = logging.getLogger(__name__)
PUSH_MOCK_WEB = (os.getenv("PUSH_MOCK_WEB") or "").lower() in {"1", "true", "yes"}
VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:support@urtruck.kz")
EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"
EXPO_ACCESS_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")


def _mask_token(token: str) -> str:
    return push_gateway.mask_token(token)


def _event_key(event_id: Optional[str], user_id: str) -> str:
    return f"{event_id or ''}:{user_id}"


def _already_delivered(event_id: Optional[str], user_id: str) -> bool:
    if not event_id:
        return False
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM push_outbox WHERE event_id = ? AND recipient_user_id = ? AND status IN ('sent','sent_partial') LIMIT 1",
            (event_id, user_id),
        ).fetchone()
    return bool(row)


def _log(event_id: Optional[str], user_id: str, provider: str, status: str, error: Optional[str] = None) -> None:
    log.debug("push event=%s user=%s provider=%s status=%s error=%s", event_id, user_id, provider, status, error)


def _web_subscriptions(user_id: str) -> list[dict[str, Any]]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND active = 1",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _claim_web_delivery(event_id: str, user_id: str, subscription_id: int) -> Optional[tuple[int, str]]:
    # Negative registry IDs occupy the existing delivery-log uniqueness key
    # without colliding with positive push_devices IDs. BEGIN IMMEDIATE makes
    # the read/claim atomic across API processes.
    registry_id = -abs(int(subscription_id))
    lease_token = uuid.uuid4().hex
    with get_conn() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute(
            "SELECT id,status,created_at FROM push_delivery_log "
            "WHERE event_id=? AND device_registry_id=? AND provider='web' ORDER BY id DESC LIMIT 1",
            (event_id, registry_id),
        ).fetchone()
        if row and row["status"] == "sent":
            return None
        if row and row["status"] == "processing" and row["created_at"]:
            active = c.execute(
                "SELECT 1 WHERE ? > datetime(CURRENT_TIMESTAMP, '-5 minutes')",
                (row["created_at"],),
            ).fetchone()
            if active:
                return None
        if row:
            c.execute(
                "UPDATE push_delivery_log SET status='processing', attempt=attempt+1, "
                "created_at=CURRENT_TIMESTAMP, error_code=NULL, provider_message_id=? WHERE id=?",
                (lease_token, row["id"]),
            )
            return int(row["id"]), lease_token
        cur = c.execute(
            "INSERT INTO push_delivery_log(event_id,recipient_user_id,device_registry_id,device_id,provider,"
            "status,token_masked,provider_message_id) VALUES(?,?,?,?,?,'processing',?,?)",
            (event_id, user_id, registry_id, f"web-sub:{int(subscription_id)}", "web", "subscription", lease_token),
        )
        return int(cur.lastrowid), lease_token


def _finish_web_delivery(delivery_id: int, lease_token: str, *, sent: bool,
                         error_code: Optional[str] = None) -> None:
    with get_conn() as c:
        c.execute(
            "UPDATE push_delivery_log SET status=?, sent_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, "
            "error_code=? WHERE id=? AND provider='web' AND status='processing' AND provider_message_id=?",
            ("sent" if sent else "failed", 1 if sent else 0, (error_code or "")[:160] or None,
             delivery_id, lease_token),
        )


def _send_web(user_id: str, title: str, body: str, data: dict, badge: Optional[int],
              event_id: Optional[str] = None) -> int:
    subs = _web_subscriptions(user_id)
    if not subs:
        return 0
    webpush = None
    if not PUSH_MOCK_WEB:
        try:
            from pywebpush import webpush as _webpush
            webpush = _webpush
        except Exception:
            return 0
    payload = json.dumps({"title": title, "body": body, "data": data or {}, "badge": badge})
    sent = 0
    for sub in subs:
        delivery_claim = _claim_web_delivery(event_id, user_id, sub["id"]) if event_id else None
        if event_id and delivery_claim is None:
            continue
        delivery_id, lease_token = delivery_claim if delivery_claim else (None, None)
        try:
            if webpush:
                webpush(
                    subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE,
                    vapid_claims={"sub": VAPID_SUBJECT},
                    timeout=30,
                )
            if delivery_id:
                _finish_web_delivery(delivery_id, lease_token, sent=True)
            sent += 1
        except Exception as exc:
            if delivery_id:
                _finish_web_delivery(delivery_id, lease_token, sent=False,
                                     error_code=f"web_{type(exc).__name__}")
            log.warning("web push failed endpoint=%s", _mask_token(sub.get("endpoint", "")))
    return sent


def _send_expo_detailed(tokens: list[str], title: str, body: str, data: dict,
                        badge: Optional[int] = None) -> dict[str, Any]:
    """Send Expo tickets without logging raw tokens or provider credentials."""
    if not tokens:
        return {"sent": 0, "tickets": [], "error": None}
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_ACCESS_TOKEN}"
    messages = []
    for token in tokens:
        message = {
            "to": token, "title": title, "body": body, "data": data or {},
            "sound": "default", "priority": "high", "channelId": "urtruck_messages_v2",
        }
        if badge is not None:
            message["badge"] = int(badge)
        messages.append(message)
    try:
        response = httpx.post(EXPO_ENDPOINT, headers=headers, json=messages, timeout=10.0)
        if response.status_code >= 400:
            return {"sent": 0, "tickets": [], "error": f"expo_http_{response.status_code}"}
        payload = response.json()
        raw_tickets = payload.get("data", []) if isinstance(payload, dict) else []
        tickets = []
        for ticket in raw_tickets:
            if not isinstance(ticket, dict):
                tickets.append({"status": "error", "message": "invalid_ticket"})
                continue
            tickets.append({
                "status": ticket.get("status"), "id": ticket.get("id"),
                "message": str(ticket.get("message") or "")[:200],
                "details": ticket.get("details") if isinstance(ticket.get("details"), dict) else {},
            })
        return {"sent": sum(ticket.get("status") == "ok" for ticket in tickets),
                "tickets": tickets, "error": None}
    except Exception as exc:
        # Exception text may contain request details; keep only its type.
        return {"sent": 0, "tickets": [], "error": f"expo_{type(exc).__name__}"}


def _send_native(user_id: str, title: str, body: str, data: dict, badge: Optional[int],
                 provider: Optional[str] = None, *, mode: str = "native",
                 delivery_lock: Optional[str] = None) -> dict[str, Any]:
    return push_gateway.send_to_devices(
        user_id=user_id, title=title, body=body, data=data or {}, badge=badge,
        mode=mode, provider_filter=provider if provider in {"expo", "fcm", "apns"} else None,
        expo_send_one=_send_expo_detailed if mode == "dual" else None,
        delivery_lock=delivery_lock,
    )


def _compute_recipient_badge(user_id: str) -> int:
    # Native APNs/FCM badge must equal the mobile client's combined unread
    # formula.  In particular, completed-deal chat rows must not resurrect a
    # stale launcher badge after the user has returned to the app.
    from api.notifications import unread_badge_count
    return unread_badge_count(user_id)


def notification_reference(user_id, title, body, url, event_id=None):
    """Correlate exactly one durable inbox record; ambiguous legacy alerts stay intact."""
    with get_conn() as c:
        if event_id:
            rows = c.execute("SELECT id,event_key FROM notifications WHERE user_id=? AND event_key=? LIMIT 2",
                             (user_id, event_id)).fetchall()
        else:
            rows = c.execute(
                "SELECT id,event_key FROM notifications WHERE user_id=? AND title=? AND body=? AND url=? "
                "AND is_read=0 AND created_at>=datetime('now','-5 minutes') LIMIT 2",
                (user_id, title, body, url),
            ).fetchall()
    if len(rows) != 1:
        return {}
    row = rows[0]
    return {"notification_id": row["id"], **({"notification_event_key": row["event_key"]} if row["event_key"] else {})}


def send(user_id: str, title: str, body: str, kind: str = "info", data: Optional[dict] = None,
         url: str = "/", *, event_id: Optional[str] = None, event_type: str = "generic",
         badge: Optional[int] = None, provider: Optional[str] = None) -> dict[str, Any]:
    data = {**(data or {}), "kind": kind, "url": url}
    event_id = event_id or data.get("event_id") or data.get("event_key") or data.get("event")
    data.update(notification_reference(user_id, title, body, url, event_id))
    event_id = event_id or str(uuid.uuid4())
    event_type = event_type if event_type != "generic" else str(data.get("type") or kind)
    if event_id:
        data.setdefault("event_id", event_id)
    # Freeze TTL/collapse controls once at business-event creation so the
    # immediate path and a later durable retry deliver the same semantics.
    data = push_gateway.enrich_event_data(event_type, data)
    badge = _compute_recipient_badge(user_id) if badge is None else badge
    if event_id and _already_delivered(event_id, user_id):
        return {"sent": 0, "duplicate": True, "event_id": event_id}
    if event_id:
        push_gateway.enqueue_event(
            event_id, event_type, user_id,
            {"title": title, "body": body, "data": data, "badge": badge},
        )
    inline_lock = None
    if push_gateway.PUSH_PROVIDER_MODE == "dual":
        inline_lock = push_gateway.claim_inline_event(event_id, user_id)
        if inline_lock is None:
            # Another inline sender or the outbox worker owns this durable
            # mobile event. Never race that owner to FCM/APNs/Expo. Web Push
            # is not handled by the mobile outbox worker, so retain that path.
            web_sent = _send_web(user_id, title, body, data, badge, event_id=event_id)
            return {"sent": web_sent, "web": web_sent, "web_sent": web_sent,
                    "native": 0, "duplicate": True, "event_id": event_id}
    if push_gateway.PUSH_PROVIDER_MODE == "dual":
        # Drain native targets while this sender owns the outbox lease. Web
        # subscriptions are sequential and can outlive the five-minute worker
        # lease; sending them first could let a worker race an unlogged native
        # delivery. Native delivery_log entries make later worker pickup safe.
        native = _send_native(user_id, title, body, data, badge, provider,
                              mode="dual", delivery_lock=inline_lock)
        web_sent = _send_web(user_id, title, body, data, badge, event_id=event_id)
    else:
        # Keep the long-standing callable signature stable for existing
        # integrations and deterministic test seams in native mode.
        native = _send_native(user_id, title, body, data, badge, provider)
        web_sent = _send_web(user_id, title, body, data, badge, event_id=event_id)
    sent = web_sent + int(native.get("sent") or 0)
    native_devices = int(native.get("devices") or 0)
    native_sent = int(native.get("sent") or 0) + int(native.get("already_delivered") or 0)
    # A web subscription cannot stand in for a registered native device: the
    # recipient may have both.  Only close a native outbox event after every
    # active native target is provider-accepted; otherwise the drain worker
    # owns the retry.  If the provider classified the remaining failure as
    # permanent, close it truthfully now instead of scheduling futile retry.
    fully_delivered = native_sent >= native_devices if native_devices > 0 else bool(web_sent)
    native_retryable = bool(native.get("retryable", True))
    native_errors = native.get("errors") or {}
    safe_error = ",".join(sorted(str(code) for code in native_errors))[:500] or "non_retryable_provider_error"
    inline_claimed = bool(inline_lock)
    if inline_lock:
        if fully_delivered:
            push_gateway.finish_inline_event(event_id, user_id, inline_lock, "sent")
        elif native_devices > 0 and not native_retryable:
            terminal = "sent_partial" if native_sent else "failed"
            push_gateway.finish_inline_event(event_id, user_id, inline_lock, terminal, safe_error)
        else:
            push_gateway.finish_inline_event(event_id, user_id, inline_lock, "pending", safe_error)
        inline_lock = None
    if event_id and not inline_claimed and (fully_delivered or (native_devices > 0 and not native_retryable)):
        try:
            with get_conn() as c:
                if fully_delivered:
                    c.execute(
                        "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, claimed_at=NULL, locked_by=NULL "
                        "WHERE event_id=? AND recipient_user_id=? AND status IN ('pending','retry')",
                        (event_id, user_id),
                    )
                else:
                    terminal = "sent_partial" if native_sent else "failed"
                    c.execute(
                        "UPDATE push_outbox SET status=?, failed_at=CURRENT_TIMESTAMP, last_error=?, claimed_at=NULL, locked_by=NULL "
                        "WHERE event_id=? AND recipient_user_id=? AND status IN ('pending','retry')",
                        (terminal, safe_error, event_id, user_id),
                    )
        except Exception:
            pass
    _log(event_id, user_id, "native", "sent" if sent else "not_sent", native.get("error"))
    return {
        "sent": sent,
        "web": web_sent,
        "web_sent": web_sent,
        "native": native_sent,
        "native_result": native,
        "total": sent,
        "event_id": event_id,
    }


def broadcast(user_ids: list[str], title: str, body: str, data: Optional[dict] = None,
              *, event_id: Optional[str] = None, event_type: str = "generic") -> dict[str, Any]:
    results = [send(uid, title, body, data=data, event_id=event_id, event_type=event_type) for uid in user_ids]
    return {"sent": sum(int(r.get("sent") or 0) for r in results), "results": results}


def send_native_debug(user_id: str, title: str, body: str, data: Optional[dict] = None,
                      badge: Optional[int] = None, provider: Optional[str] = None) -> dict[str, Any]:
    data = {**(data or {})}
    data.setdefault("event_id", str(uuid.uuid4()))
    result = _send_native(user_id, title, body, data, badge, provider)
    result["provider"] = provider if provider in {"fcm", "apns"} else "native"
    return result


def drain_outbox_once(limit: int = 100) -> dict[str, Any]:
    return push_gateway.process_pending_once(limit=limit)


def native_token_diagnostics(user_id: str) -> dict[str, Any]:
    devices = push_gateway.active_devices(user_id)
    safe = [
        {
            "device_id": d.get("device_id"),
            "platform": d.get("platform"),
            "provider": d.get("push_provider"),
            "token": _mask_token(d.get("push_token") or ""),
            "app_id": d.get("app_id"),
            "locale": d.get("locale"),
        }
        for d in devices if d.get("push_provider") in {"fcm", "apns"}
    ]
    return {"user_id": user_id, "native_devices": safe, "count": len(safe)}


def info() -> dict[str, Any]:
    with get_conn() as c:
        web = c.execute("SELECT COUNT(*) FROM push_subscriptions WHERE active = 1").fetchone()[0]
        native = c.execute(
            "SELECT COUNT(*) FROM push_devices WHERE enabled = 1 AND push_provider IN ('fcm','apns')"
        ).fetchone()[0]
        legacy = c.execute(
            "SELECT COUNT(*) FROM push_devices WHERE enabled = 1 AND push_provider NOT IN ('fcm','apns')"
        ).fetchone()[0]
    gateway = push_gateway.info()
    return {"web": {"active": web}, "native": {"active": native, "legacy_ignored": legacy},
            "gateway": gateway, "vapid": {"configured": bool(VAPID_PUBLIC and VAPID_PRIVATE)}}
