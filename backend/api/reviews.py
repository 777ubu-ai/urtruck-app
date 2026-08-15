"""API отзывов."""
import sqlite3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional

from database import reviews_dal
from api.verification_gate import require_level
from api.rate_limit import limit_review_create

reviews_router = APIRouter()


class ReviewIn(BaseModel):
    deal_id: str = Field(..., min_length=1)
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

    # I3 (anti-fraud): не чаще 10 отзывов в час на пользователя.
    limit_review_create(user["id"])

    deal = reviews_dal.get_reviewable_deal(
        deal_id=body.deal_id,
        author_id=user["id"],
        target_id=body.target_id,
        trip_id=body.trip_id,
    )
    if not deal:
        raise HTTPException(
            status_code=403,
            detail="Отзыв доступен только участнику конкретной завершённой сделки",
        )

    expected_role = "driver" if body.target_id == deal["driver_id"] else "client"
    if body.target_role != expected_role:
        raise HTTPException(status_code=422, detail="Роль получателя не соответствует сделке")
    if reviews_dal.has_already_reviewed(user["id"], body.deal_id):
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв по этой сделке")

    author_role = "client" if user["id"] == deal["shipper_id"] else "driver"
    try:
        rid = reviews_dal.add_review(
            deal_id=body.deal_id,
            trip_id=deal.get("trip_id"),
            author_id=user["id"],
            author_role=author_role,
            target_id=body.target_id,
            target_role=expected_role,
            rating=body.rating,
            text=body.text,
            tags=body.tags,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв по этой сделке")
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
