"""HTTP-клиент к публичным реестрам cgr.qoldau.kz.

Только GET, только публичные URL, честный User-Agent (TZ §4.1, §4.2).
"""
import asyncio
import logging
from typing import Any

import httpx

from .exceptions import (
    CGRException,
    CGRForbiddenError,
    CGRNotAvailableError,
    CGRRateLimitError,
)
from .settings import cgr_settings

logger = logging.getLogger("cgr.client")


class CGRClient:
    """Async-клиент. Один shared instance на процесс (см. DECISIONS §9)."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._consecutive_5xx = 0

    async def _ensure(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=cgr_settings.base_url,
                timeout=httpx.Timeout(
                    connect=10.0,
                    read=float(cgr_settings.request_timeout_sec),
                    write=10.0,
                    pool=10.0,
                ),
                headers={"User-Agent": cgr_settings.user_agent},
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def get(self, path: str, params: dict | None = None) -> httpx.Response:
        """GET к CGR с обработкой 429/403/5xx.

        Retry для 5xx — на стороне caller (через tenacity в сервисах).
        Здесь — только классификация ошибок в специфичные CGRException.
        """
        client = await self._ensure()
        try:
            r = await client.get(path, params=params)
        except httpx.RequestError as e:
            self._consecutive_5xx += 1
            if self._consecutive_5xx >= 5:
                logger.error("cgr: 5+ consecutive network errors — likely unavailable")
                raise CGRNotAvailableError(str(e)) from e
            raise CGRException(f"network error: {e}") from e

        if r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", "60"))
            logger.warning("cgr: 429 rate limit, sleeping %ds", retry_after)
            await asyncio.sleep(min(retry_after, 300))
            raise CGRRateLimitError(retry_after_sec=retry_after)

        if r.status_code == 403:
            logger.error("cgr: 403 Forbidden — IP blocked or anti-bot triggered")
            raise CGRForbiddenError(f"403 from {path}")

        if 500 <= r.status_code < 600:
            self._consecutive_5xx += 1
            if self._consecutive_5xx >= 5:
                raise CGRNotAvailableError(f"5xx repeated ({r.status_code})")
            raise CGRException(f"5xx from {path}: {r.status_code}")

        # success path
        self._consecutive_5xx = 0
        r.raise_for_status()
        return r

    # --- High-level helpers ---
    async def fetch_scoreboard(self) -> str | dict:
        """Возвращает сырой контент (HTML или JSON). Парсинг в parsers.py."""
        r = await self.get("/ru/registry/scoreboard")
        ct = r.headers.get("content-type", "")
        return r.json() if "json" in ct else r.text

    async def fetch_booking_lookup(self, booking_number: str) -> str | dict:
        # TODO: после разведки 1.2 — заменить params на реальный формат
        r = await self.get("/ru/registry/public-list", params={"q": booking_number})
        ct = r.headers.get("content-type", "")
        return r.json() if "json" in ct else r.text

    async def fetch_blocklist_page(self, page: int = 1) -> str | dict:
        # TODO: после разведки 1.4 — заменить на реальную пагинацию
        r = await self.get("/ru/information/blocked-users", params={"page": page})
        ct = r.headers.get("content-type", "")
        return r.json() if "json" in ct else r.text


# Singleton — main.py закрывает на shutdown.
cgr_client = CGRClient()
