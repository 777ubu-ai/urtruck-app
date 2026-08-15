"""InApp Notifications API — история уведомлений с колокольчиком."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends
from database.db import get_conn
from api.verification_gate import require_level

notif_router = APIRouter()


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "notifications_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()
    _migrate_event_key()


def _migrate_event_key():
    """Add dedupe and locale-neutral semantic event metadata."""
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(notifications)").fetchall()}
        if "event_key" not in cols:
            try:
                c.execute("ALTER TABLE notifications ADD COLUMN event_key TEXT")
            except Exception:
                pass
        for name, ddl in (
            ("event_type", "ALTER TABLE notifications ADD COLUMN event_type TEXT"),
            ("event_payload_json", "ALTER TABLE notifications ADD COLUMN event_payload_json TEXT"),
        ):
            if name not in cols:
                try:
                    c.execute(ddl)
                except Exception:
                    pass
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_event_key "
            "ON notifications(user_id, event_key) WHERE event_key IS NOT NULL"
        )
        c.commit()


_init()


def create_notification(user_id: str, type: str, title: str, body: str = "", icon: str = "🔔",
                        url: str = "/", event_key: str = None,
                        semantic_type: str = None, semantic_payload: dict = None):
    """Create a notification with legacy fallback copy and semantic metadata.

    ``event_key`` remains the idempotency key. ``semantic_type`` is a stable,
    locale-neutral event identifier rendered by the client in its own locale.
    Payload must contain server-derived display facts, never arbitrary client
    text.
    """
    payload_json = json.dumps(semantic_payload or {}, ensure_ascii=False, separators=(",", ":")) if semantic_type else None
    with get_conn() as c:
        if event_key:
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url, event_key, event_type, event_payload_json) "
                "VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING",
                (user_id, type, title, body, icon, url, event_key, semantic_type, payload_json),
            )
        else:
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url, event_type, event_payload_json) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (user_id, type, title, body, icon, url, semantic_type, payload_json),
            )


def _notification_path(value: str) -> str:
    """Return a canonical path from a relative or absolute notification URL."""
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        parsed = urlsplit(value)
        path = parsed.path or ""
    except Exception:
        path = value.split("?", 1)[0].split("#", 1)[0]
    if path and not path.startswith("/"):
        path = f"/{path}"
    return path.rstrip("/") or "/"


def mark_notifications_read_by_urls(user_id: str, urls) -> int:
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
            rows = c.execute(
                "SELECT id, url FROM notifications WHERE user_id = ? AND is_read = 0",
                (user_id,),
            ).fetchall()
            ids = [row["id"] for row in rows if _notification_path(row["url"]) in target_paths]
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
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user["id"], limit),
        ).fetchall()
    notifications = []
    for row in rows:
        item = dict(row)
        raw_payload = item.pop("event_payload_json", None)
        if item.get("event_type"):
            try:
                parsed = json.loads(raw_payload or "{}")
                item["event_payload"] = parsed if isinstance(parsed, dict) else {}
            except (TypeError, ValueError, json.JSONDecodeError):
                item["event_payload"] = {}
        notifications.append(item)
    return {"notifications": notifications}


@notif_router.get("/unread")
def unread_count(user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0",
            (user["id"],),
        ).fetchone()
    return {"unread": row["cnt"] if row else 0}


@notif_router.post("/read-all")
def mark_all_read(user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (user["id"],))
    return {"ok": True}


@notif_router.post("/read/{notif_id}")
def mark_read(notif_id: int, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notif_id, user["id"]))
    return {"ok": True}
