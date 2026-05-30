"""Deal Room API (First PR — backend foundation).

Новые endpoints поверх существующего чата. Старые /chat/rooms и
/chat/messages/{room_id} НЕ трогаются (живут в api/chat.py).

Все пути смонтированы под /api/v1 (см. main.py). Авторизация — та же
require_level(1), что и в chat.py. Доступ к чужим беседам/сделкам закрыт
(403/404) через deal_room_dal.

immutable timeline: создание событий — только серверной логикой
(deal_room_dal.create_deal_event). Здесь НЕТ endpoint update/delete deal_events
и actor_id/created_at с фронта не принимаются.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from api.verification_gate import require_level
from database import deal_room_dal as dr

deal_room_router = APIRouter()


# ---------- Conversations (N-участниковая модель) ----------
@deal_room_router.get("/chat/conversations")
def list_conversations(user=Depends(require_level(1))):
    return {"conversations": dr.list_conversations(user["id"])}


@deal_room_router.get("/chat/conversations/{conversation_id}/messages")
def conversation_messages(conversation_id: str, limit: int = 100, offset: int = 0,
                          user=Depends(require_level(1))):
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    return {"messages": dr.get_messages(conversation_id, limit, offset)}


@deal_room_router.post("/chat/conversations/{conversation_id}/read")
def conversation_read(conversation_id: str, user=Depends(require_level(1))):
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    receipts = dr.mark_read(conversation_id, user["id"])
    return {"ok": True, "new_receipts": receipts}


# ---------- Deal timeline (immutable) ----------
@deal_room_router.get("/deals/{deal_id}/timeline")
def deal_timeline(deal_id: str, user=Depends(require_level(1))):
    if not dr.get_deal(deal_id):
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    if not dr.user_can_access_deal(deal_id, user["id"]):
        raise HTTPException(status_code=403, detail="Нет доступа к этой сделке")
    return {"deal_id": deal_id, "events": dr.get_deal_timeline(deal_id)}


# ---------- Support escalation ----------
class EscalateBody(BaseModel):
    conversation_id: Optional[str] = None
    reason: Optional[str] = None


@deal_room_router.post("/support/escalate")
def support_escalate(body: EscalateBody, user=Depends(require_level(1))):
    # Если указана беседа — пользователь должен быть её участником.
    if body.conversation_id:
        if not dr.room_exists(body.conversation_id):
            raise HTTPException(status_code=404, detail="Беседа не найдена")
        if not dr.is_participant(body.conversation_id, user["id"]):
            raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    esc = dr.create_support_escalation(
        requested_by_user_id=user["id"],
        conversation_id=body.conversation_id,
        reason=body.reason,
    )
    # future-ready: реального support-агента ещё нет → статус 'open', без фейков.
    return {"escalation": esc}
