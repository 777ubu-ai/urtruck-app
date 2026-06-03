"""Pydantic-модели для CGR-интеграции.

⚠️ Точные поля будут уточнены после заполнения docs/cgr/CGR_DISCOVERY.md
этапа 1.2 и 1.4 (см. TODO ниже).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# --------- Scoreboard ---------
class ScoreboardEntry(BaseModel):
    """Один датапоинт загруженности по направлению на ПП."""
    checkpoint_code: str
    direction: Literal["IN", "OUT"]
    queue_length: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None


class ScoreboardDirection(BaseModel):
    queue_length: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None


class ScoreboardCheckpointResponse(BaseModel):
    """Что отдаём фронту по каждому ПП (TZ §3.1)."""
    code: str
    name_ru: str
    name_kz: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    country_to: str
    directions: dict[Literal["in", "out"], ScoreboardDirection]
    status: Literal["ok", "stale", "unavailable"]
    last_updated: Optional[datetime] = None


class ScoreboardResponse(BaseModel):
    fetched_at: datetime
    checkpoints: list[ScoreboardCheckpointResponse]


# --------- Booking ---------
class CreateBookingRequest(BaseModel):
    trip_id: Optional[str] = None
    booking_number: str = Field(min_length=3, max_length=64)
    # TODO: после разведки 1.2 — добавить validator с regex по формату CGR


class BookingResponse(BaseModel):
    booking_id: int
    verification_status: Literal["pending", "verified", "active", "completed", "cancelled", "not_found"]
    message: str


# --------- Blocklist (только для внутреннего использования, фронту не отдаём) ---------
class BlocklistEntry(BaseModel):
    """Запись чёрного списка как мы её храним. ИИН только хэшем."""
    iin_hash: Optional[str] = Field(default=None, min_length=64, max_length=64)
    grnz_normalized: Optional[str] = None
    full_name_normalized: Optional[str] = None
    blocked_at: Optional[str] = None
    reason: Optional[str] = None
