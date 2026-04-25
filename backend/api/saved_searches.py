"""Сохранённые маршруты + push-уведомления при новых грузах."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from database.db import get_conn
from api.verification_gate import require_level
from api.push import send_to_user

ss_router = APIRouter()


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "saved_searches_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()

_init()


class SavedSearchIn(BaseModel):
    from_city: str
    to_city: str
    truck_type: Optional[str] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    notify: bool = True


@ss_router.post("")
def create_saved_search(body: SavedSearchIn, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO saved_searches (user_id, from_city, to_city, truck_type, min_price, max_price, notify) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user["id"], body.from_city, body.to_city, body.truck_type, body.min_price, body.max_price, 1 if body.notify else 0),
        )
    return {"ok": True}


@ss_router.get("")
def list_saved_searches(user=Depends(require_level(1))):
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return {"searches": [dict(r) for r in rows]}


@ss_router.delete("/{search_id}")
def delete_saved_search(search_id: int, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute("DELETE FROM saved_searches WHERE id = ? AND user_id = ?", (search_id, user["id"]))
    return {"ok": True}


def notify_matching_users(from_city: str, to_city: str, cargo_desc: str = ""):
    """Вызывается при публикации нового груза — пушит matching подписчикам."""
    with get_conn() as c:
        rows = c.execute(
            "SELECT DISTINCT user_id FROM saved_searches WHERE from_city = ? AND to_city = ? AND notify = 1",
            (from_city, to_city),
        ).fetchall()
    sent = 0
    for r in rows:
        try:
            send_to_user(
                r["user_id"],
                f"📦 Новый груз: {from_city} → {to_city}",
                cargo_desc[:100] if cargo_desc else "Появился груз по вашему маршруту!",
                url="/",
            )
            sent += 1
        except Exception:
            pass
    return sent
