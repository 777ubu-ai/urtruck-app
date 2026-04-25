"""Избранное — server-side. Сохраняет cargo/driver/route для пользователя."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from database.db import get_conn
from api.verification_gate import require_level

fav_router = APIRouter()


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "favorites_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()

_init()


class FavIn(BaseModel):
    item_type: str   # cargo | driver | route
    item_id: str
    item_data: Optional[dict] = None


@fav_router.post("")
def add_favorite(body: FavIn, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute(
            "INSERT OR IGNORE INTO favorites (user_id, item_type, item_id, item_data) VALUES (?, ?, ?, ?)",
            (user["id"], body.item_type, body.item_id, json.dumps(body.item_data or {}, ensure_ascii=False)),
        )
    return {"ok": True}


@fav_router.delete("")
def remove_favorite(item_type: str, item_id: str, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute(
            "DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?",
            (user["id"], item_type, item_id),
        )
    return {"ok": True}


@fav_router.get("")
def list_favorites(item_type: str = "", user=Depends(require_level(1))):
    with get_conn() as c:
        if item_type:
            rows = c.execute(
                "SELECT * FROM favorites WHERE user_id = ? AND item_type = ? ORDER BY created_at DESC LIMIT 100",
                (user["id"], item_type),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
                (user["id"],),
            ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["item_data"] = json.loads(d.get("item_data") or "{}")
        except Exception:
            d["item_data"] = {}
        result.append(d)
    return {"favorites": result}


@fav_router.get("/check")
def check_favorite(item_type: str, item_id: str, user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?",
            (user["id"], item_type, item_id),
        ).fetchone()
    return {"is_favorite": bool(row)}
