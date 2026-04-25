"""Rate limiting через Redis (опционально)."""
import time
from fastapi import Request, HTTPException
import redis
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

try:
    r = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
    r.ping()
    REDIS_OK = True
except Exception:
    REDIS_OK = False


async def rate_limit(request: Request, limit: int = 120, window: int = 60):
    """Лимит: 120 запросов в минуту с одного IP."""
    if not REDIS_OK:
        return
    ip = request.client.host
    key = f"rl:{ip}:{int(time.time() // window)}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, window)
    if count > limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


def cache_get(key: str):
    if not REDIS_OK:
        return None
    return r.get(key)


def cache_set(key: str, value: str, ttl: int = None):
    if not REDIS_OK:
        return
    r.set(key, value, ex=ttl or config.CACHE_TTL_SECONDS)
