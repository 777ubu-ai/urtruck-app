"""DAL для отзывов."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


def init_reviews_schema():
    schema = Path(__file__).resolve().parent / "reviews_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        c.commit()


def add_review(*, trip_id, author_id, author_role, target_id, target_role, rating, text=None, tags=None):
    rid = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO reviews (id, trip_id, author_id, author_role, target_id, target_role, rating, text, tags) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (rid, trip_id, author_id, author_role, target_id, target_role,
             max(1, min(5, int(rating))), text, json.dumps(tags or [], ensure_ascii=False)),
        )
    return rid


def get_reviews_for(target_id: str, limit: int = 50) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT r.*, dr.full_name AS author_name "
            "FROM reviews r "
            "LEFT JOIN drivers_registration dr ON dr.id = r.author_id "
            "WHERE r.target_id = ? AND r.is_visible = 1 "
            "ORDER BY r.created_at DESC LIMIT ?",
            (target_id, limit),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if d.get("tags") and isinstance(d["tags"], str):
            try:
                d["tags"] = json.loads(d["tags"])
            except Exception:
                d["tags"] = []
        d["user"] = d.get("author_name") or (str(d.get("author_id", ""))[:8] if d.get("author_id") else None)
        result.append(d)
    return result


def get_rating_summary(target_id: str) -> dict:
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) AS cnt, AVG(rating) AS avg, "
            "SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) AS r5, "
            "SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) AS r4, "
            "SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) AS r3, "
            "SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) AS r2, "
            "SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) AS r1 "
            "FROM reviews WHERE target_id = ? AND is_visible = 1",
            (target_id,),
        ).fetchone()
    if not row or not row["cnt"]:
        return {"count": 0, "average": 0, "distribution": {}}
    return {
        "count": row["cnt"],
        "average": round(row["avg"] or 0, 2),
        "distribution": {
            "5": row["r5"] or 0, "4": row["r4"] or 0,
            "3": row["r3"] or 0, "2": row["r2"] or 0, "1": row["r1"] or 0,
        },
    }


def has_already_reviewed(author_id: str, trip_id: str) -> bool:
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM reviews WHERE author_id = ? AND trip_id = ? LIMIT 1",
            (author_id, trip_id),
        ).fetchone()
    return bool(row)


def has_deal_between(user_a: str, user_b: str) -> bool:
    """True, если между двумя пользователями есть НЕотменённая сделка (в любую
    сторону). Отзыв разрешаем только реальному контрагенту — защита от накрутки
    рейтинга (I3): раньше с trip_id=None можно было спамить отзывами на любого."""
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM deals WHERE status = 'completed' AND "
            "((shipper_id = ? AND driver_id = ?) OR (shipper_id = ? AND driver_id = ?)) "
            "LIMIT 1",
            (user_a, user_b, user_b, user_a),
        ).fetchone()
    return bool(row)


def has_reviewed_target(author_id: str, target_id: str) -> bool:
    """True, если author уже оставлял отзыв на target. Дедуп по паре для случая
    trip_id=None (иначе один пользователь мог оставить неограниченно отзывов)."""
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM reviews WHERE author_id = ? AND target_id = ? LIMIT 1",
            (author_id, target_id),
        ).fetchone()
    return bool(row)
