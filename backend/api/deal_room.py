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

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from api.verification_gate import require_level
from database import deal_room_dal as dr
from services import storage_service

# Лимит размера вложения (защита от больших оригиналов; клиент сжимает по
# §5 мастер-ТЗ — document 1600/0.8, photo 1280/0.75). 12 МБ — запас.
_MAX_ATTACH_BYTES = 12 * 1024 * 1024
_KIND_BY_MIME = {"image/jpeg": "photo", "image/png": "photo", "image/webp": "photo",
                 "application/pdf": "document"}

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


# ---------- Attachments (PR3 — media foundation) ----------
@deal_room_router.post("/chat/conversations/{conversation_id}/attachments")
async def upload_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    message_id: Optional[str] = Form(None),
    user=Depends(require_level(1)),
):
    """Загрузка вложения в беседу. Только участник (403/404). Файл сохраняется
    через storage_service (local в dev), создаётся запись message_attachments.
    uploader_id = user[id] (с auth, НЕ с фронта). Без fake-success: запись в БД
    создаётся только после реального сохранения файла."""
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(raw) > _MAX_ATTACH_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой")

    mime = file.content_type or "application/octet-stream"
    resolved_kind = kind if kind in dr.ATTACH_KINDS else _KIND_BY_MIME.get(mime, "other")
    ext = "pdf" if mime == "application/pdf" else "jpg"
    url = storage_service.save_image(raw, "chat_attachments", ext=ext)

    att = dr.create_attachment(
        conversation_id=conversation_id,
        uploader_id=user["id"],
        kind=resolved_kind,
        url=url,
        mime_type=mime,
        size_bytes=len(raw),
        upload_status="uploaded",
        message_id=message_id,
    )
    return {"attachment": att}


@deal_room_router.get("/chat/conversations/{conversation_id}/attachments")
def list_conversation_attachments(conversation_id: str, user=Depends(require_level(1))):
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    return {"attachments": dr.list_attachments(conversation_id)}
