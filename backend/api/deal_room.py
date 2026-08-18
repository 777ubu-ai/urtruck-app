"""Deal Room API.

Новые endpoints поверх существующего чата. Старые /chat/rooms и
/chat/messages/{room_id} НЕ трогаются.
"""
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from api.verification_gate import require_level
from database import deal_room_dal as dr
from services import storage_service
from services import file_signing
from api.push import send_to_user
from database.db import get_conn

_MAX_ATTACH_BYTES = 12 * 1024 * 1024
_ALLOWED = {
    "image/jpeg": ("photo", "jpg"),
    "image/png": ("photo", "png"),
    "application/pdf": ("document", "pdf"),
}
_GENERIC_DECLARED_MIME = {
    "",
    "application/octet-stream",
    "binary/octet-stream",
    "application/x-download",
}
_DECLARED_ALIASES = {
    "image/jpg": "image/jpeg",
    "application/x-pdf": "application/pdf",
    "application/acrobat": "application/pdf",
}


def _sniff_mime(raw: bytes) -> str | None:
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:5] == b"%PDF-":
        return "application/pdf"
    return None


def _safe_original_name(value: Optional[str], ext: str) -> str:
    # Safari may send Unicode/spaces/parentheses — keep them, but strip paths,
    # controls and excessive length. Never use this value as a storage key.
    raw = str(value or "").replace("\\", "/").split("/")[-1].strip()
    raw = re.sub(r"[\x00-\x1f\x7f]+", "", raw)
    if not raw:
        raw = f"document.{ext}"
    return raw[:180]


def _ensure_attachment_columns() -> None:
    """Idempotent migration for production DBs created before this release."""
    with get_conn() as c:
        cols = {row["name"] for row in c.execute("PRAGMA table_info(message_attachments)").fetchall()}
        if "original_name" not in cols:
            c.execute("ALTER TABLE message_attachments ADD COLUMN original_name TEXT")
        if "client_upload_id" not in cols:
            c.execute("ALTER TABLE message_attachments ADD COLUMN client_upload_id TEXT")
        c.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_att_client_upload
            ON message_attachments(conversation_id, uploader_id, client_upload_id)
            WHERE client_upload_id IS NOT NULL AND client_upload_id != ''
            """
        )


def _existing_attachment(conversation_id: str, uploader_id: str, client_upload_id: Optional[str]):
    if not client_upload_id:
        return None
    with get_conn() as c:
        row = c.execute(
            """
            SELECT * FROM message_attachments
            WHERE conversation_id = ? AND uploader_id = ? AND client_upload_id = ?
            LIMIT 1
            """,
            (conversation_id, uploader_id, client_upload_id),
        ).fetchone()
    return dict(row) if row else None


def _sign_attachment(att: dict | None):
    if not isinstance(att, dict):
        return att
    if att.get("url"):
        return {**att, "url": file_signing.sign(att["url"])}
    return att


deal_room_router = APIRouter()


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
    msgs = dr.get_messages(conversation_id, limit, offset)
    for m in msgs:
        if m.get("photo_url"):
            m["photo_url"] = file_signing.sign(m["photo_url"])
    return {"messages": msgs}


@deal_room_router.post("/chat/conversations/{conversation_id}/read")
def conversation_read(conversation_id: str, user=Depends(require_level(1))):
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    receipts = dr.mark_read(conversation_id, user["id"])
    return {"ok": True, "new_receipts": receipts}


@deal_room_router.get("/deals/{deal_id}/timeline")
def deal_timeline(deal_id: str, user=Depends(require_level(1))):
    if not dr.get_deal(deal_id):
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    if not dr.user_can_access_deal(deal_id, user["id"]):
        raise HTTPException(status_code=403, detail="Нет доступа к этой сделке")
    return {"deal_id": deal_id, "events": dr.get_deal_timeline(deal_id)}


class EscalateBody(BaseModel):
    conversation_id: Optional[str] = None
    reason: Optional[str] = None


@deal_room_router.post("/support/escalate")
def support_escalate(body: EscalateBody, user=Depends(require_level(1))):
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
    return {"escalation": esc}


@deal_room_router.post("/chat/conversations/{conversation_id}/attachments")
async def upload_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    message_id: Optional[str] = Form(None),
    client_upload_id: Optional[str] = Form(None),
    user=Depends(require_level(1)),
):
    """Upload a private deal attachment with magic-byte MIME validation.

    `client_upload_id` makes Retry idempotent: if the server stored the file but
    the response was lost, the next retry returns the same attachment instead
    of writing a duplicate.
    """
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")

    _ensure_attachment_columns()
    normalized_client_id = (client_upload_id or "").strip()[:120] or None
    existing = _existing_attachment(conversation_id, user["id"], normalized_client_id)
    if existing:
        return {"attachment": _sign_attachment(existing), "deduplicated": True}

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(raw) > _MAX_ATTACH_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 12 МБ)")

    sniffed = _sniff_mime(raw)
    if sniffed is None or sniffed not in _ALLOWED:
        raise HTTPException(status_code=415, detail="Неподдерживаемый тип файла (JPEG/PNG/PDF)")

    declared = (file.content_type or "").split(";", 1)[0].strip().lower()
    declared = _DECLARED_ALIASES.get(declared, declared)
    # Safari/PWA commonly uploads a selected PDF as application/octet-stream.
    # Magic bytes are authoritative. Reject only a specific contradictory MIME.
    if declared not in _GENERIC_DECLARED_MIME and declared != sniffed:
        raise HTTPException(status_code=415, detail="Тип файла не совпадает с содержимым")

    mime = sniffed
    detected_kind, ext = _ALLOWED[mime]
    resolved_kind = kind if kind in dr.ATTACH_KINDS else detected_kind
    original_name = _safe_original_name(file.filename, ext)

    try:
        url = storage_service.save_file(
            raw,
            "chat_attachments",
            ext=ext,
            content_type=mime,
        )
    except Exception as exc:
        print(
            f"[attachment-storage] failed room={conversation_id} mime={mime} bytes={len(raw)} error={type(exc).__name__}",
            flush=True,
        )
        raise HTTPException(status_code=502, detail="Не удалось сохранить файл") from exc

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
    # The current DAL remains backward-compatible. Persist the new metadata in
    # the same transaction boundary after its insert; the unique idempotency
    # index protects concurrent retries.
    with get_conn() as c:
        c.execute(
            "UPDATE message_attachments SET original_name = ?, client_upload_id = ? WHERE id = ?",
            (original_name, normalized_client_id, att["id"]),
        )
        row = c.execute("SELECT * FROM message_attachments WHERE id = ?", (att["id"],)).fetchone()
        att = dict(row) if row else att

    att = _sign_attachment(att)

    try:
        with get_conn() as c:
            room = c.execute(
                "SELECT participant_1, participant_2 FROM chat_rooms WHERE id = ?",
                (conversation_id,),
            ).fetchone()
        if room:
            recipient_id = room["participant_2"] if room["participant_1"] == user["id"] else room["participant_1"]
            label = f"📄 {original_name}" if resolved_kind == "document" else "🖼 Фото"
            send_to_user(
                recipient_id,
                "Новое вложение в сделке",
                label,
                url=f"/chats/{conversation_id}",
                kind="chat",
                data={
                    "type": "chat_attachment",
                    "room_id": conversation_id,
                    "attachment_id": att.get("id") if isinstance(att, dict) else None,
                    "sender_id": user["id"],
                    "recipient_id": recipient_id,
                },
            )
    except Exception as exc:
        print(f"[attachment-push] failed room={conversation_id}: {type(exc).__name__}", flush=True)

    return {"attachment": att, "deduplicated": False}


@deal_room_router.get("/chat/conversations/{conversation_id}/attachments")
def list_conversation_attachments(conversation_id: str, user=Depends(require_level(1))):
    if not dr.room_exists(conversation_id):
        raise HTTPException(status_code=404, detail="Беседа не найдена")
    if not dr.is_participant(conversation_id, user["id"]):
        raise HTTPException(status_code=403, detail="Вы не участник этой беседы")
    _ensure_attachment_columns()
    atts = dr.list_attachments(conversation_id)
    return {"attachments": [_sign_attachment(a) for a in atts]}
