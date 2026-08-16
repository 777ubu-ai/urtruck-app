"""Lazy driver-facing Border endpoints.

/catalog is DB-only and intentionally cheap.
/live/{code} contacts CGR only after the driver taps a checkpoint.

CGR modules are imported only inside /live so opening the Border screen does
not initialize or contact CGR at all.
"""
from fastapi import APIRouter, HTTPException, Query

lazy_border_router = APIRouter()


@lazy_border_router.get("/catalog")
def border_catalog(country: str = ""):
    """Lightweight checkpoint catalogue. No CGR imports or network requests."""
    from database import cgr_dal

    all_rows = [
        {
            "id": cp["code"],
            "code": cp["code"],
            "name": cp["name_ru"],
            "country": cp.get("country_to"),
        }
        for cp in cgr_dal.get_all_checkpoints(active_only=True)
    ]

    # Safe local fallback for a brand-new DB before the one-time CGR catalogue
    # seed completes. Still no CGR/network access on screen open.
    if not all_rows:
        from services.border_service import BORDERS
        all_rows = [
            {
                "id": b["id"],
                "code": b["id"],
                "name": b["name"],
                "country": b.get("country_to") or b.get("country") or (
                    b.get("countries", "").split("↔")[-1] if "↔" in b.get("countries", "") else None
                ),
            }
            for b in BORDERS
        ]

    code = (country or "").strip().upper()
    rows = all_rows if not code or code == "ALL" else [
        row for row in all_rows if str(row.get("country") or "").upper() == code
    ]
    countries: dict[str, int] = {}
    for row in all_rows:
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
    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            raise HTTPException(status_code=503, detail="CGR feature disabled")
        from cgr import checkpoint_detail_service
        detail, cache_hit = await checkpoint_detail_service.live_detail(code, force=force)
    except HTTPException:
        raise
    except KeyError:
        raise HTTPException(status_code=404, detail="Пункт пропуска не найден")
    except Exception as exc:  # fail closed; do not expose parser/network internals
        raise HTTPException(status_code=502, detail="CGR временно недоступен") from exc
    return {**detail, "cache_hit": cache_hit, "cache_ttl_sec": 300}
