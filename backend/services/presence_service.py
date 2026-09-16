"""Ephemeral user-presence for UrTruck Control Center.

Presence is deliberately stored in Redis, not the main SQLite database:
mobile clients heartbeat frequently and operational presence must never add
write contention to marketplace/deal transactions.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import redis

from config import REDIS_URL

INDEX_KEY = "urtruck:presence:index"
USER_KEY_PREFIX = "urtruck:presence:user:"
ONLINE_WINDOW_SECONDS = 90
USER_TTL_SECONDS = 180
INDEX_RETENTION_SECONDS = 24 * 60 * 60
PASSIVE_TOUCH_MIN_SECONDS = 20

_client = None
_last_passive_touch: dict[str, float] = {}


def _redis():
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.8,
        )
    return _client


def heartbeat(user: dict, *, platform: str = "unknown", app_version: str = "", screen: str = "", locale: str = "") -> dict:
    uid = str(user.get("id") or "").strip()
    if not uid:
        return {"ok": False, "presence_available": False}
    now = time.time()
    payload = {
        "user_id": uid,
        "role": str(user.get("role") or "guest")[:24],
        "platform": str(platform or "unknown")[:24],
        "app_version": str(app_version or "")[:48],
        "screen": str(screen or "")[:80],
        "locale": str(locale or "")[:12],
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }
    try:
        r = _redis()
        key = f"{USER_KEY_PREFIX}{uid}"
        pipe = r.pipeline(transaction=False)
        pipe.hset(key, mapping=payload)
        pipe.expire(key, USER_TTL_SECONDS)
        pipe.zadd(INDEX_KEY, {uid: now})
        pipe.zremrangebyscore(INDEX_KEY, 0, now - INDEX_RETENTION_SECONDS)
        pipe.execute()
        return {"ok": True, "presence_available": True}
    except Exception:
        # Presence is observability, never a blocker for the transport flow.
        return {"ok": False, "presence_available": False}


def touch_authenticated(user: dict) -> dict:
    """Best-effort presence fallback for clients without heartbeat support.

    Called from the common bearer-token auth path. It never overwrites richer
    platform/screen/locale fields written by explicit mobile heartbeat and is
    process-locally throttled to avoid Redis writes on every API request.
    """
    uid = str(user.get("id") or "").strip()
    if not uid:
        return {"ok": False, "presence_available": False}
    now = time.time()
    previous = _last_passive_touch.get(uid, 0.0)
    if now - previous < PASSIVE_TOUCH_MIN_SECONDS:
        return {"ok": True, "presence_available": True, "throttled": True}
    _last_passive_touch[uid] = now
    try:
        r = _redis()
        key = f"{USER_KEY_PREFIX}{uid}"
        payload = {
            "user_id": uid,
            "role": str(user.get("role") or "guest")[:24],
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "presence_source": "api_activity",
        }
        pipe = r.pipeline(transaction=False)
        pipe.hset(key, mapping=payload)
        pipe.expire(key, USER_TTL_SECONDS)
        pipe.zadd(INDEX_KEY, {uid: now})
        pipe.zremrangebyscore(INDEX_KEY, 0, now - INDEX_RETENTION_SECONDS)
        pipe.execute()
        return {"ok": True, "presence_available": True}
    except Exception:
        return {"ok": False, "presence_available": False}


def snapshot(window_seconds: int = ONLINE_WINDOW_SECONDS) -> dict[str, Any]:
    now = time.time()
    cutoff = now - max(30, min(int(window_seconds or ONLINE_WINDOW_SECONDS), 600))
    try:
        r = _redis()
        ids = r.zrangebyscore(INDEX_KEY, cutoff, "+inf")
        pipe = r.pipeline(transaction=False)
        for uid in ids:
            pipe.hgetall(f"{USER_KEY_PREFIX}{uid}")
        rows = pipe.execute() if ids else []
        users = [row for row in rows if row]
        by_role: dict[str, int] = {}
        by_platform: dict[str, int] = {}
        for row in users:
            role = row.get("role") or "unknown"
            platform = row.get("platform") or "unknown"
            by_role[role] = by_role.get(role, 0) + 1
            by_platform[platform] = by_platform.get(platform, 0) + 1
        return {
            "available": True,
            "window_seconds": window_seconds,
            "online": len(users),
            "by_role": by_role,
            "by_platform": by_platform,
            "users": users,
        }
    except Exception:
        return {
            "available": False,
            "window_seconds": window_seconds,
            "online": None,
            "by_role": {},
            "by_platform": {},
            "users": [],
        }
