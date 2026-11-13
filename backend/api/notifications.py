"""InApp Notifications API — история уведомлений с колокольчиком."""
import sys
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from database.db import get_conn
from api.verification_gate import require_level

notif_router = APIRouter()

# Deal status, bid, tracking and chat events are stored here as the durable
# Bell inbox. Chat rows are visible in the inbox but excluded from this
# endpoint's counter because chat/unread counts the same raw message for the
# app icon and bottom navigation; RootHeader intentionally recombines both
# sources once for the Bell badge.
DEAL_NOTIFICATION_TYPES = {
    "bid",
    "bid_created",
    "bid_accepted",
    "bid_cancelled",
    "bid_rejected",
    "bid_countered",
    "deal_created",
    "deal_status",
    "trip_status",
    "tracking",
}

_CHAT_NOTIFICATION_TYPES = ("chat_message", "chat_attachment")
_DEAL_BADGE_NOTIFICATION_TYPES = tuple(sorted(DEAL_NOTIFICATION_TYPES))
_ACTIVE_CHAT_BADGE_DEAL_STATUSES = (
    "accepted", "in_progress", "at_border", "awaiting_confirmation", "delivered", "received",
)


def unread_badge_snapshot(user_id: str) -> dict:
    """Return the one authoritative native-app badge total for ``user_id``.

    Bottom navigation, launcher and push payloads share a Deals attention
    counter: durable deal/bid/tracking events plus unread messages in live
    participant rooms. General reminders and profile reviews remain in the
    notification history, but must not make a fully read Deals tab show 9+.
    Chat notification mirrors are excluded to avoid counting a message twice.
    """
    if not user_id:
        return {"badge": 0, "notifications": [], "rooms": []}
    placeholders = ",".join("?" for _ in _ACTIVE_CHAT_BADGE_DEAL_STATUSES)
    chat_query = f"""
        SELECT r.id AS room_id, r.cargo_id, r.trip_id, COUNT(*) AS unread_count FROM chat_messages m
        JOIN chat_rooms r ON m.room_id = r.id
        WHERE (r.participant_1 = ? OR r.participant_2 = ?)
          AND m.sender_id != ? AND m.sender_id != 'system' AND m.is_read = 0
          AND (
            (r.cargo_id IS NULL AND r.trip_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM deals d0 WHERE d0.chat_room_id = r.id))
            OR EXISTS (
              SELECT 1 FROM deals d
              WHERE d.status IN ({placeholders})
                AND (
                  d.chat_room_id = r.id
                  OR (d.chat_room_id IS NULL AND (
                    (r.cargo_id IS NOT NULL AND d.cargo_id = r.cargo_id)
                    OR (r.trip_id IS NOT NULL AND d.trip_id = r.trip_id)
                  ))
                )
            )
          )
    """
    chat_query += " GROUP BY r.id, r.cargo_id, r.trip_id"
    with get_conn() as c:
        # One read transaction: list and total describe the same snapshot.
        if not c.in_transaction:
            c.execute("BEGIN")
        event_placeholders = ",".join("?" for _ in _DEAL_BADGE_NOTIFICATION_TYPES)
        notification_rows = c.execute(
            "SELECT id,type,url,title,created_at,event_key FROM notifications "
            f"WHERE user_id = ? AND is_read = 0 AND type IN ({event_placeholders})",
            (user_id, *_DEAL_BADGE_NOTIFICATION_TYPES),
        ).fetchall()
        chat_rows = c.execute(
            chat_query,
            (user_id, user_id, user_id, *_ACTIVE_CHAT_BADGE_DEAL_STATUSES),
        ).fetchall()
    return {"badge": len(notification_rows) + sum(int(row["unread_count"]) for row in chat_rows),
            "notifications": [dict(row) for row in notification_rows],
            "rooms": [dict(row) for row in chat_rows]}


def unread_badge_count(user_id: str) -> int:
    return unread_badge_snapshot(user_id)["badge"]


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "notifications_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()
    _migrate_event_key()


def _migrate_event_key():
    """Add an optional deduplication key for repeatable notification jobs."""
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(notifications)").fetchall()}
        if "event_key" not in cols:
            try:
                c.execute("ALTER TABLE notifications ADD COLUMN event_key TEXT")
            except Exception:
                pass
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_event_key "
            "ON notifications(user_id, event_key) WHERE event_key IS NOT NULL"
        )
        c.commit()


_init()


def create_notification(user_id: str, type: str, title: str, body: str = "", icon: str = "🔔",
                        url: str = "/", event_key: str = None, *, conn=None):
    """Create an in-app notification; event_key makes repeatable jobs idempotent."""
    with (nullcontext(conn) if conn is not None else get_conn()) as c:
        if event_key:
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url, event_key) "
                "VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING",
                (user_id, type, title, body, icon, url, event_key),
            )
        else:
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url) VALUES (?,?,?,?,?,?)",
                (user_id, type, title, body, icon, url),
            )


def _notification_path(value: str) -> str:
    """Return a canonical path from a relative or absolute notification URL."""
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        parsed = urlsplit(value)
        path = parsed.path or ""
        if parsed.scheme in {"urtruck", "com.urtruck.app"}:
            path = "/" + parsed.netloc + path
    except Exception:
        path = value.split("?", 1)[0].split("#", 1)[0]
    if path and not path.startswith("/"):
        path = f"/{path}"
    return path.rstrip("/") or "/"


def mark_notifications_read_by_urls(
    user_id: str, urls, *, read_through_id: int | None = None,
    chat_message_read_through: int | None = None,
) -> int:
    """Mark unread notifications whose canonical path was actually opened.

    Matching is performed in Python after selecting only this user's unread
    rows. This avoids SQLite wildcard/escaping edge cases and correctly handles
    relative URLs, absolute URLs, query strings and fragments. Only exact
    canonical paths match, so similar entity identifiers remain isolated.
    """
    target_paths = {_notification_path(value) for value in (urls or [])}
    target_paths.discard("")
    if not user_id or not target_paths:
        return 0

    try:
        with get_conn() as c:
            query = "SELECT id, url, type, event_key FROM notifications WHERE user_id = ? AND is_read = 0"
            params = [user_id]
            if read_through_id is not None:
                query += " AND id <= ?"
                params.append(read_through_id)
            rows = c.execute(query, params).fetchall()
            ids = []
            for row in rows:
                if _notification_path(row["url"]) not in target_paths:
                    continue
                # Chat event_key содержит исходный message id. Пагинация
                # старой истории не читает более новые события той же комнаты.
                # Старые записи без ключа ограничены снимком notification id.
                if chat_message_read_through is not None and row["type"] in _CHAT_NOTIFICATION_TYPES:
                    event_key = str(row["event_key"] or "")
                    message_id = event_key.rsplit(":msg:", 1)[-1]
                    if event_key.startswith("chat:") and ":msg:" in event_key and message_id.isdigit():
                        if int(message_id) > chat_message_read_through:
                            continue
                ids.append(row["id"])
            if not ids:
                return 0
            placeholders = ",".join("?" for _ in ids)
            cur = c.execute(
                f"UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN ({placeholders})",
                (user_id, *ids),
            )
            return cur.rowcount or 0
    except Exception as exc:
        print(f"[notifications] mark-read failed user={user_id}: {exc}", file=sys.stderr, flush=True)
        return 0


@notif_router.get("")
def list_notifications(limit: int = 50, user=Depends(require_level(1))):
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (user["id"], limit),
        ).fetchall()
    return {"notifications": [dict(r) for r in rows]}


@notif_router.get("/unread")
def unread_count(user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) as cnt FROM notifications "
            "WHERE user_id = ? AND is_read = 0 "
            "AND type NOT IN ('chat_message', 'chat_attachment')",
            (user["id"],),
        ).fetchone()
    return {"unread": row["cnt"] if row else 0}


@notif_router.get("/attention")
def attention_snapshot(user=Depends(require_level(1))):
    """Same inclusion set as /badge, with owner-scoped entity references."""
    return unread_badge_snapshot(user["id"])


@notif_router.get("/badge")
def badge_count(user=Depends(require_level(1))):
    """Canonical launcher badge, including zero after completed deals."""
    return {"badge": unread_badge_count(user["id"])}


@notif_router.post("/read-all")
def mark_all_read(user=Depends(require_level(1))):
    with get_conn() as c:
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")
        rows = c.execute("SELECT id,event_key FROM notifications WHERE user_id=? AND is_read=0", (user["id"],)).fetchall()
        if rows:
            boundary = max(row["id"] for row in rows)
            c.execute("UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0 AND id<=?", (user["id"], boundary))
    return {"ok": True, "read_ids": [row["id"] for row in rows],
            "read_event_keys": [row["event_key"] for row in rows if row["event_key"]]}


@notif_router.post("/read/{notif_id}")
def mark_read(notif_id: int, user=Depends(require_level(1))):
    with get_conn() as c:
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT id,event_key FROM notifications WHERE id=? AND user_id=?", (notif_id, user["id"])).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        c.execute("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", (notif_id, user["id"]))
    return {"ok": True, "read_ids": [row["id"]],
            "read_event_keys": [row["event_key"]] if row["event_key"] else []}
