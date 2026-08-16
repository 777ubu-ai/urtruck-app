"""Lazy driver-facing Border endpoints.

/catalog is DB-only and intentionally cheap.
/live/{code} contacts CGR only after the driver taps a checkpoint.
"""
from fastapi import APIRouter, HTTPException, Query

from cgr.settings import cgr_settings
from cgr import checkpoint_detail_service

lazy_border_router = APIRouter()


@lazy_border_router.get("/catalog")
def border_catalog(country: str = ""):
    """Lightweight checkpoint catalogue. No CGR/network requests here."""
    code = (country or "").strip().upper()
    rows = checkpoint_detail_service.catalog()
    if code and code != "ALL":
        rows = [row for row in rows if str(row.get("country") or "").upper() == code]
    countries: dict[str, int] = {}
    for row in checkpoint_detail_service.catalog():
        cc = str(row.get("country") or "XX").upper()
        countries[cc] = countries.get(cc, 0) + 1
    return {
        "checkpoints": rows,
        "countries": [{"country": cc, "count": count} for cc, count in sorted(countries.items())],
        "lazy": True,
        "cgr_requests": 0,
    }


@lazy_border_router.get("/live/{code}")
async def border_live_detail(code: str, force: bool = Query(False)):
    """Fetch/cache live CGR data for exactly one selected checkpoint."""
    if not cgr_settings.feature_enabled:
        raise HTTPException(status_code=503, detail="CGR feature disabled")
    try:
        detail, cache_hit = await checkpoint_detail_service.live_detail(code, force=force)
    except KeyError:
        raise HTTPException(status_code=404, detail="Пункт пропуска не найден")
    except Exception as exc:  # fail closed; do not expose parser/network internals
        raise HTTPException(status_code=502, detail="CGR временно недоступен") from exc
    return {**detail, "cache_hit": cache_hit, "cache_ttl_sec": 300}
