"""API погранпереходов, очередей и CGR-броней."""
import logging
import sys
import time as _time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from services.border_service import get_border, search_borders, get_borders_grouped

logger = logging.getLogger("api.borders")
borders_router = APIRouter()


def _current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization required")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty token")
    return token


def _cgr_enabled() -> bool:
    try:
        from cgr.settings import cgr_settings
        return bool(cgr_settings.feature_enabled)
    except Exception:
        return False


def _load_color(q: int | None) -> str:
    if q is None:
        return "gray"
    if q <= 15:
        return "green"
    if q <= 60:
        return "yellow"
    return "red"


def _load_status(q: int | None) -> str:
    """Driver-facing load buckets; null is never converted to zero."""
    if q is None:
        return "no_data"
    if q <= 15:
        return "free"
    if q <= 40:
        return "moderate"
    if q <= 80:
        return "busy"
    return "very_busy"


def _crossing_from_checkpoint(c: dict) -> dict:
    """Convert the canonical scoreboard row into the mobile/web card model."""
    q = c["directions"]["in"]["queue_length"]
    fresh = c.get("status")
    if fresh == "ok":
        load_status = _load_status(q)
        shown_q = q
    elif fresh == "stale":
        load_status = "stale"
        shown_q = None
    else:
        load_status = "no_data"
        shown_q = None
    return {
        "id": c["code"],
        "code": c["code"],
        "name": c["name_ru"],
        "name_en": c.get("name_en"),
        "name_kz": c.get("name_kz"),
        "name_cn": c.get("name_cn"),
        "country": c.get("country_to"),
        "trucks_in_queue": shown_q,
        "load_status": load_status,
        "freshness": fresh,
        "estimated_wait_hours": None,
        "updated_at": c.get("last_updated"),
        "source_type": "official",
        "daily_capacity": c.get("daily_capacity"),
        "waiting_area_count": c.get("waiting_area_count"),
        "next_available_booking": c.get("next_available_booking"),
        "booking_url": c.get("booking_url"),
        "cgr_checkpoint_id": c.get("cgr_checkpoint_id"),
    }


@borders_router.get("/scoreboard")
def get_scoreboard():
    """Canonical current checkpoint board."""
    if not _cgr_enabled():
        legacy = search_borders(None)
        checkpoints = []
        for b in legacy:
            wait_h = b.get("estimated_wait_hours")
            checkpoints.append({
                "code": b["id"],
                "name_ru": b["name"],
                "name_en": b.get("name_en"),
                "country_to": b["countries"].split("↔")[-1] if "↔" in b.get("countries", "") else "",
                "directions": {
                    "in": {
                        "queue_length": b.get("trucks_in_queue"),
                        "estimated_wait_minutes": int(wait_h * 60) if wait_h is not None else None,
                    },
                    "out": {"queue_length": None, "estimated_wait_minutes": None},
                },
                "status": "legacy_mock",
                "last_updated": b.get("updated_at"),
                "daily_capacity": None,
                "waiting_area_count": None,
                "next_available_booking": None,
            })
        return {"fetched_at": None, "checkpoints": checkpoints}

    from cgr import scoreboard_service
    return scoreboard_service.build_scoreboard_response()


@borders_router.get("/best")
def best_crossing(country: str = ""):
    """Best reliable crossing by the smallest *current* CGR queue."""
    if not _cgr_enabled():
        return {"best": None, "reason": "source_unavailable"}
    from cgr import scoreboard_service
    board = scoreboard_service.build_scoreboard_response()
    code = (country or "").upper()
    candidates = []
    for c in board["checkpoints"]:
        if code and code not in ("", "ALL") and c.get("country_to") != code:
            continue
        if c.get("status") != "ok":
            continue
        q = c["directions"]["in"]["queue_length"]
        if q is None:
            continue
        candidates.append((q, c))
    if not candidates:
        return {"best": None, "reason": "no_reliable_data"}
    candidates.sort(key=lambda item: item[0])
    return {"best": _crossing_from_checkpoint(candidates[0][1]), "source_type": "official"}


@borders_router.get("/countries")
def list_countries():
    """Country catalogue plus honest fresh/no-data counts."""
    if not _cgr_enabled():
        from services.border_service import BORDERS
        agg: dict[str, int] = {}
        for b in BORDERS:
            cc = b.get("country_to") or b.get("country") or "XX"
            agg[cc] = agg.get(cc, 0) + 1
        return {"countries": [
            {"country": k, "crossings": v, "has_live_data": False,
             "free": 0, "moderate": 0, "busy": 0, "very_busy": 0,
             "no_data": v, "updated_at": None}
            for k, v in sorted(agg.items())
        ]}

    from cgr import scoreboard_service
    board = scoreboard_service.build_scoreboard_response()
    by_country: dict[str, dict] = {}
    for c in board["checkpoints"]:
        cc = c.get("country_to") or "XX"
        d = by_country.setdefault(
            cc,
            {"country": cc, "crossings": 0, "has_live_data": True,
             "free": 0, "moderate": 0, "busy": 0, "very_busy": 0,
             "no_data": 0, "updated_at": None},
        )
        d["crossings"] += 1
        card = _crossing_from_checkpoint(c)
        st = card["load_status"]
        if st in ("free", "moderate", "busy", "very_busy"):
            d[st] += 1
        else:
            d["no_data"] += 1
        u = card["updated_at"]
        if u and (d["updated_at"] is None or u > d["updated_at"]):
            d["updated_at"] = u
    return {"countries": [by_country[k] for k in sorted(by_country)]}


@borders_router.get("/lookup")
async def lookup_by_plate(plate: str = ""):
    """Live public CGR status for one vehicle plate."""
    plate = (plate or "").strip()
    if len(plate) < 3:
        raise HTTPException(status_code=422, detail="Укажите госномер (ГРНЗ)")
    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            raise HTTPException(status_code=503, detail="CGR feature disabled")
        from cgr import booking_service
        return await booking_service.lookup_by_plate(plate)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("lookup_by_plate failed: %s", exc)
        raise HTTPException(status_code=502, detail="CGR недоступен, попробуйте позже")


@borders_router.get("/grouped")
def list_borders_grouped(q: str | None = None):
    return {"groups": get_borders_grouped(q)}


class CreateBookingBody(BaseModel):
    trip_id: str | None = None
    booking_number: str = Field(min_length=3, max_length=64)
    checkpoint_code: str | None = None


@borders_router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(body: CreateBookingBody, user_id: str = Depends(_current_user_id)):
    try:
        from cgr import booking_service
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            raise HTTPException(status_code=503, detail="CGR feature disabled")
        return booking_service.create_booking(
            urtruck_user_id=user_id,
            urtruck_trip_id=body.trip_id,
            booking_number=body.booking_number,
            checkpoint_code=body.checkpoint_code,
        )
    except HTTPException:
        raise
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(status_code=409, detail="Booking number already attached")
        logger.exception("create_booking failed")
        raise HTTPException(status_code=500, detail="Internal error")


@borders_router.get("/bookings/active")
def get_my_active_bookings(user_id: str = Depends(_current_user_id)):
    from database import cgr_dal
    return {"bookings": [
        b for b in cgr_dal.get_active_bookings() if b["urtruck_user_id"] == user_id
    ]}


@borders_router.get("/bookings/{booking_id}")
def get_booking(booking_id: int, user_id: str = Depends(_current_user_id)):
    from database import cgr_dal
    b = cgr_dal.get_booking(booking_id)
    if not b or b["urtruck_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


@borders_router.get("")
def list_borders(country: str = ""):
    """Checkpoint cards used by the Border carousel."""
    if not _cgr_enabled():
        return {"borders": search_borders(country or None)}

    from cgr import scoreboard_service
    board = scoreboard_service.build_scoreboard_response()
    code = (country or "").upper()
    out = []
    for c in board["checkpoints"]:
        if code and code not in ("ALL",) and c.get("country_to") != code:
            continue
        # Do not use ``or 0`` here: no data and a confirmed CGR zero are
        # different states and the UI must be able to distinguish them.
        q = c["directions"]["in"]["queue_length"]
        out.append({
            "id": c["code"],
            "name": c["name_ru"],
            "name_en": c.get("name_en"),
            "country": c.get("country_to"),
            "countries": f"KZ↔{c.get('country_to')}" if c.get("country_to") not in (None, "", "XX") else "KZ",
            "type": None,
            "trucks_in_queue": q,
            "estimated_wait_hours": None,
            "status": _load_color(q),
            "updated_at": c.get("last_updated"),
            "source": "cgr",
            "source_type": "official",
            "daily_capacity": c.get("daily_capacity"),
            "waiting_area_count": c.get("waiting_area_count"),
            "next_available_booking": c.get("next_available_booking"),
            "booking_url": c.get("booking_url"),
            "cgr_checkpoint_id": c.get("cgr_checkpoint_id"),
        })

    # Known queues first; within them show the busiest first. Unknown data is
    # placed at the end rather than masquerading as an empty queue.
    out.sort(key=lambda b: (
        b["trucks_in_queue"] is None,
        -(b["trucks_in_queue"] if b["trucks_in_queue"] is not None else -1),
    ))
    return {"borders": out}


class WatchIn(BaseModel):
    plate: str


@borders_router.post("/watch")
def add_queue_watch(body: WatchIn, user_id: str = Depends(_current_user_id)):
    from cgr import queue_watch
    ok = queue_watch.add_watch(user_id, body.plate)
    if not ok:
        raise HTTPException(status_code=400, detail="Некорректный госномер")
    return {"ok": True}


@borders_router.delete("/watch")
def remove_queue_watch(plate: str, user_id: str = Depends(_current_user_id)):
    from cgr import queue_watch
    queue_watch.remove_watch(user_id, plate)
    return {"ok": True}


@borders_router.get("/watch")
def list_queue_watches(user_id: str = Depends(_current_user_id)):
    from cgr import queue_watch
    return {"watches": queue_watch.list_watches(user_id)}


_BOARD_CACHE: dict = {}
_BOARD_TTL = 60


@borders_router.get("/board")
async def get_board(checkpoint: str = "", status: str = ""):
    """Public CGR booking rows for a selected checkpoint/plate workflow."""
    if not _cgr_enabled():
        return {"rows": [], "enabled": False}

    key = ((checkpoint or "").strip().lower(), (status or "").strip())
    now = _time.time()
    hit = _BOARD_CACHE.get(key)
    if hit and now - hit[0] < _BOARD_TTL:
        return hit[1]

    try:
        from cgr import scoreboard_service
        rows = await scoreboard_service.fetch_board_rows(
            checkpoint=checkpoint or None,
            status=status or None,
        )
        out = {
            "rows": [{
                "checkpoint": r.get("checkpoint"),
                "plate": r.get("plate"),
                "queue_datetime": r.get("queue_datetime"),
                "status": r["status"]["code"],
                "is_late": r["status"]["is_late"],
                "status_raw": r["status"]["raw"],
            } for r in rows],
            "enabled": True,
        }
        out["count"] = len(out["rows"])
        _BOARD_CACHE[key] = (now, out)
        return out
    except Exception as exc:
        logger.exception("board failed: %s", exc)
        return {"rows": [], "enabled": True, "error": True}


@borders_router.get("/{border_id}")
def border_detail(border_id: str):
    b = get_border(border_id)
    if not b:
        return {"error": "Погранпереход не найден"}
    return b
