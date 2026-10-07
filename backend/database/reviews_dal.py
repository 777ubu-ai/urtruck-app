"""DAL для отзывов."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


class DuplicateReviewError(ValueError):
    """Отзыв уже записан; история не изменяется."""


class InvalidReviewReferenceError(ValueError):
    """Ссылка не разрешается в одну завершённую сделку с этим контрагентом."""


def _completed_deal_for_reference(conn, user_a: str, user_b: str, reference_id: str):
    """Resolve a deal id directly, or a legacy listing id only when unambiguous."""
    participants = (
        "((shipper_id = ? AND driver_id = ?) OR (shipper_id = ? AND driver_id = ?))"
    )
    params = (user_a, user_b, user_b, user_a)
    row = conn.execute(
        f"SELECT id, trip_id, cargo_id FROM deals WHERE status = 'completed' AND {participants} AND id = ? LIMIT 1",
        (*params, reference_id),
    ).fetchone()
    if row:
        return row

    rows = conn.execute(
        f"SELECT id, trip_id, cargo_id FROM deals WHERE status = 'completed' AND {participants} "
        "AND (trip_id = ? OR cargo_id = ?) LIMIT 2",
        (*params, reference_id, reference_id),
    ).fetchall()
    return rows[0] if len(rows) == 1 else None


def _review_exists_for_deal(conn, *, author_id: str, target_id: str, deal) -> bool:
    # New writes use the canonical deal id. Also recognize an old listing alias,
    # but only when it identifies this participant pair's completed deal uniquely;
    # a cargo/trip reused by another deal must not block a legitimate review.
    references = {deal["id"]}
    for alias in (deal["trip_id"], deal["cargo_id"]):
        if alias and alias != deal["id"]:
            resolved = _completed_deal_for_reference(conn, author_id, target_id, alias)
            if resolved and resolved["id"] == deal["id"]:
                references.add(alias)
    placeholders = ",".join("?" for _ in references)
    row = conn.execute(
        f"SELECT 1 FROM reviews WHERE author_id = ? AND target_id = ? "
        f"AND trip_id IN ({placeholders}) LIMIT 1",
        (author_id, target_id, *sorted(references)),
    ).fetchone()
    return bool(row)


def init_reviews_schema():
    schema = Path(__file__).resolve().parent / "reviews_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        c.commit()


def add_review(*, trip_id, author_id, author_role, target_id, target_role, rating, text=None, tags=None):
    rid = new_id()
    with get_conn() as c:
        # SELECT + INSERT защищены одним writer lock. Проверка API до этой
        # транзакции — только быстрый путь, не гарантия от параллельного POST.
        c.execute("BEGIN IMMEDIATE")
        if trip_id:
            deal = _completed_deal_for_reference(c, author_id, target_id, trip_id)
            if not deal:
                raise InvalidReviewReferenceError("review_reference_invalid")
            trip_id = deal["id"]
            existing = _review_exists_for_deal(
                c, author_id=author_id, target_id=target_id, deal=deal
            )
        else:
            existing = c.execute(
                "SELECT 1 FROM reviews WHERE author_id = ? AND target_id = ? LIMIT 1",
                (author_id, target_id),
            ).fetchone()
        if existing:
            raise DuplicateReviewError("review_already_exists")
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


def has_already_reviewed(author_id: str, target_id: str, trip_id: str) -> bool:
    with get_conn() as c:
        deal = _completed_deal_for_reference(c, author_id, target_id, trip_id)
        return bool(
            deal
            and _review_exists_for_deal(
                c, author_id=author_id, target_id=target_id, deal=deal
            )
        )


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


def has_completed_deal_reference(user_a: str, user_b: str, reference_id: str) -> bool:
    """Validate that a review reference belongs to a completed deal between
    the author and target.  The mobile client uses the deal id as the stable
    review reference for both cargo- and trip-originated deals; legacy rows
    may still carry the listing trip/cargo id, so all three are accepted.
    """
    return resolve_completed_deal_reference(user_a, user_b, reference_id) is not None


def resolve_completed_deal_reference(user_a: str, user_b: str, reference_id: str):
    """Return the canonical deal id for a deal id or unique legacy alias."""
    with get_conn() as c:
        deal = _completed_deal_for_reference(c, user_a, user_b, reference_id)
        return deal["id"] if deal else None


def has_reviewed_target(author_id: str, target_id: str) -> bool:
    """True, если author уже оставлял отзыв на target. Дедуп по паре для случая
    trip_id=None (иначе один пользователь мог оставить неограниченно отзывов)."""
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM reviews WHERE author_id = ? AND target_id = ? LIMIT 1",
            (author_id, target_id),
        ).fetchone()
    return bool(row)
