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

_DEFAULT_API_KEY = "demo-api-key-change-me"
_DEFAULT_ADMIN_TOKEN = "demo-admin-change-me"
API_KEY = os.getenv("URTRUCK_API_KEY", _DEFAULT_API_KEY)
ADMIN_TOKEN = os.getenv("URTRUCK_ADMIN_TOKEN", _DEFAULT_ADMIN_TOKEN)
_IS_PROD = (os.getenv("URTRUCK_ENV") or os.getenv("ENV") or "production").strip().lower() == "production"


def _block_default_in_prod(kind: str, value: str, default: str):
    """Security (B3): дефолтные секреты закоммичены в репо. В production
    (URTRUCK_ENV=production) отказываем в доступе, пока не задан реальный
    секрет через env — иначе защищённые эндпоинты открыты известным ключом.
    Dev/preview работают как раньше. Срабатывает только если реально оставлен
    дефолт, поэтому рабочую конфигурацию не ломает."""
    if _IS_PROD and value == default:
        raise HTTPException(
            status_code=503,
            detail=f"{kind} не сконфигурирован для production (задайте env-секрет).",
        )


def require_api_key(request: Request):
    _block_default_in_prod("URTRUCK_API_KEY", API_KEY, _DEFAULT_API_KEY)
    key = request.headers.get("X-API-Key")
    if not key and not _IS_PROD:
        key = request.query_params.get("api_key")
    if not key or not secrets.compare_digest(key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def require_admin(request: Request):
    _block_default_in_prod("URTRUCK_ADMIN_TOKEN", ADMIN_TOKEN, _DEFAULT_ADMIN_TOKEN)
    token = request.headers.get("X-Admin-Token")
    if not token and not _IS_PROD:
        token = request.query_params.get("admin_token")
    if not token or not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="Admin token required")


def optional_api_key(request: Request) -> bool:
    """Опциональная проверка — возвращает True если ключ валидный."""
    key = request.headers.get("X-API-Key")
    if not key and not _IS_PROD:
        key = request.query_params.get("api_key")
    return bool(key and secrets.compare_digest(key, API_KEY))
