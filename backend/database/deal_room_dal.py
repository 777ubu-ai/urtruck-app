"""DAL для Deal Room foundation (First PR — backend foundation).

Расширяет существующий чат (chat_rooms / chat_messages), НЕ переписывает его.
conversation_id == chat_rooms.id (room_id). Старые endpoints /chat/rooms и
/chat/messages/{room_id} продолжают работать без изменений.

Стиль повторяет database/db.py: get_conn() (Row + commit-on-exit), new_id().
Все схемы идемпотентны; backfill безопасен при повторном запуске.

ВАЖНО (immutable timeline): create_deal_event() — единственная точка записи
deal_events, вызывается только серверной логикой. Нет update/delete функций и
нет user-facing endpoint для модификации событий. actor_id/created_at задаются
сервером, не принимаются с фронта.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.db import get_conn, new_id

_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "deal_room_schema.sql"
SUPPORT_ID = "urtruck-support-bot"
ACTIVE_CHAT_DEAL_STATUSES = {
    "accepted", "in_progress", "at_border", "awaiting_confirmation",
}

# Базовые типы системных событий сделки + их i18n-ключи (фронт переводит
# RU/KZ/UZ/ZH по ключу + payload, НЕ хранится готовый русский текст).
EVENT_TYPES = {
    "deal.bid_created":        "deal_event.bid_created",
    "deal.bid_accepted":       "deal_event.bid_accepted",
    "deal.trip_confirmed":     "deal_event.trip_confirmed",
    "deal.documents_uploaded": "deal_event.documents_uploaded",
    "deal.support_joined":     "deal_event.support_joined",
    "deal.status_changed":     "deal_event.status_changed",
}


# ----------------------------------------------------------------
# Schema init + backfill
# ----------------------------------------------------------------
def init_deal_room_schema() -> None:
    """Применить deal_room_schema.sql (идемпотентно)."""
    with get_conn() as c:
        c.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))


def backfill_participants() -> int:
    """Из существующих chat_rooms создать строки conversation_participants.

    Роль выводим из deals (driver_id→driver, shipper_id→client), иначе 'member'.
    Идемпотентно (UNIQUE(conversation_id,user_id) + INSERT OR IGNORE). Если
    данных нет — просто возвращает 0, не падает.
    """
    inserted = 0
    with get_conn() as c:
        rooms = c.execute(
            "SELECT id, participant_1, participant_2, cargo_id, trip_id FROM chat_rooms"
        ).fetchall()
        for r in rooms:
            room_id = r["id"]
            # роли по deals, связанным с этой комнатой
            deals = c.execute(
                "SELECT id, driver_id, shipper_id, bid_id, cargo_id, trip_id "
                "FROM deals WHERE chat_room_id = ? ORDER BY created_at",
                (room_id,),
            ).fetchall()
            deal = deals[0] if len(deals) == 1 else None
            driver_id = deal["driver_id"] if deal else None
            shipper_id = deal["shipper_id"] if deal else None
            # Старые accepted-room создавались без bid_id/role metadata.
            # Синхронизируем только однозначно связанную комнату; orphan и
            # reused-room (несколько deals) остаются quarantined и не проходят
            # get_room_access ниже.
            if deal and driver_id and shipper_id:
                p1, p2 = sorted([driver_id, shipper_id])
                c.execute(
                    "UPDATE chat_rooms SET participant_1=?, participant_2=?, "
                    "owner_id=?, bidder_id=?, bid_id=?, cargo_id=?, trip_id=? WHERE id=?",
                    (p1, p2, shipper_id, driver_id, deal["bid_id"],
                     deal["cargo_id"], deal["trip_id"], room_id),
                )
            else:
                p1, p2 = r["participant_1"], r["participant_2"]
            for uid in (p1, p2):
                if not uid:
                    continue
                role = "member"
                if uid == driver_id:
                    role = "driver"
                elif uid == shipper_id:
                    role = "client"
                elif uid == SUPPORT_ID:
                    role = "support"
                cur = c.execute(
                    """
                    INSERT OR IGNORE INTO conversation_participants
                        (id, conversation_id, user_id, role)
                    VALUES (?, ?, ?, ?)
                    """,
                    (new_id(), room_id, uid, role),
                )
                inserted += cur.rowcount
    return inserted


# ----------------------------------------------------------------
# Access helpers — единый источник правды deal/support isolation.
# ----------------------------------------------------------------
def _room_access_on_conn(c, conversation_id: str, user_id: str,
                         require_active: bool = False) -> dict | None:
    """Return verified room/deal context or None, never trusting membership rows.

    Commercial rooms must map one-to-one to a server-created deal and exactly
    match its participants and cargo/trip/bid context. Support is the only
    room type without a deal and uses a dedicated pair-only allowlist.
    """
    room_row = c.execute("SELECT * FROM chat_rooms WHERE id = ?", (conversation_id,)).fetchone()
    if not room_row:
        return None
    room = dict(room_row)
    participants = {room.get("participant_1"), room.get("participant_2")}
    if user_id not in participants or len(participants) != 2 or None in participants:
        return None

    deals = c.execute(
        "SELECT * FROM deals WHERE chat_room_id = ? ORDER BY created_at",
        (conversation_id,),
    ).fetchall()
    if not deals:
        other_id = room["participant_2"] if room["participant_1"] == user_id else room["participant_1"]
        expected_key = "p:" + ":".join(sorted([user_id, other_id]))
        support_room = (
            SUPPORT_ID in participants
            and room.get("deal_key") == expected_key
            and not any(room.get(field) for field in (
                "owner_id", "bidder_id", "bid_id", "cargo_id", "trip_id",
            ))
        )
        if not support_room:
            return None
        return {"room": room, "deal": None, "recipient_id": other_id, "is_support": True}

    # One room cannot join histories from two deals, even for the same pair.
    if len(deals) != 1:
        return None
    deal = dict(deals[0])
    deal_participants = {deal.get("shipper_id"), deal.get("driver_id")}
    if participants != deal_participants or user_id not in deal_participants:
        return None
    if (
        room.get("cargo_id") != deal.get("cargo_id")
        or room.get("trip_id") != deal.get("trip_id")
        or room.get("bid_id") != deal.get("bid_id")
    ):
        return None
    if require_active and deal.get("status") not in ACTIVE_CHAT_DEAL_STATUSES:
        return None
    recipient_id = deal["driver_id"] if user_id == deal["shipper_id"] else deal["shipper_id"]
    return {"room": room, "deal": deal, "recipient_id": recipient_id, "is_support": False}


def get_room_access(conversation_id: str, user_id: str,
                    require_active: bool = False, conn=None) -> dict | None:
    if conn is not None:
        return _room_access_on_conn(conn, conversation_id, user_id, require_active)
    with get_conn() as c:
        return _room_access_on_conn(c, conversation_id, user_id, require_active)


def is_participant(conversation_id: str, user_id: str) -> bool:
    """Only a verified deal participant or exact support-room member."""
    return get_room_access(conversation_id, user_id) is not None


def is_active_participant(conversation_id: str, user_id: str) -> bool:
    return get_room_access(conversation_id, user_id, require_active=True) is not None


def room_exists(conversation_id: str) -> bool:
    with get_conn() as c:
        return bool(c.execute("SELECT 1 FROM chat_rooms WHERE id = ?", (conversation_id,)).fetchone())


# ----------------------------------------------------------------
# Conversations (N-участниковая модель; совместимый mapping на chat_rooms)
# ----------------------------------------------------------------
def list_conversations(user_id: str) -> list[dict]:
    """Беседы пользователя через participants-модель (fallback chat_rooms)."""
    with get_conn() as c:
        rows = c.execute(
            """
            SELECT r.*,
                   (SELECT COUNT(*) FROM chat_messages m
                    WHERE m.room_id = r.id AND m.is_read = 0 AND m.sender_id != ?) AS unread
            FROM chat_rooms r
            WHERE r.id IN (
                SELECT conversation_id FROM conversation_participants
                WHERE user_id = ? AND is_active = 1
            )
               OR r.participant_1 = ? OR r.participant_2 = ?
            ORDER BY r.last_at DESC LIMIT 100
            """,
            (user_id, user_id, user_id, user_id),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            if not _room_access_on_conn(c, d["id"], user_id):
                continue
            parts = c.execute(
                "SELECT user_id, role FROM conversation_participants WHERE conversation_id = ? AND is_active = 1",
                (d["id"],),
            ).fetchall()
            d["conversation_id"] = d["id"]
            d["participants"] = [dict(p) for p in parts]
            out.append(d)
        return out


def get_messages(conversation_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (conversation_id, limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]


def mark_read(conversation_id: str, user_id: str) -> int:
    """Проставить read-receipts для непрочитанных сообщений + сохранить старую
    chat_messages.is_read (совместимость с /chat/unread). Возвращает кол-во
    новых receipts."""
    added = 0
    with get_conn() as c:
        msgs = c.execute(
            "SELECT id FROM chat_messages WHERE room_id = ? AND sender_id != ?",
            (conversation_id, user_id),
        ).fetchall()
        for m in msgs:
            cur = c.execute(
                "INSERT OR IGNORE INTO message_read_receipts (id, message_id, user_id) VALUES (?, ?, ?)",
                (new_id(), m["id"], user_id),
            )
            added += cur.rowcount
        # старая логика unread — НЕ ломаем
        c.execute(
            "UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ? AND is_read = 0",
            (conversation_id, user_id),
        )
    return added


# ----------------------------------------------------------------
# Deal timeline (IMMUTABLE)
# ----------------------------------------------------------------
def create_deal_event(
    event_type: str,
    *,
    actor_id: str | None,
    actor_role: str | None,
    conversation_id: str | None = None,
    deal_id: str | None = None,
    load_id: str | None = None,
    trip_id: str | None = None,
    bid_id: str | None = None,
    payload: dict | None = None,
    conn=None,
) -> str:
    """Серверная запись immutable-события. Единственная точка создания.
    i18n_key выводится из EVENT_TYPES — фронт переводит по ключу.
    actor_id/created_at задаёт сервер (created_at = CURRENT_TIMESTAMP).

    conn: опциональный открытый коннект. Нужен, когда вызов идёт ВНУТРИ уже
    открытой транзакции (напр. marketplace accept_bid) — иначе второй
    get_conn() упирается в SQLite write-lock ('database is locked')."""
    i18n_key = EVENT_TYPES.get(event_type)
    if not i18n_key:
        raise ValueError(f"unknown event_type: {event_type}")
    eid = new_id()
    sql = (
        "INSERT INTO deal_events "
        "(id, conversation_id, event_type, i18n_key, payload_json, "
        " actor_id, actor_role, load_id, trip_id, bid_id, deal_id, is_system) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
    )
    params = (eid, conversation_id, event_type, i18n_key,
              json.dumps(payload or {}, ensure_ascii=False),
              actor_id, actor_role, load_id, trip_id, bid_id, deal_id)
    if conn is not None:
        conn.execute(sql, params)
    else:
        with get_conn() as c:
            c.execute(sql, params)
    return eid


def get_deal_timeline(deal_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM deal_events WHERE deal_id = ? ORDER BY created_at ASC",
            (deal_id,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["payload"] = json.loads(d.get("payload_json") or "{}")
            except Exception:
                d["payload"] = {}
            out.append(d)
        return out


def get_deal(deal_id: str) -> dict | None:
    with get_conn() as c:
        r = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        return dict(r) if r else None


def user_can_access_deal(deal_id: str, user_id: str) -> bool:
    """Доступ к сделке: участник её чат-комнаты, либо driver/shipper сделки."""
    deal = get_deal(deal_id)
    if not deal:
        return False
    if user_id in (deal.get("driver_id"), deal.get("shipper_id")):
        return True
    room_id = deal.get("chat_room_id")
    return bool(room_id and is_participant(room_id, user_id))


# ----------------------------------------------------------------
# Support escalation
# ----------------------------------------------------------------
def create_support_escalation(
    requested_by_user_id: str,
    conversation_id: str | None = None,
    reason: str | None = None,
) -> dict:
    eid = new_id()
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO support_escalations
                (id, conversation_id, requested_by_user_id, status, reason)
            VALUES (?, ?, ?, 'open', ?)
            """,
            (eid, conversation_id, requested_by_user_id, reason),
        )
        row = c.execute("SELECT * FROM support_escalations WHERE id = ?", (eid,)).fetchone()
        return dict(row)


# ----------------------------------------------------------------
# Message attachments (PR3 — media foundation)
# ----------------------------------------------------------------
# Тип вложения по mime/расширению. Документы и фото груза — основные кейсы.
ATTACH_KINDS = ("photo", "document", "voice", "other")


def create_attachment(
    conversation_id: str,
    uploader_id: str,
    *,
    kind: str = "other",
    url: str | None = None,
    mime_type: str | None = None,
    size_bytes: int | None = None,
    upload_status: str = "uploaded",
    message_id: str | None = None,
) -> dict:
    """Создать запись вложения. uploader_id берётся из auth (не с фронта).
    upload_status по умолчанию 'uploaded' (файл уже сохранён в storage до
    вызова); foundation для queued/uploading/failed/retrying на клиенте."""
    if kind not in ATTACH_KINDS:
        kind = "other"
    aid = new_id()
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO message_attachments
                (id, message_id, conversation_id, uploader_id, kind, url,
                 mime_type, size_bytes, upload_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (aid, message_id, conversation_id, uploader_id, kind, url,
             mime_type, size_bytes, upload_status),
        )
        row = c.execute("SELECT * FROM message_attachments WHERE id = ?", (aid,)).fetchone()
        return dict(row)


def list_attachments(conversation_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM message_attachments WHERE conversation_id = ? ORDER BY created_at ASC",
            (conversation_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_attachment(attachment_id: str) -> dict | None:
    with get_conn() as c:
        r = c.execute("SELECT * FROM message_attachments WHERE id = ?", (attachment_id,)).fetchone()
        return dict(r) if r else None
