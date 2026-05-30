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
            deal = c.execute(
                "SELECT driver_id, shipper_id FROM deals WHERE chat_room_id = ? LIMIT 1",
                (room_id,),
            ).fetchone()
            driver_id = deal["driver_id"] if deal else None
            shipper_id = deal["shipper_id"] if deal else None
            for uid in (r["participant_1"], r["participant_2"]):
                if not uid:
                    continue
                role = "member"
                if uid == driver_id:
                    role = "driver"
                elif uid == shipper_id:
                    role = "client"
                elif uid == "urtruck-support-bot":
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
# Access helpers (role-based) — единый источник правды доступа.
# ----------------------------------------------------------------
def is_participant(conversation_id: str, user_id: str) -> bool:
    """Участник ли пользователь беседы. Проверяем НОВУЮ таблицу participants,
    с fallback на старую chat_rooms (на случай комнат без backfill)."""
    with get_conn() as c:
        r = c.execute(
            "SELECT 1 FROM conversation_participants "
            "WHERE conversation_id = ? AND user_id = ? AND is_active = 1",
            (conversation_id, user_id),
        ).fetchone()
        if r:
            return True
        room = c.execute(
            "SELECT participant_1, participant_2 FROM chat_rooms WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        return bool(room and user_id in (room["participant_1"], room["participant_2"]))


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
) -> str:
    """Серверная запись immutable-события. Единственная точка создания.
    i18n_key выводится из EVENT_TYPES — фронт переводит по ключу.
    actor_id/created_at задаёт сервер (created_at = CURRENT_TIMESTAMP)."""
    i18n_key = EVENT_TYPES.get(event_type)
    if not i18n_key:
        raise ValueError(f"unknown event_type: {event_type}")
    eid = new_id()
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO deal_events
                (id, conversation_id, event_type, i18n_key, payload_json,
                 actor_id, actor_role, load_id, trip_id, bid_id, deal_id, is_system)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (eid, conversation_id, event_type, i18n_key,
             json.dumps(payload or {}, ensure_ascii=False),
             actor_id, actor_role, load_id, trip_id, bid_id, deal_id),
        )
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
