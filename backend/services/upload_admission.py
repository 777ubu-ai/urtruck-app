"""Bound simultaneous attachment byte buffers per API worker; never queue RAM."""
from functools import wraps
from threading import BoundedSemaphore
from fastapi import HTTPException

_slots = BoundedSemaphore(2)


def bounded_attachment_upload(function):
    @wraps(function)
    async def wrapped(*args, **kwargs):
        if not _slots.acquire(blocking=False):
            raise HTTPException(
                status_code=429,
                detail="Загрузка файлов занята. Повторите через несколько секунд.",
                headers={"Retry-After": "2"},
            )
        try:
            return await function(*args, **kwargs)
        finally:
            _slots.release()
    return wrapped
