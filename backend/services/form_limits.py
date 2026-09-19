"""Ограничения форм до разбора файлов и проверки зависимостей FastAPI."""
import asyncio
import time

from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse


class FormLimitsMiddleware:
    # Самый большой разрешённый файл — 15 МиБ; запас оставлен под поля формы.
    def __init__(self, app, max_bytes=16 * 1024 * 1024, timeout=120, max_concurrent=8):
        self.app = app
        self.max_bytes = max_bytes
        self.timeout = timeout
        self.max_concurrent = max_concurrent
        self.active = 0

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        mime = headers.get(b"content-type", b"").split(b";", 1)[0].strip().lower()
        if scope["type"] != "http" or mime not in (
            b"multipart/form-data", b"application/x-www-form-urlencoded"
        ):
            return await self.app(scope, receive, send)

        async def reject(status):
            details = {400: "Invalid content length", 413: "Form too large",
                       408: "Form upload timed out", 503: "Too many uploads"}
            response = JSONResponse({"detail": details[status]}, status_code=status,
                                    headers={"Retry-After": "5"} if status == 503 else None)
            await response(scope, receive, send)

        try:
            length = int(headers.get(b"content-length", b"0"))
            if length < 0:
                raise ValueError
        except ValueError:
            return await reject(400)
        if length > self.max_bytes:
            return await reject(413)
        # Проверка и занятие слота без await: атомарно внутри ASGI worker.
        if self.active >= self.max_concurrent:
            return await reject(503)
        self.active += 1
        deadline = time.monotonic() + self.timeout
        seen = 0
        violation = None

        async def limited_receive():
            nonlocal seen, violation
            try:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise asyncio.TimeoutError
                message = await asyncio.wait_for(receive(), remaining)
            except asyncio.TimeoutError:
                violation = 408
                raise MultiPartException("Form upload timed out") from None
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    violation = 413
                    # Starlette закрывает все временные файлы при исключении.
                    raise MultiPartException("Form too large")
            return message

        async def limited_send(message):
            # FastAPI может преобразовать ошибку парсера в 400; сохраняем
            # точный 413/408 вместо этого промежуточного ответа.
            if violation is None:
                await send(message)

        try:
            await self.app(scope, limited_receive, limited_send)
        except Exception:
            if violation is None:
                raise
        finally:
            self.active -= 1
        if violation is not None:
            await reject(violation)
