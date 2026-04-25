"""Pydantic модели API."""
from pydantic import BaseModel, Field
from typing import Optional


class CheckFullRequest(BaseModel):
    user_id: str
    phone: Optional[str] = None
    plate: Optional[str] = None
    name: Optional[str] = None
    vehicle_year: Optional[int] = None
    has_insurance: bool = True
    experience_years: Optional[int] = None
    completed_trips: int = 0
    positive_reviews: int = 0
    negative_reviews: int = 0


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
