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

_init()


def create_notification(user_id: str, type: str, title: str, body: str = "", icon: str = "🔔", url: str = "/"):
    """Вызывается из других модулей для создания InApp уведомления."""
    with get_conn() as c:
        c.execute(
            "INSERT INTO notifications (user_id, type, title, body, icon, url) VALUES (?,?,?,?,?,?)",
            (user_id, type, title, body, icon, url),
        )


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
