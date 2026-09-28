"""Native push sender for direct FCM/APNs delivery.

Web Push remains supported for browser subscriptions. Mobile delivery is
strictly native: device rows registered as FCM/APNs are sent through the
gateway; legacy rows remain stored but are never selected.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from database.db import get_conn
from services import push_gateway

log = logging.getLogger(__name__)
PUSH_MOCK_WEB = (os.getenv("PUSH_MOCK_WEB") or "").lower() in {"1", "true", "yes"}
VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:support@urtruck.kz")


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


def _send_web(user_id: str, title: str, body: str, data: dict, badge: Optional[int]) -> int:
    subs = _web_subscriptions(user_id)
    if not subs:
        return 0
    if PUSH_MOCK_WEB:
        return len(subs)
    try:
        from pywebpush import webpush
    except Exception:
        return 0
    payload = json.dumps({"title": title, "body": body, "data": data or {}, "badge": badge})
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload,
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except Exception:
            log.warning("web push failed endpoint=%s", _mask_token(sub.get("endpoint", "")))
    return sent


def _send_native(user_id: str, title: str, body: str, data: dict, badge: Optional[int], provider: Optional[str] = None) -> dict[str, Any]:
    return push_gateway.send_to_devices(
        user_id=user_id, title=title, body=body, data=data or {}, badge=badge,
        mode="native", provider_filter=provider if provider in {"fcm", "apns"} else None,
    )


def _compute_recipient_badge(user_id: str) -> int:
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", (user_id,)
            ).fetchone()
        return int(row["n"] if row else 0)
    except Exception:
        return 0


def send(user_id: str, title: str, body: str, kind: str = "info", data: Optional[dict] = None,
         url: str = "/", *, event_id: Optional[str] = None, event_type: str = "generic",
         badge: Optional[int] = None, provider: Optional[str] = None) -> dict[str, Any]:
    data = {**(data or {}), "kind": kind, "url": url}
    event_id = event_id or data.get("event_id") or data.get("event_key") or data.get("event")
    event_type = event_type if event_type != "generic" else str(data.get("type") or kind)
    if event_id:
        data.setdefault("event_id", event_id)
    badge = _compute_recipient_badge(user_id) if badge is None else badge
    if event_id and _already_delivered(event_id, user_id):
        return {"sent": 0, "duplicate": True, "event_id": event_id}
    if event_id:
        push_gateway.enqueue_event(
            event_id, event_type, user_id,
            {"title": title, "body": body, "data": data, "badge": badge},
        )
    web_sent = _send_web(user_id, title, body, data, badge)
    native = _send_native(user_id, title, body, data, badge, provider)
    sent = web_sent + int(native.get("sent") or 0)
    native_devices = int(native.get("devices") or 0)
    native_sent = int(native.get("sent") or 0) + int(native.get("already_delivered") or 0)
    fully_delivered = bool(web_sent) or (native_devices > 0 and native_sent >= native_devices)
    if event_id and fully_delivered:
        try:
            with get_conn() as c:
                c.execute(
                    "UPDATE push_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP "
                    "WHERE event_id=? AND recipient_user_id=? AND status IN ('pending','processing')",
                    (event_id, user_id),
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
    result = _send_native(user_id, title, body, data or {}, badge, provider)
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
