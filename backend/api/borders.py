"""API погранпереходов и очередей."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter
from services.border_service import get_all_borders, get_border, search_borders

borders_router = APIRouter()


@borders_router.get("")
def list_borders(country: str = ""):
    """Все погранпереходы с текущими очередями."""
    return {"borders": search_borders(country or None)}


@borders_router.get("/{border_id}")
def border_detail(border_id: str):
    """Детали одного погранперехода."""
    b = get_border(border_id)
    if not b:
        return {"error": "Погранпереход не найден"}
    return b
