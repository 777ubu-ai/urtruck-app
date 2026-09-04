"""Payments API — подписка на разблокировку контактов (Google Play Billing).

Только Google Play (мобильное приложение) — веб-версия подписку не продаёт.
См. services/google_play_service.py про MOCK vs REAL режим верификации.
Реальный gate живёт в api/marketplace.py:get_deal() (database.subscription_dal
.can_reveal_contact) — этот роутер только читает статус и обрабатывает
покупки/уведомления, авторизацию контактов не решает.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

import config
from api.verification_gate import require_level
from database import subscription_dal as sub_dal
from services import google_play_service

payments_router = APIRouter()


@payments_router.get("/subscription/status")
def subscription_status(user=Depends(require_level(1))):
    uid = user["id"]
    sub = sub_dal.get_active_subscription(uid)
    used = sub_dal.count_reveals_this_period(uid)
    if sub and config.PREMIUM_CONTACT_LIMIT <= 0:
        limit = None
    else:
        limit = config.PREMIUM_CONTACT_LIMIT if sub else config.FREE_CONTACT_LIMIT
    return {
        "monetization_enabled": config.CONTACTS_MONETIZATION_ENABLED,
        "active": bool(sub),
        "plan": sub.get("product_id") if sub else None,
        "period_end": sub.get("period_end") if sub else None,
        "auto_renewing": bool(sub.get("auto_renewing")) if sub else None,
        "contacts_used_this_period": used,
        "contacts_limit": limit,
        "google_product_id": config.GOOGLE_PLAY_CONTACTS_PRODUCT_ID,
    }


class VerifyPurchaseBody(BaseModel):
    product_id: str
    purchase_token: str


@payments_router.post("/google/verify")
def verify_google_purchase(body: VerifyPurchaseBody, user=Depends(require_level(1))):
    """Клиент вызывает сразу после успешной покупки в react-native-iap.
    Сервер — единственный источник правды о том, активна ли подписка;
    клиентский "успех покупки" сам по себе доступ не даёт."""
    uid = user["id"]
    result = google_play_service.verify_purchase(body.product_id, body.purchase_token)
    sub = sub_dal.upsert_subscription(
        uid,
        provider="google_play",
        product_id=body.product_id,
        purchase_token=body.purchase_token,
        status=result["status"],
        auto_renewing=result["auto_renewing"],
        period_start=result["period_start"],
        period_end=result["period_end"],
        raw_response=str(result["raw"])[:4000],
    )
    return {"active": sub["status"] == "active", "period_end": sub["period_end"]}


@payments_router.post("/google/rtdn")
async def google_rtdn_webhook(request: Request):
    """Real-time Developer Notifications от Google Cloud Pub/Sub — держит
    статус подписки в синхронизации (продление/отмена/refund) без участия
    клиента. Настраивается в Play Console → Monetization setup →
    Real-time developer notifications, топик Pub/Sub push шлёт сюда.

    Никакой auth-проверки конверта здесь нет специально: вместо доверия telу
    уведомления сервер переспрашивает актуальный статус у самого Google
    (verify_purchase) — так подделанный запрос в худшем случае просто дёрнет
    лишний verify по существующей подписке, не может создать/продлить её."""
    body = await request.json()
    payload = google_play_service.parse_rtdn(body)
    if not payload:
        return {"ok": True}
    notif = payload.get("subscriptionNotification")
    if not notif:
        return {"ok": True}
    product_id = notif.get("subscriptionId")
    purchase_token = notif.get("purchaseToken")
    if not (product_id and purchase_token):
        return {"ok": True}
    existing = sub_dal.get_subscription_by_token("google_play", purchase_token)
    if not existing:
        # Уведомление о подписке, которую мы ещё не видели через /verify —
        # ждём, пока клиент сам подтвердит покупку.
        return {"ok": True}
    result = google_play_service.verify_purchase(product_id, purchase_token)
    sub_dal.upsert_subscription(
        existing["user_id"],
        provider="google_play",
        product_id=product_id,
        purchase_token=purchase_token,
        status=result["status"],
        auto_renewing=result["auto_renewing"],
        period_start=result["period_start"],
        period_end=result["period_end"],
        raw_response=str(result["raw"])[:4000],
    )
    return {"ok": True}
