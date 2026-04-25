"""Единая точка отправки push-уведомлений.

Два канала:
  1. Web Push — через pywebpush + VAPID (браузер, PWA).
  2. Native — через Expo Push Service (https://exp.host) — один endpoint
     работает и для Android (FCM), и для iOS (APNs), без Firebase-ключей.
     Для подключения «чистого» FCM позже — см. stub ниже.

ENV (.env):
  VAPID_PUBLIC_KEY    — публичный VAPID-ключ (base64url, без паддинга)
  VAPID_PRIVATE_KEY   — приватный VAPID-ключ (PEM либо base64url)
  VAPID_SUBJECT       — mailto:admin@urtruck.kz (default)
  EXPO_ACCESS_TOKEN   — опционально (если бот в private mode)
  FCM_SERVER_KEY      — опционально, если будет прямая интеграция FCM

Использование:
  from services import push_sender
  push_sender.send(user_id, 'Новая ставка', '3500$ за Алматы→Иу', kind='bid',
                   data={'cargo_id': 'c42'}, url='/cargo/c42')
"""
import os
import sys
import json
import logging
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from database.db import get_conn

log = logging.getLogger("push")

VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@urtruck.kz")
PUSH_MOCK_WEB = not (VAPID_PUBLIC and VAPID_PRIVATE)

EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"
EXPO_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")

FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
FCM_MOCK = not FCM_SERVER_KEY


# ───────────────────────── Storage helpers ─────────────────────────
def _web_subs(user_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def _native_tokens(user_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT token, provider, platform FROM push_tokens_native WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def _log(user_id: Optional[str], kind: str, title: str, body: str,
         data: dict, web_sent: int, native_sent: int, error: str = None):
    try:
        with get_conn() as c:
            c.execute(
                "INSERT INTO push_log (user_id, kind, title, body, data_json, web_sent, native_sent, error) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, kind, title, body, json.dumps(data, ensure_ascii=False),
                 web_sent, native_sent, error),
            )
    except Exception:
        log.exception("push_log insert failed")


# ───────────────────────── Web Push ─────────────────────────
def _send_web(user_id: str, title: str, body: str, data: dict, url: str) -> int:
    subs = _web_subs(user_id)
    if not subs:
        return 0
    if PUSH_MOCK_WEB:
        print(f"[PUSH·WEB MOCK] {user_id}: {title} · {body}  ({len(subs)} subs)")
        return len(subs)

    payload = json.dumps({"title": title, "body": body, "url": url, "data": data}, ensure_ascii=False)
    sent = 0
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        log.error("pywebpush не установлен — pip install pywebpush")
        return 0

    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"],
                                   "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload,
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as e:
            # 404/410 — подписка мёртвая, чистим
            status = getattr(e.response, "status_code", 0) if e.response else 0
            if status in (404, 410):
                with get_conn() as c:
                    c.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (sub["endpoint"],))
                log.info(f"dead sub removed: {sub['endpoint'][:60]}")
            else:
                log.warning(f"webpush err {status}: {e}")
        except Exception as e:
            log.warning(f"webpush exception: {e}")
    return sent


# ───────────────────────── Native Push (Expo / FCM) ─────────────────────────
def _send_expo(tokens: list[str], title: str, body: str, data: dict) -> int:
    """Отправка через Expo Push Service — работает для Android(FCM) и iOS(APNs).
    Токены должны начинаться с 'ExponentPushToken[...]' или 'ExpoPushToken[...]'.
    """
    if not tokens:
        return 0
    messages = [{
        "to": t,
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    } for t in tokens]

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_TOKEN}"

    try:
        r = httpx.post(EXPO_ENDPOINT, headers=headers, json=messages, timeout=10.0)
        if r.status_code >= 400:
            log.warning(f"expo push {r.status_code}: {r.text[:200]}")
            return 0
        resp = r.json()
        tickets = resp.get("data", [])
        # Удаляем токены с DeviceNotRegistered
        dead = []
        for i, tk in enumerate(tickets):
            if isinstance(tk, dict) and tk.get("status") == "error":
                err = (tk.get("details") or {}).get("error")
                if err in ("DeviceNotRegistered", "InvalidCredentials"):
                    dead.append(tokens[i])
        if dead:
            with get_conn() as c:
                for d in dead:
                    c.execute("DELETE FROM push_tokens_native WHERE token = ?", (d,))
        sent = sum(1 for tk in tickets if isinstance(tk, dict) and tk.get("status") == "ok")
        return sent
    except Exception as e:
        log.warning(f"expo push exception: {e}")
        return 0


def _send_fcm(tokens: list[str], title: str, body: str, data: dict) -> int:
    """Отправка через FCM HTTP v1 (прямое Firebase).
    Сейчас stub — включается только если FCM_SERVER_KEY задан.
    """
    if not tokens or FCM_MOCK:
        return 0
    # Legacy FCM HTTP API (проще чем HTTP v1, но deprecated 2024). Для MVP — достаточно.
    headers = {"Authorization": f"key={FCM_SERVER_KEY}", "Content-Type": "application/json"}
    sent = 0
    for t in tokens:
        try:
            r = httpx.post("https://fcm.googleapis.com/fcm/send", headers=headers,
                           json={"to": t, "notification": {"title": title, "body": body},
                                 "data": {k: str(v) for k, v in (data or {}).items()}},
                           timeout=10.0)
            if r.status_code == 200 and r.json().get("success") == 1:
                sent += 1
        except Exception as e:
            log.warning(f"fcm err: {e}")
    return sent


def _send_native(user_id: str, title: str, body: str, data: dict) -> int:
    tokens = _native_tokens(user_id)
    if not tokens:
        return 0

    expo_tokens = [t["token"] for t in tokens if t["provider"] == "expo"]
    fcm_tokens = [t["token"] for t in tokens if t["provider"] == "fcm"]

    sent = 0
    if expo_tokens:
        sent += _send_expo(expo_tokens, title, body, data)
    if fcm_tokens:
        sent += _send_fcm(fcm_tokens, title, body, data)

    if FCM_MOCK and PUSH_MOCK_WEB and not expo_tokens and not fcm_tokens:
        print(f"[PUSH·NATIVE MOCK] {user_id}: {title} · {body}")
    return sent


# ───────────────────────── Public API ─────────────────────────
def send(user_id: str, title: str, body: str,
         kind: str = "info", data: Optional[dict] = None, url: str = "/") -> dict:
    """Единый sender. Возвращает {'web': N, 'native': N, 'total': N}."""
    if not user_id:
        return {"web": 0, "native": 0, "total": 0}

    data = data or {}
    data = {**data, "kind": kind, "url": url}

    try:
        web = _send_web(user_id, title, body, data, url)
    except Exception as e:
        log.exception("web push fatal")
        web = 0
    try:
        native = _send_native(user_id, title, body, data)
    except Exception as e:
        log.exception("native push fatal")
        native = 0

    _log(user_id, kind, title, body, data, web, native)
    return {"web": web, "native": native, "total": web + native}


def broadcast(user_ids: list[str], title: str, body: str,
              kind: str = "info", data: Optional[dict] = None, url: str = "/") -> dict:
    """Массовая рассылка — тем же сообщением нескольким юзерам."""
    totals = {"web": 0, "native": 0, "total": 0}
    for uid in user_ids:
        r = send(uid, title, body, kind=kind, data=data, url=url)
        for k in totals:
            totals[k] += r[k]
    return totals


def info() -> dict:
    return {
        "web": {"mode": "MOCK" if PUSH_MOCK_WEB else "REAL", "vapid_public": VAPID_PUBLIC or None,
                "subject": VAPID_SUBJECT},
        "native": {
            "expo": {"endpoint": EXPO_ENDPOINT, "token_set": bool(EXPO_TOKEN)},
            "fcm": {"mode": "MOCK" if FCM_MOCK else "REAL"},
        },
    }
