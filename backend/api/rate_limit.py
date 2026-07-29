"""Простой rate limiter на in-memory dict.
В scale-режиме заменить на Redis (redis.incr + expire).
"""
import time
from collections import defaultdict, deque
from fastapi import HTTPException


# key → deque[timestamps]
_store = defaultdict(deque)


def check_rate(key: str, max_per_window: int, window_sec: int) -> bool:
    """Возвращает True если запрос разрешён, иначе кидает 429."""
    now = time.time()
    q = _store[key]
    # Чистим старые
    while q and q[0] < now - window_sec:
        q.popleft()
    if len(q) >= max_per_window:
        retry_after = int(q[0] + window_sec - now) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много запросов. Подожди {retry_after} сек.",
            headers={"Retry-After": str(retry_after)},
        )
    q.append(now)
    return True


def limit_otp_send(phone: str):
    """Не чаще 1 OTP в 60 секунд на phone."""
    check_rate(f"otp_send:{phone}", max_per_window=1, window_sec=60)
    # Ещё общий лимит на весь phone — не более 5 OTP в час
    check_rate(f"otp_send_hour:{phone}", max_per_window=5, window_sec=3600)


def limit_otp_verify(phone: str):
    """Не более 5 попыток verify в 10 минут — защита от брутфорса кодов."""
    check_rate(f"otp_verify:{phone}", max_per_window=5, window_sec=600)


def limit_guest_create(ip: str):
    """Не больше 20 guest-сессий в час с одного IP."""
    check_rate(f"guest:{ip}", max_per_window=20, window_sec=3600)


def limit_review_create(user_id: str):
    """Не больше 10 отзывов в час от одного пользователя."""
    check_rate(f"review:{user_id}", max_per_window=10, window_sec=3600)


def limit_report_create(user_id: str):
    """Не больше 5 жалоб на водителей в час от одного пользователя (анти-абьюз)."""
    check_rate(f"report:{user_id}", max_per_window=5, window_sec=3600)
