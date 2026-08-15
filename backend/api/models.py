"""Pydantic модели API."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class CheckFullRequest(BaseModel):
    """Запрос на серверный пересчёт скоринга.

    Все факторы скоринга берутся только из доверенных серверных данных. Для
    обычного пользователя ``user_id`` можно не передавать (будет использован
    id сессии) или передать только собственный id. Явная цель предназначена
    для административного запуска.
    """
    model_config = ConfigDict(extra="forbid")
    user_id: Optional[str] = None


class CheckQuickRequest(BaseModel):
    phone: Optional[str] = None
    plate: Optional[str] = None
    name: Optional[str] = None


class BlacklistAddRequest(BaseModel):
    phone: Optional[str] = None
    plate: Optional[str] = None
    name: Optional[str] = None
    reason: str
    source: str = "manual"
    severity: str = "medium"


class ScoreResponse(BaseModel):
    user_id: str
    total_score: int
    color_code: str
    components: dict
    blacklisted: bool = False
    blacklist_details: list = []


class OCRResponse(BaseModel):
    success: bool
    raw_text: str = ""
    plate_number: Optional[str] = None
    vin: Optional[str] = None
    year: Optional[int] = None
    brand: Optional[str] = None
    confidence: float = 0.0
    error: Optional[str] = None
