"""API отзывов."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional

from database import reviews_dal
from api.verification_gate import require_level

reviews_router = APIRouter()


class ReviewIn(BaseModel):
    trip_id: Optional[str] = None
    target_id: str
    target_role: str = Field(..., pattern="^(driver|client)$")
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = None
    tags: Optional[List[str]] = None


@reviews_router.post("")
def create_review(body: ReviewIn, user=Depends(require_level(1))):
    """Оставить отзыв (требует phone-верификацию минимум)."""
    if user["id"] == body.target_id:
        raise HTTPException(status_code=400, detail="Нельзя оставить отзыв самому себе")
    if body.trip_id and reviews_dal.has_already_reviewed(user["id"], body.trip_id):
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв по этому рейсу")

    rid = reviews_dal.add_review(
        trip_id=body.trip_id,
        author_id=user["id"],
        author_role=user.get("role", "client"),
        target_id=body.target_id,
        target_role=body.target_role,
        rating=body.rating,
        text=body.text,
        tags=body.tags,
    )
    # Push получателю отзыва
    try:
        from api.push import send_to_user
        emoji = '⭐' * body.rating
        send_to_user(
            body.target_id,
            f"Новый отзыв {emoji}",
            body.text[:80] if body.text else f"Оценка {body.rating} из 5",
            url="/profile",
        )
    except Exception as e:
        print(f"[push] review failed: {e}")
    return {"id": rid, "ok": True}


@reviews_router.get("/for/{target_id}")
def reviews_for(target_id: str, limit: int = 50):
    """Публичный — все отзывы про target_id."""
    return {
        "summary": reviews_dal.get_rating_summary(target_id),
        "reviews": reviews_dal.get_reviews_for(target_id, limit=limit),
    }


@reviews_router.get("/summary/{target_id}")
def rating_summary(target_id: str):
    """Короткий summary — только средняя + количество."""
    return reviews_dal.get_rating_summary(target_id)
