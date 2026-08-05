"""InApp Notifications API — история уведомлений с колокольчиком."""
import sys
from pathlib import Path
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
                        url: str = "/", event_key: str = None):
    """Create an in-app notification; event_key makes repeatable jobs idempotent."""
    with get_conn() as c:
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


def mark_notifications_read_by_urls(user_id: str, urls) -> int:
    """Mark notifications for the entity paths the user actually opened.

    A notification may contain either a bare path or the same path followed by
    a query string. GLOB is used with a literal ``?`` encoded as ``[?]`` so
    SQLite does not treat it as a wildcard. This keeps matching strict and
    prevents a short/similar entity id from consuming another entity's badge.
    """
    clean_urls = []
    for value in urls or []:
        value = str(value or "").strip()
        if value and value not in clean_urls:
            clean_urls.append(value)
    if not user_id or not clean_urls:
        return 0

    clauses = []
    params = []
    for path in clean_urls:
        clauses.append("(url = ? OR url GLOB ?)")
        params.extend((path, f"{path}[?]*"))

    try:
        with get_conn() as c:
            cur = c.execute(
                "UPDATE notifications SET is_read = 1 "
                f"WHERE user_id = ? AND is_read = 0 AND ({' OR '.join(clauses)})",
                (user_id, *params),
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
    return {"notifications": [dict(r) for r in rows]}


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
