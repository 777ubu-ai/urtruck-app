"""API-key авторизация. Открытые endpoints: /health, /api/v1/ (root), /docs.
Защищённые (требуют X-API-Key): /blacklist/add, /report/driver.
Admin (требуют X-Admin-Token): /admin/*.
"""
import sys
import secrets
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import Request, HTTPException
import os

API_KEY = os.getenv("URTRUCK_API_KEY", "demo-api-key-change-me")
ADMIN_TOKEN = os.getenv("URTRUCK_ADMIN_TOKEN", "demo-admin-change-me")


def require_api_key(request: Request):
    key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if not key or not secrets.compare_digest(key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def require_admin(request: Request):
    token = request.headers.get("X-Admin-Token") or request.query_params.get("admin_token")
    if not token or not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="Admin token required")


def optional_api_key(request: Request) -> bool:
    """Опциональная проверка — возвращает True если ключ валидный."""
    key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    return bool(key and secrets.compare_digest(key, API_KEY))
