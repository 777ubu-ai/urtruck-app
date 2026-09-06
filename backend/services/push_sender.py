"""Единая точка отправки push-уведомлений.

Два канала:
  1. Web Push — через pywebpush + VAPID (браузер, PWA).
  2. Native — через Push Gateway. По умолчанию Expo Push Service
     сохраняется как legacy-path, но PUSH_PROVIDER_MODE=native|dual включает
     прямой FCM/APNs через services.push_gateway.

ENV (.env):
  VAPID_PUBLIC_KEY    — публичный VAPID-ключ (base64url, без паддинга)
  VAPID_PRIVATE_KEY   — приватный VAPID-ключ (PEM либо base64url)
  VAPID_SUBJECT       — mailto:admin@urtruck.kz (default)
  EXPO_ACCESS_TOKEN   — опционально (если бот в private mode)
  PUSH_PROVIDER_MODE  — expo | native | dual
  FCM_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS + FCM_PROJECT_ID
  APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_AUTH_KEY_P8

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
from services import push_gateway

log = logging.getLogger("push")

VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@urtruck.kz")
PUSH_MOCK_WEB = not (VAPID_PUBLIC and VAPID_PRIVATE)

EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"
EXPO_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")
NATIVE_PUSH_CHANNEL_ID = "urtruck_messages_v2"

FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
FCM_MOCK = not FCM_SERVER_KEY


def _mask_token(token: str) -> str:
    if not token:
        return ""
    token = str(token)
    if len(token) <= 12:
        return token[:4] + "..."
    return f"{token[:10]}...{token[-6:]}"


# ───────────────────────── Storage helpers ─────────────────────────
def _web_subs(user_id: str) -> list[dict]:
    # P0-1/P1-3/P1-4: только active=1 — деактивированные (logout, отписка,
    # угон-конфликт разрешён в пользу другого владельца) сюда не попадают.
    with get_conn() as c:
        rows = c.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions "
            "WHERE user_id = ? AND (active = 1 OR active IS NULL)",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def _native_tokens(user_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT token, provider, platform FROM push_tokens_native "
            "WHERE user_id = ? AND (active = 1 OR active IS NULL)",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# PR#187 reconciliation: идемпотентность доставок. event_key задаётся
# сервером в момент перехода состояния (никогда не клиентом). Повтор того же
# перехода не должен слать второй push/системное сообщение на устройства.
def _event_key(data: Optional[dict]) -> Optional[str]:
    value = (data or {}).get("event_key")
    return str(value).strip()[:240] if value and str(value).strip() else None


def _already_delivered(user_id: str, event_key: Optional[str]) -> bool:
    """True только если раньше была УСПЕШНАЯ доставка по этому ключу.

    Транзиентный сбой провайдера (web_sent=native_sent=0) остаётся
    ретраибельным — тогда возвращаем False и повтор разрешён.
    """
    if not user_id or not event_key:
        return False


def _recipient_locale(user_id: str) -> str:
    """Use the locale registered by the recipient's active device."""
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT locale FROM push_devices WHERE user_id = ? AND enabled = 1 "
                "AND locale IS NOT NULL AND TRIM(locale) <> '' "
                "ORDER BY last_seen_at DESC LIMIT 1",
                (user_id,),
            ).fetchone()
        return str(row["locale"] if row else "RU").strip().upper() or "RU"
    except Exception:
        return "RU"


_SYSTEM_PUSH_COPY = {
    "RU": {
        "bid_created": ("💰 Новая ставка", "Новая ставка: {amount} · {route}"),
        "bid_countered": ("🔁 Контр-оффер", "Новая цена: {amount} · {route}"),
        "bid_accepted": ("✅ Сделка создана", "Согласована цена {amount} · {route}"),
        "deal_status": ("🚚 Статус сделки", "Статус: {status} · {route}"),
        "trip_status": ("🚚 Статус рейса", "Статус: {status} · {route}"),
    },
    "EN": {
        "bid_created": ("💰 New bid", "New bid: {amount} · {route}"),
        "bid_countered": ("🔁 Counter-offer", "New price: {amount} · {route}"),
        "bid_accepted": ("✅ Deal created", "Agreed price {amount} · {route}"),
        "deal_status": ("🚚 Deal status", "Status: {status} · {route}"),
        "trip_status": ("🚚 Trip status", "Status: {status} · {route}"),
    },
    "KK": {
        "bid_created": ("💰 Жаңа баға", "Жаңа баға: {amount} · {route}"),
        "bid_countered": ("🔁 Қарсы ұсыныс", "Жаңа баға: {amount} · {route}"),
        "bid_accepted": ("✅ Мәміле жасалды", "Келісілген баға {amount} · {route}"),
        "deal_status": ("🚚 Мәміле күйі", "Күйі: {status} · {route}"),
        "trip_status": ("🚚 Рейс күйі", "Күйі: {status} · {route}"),
    },
    "ZH": {
        "bid_created": ("💰 新报价", "新报价：{amount} · {route}"),
        "bid_countered": ("🔁 还价", "新价格：{amount} · {route}"),
        "bid_accepted": ("✅ 交易已创建", "协商价格 {amount} · {route}"),
        "deal_status": ("🚚 交易状态", "状态：{status} · {route}"),
        "trip_status": ("🚚 行程状态", "状态：{status} · {route}"),
    },
}


def _localize_system_copy(user_id: str, kind: str, title: str, body: str, data: dict) -> tuple[str, str]:
    """Localize server-authored system copy; user content remains untouched."""
    if kind in ("chat", "info", "reminder", "expired", "no_bids"):
        return title, body
    locale = _recipient_locale(user_id)
    catalog = _SYSTEM_PUSH_COPY.get(locale, _SYSTEM_PUSH_COPY["RU"])
    template = catalog.get(kind)
    if not template:
        return title, body
    route = str(data.get("route") or "").strip()
    if not route:
        route = " → ".join(str(v).strip() for v in (data.get("from_city"), data.get("to_city")) if str(v or "").strip())
    values = {
        "amount": str(data.get("amount") or "—"),
        "route": route or "UrTruck",
        "status": str(data.get("status") or "updated"),
    }
    return template[0], template[1].format(**values)
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT 1 FROM push_log WHERE user_id = ? AND event_key = ? "
                "AND (COALESCE(web_sent, 0) > 0 OR COALESCE(native_sent, 0) > 0) LIMIT 1",
                (user_id, event_key),
            ).fetchone()
        return bool(row)
    except Exception:
        return False


def _log(user_id: Optional[str], kind: str, title: str, body: str,
         data: dict, web_sent: int, native_sent: int, error: str = None):
    try:
        event_key = _event_key(data)
        with get_conn() as c:
            c.execute(
                "INSERT INTO push_log (user_id, kind, title, body, data_json, web_sent, native_sent, error, event_key) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, kind, title, body, json.dumps(data, ensure_ascii=False),
                 web_sent, native_sent, error, event_key),
            )
    except Exception as e:
        # Never raise — push logging is observability, not part of the request
        # contract. Stay on debug to avoid flooding logs when SQLite is busy.
        log.debug("push_log insert skipped: %s", e)


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
                # Блок 1 (P0-1 модель): деактивируем, а не удаляем — сохраняем
                # аудит-след и не даём "мёртвой" строке молча ожить при
                # переиспользовании того же endpoint другим владельцем без
                # прохождения через _resolve_ownership.
                with get_conn() as c:
                    c.execute(
                        "UPDATE push_subscriptions SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                        "invalidated_reason = 'webpush_dead' WHERE endpoint = ?",
                        (sub["endpoint"],),
                    )
                log.info(f"dead sub deactivated: {sub['endpoint'][:60]}")
            else:
                log.warning(f"webpush err {status}: {e}")
        except Exception as e:
            log.warning(f"webpush exception: {e}")
    return sent


# ───────────────────────── Native Push (Expo / FCM) ─────────────────────────
def _send_expo(tokens: list[str], title: str, body: str, data: dict, badge: Optional[int] = None) -> int:
    """Отправка через Expo Push Service — работает для Android(FCM) и iOS(APNs).
    Токены должны начинаться с 'ExponentPushToken[...]' или 'ExpoPushToken[...]'.

    PR-C2 (P0-2 app icon badge): добавлен optional `badge` параметр.
    Когда iOS получает push payload с `badge: N`, APNs автоматически
    устанавливает красный кружок с цифрой на иконке UrTruck на home
    screen. Без этого поля badge не появляется даже если notification
    permissions включены. Expo Push Service пробрасывает badge в APNs
    aps payload как-is.
    """
    if not tokens:
        return 0
    msg_base = {
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": NATIVE_PUSH_CHANNEL_ID,
    }
    if badge is not None:
        msg_base["badge"] = int(badge)
    messages = [{**msg_base, "to": t} for t in tokens]

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
                # DeviceNotRegistered is token-specific and may be safely
                # deactivated. InvalidCredentials is an APNs/FCM/Expo app
                # credential failure: deactivating the driver token here
                # destroys a valid registration and prevents recovery after
                # credentials are fixed. Keep it active and make it visible.
                if err == "DeviceNotRegistered":
                    dead.append(tokens[i])
                else:
                    log.error("expo ticket error token=%s error=%s message=%s",
                              (tokens[i][:4] + "..." + tokens[i][-4:]) if tokens[i] else "-",
                              err or "unknown", tk.get("message") or "")
        if dead:
            # Блок 1 (P0-1 модель): деактивируем, а не удаляем — см. комментарий
            # в _send_web выше.
            with get_conn() as c:
                for d in dead:
                    c.execute(
                        "UPDATE push_tokens_native SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                        "invalidated_reason = 'expo_device_not_registered' WHERE token = ?",
                        (d,),
                    )
        sent = sum(1 for tk in tickets if isinstance(tk, dict) and tk.get("status") == "ok")
        return sent
    except Exception as e:
        log.warning(f"expo push exception: {e}")
        return 0


def _send_expo_detailed(tokens: list[str], title: str, body: str, data: dict, badge: Optional[int] = None) -> dict:
    """QA diagnostics variant of _send_expo.

    Returns masked token metadata + Expo tickets so release QA can separate
    backend/event bugs from Expo/Firebase/Android delivery bugs without
    exposing raw push tokens.
    """
    if not tokens:
        return {"sent": 0, "tickets": [], "error": None}
    msg_base = {
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": NATIVE_PUSH_CHANNEL_ID,
    }
    if badge is not None:
        msg_base["badge"] = int(badge)
    messages = [{**msg_base, "to": t} for t in tokens]
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_TOKEN}"

    try:
        r = httpx.post(EXPO_ENDPOINT, headers=headers, json=messages, timeout=10.0)
    except Exception as e:
        return {"sent": 0, "tickets": [], "error": f"expo_push_exception: {e}"}

    if r.status_code >= 400:
        return {"sent": 0, "tickets": [], "error": f"expo_http_{r.status_code}: {r.text[:300]}"}

    try:
        payload = r.json()
    except Exception as e:
        return {"sent": 0, "tickets": [], "error": f"expo_bad_json: {e}"}

    raw_tickets = payload.get("data", [])
    tickets = []
    sent = 0
    for i, ticket in enumerate(raw_tickets):
        token = tokens[i] if i < len(tokens) else ""
        item = {
            "token_masked": _mask_token(token),
            "status": ticket.get("status") if isinstance(ticket, dict) else None,
            "id": ticket.get("id") if isinstance(ticket, dict) else None,
            "message": ticket.get("message") if isinstance(ticket, dict) else None,
            "details": ticket.get("details") if isinstance(ticket, dict) else None,
        }
        if item["status"] == "ok":
            sent += 1
        tickets.append(item)
    return {"sent": sent, "tickets": tickets, "error": None}


def expo_receipts(ticket_ids: list[str]) -> dict:
    """Fetch Expo delivery receipts for ticket IDs returned by diagnostics."""
    ids = [str(x).strip() for x in (ticket_ids or []) if str(x).strip()]
    if not ids:
        return {"receipts": {}, "error": None}
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_TOKEN}"
    try:
        r = httpx.post("https://exp.host/--/api/v2/push/getReceipts", headers=headers, json={"ids": ids}, timeout=10.0)
    except Exception as e:
        return {"receipts": {}, "error": f"expo_receipt_exception: {e}"}
    if r.status_code >= 400:
        return {"receipts": {}, "error": f"expo_receipt_http_{r.status_code}: {r.text[:300]}"}
    try:
        return {"receipts": r.json().get("data", {}), "error": None}
    except Exception as e:
        return {"receipts": {}, "error": f"expo_receipt_bad_json: {e}"}


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


def _send_native_legacy(user_id: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> int:
    tokens = _native_tokens(user_id)
    if not tokens:
        return 0

    expo_tokens = [t["token"] for t in tokens if t["provider"] == "expo"]
    fcm_tokens = [t["token"] for t in tokens if t["provider"] == "fcm"]

    sent = 0
    if expo_tokens:
        sent += _send_expo(expo_tokens, title, body, data, badge=badge)
    if fcm_tokens:
        sent += _send_fcm(fcm_tokens, title, body, data)

    if FCM_MOCK and PUSH_MOCK_WEB and not expo_tokens and not fcm_tokens:
        print(f"[PUSH·NATIVE MOCK] {user_id}: {title} · {body}")
    return sent


def _send_native(user_id: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> int:
    """Native delivery with gradual migration.

    push_devices is the new source for provider choice. Legacy
    push_tokens_native remains a fallback so production users do not lose
    notifications during rollout.
    """
    gateway_result = push_gateway.send_to_devices(
        user_id,
        title,
        body,
        data,
        badge,
        expo_send_one=_send_expo_detailed,
    )
    if gateway_result.get("devices", 0) > 0:
        return int(gateway_result.get("sent", 0) or 0)
    return _send_native_legacy(user_id, title, body, data, badge=badge)


def native_token_diagnostics(user_id: str) -> dict:
    """Masked active native tokens for a user. QA-only callers must guard this."""
    tokens = _native_tokens(user_id)
    devices = push_gateway.active_devices(user_id)
    return {
        "user_id": user_id,
        "count": len(tokens),
        "device_registry_count": len(devices),
        "tokens": [
            {
                "token_masked": _mask_token(t.get("token")),
                "provider": t.get("provider"),
                "platform": t.get("platform"),
            }
            for t in tokens
        ],
        "devices": [
            {
                "id": d.get("id"),
                "device_id": d.get("device_id"),
                "token_masked": _mask_token(d.get("push_token")),
                "provider": d.get("push_provider"),
                "platform": d.get("platform"),
                "app_id": d.get("app_id"),
                "locale": d.get("locale"),
                "app_version": d.get("app_version"),
            }
            for d in devices
        ],
    }


def send_native_debug(user_id: str, title: str, body: str, data: Optional[dict] = None, url: str = "/", kind: str = "qa_push_test", provider: Optional[str] = None) -> dict:
    """Direct provider test for one user's active native tokens.

    This bypasses marketplace/chat event creation but keeps the same Expo
    payload contract used by normal push sends. It is intentionally separate
    from send() so existing business call-sites keep their current behavior.
    """
    if not user_id:
        return {"user_id": user_id, "tokens": 0, "sent": 0, "tickets": [], "error": "missing_user_id"}
    data = {**(data or {}), "kind": kind, "url": url}
    badge = _compute_recipient_badge(user_id)
    if provider and provider in ("expo", "fcm", "apns", "native", "dual"):
        mode = "native" if provider in ("fcm", "apns", "native") else provider
        gateway = push_gateway.send_to_devices(
            user_id,
            title,
            body,
            data,
            badge,
            expo_send_one=_send_expo_detailed,
            mode=mode,
            provider_filter=provider if provider in ("expo", "fcm", "apns") else None,
        )
        return {
            "user_id": user_id,
            "provider": provider,
            "sent": gateway.get("sent", 0),
            "devices": gateway.get("devices", 0),
            "providers": gateway.get("providers", {}),
            "mode": gateway.get("mode"),
            "error": None if gateway.get("sent", 0) else "no_provider_delivery",
        }

    tokens = _native_tokens(user_id)
    expo_tokens = [t["token"] for t in tokens if t["provider"] == "expo"]
    fcm_tokens = [t["token"] for t in tokens if t["provider"] == "fcm"]
    expo_result = _send_expo_detailed(expo_tokens, title, body, data, badge=badge)
    return {
        "user_id": user_id,
        "tokens": len(tokens),
        "expo_tokens": len(expo_tokens),
        "fcm_tokens": len(fcm_tokens),
        "sent": expo_result.get("sent", 0),
        "tickets": expo_result.get("tickets", []),
        "error": expo_result.get("error"),
    }


def _compute_recipient_badge(user_id: str) -> int:
    """Бейдж на иконке (вариант 2): единый сигнал «всё новое» = непрочитанные
    chat-сообщения + непрочитанные уведомления (колокол). iOS APNs рисует это
    число на иконке. Чат-точка и колокол внутри приложения остаются раздельными;
    суммарный счётчик — только на home-иконке, чтобы получатель ничего не
    пропустил. Каждый источник считаем независимо (одна таблица может
    отсутствовать на старой/тестовой БД — не теряем второй счётчик).
    """
    total = 0
    try:
        with get_conn() as c:
            try:
                # Блок 5 аудита (P1-1, вариант B): system-сообщения исключены
                # — тот же фильтр, что в api/chat.py unread_count(), иначе
                # APNs-бейдж на иконке расходился бы с in-app бейджем
                # «Сделки» (двойной счёт одного события).
                row = c.execute(
                    "SELECT COUNT(*) FROM chat_messages m "
                    "JOIN chat_rooms r ON r.id = m.room_id "
                    "WHERE (r.participant_1 = ? OR r.participant_2 = ?) "
                    "AND m.sender_id != ? AND m.sender_id != 'system' AND m.is_read = 0",
                    (user_id, user_id, user_id),
                ).fetchone()
                total += int(row[0]) if row else 0
            except Exception:
                pass
            try:
                row = c.execute(
                    "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
                    (user_id,),
                ).fetchone()
                total += int(row[0]) if row else 0
            except Exception:
                pass
    except Exception:
        return 0
    return total


# ───────────────────────── Public API ─────────────────────────
def send(user_id: str, title: str, body: str,
         kind: str = "info", data: Optional[dict] = None, url: str = "/") -> dict:
    """Единый sender. Возвращает {'web': N, 'native': N, 'total': N}.

    Бейдж на иконке (вариант 2): для ЛЮБОГО пуша (chat и bid/system) ставим
    badge = чат + уведомления получателя. iOS APNs рисует это число на иконке —
    единый сигнal «всё новое», чтобы фоновый пуш всегда приводил иконку к
    суммарному счётчику. Внутри приложения чат-точка и колокол раздельны.
    """
    if not user_id:
        return {"web": 0, "native": 0, "total": 0}

    data = data or {}
    data = {**data, "kind": kind, "url": url}
    title, body = _localize_system_copy(user_id, kind, title, body, data)
    event_key = _event_key(data)

    # PR#187: повтор того же серверного перехода не создаёт дубль-доставку.
    # Без event_key поведение прежнее (независимые сообщения не дедупятся).
    if _already_delivered(user_id, event_key):
        return {"web": 0, "native": 0, "total": 0, "deduped": True}
    if event_key:
        try:
            push_gateway.enqueue_event(
                event_key,
                str(data.get("event") or data.get("type") or kind),
                user_id,
                {"title": title, "body": body, "data": data, "url": url},
            )
        except Exception:
            pass

    badge = _compute_recipient_badge(user_id)

    try:
        web = _send_web(user_id, title, body, data, url)
    except Exception as e:
        log.exception("web push fatal")
        web = 0
    try:
        native = _send_native(user_id, title, body, data, badge=badge)
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
    # Safe production diagnostics: counts only, never raw endpoints/tokens or
    # user ids. This lets release QA distinguish "sender is broken" from
    # "driver never registered a token" without exposing private data.
    counts = {"web_active": 0, "native_active": 0, "native_ios": 0, "native_android": 0}
    try:
        with get_conn() as c:
            counts["web_active"] = int(c.execute(
                "SELECT COUNT(*) FROM push_subscriptions WHERE active = 1 OR active IS NULL"
            ).fetchone()[0])
            counts["native_active"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE active = 1 OR active IS NULL"
            ).fetchone()[0])
            counts["native_ios"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE (active = 1 OR active IS NULL) AND platform = 'ios'"
            ).fetchone()[0])
            counts["native_android"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE (active = 1 OR active IS NULL) AND platform = 'android'"
            ).fetchone()[0])
    except Exception as e:
        log.warning("push diagnostics count failed: %s", e)
    return {
        "web": {"mode": "MOCK" if PUSH_MOCK_WEB else "REAL", "vapid_public": bool(VAPID_PUBLIC),
                "subject": VAPID_SUBJECT},
        "native": {
            "expo": {"endpoint": EXPO_ENDPOINT, "access_token_set": bool(EXPO_TOKEN)},
            "fcm": {"mode": "MOCK" if FCM_MOCK else "REAL"},
            "gateway": push_gateway.info(),
        },
        "registrations": counts,
    }
