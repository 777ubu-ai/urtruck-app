"""Лидерборд — топ водителей по рейтингу + скорингу."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter
from database.db import get_conn
from database import reviews_dal

leader_router = APIRouter()


@leader_router.get("")
def top_drivers(limit: int = 20):
    """Топ водителей по security_score * avg_rating."""
    with get_conn() as c:
        rows = c.execute("""
            SELECT id, phone, full_name, vehicle_type, vehicle_brand, vehicle_plate,
                   security_score, security_color, approved_at
            FROM drivers_registration
            WHERE status = 'approved' AND security_score IS NOT NULL
            ORDER BY security_score DESC
            LIMIT ?
        """, (limit * 2,)).fetchall()  # берём x2 чтобы отсортировать по combined score

    result = []
    for r in rows:
        d = dict(r)
        summary = reviews_dal.get_rating_summary(d["id"])
        avg = summary.get("average", 0)
        cnt = summary.get("count", 0)
        # Combined score: security * 0.6 + rating(normalized to 100) * 0.4
        rating_norm = (avg / 5.0) * 100 if avg else 50
        combined = (d.get("security_score") or 0) * 0.6 + rating_norm * 0.4
        result.append({
            "id": d["id"],
            "full_name": d.get("full_name"),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_brand": d.get("vehicle_brand"),
            "vehicle_plate": d.get("vehicle_plate"),
            "security_score": d.get("security_score"),
            "security_color": d.get("security_color"),
            "rating_avg": avg,
            "rating_count": cnt,
            "combined_score": round(combined, 1),
            "approved_at": d.get("approved_at"),
        })

    result.sort(key=lambda x: -x["combined_score"])
    return {"leaderboard": result[:limit]}
