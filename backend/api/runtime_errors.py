"""Uniform, truthful responses for transient runtime failures."""
from fastapi import Request
from fastapi.responses import JSONResponse

from database.db import DatabaseBusyError


def install_runtime_error_handlers(app) -> None:
    @app.exception_handler(DatabaseBusyError)
    async def database_busy_handler(_request: Request, _exc: DatabaseBusyError):
        # A retryable 503 is actionable for the client.  Returning a generic
        # 500 made Android wait for its local timeout and show “network error”.
        return JSONResponse(
            status_code=503,
            content={"detail": {"code": "database_busy", "retryable": True}},
            headers={"Retry-After": "1"},
        )
