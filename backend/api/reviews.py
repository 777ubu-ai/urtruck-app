"""API отзывов."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional

from database import reviews_dal
from api.verification_gate import require_level
from api.rate_limit import limit_review_create
from config import BETA_MODE

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

    # I3 (anti-fraud): не чаще 10 отзывов в час на пользователя.
    limit_review_create(user["id"])

    # I3: отзыв разрешён только реальному контрагенту — между author и target
    # должна быть НЕотменённая сделка. Раньше с trip_id=None любой мог оставить
    # неограниченно отзывов на кого угодно и накрутить рейтинг.
    # Проверка включена ВСЕГДА (раньше BETA_MODE её обходил, что позволяло
    # накрутку рейтинга ещё до запуска). Легальный флоу отзыва идёт через
    # реальную доставленную сделку → has_deal_between=True, проверка проходит.
    if not reviews_dal.has_deal_between(user["id"], body.target_id):
        raise HTTPException(
            status_code=403,
            detail="Оставить отзыв можно только после совместной сделки",
        )

    if body.trip_id and reviews_dal.has_already_reviewed(user["id"], body.trip_id):
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв по этому рейсу")
    # Дедуп по паре, когда рейс не указан (trip_id=None) — иначе спам отзывами.
    if not body.trip_id and reviews_dal.has_reviewed_target(user["id"], body.target_id):
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв этому пользователю")

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
    emoji = '⭐' * body.rating
    review_title = f"Новый отзыв {emoji}"
    review_body = body.text[:80] if body.text else f"Оценка {body.rating} из 5"
    try:
        from api.push import send_to_user
        send_to_user(body.target_id, review_title, review_body, url="/profile")
    except Exception as e:
        print(f"[push] review failed: {e}")
    # P0-hotfix 28.08.2026: push шёл без записи в notifications — badge на
    # иконке рос, но список внутри приложения оставался пустым (тот же
    # разрыв, что для saved_searches ниже — единая первопричина §1).
    try:
        from api.notifications import create_notification
        create_notification(body.target_id, "review", review_title, review_body, "⭐", url="/profile")
    except Exception as e:
        print(f"[notif] review failed: {e}")
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
