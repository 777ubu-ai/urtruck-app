"""Push API — Web Push (VAPID) + Native (Expo/FCM).

- POST /subscribe        — web push (endpoint + p256dh + auth)
- POST /register-native  — native (Expo push token / FCM token)
- POST /unsubscribe      — снять подписку web
- POST /unregister-native— удалить native-токен
- POST /test             — тест себе
- GET  /public-key       — VAPID public key для клиента
- GET  /info             — диагностика

Все отправки идут через services/push_sender.send(...) — единая точка.
"""
import os
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional

from database.db import get_conn
from api.verification_gate import get_user
from services import push_sender

push_router = APIRouter()


VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@urtruck.kz")
PUSH_MOCK = not (VAPID_PUBLIC and VAPID_PRIVATE)


def _init_schema():
    schema = Path(__file__).resolve().parent.parent / "database" / "push_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        c.commit()


class SubscribeIn(BaseModel):
    endpoint: str
    keys: dict  # {p256dh, auth}
    user_agent: Optional[str] = None


class NativeTokenIn(BaseModel):
    token: str                              # Expo push token или FCM token
    provider: Optional[str] = "expo"        # 'expo' | 'fcm' | 'apns'
    platform: Optional[str] = None          # 'ios' | 'android'
    device_name: Optional[str] = None


@push_router.get("/public-key")
def get_public_key():
    return {"public_key": VAPID_PUBLIC, "mock": PUSH_MOCK}


@push_router.get("/info")
def info():
    return push_sender.info()


@push_router.post("/subscribe")
def subscribe(sub: SubscribeIn, authorization: str = None):
    """Сохранить push-подписку. Юзер необязателен (можно guest)."""
    user_id = None
    try:
        # Пытаемся получить user, если токен есть
        from fastapi import Header
        # Простой парсинг
        if authorization and authorization.startswith("Bearer "):
            from database import registration_dal as reg_dal
            token = authorization.split(" ", 1)[1]
            user_id = reg_dal.get_driver_by_token(token)
    except Exception:
        pass

    with get_conn() as c:
        c.execute(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(endpoint) DO UPDATE SET user_id = COALESCE(excluded.user_id, user_id), "
            "last_seen = CURRENT_TIMESTAMP",
            (user_id, sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""), sub.user_agent),
        )
    return {"ok": True, "mock": PUSH_MOCK}


@push_router.post("/unsubscribe")
def unsubscribe(sub: dict):
    endpoint = sub.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint required")
    with get_conn() as c:
        c.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    return {"ok": True}


@push_router.post("/register-native")
def register_native(data: NativeTokenIn, authorization: Optional[str] = Header(None)):
    """Регистрация Expo/FCM push токена (native apps)."""
    user_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from database import registration_dal as reg_dal
            user_id = reg_dal.get_driver_by_token(authorization.split(" ", 1)[1])
        except Exception:
            pass

    with get_conn() as c:
        c.execute(
            "INSERT INTO push_tokens_native (user_id, token, provider, platform, device_name) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(token) DO UPDATE SET "
            "  user_id = COALESCE(excluded.user_id, user_id), "
            "  last_seen = CURRENT_TIMESTAMP",
            (user_id, data.token, data.provider or "expo", data.platform, data.device_name),
        )
    return {"ok": True, "user_id": user_id}


@push_router.post("/unregister-native")
def unregister_native(body: dict):
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    with get_conn() as c:
        c.execute("DELETE FROM push_tokens_native WHERE token = ?", (token,))
    return {"ok": True}


# Backward-compatible обёртка — использовалась в старом коде.
def send_to_user(user_id: str, title: str, body: str, url: str = "/", kind: str = "info", data: dict = None) -> int:
    """Legacy: отправить push юзеру. Возвращает суммарное число отправленных.

    PR-C2 (P0-2 app icon badge): добавлены опциональные `kind` и `data`
    параметры. Существующие вызовы (`send_to_user(uid, title, body)`)
    не ломаются. Новые callsites (chat.py) передают kind='chat' чтобы
    push_sender автоматически вычислил unread badge и положил его в
    APNs payload — без этого красный кружок на иконке UrTruck не
    появляется на iPhone home screen даже при включённых notifications.
    """
    r = push_sender.send(user_id, title, body, url=url, kind=kind, data=data)
    return r["total"]


@push_router.post("/test")
def test_push(body: dict, user=Depends(get_user)):
    """Тестовая отправка себе."""
    r = push_sender.send(
        user["id"],
        body.get("title", "UrTruck"),
        body.get("body", "Тестовое уведомление"),
        kind="test",
        url=body.get("url", "/"),
    )
    return {"sent": r["total"], "web": r["web"], "native": r["native"]}


_init_schema()
