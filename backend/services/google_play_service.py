"""Google Play Billing — верификация покупок подписки + разбор RTDN.

MOCK vs REAL (см. CLAUDE.md, "Режимы MOCK vs REAL"): пока
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON пуст — работает MOCK-режим (подтверждает
любую покупку как активную на 30 дней). Это ТОЛЬКО для локальной разработки —
на проде переменная обязана быть задана, иначе платные подписки будут
приниматься без реальной проверки.

REAL режим дёргает Android Publisher API через сервис-аккаунт. Это ОТДЕЛЬНАЯ
переменная от PLAY_SERVICE_ACCOUNT_JSON в GitHub Actions (тот секрет живёт
только в CI и нужен для заливки .aab в Play Console) — сервису нужен свой
экземпляр того же (или отдельного) ключа сервисного аккаунта в серверном
.env, с правом "View financial data" в Play Console → Users and permissions.
"""
import base64
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

MOCK_MODE = not bool((config.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or "").strip())


def _mock_verify(product_id: str, purchase_token: str) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "status": "active",
        "auto_renewing": True,
        "period_start": now.isoformat(),
        "period_end": (now + timedelta(days=30)).isoformat(),
        "raw": {"mock": True, "product_id": product_id, "purchase_token": purchase_token},
    }


def verify_purchase(product_id: str, purchase_token: str) -> dict:
    """Проверить покупку подписки в Google Play.

    Возвращает нормализованный статус:
    {status: active|expired|cancelled, auto_renewing, period_start, period_end, raw}.
    """
    if MOCK_MODE:
        print(
            f"[google_play] MOCK verify_purchase({product_id}) — "
            f"GOOGLE_PLAY_SERVICE_ACCOUNT_JSON не задан, только для dev",
            flush=True,
        )
        return _mock_verify(product_id, purchase_token)

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds_info = json.loads(config.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
    creds = service_account.Credentials.from_service_account_info(
        creds_info, scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    resp = (
        service.purchases()
        .subscriptions()
        .get(
            packageName=config.GOOGLE_PLAY_PACKAGE_NAME,
            subscriptionId=product_id,
            token=purchase_token,
        )
        .execute()
    )

    expiry_ms = int(resp.get("expiryTimeMillis") or 0)
    start_ms = int(resp.get("startTimeMillis") or 0) if resp.get("startTimeMillis") else None
    expiry = datetime.fromtimestamp(expiry_ms / 1000, tz=timezone.utc) if expiry_ms else None
    now = datetime.now(timezone.utc)
    auto_renewing = bool(resp.get("autoRenewing", False))
    if expiry and expiry > now:
        status = "active"
    elif resp.get("cancelReason") is not None:
        status = "cancelled"
    else:
        status = "expired"
    return {
        "status": status,
        "auto_renewing": auto_renewing,
        "period_start": datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).isoformat() if start_ms else None,
        "period_end": expiry.isoformat() if expiry else None,
        "raw": resp,
    }


def parse_rtdn(body: dict) -> dict | None:
    """Разобрать Pub/Sub push-конверт с Real-time Developer Notification.

    Формат: {"message": {"data": "<base64 JSON>", ...}, "subscription": "..."}.
    Возвращает декодированный payload либо None, если это не тот формат
    (например ручной health-check запрос)."""
    message = body.get("message") or {}
    data_b64 = message.get("data")
    if not data_b64:
        return None
    try:
        return json.loads(base64.b64decode(data_b64).decode("utf-8"))
    except Exception:
        return None
