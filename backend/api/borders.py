"""API погранпереходов, очередей и CGR-броней.

Подключается в main.py под prefix '/api/v1/borders'.

Маршруты (порядок важен — конкретные ДО /{border_id}):
  GET  /api/v1/borders/scoreboard           — live-табло загруженности (TZ §3.1)
  GET  /api/v1/borders/                     — список ПП (legacy + DB)
  POST /api/v1/borders/bookings             — привязать номер брони (TZ §3.2)
  GET  /api/v1/borders/bookings/active      — мои активные брони
  GET  /api/v1/borders/bookings/{id}        — статус конкретной брони
  GET  /api/v1/borders/{border_id}          — детали одного ПП (legacy)
"""
import logging
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from services.border_service import get_all_borders, get_border, search_borders, get_borders_grouped
from api.verification_gate import get_user
from database import registration_dal as reg_dal

logger = logging.getLogger("api.borders")

borders_router = APIRouter()


def _mask_plate(value: str | None) -> str | None:
    normalized = "".join(ch for ch in str(value or "").upper() if ch.isalnum())
    if not normalized:
        return None
    visible = normalized[-2:] if len(normalized) > 2 else normalized[-1:]
    return f"***{visible}"


def _limit_public_cgr(request: Request, scope: str, max_requests: int) -> None:
    """Persistent per-client limit; database receives only a SHA-256 digest."""
    peer = request.client.host if request.client else "unknown"
    agent = request.headers.get("user-agent", "")[:160]
    digest = hashlib.sha256(f"{scope}|{peer}|{agent}".encode("utf-8")).hexdigest()
    from database import cgr_dal
    if not cgr_dal.consume_public_rate_limit(digest, max_requests=max_requests, window_sec=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many CGR requests",
            headers={"Retry-After": "60"},
        )


# ----------------------------------------------------------------
# Auth helper — тот же verified session contract, что marketplace/profile.
# ----------------------------------------------------------------
def _current_user_id(user: dict = Depends(get_user)) -> str:
    """Return only the stable user ID resolved from a live reg_session."""
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return str(user_id)


def _require_driver(user_id: str) -> None:
    user = reg_dal.get_driver(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    if user.get("role") != "driver":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Driver role required")


# ----------------------------------------------------------------
# CGR scoreboard (TZ §3.1) — конкретный путь ДО /{border_id}
# ----------------------------------------------------------------
@borders_router.get("/scoreboard")
def get_scoreboard(request: Request):
    """Live-табло загруженности с CGR.

    Если CGR_FEATURE_ENABLED=true — отдаём только официальный cgr_scoreboard.
    Disabled/unavailable никогда не подменяется legacy/mock числами.
    """
    try:
        from cgr.settings import cgr_settings
    except Exception:
        cgr_settings = None

    if cgr_settings is None or not cgr_settings.feature_enabled:
        return {
            "enabled": False,
            "fetched_at": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_updated_at": None,
            "source_type": "official",
            "source_status": "disabled",
            "checkpoints": [],
        }

    _limit_public_cgr(request, "scoreboard", max_requests=120)

    from cgr import scoreboard_service
    return scoreboard_service.build_scoreboard_response()


# ----------------------------------------------------------------
# Личный статус водителя по госномеру (Поток А, публичные данные CGR).
# Конкретный путь ДО /{border_id}.
# ----------------------------------------------------------------
def _load_color(q: int | None) -> str:
    """Цвет загрузки по реальной длине очереди (времени ожидания CGR не даёт)."""
    if q is None:
        return "gray"
    if q <= 15:
        return "green"
    if q <= 60:
        return "yellow"
    return "red"


def _load_status(q: int | None) -> str:
    """Border-dashboard v1: понятный статус загрузки по реальной длине очереди.
    Вокабуляр: free / moderate / busy / very_busy / no_data.
    'closed' и 'stale' определяются отдельно (freshness/is_active), не по числу."""
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
    """Единая карточка КПП для dashboard из checkpoint+scoreboard.
    freshness: 'ok'|'stale'|'unavailable' (из build_scoreboard_response).
    Если данные не свежие (не 'ok') — очередь/статус НЕ выдаём как текущие."""
    q = c["directions"]["in"]["queue_length"]
    fresh = c.get("status")  # ok|stale|unavailable
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
        "load_status": load_status,      # free|moderate|busy|very_busy|no_data|stale
        "freshness": fresh,              # ok|stale|unavailable
        "estimated_wait_hours": None,    # CGR public-list не даёт ETA
        "updated_at": c.get("last_updated"),
        "source_type": "official",       # CGR = официальный реестр CarGoRuqsat
    }


def _cgr_enabled() -> bool:
    try:
        from cgr.settings import cgr_settings
        return bool(cgr_settings.feature_enabled)
    except Exception:
        return False


@borders_router.get("/best")
def best_crossing(country: str = ""):
    """Border-dashboard v1: лучший переход СЕЙЧАС по реальным данным.
    Строго: только свежие (freshness=='ok') КПП с известной длиной очереди;
    stale / no_data / неактивные исключаются. Сортировка queue ASC. Если
    надёжных данных нет — best=null (UI не показывает блок; НЕ выдумываем)."""
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
            continue  # stale/unavailable исключаем
        q = c["directions"]["in"]["queue_length"]
        if q is None:
            continue  # no_data исключаем
        candidates.append((q, c))
    if not candidates:
        return {"best": None, "reason": "no_reliable_data"}
    candidates.sort(key=lambda t: t[0])
    return {"best": _crossing_from_checkpoint(candidates[0][1]), "source_type": "official"}


@borders_router.get("/countries")
def list_countries():
    """Border-dashboard v1: страны + агрегат статусов КПП по реальным данным.
    Возвращает по каждой стране: всего КПП, счётчики free/moderate/busy/
    very_busy/no_data (только по свежим), самое свежее updated_at."""
    if not _cgr_enabled():
        # legacy: только количество переходов, без статусов (нет реальных данных)
        from services.border_service import BORDERS
        agg: dict[str, int] = {}
        for b in BORDERS:
            cc = b.get("country_to") or b.get("country") or "XX"
            agg[cc] = agg.get(cc, 0) + 1
        return {"countries": [{"country": k, "crossings": v, "has_live_data": False,
                               "free": 0, "moderate": 0, "busy": 0, "very_busy": 0,
                               "no_data": v, "updated_at": None} for k, v in sorted(agg.items())]}
    from cgr import scoreboard_service
    board = scoreboard_service.build_scoreboard_response()
    by_country: dict[str, dict] = {}
    for c in board["checkpoints"]:
        cc = c.get("country_to") or "XX"
        d = by_country.setdefault(cc, {"country": cc, "crossings": 0, "has_live_data": True,
                                       "free": 0, "moderate": 0, "busy": 0, "very_busy": 0,
                                       "no_data": 0, "updated_at": None})
        d["crossings"] += 1
        card = _crossing_from_checkpoint(c)
        st = card["load_status"]
        if st in ("free", "moderate", "busy", "very_busy"):
            d[st] += 1
        else:
            d["no_data"] += 1  # stale тоже считаем как «нет актуальных»
        u = card["updated_at"]
        if u and (d["updated_at"] is None or u > d["updated_at"]):
            d["updated_at"] = u
    return {"countries": [by_country[k] for k in sorted(by_country)]}


@borders_router.get("/lookup")
async def lookup_by_plate(request: Request, plate: str = ""):
    """Статус машины в электронной очереди по госномеру (ГРНЗ).

    Публичные данные CGR (без авторизации, без чужих ПДн). Водитель вводит
    свой номер — видит свой реальный статус. В реестре нет «номера брони»,
    поэтому ищем по ГРНЗ.
    """
    plate = (plate or "").strip()
    if len(plate) < 3:
        raise HTTPException(status_code=422, detail="Укажите госномер (ГРНЗ)")
    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            raise HTTPException(status_code=503, detail="CGR feature disabled")
        _limit_public_cgr(request, "lookup", max_requests=10)
        from cgr import booking_service
        result = await booking_service.lookup_by_plate(plate)
        # The caller already knows the searched plate. Do not echo a stable
        # public identifier or raw upstream status text back to scrapers.
        result = dict(result or {})
        result["plate"] = _mask_plate(plate)
        result.pop("status_raw", None)
        result["source_type"] = "official"
        # CGR lookup response has no publication timestamp. Record when we
        # fetched it, but never present response time as source_updated_at.
        result["source_updated_at"] = None
        result["source_fetched_at"] = datetime.now(timezone.utc).isoformat()
        result["generated_at"] = datetime.now(timezone.utc).isoformat()
        return result
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — наружу не светим CGR-детали
        logger.exception("lookup_by_plate failed: %s", e)
        raise HTTPException(status_code=502, detail="CGR недоступен, попробуйте позже")


# ----------------------------------------------------------------
# Электронная очередь — переходы, сгруппированные по стране (ТЗ §0.2).
# Конкретный путь ДО /{border_id}.
# ----------------------------------------------------------------
@borders_router.get("/grouped")
def list_borders_grouped(q: str | None = None):
    """Список погранпереходов РК, сгруппированный по стране-соседу
    (CN/RU/UZ/KG/TM) для accordion-экрана «Электронная очередь».
    q — необязательный поиск по названию перехода."""
    return {"groups": get_borders_grouped(q)}


# ----------------------------------------------------------------
# CGR bookings (TZ §3.2)
# ----------------------------------------------------------------
class CreateBookingBody(BaseModel):
    trip_id: str | None = None
    booking_number: str = Field(min_length=3, max_length=64)
    checkpoint_code: str | None = None


@borders_router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(body: CreateBookingBody, user_id: str = Depends(_current_user_id)):
    _require_driver(user_id)
    from database import cgr_dal
    if body.trip_id and cgr_dal.trip_driver_id(body.trip_id) != user_id:
        # 404 avoids disclosing whether another driver's trip exists.
        raise HTTPException(status_code=404, detail="Trip not found")
    try:
        from cgr import booking_service
    except Exception as e:
        logger.exception("cgr.booking_service unavailable: %s", e)
        raise HTTPException(status_code=503, detail="CGR module not available")

    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            raise HTTPException(status_code=503, detail="CGR feature disabled")
    except ImportError:
        pass

    # TODO: после разведки 1.2 — добавить validate_booking_number_format(body.booking_number)

    try:
        result = booking_service.create_booking(
            urtruck_user_id=user_id,
            urtruck_trip_id=body.trip_id,
            booking_number=body.booking_number,
            checkpoint_code=body.checkpoint_code,
        )
    except Exception as e:
        # UNIQUE constraint = 409
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail="Booking number already attached")
        logger.exception("create_booking failed")
        raise HTTPException(status_code=500, detail="Internal error")

    return result


@borders_router.get("/bookings/active")
def get_my_active_bookings(user_id: str = Depends(_current_user_id)):
    from database import cgr_dal
    return {"bookings": cgr_dal.get_active_bookings_for_user(user_id)}


@borders_router.get("/bookings/{booking_id}")
def get_booking(booking_id: int, user_id: str = Depends(_current_user_id)):
    from database import cgr_dal
    b = cgr_dal.get_booking_for_user(booking_id, user_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


# ----------------------------------------------------------------
# Legacy endpoints (остаются для обратной совместимости).
# Перевод на DB-only — после полной QA-приёмки seed (см. DECISIONS §6).
# ----------------------------------------------------------------
@borders_router.get("")
def list_borders(country: str = ""):
    """Все погранпереходы с текущими очередями.

    CGR включён → реальные данные из cgr_scoreboard (длина очереди по постам,
    цвет загрузки по числу машин). Иначе → legacy fallback.
    """
    try:
        from cgr.settings import cgr_settings
        enabled = cgr_settings.feature_enabled
    except Exception:
        enabled = False

    if not enabled:
        return {"borders": search_borders(country or None)}

    from cgr import scoreboard_service
    board = scoreboard_service.build_scoreboard_response()
    code = (country or "").upper()
    out = []
    for c in board["checkpoints"]:
        if code and code not in ("ALL",) and c.get("country_to") != code:
            continue
        card = _crossing_from_checkpoint(c)
        q = card["trucks_in_queue"]
        out.append({
            "id": c["code"],
            "name": c["name_ru"],
            "name_en": c.get("name_en"),
            "country": c.get("country_to"),
            "countries": f"KZ↔{c.get('country_to')}" if c.get("country_to") not in (None, "", "XX") else "KZ",
            "type": None,
            "trucks_in_queue": q,
            "estimated_wait_hours": None,  # публичные данные CGR не дают времени
            "status": _load_color(q),
            "updated_at": c.get("last_updated"),
            "source": "cgr",
            "source_type": "official",
            "freshness": card["freshness"],
        })
    # самые загруженные сверху — водителю это важнее всего
    out.sort(key=lambda b: -(b["trucks_in_queue"] or 0))
    return {"borders": out}


# ── Пуш-алерт «очередь подошла»: watch по ГРНЗ ───────────────────────────
class WatchIn(BaseModel):
    plate: str


@borders_router.post("/watch")
def add_queue_watch(body: WatchIn, user_id: str = Depends(_current_user_id)):
    """Следить за своим номером → пуш при смене статуса в очереди CGR."""
    _require_driver(user_id)
    from cgr import queue_watch
    ok = queue_watch.add_watch(user_id, body.plate)
    if not ok:
        raise HTTPException(status_code=400, detail="Некорректный госномер")
    return {"ok": True}


@borders_router.delete("/watch")
def remove_queue_watch(plate: str, user_id: str = Depends(_current_user_id)):
    _require_driver(user_id)
    from cgr import queue_watch
    queue_watch.remove_watch(user_id, plate)
    return {"ok": True}


@borders_router.get("/watch")
def list_queue_watches(user_id: str = Depends(_current_user_id)):
    _require_driver(user_id)
    from cgr import queue_watch
    return {"watches": queue_watch.list_watches(user_id)}


# ── Трек 1: полное онлайн-табло (номера + статус по пункту) ──────────────
# Кэш 60с: /board живо фетчит несколько страниц HTML у CGR — без кэша тап по
# каждому пункту дёргал бы CGR заново. Ключ = (checkpoint, status).
import time as _time
_BOARD_CACHE: dict = {}
_BOARD_TTL = 60


@borders_router.get("/board")
async def get_board(request: Request, checkpoint: str = "", status: str = ""):
    """Полное онлайн-табло CGR: строки очереди (ГРНЗ + статус + слот времени)
    по пунктам пропуска. ПУБЛИЧНО (данные public-list, без авторизации).
    Фильтр: checkpoint (подстрока названия), status."""
    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            return {"rows": [], "enabled": False, "source_type": "official",
                    "source_status": "disabled", "source_updated_at": None}
    except Exception:
        return {"rows": [], "enabled": False, "source_type": "official", "source_status": "disabled", "source_updated_at": None}

    _limit_public_cgr(request, "board", max_requests=30)

    key = ((checkpoint or "").strip().lower(), (status or "").strip())
    now = _time.time()
    hit = _BOARD_CACHE.get(key)
    if hit and now - hit[0] < _BOARD_TTL:
        return hit[1]

    try:
        from cgr import scoreboard_service
        rows = await scoreboard_service.fetch_board_rows(
            checkpoint=checkpoint or None, status=status or None)
        out = {
            "rows": [{
                "checkpoint": r.get("checkpoint"),
                "plate": _mask_plate(r.get("plate")),
                "queue_datetime": r.get("queue_datetime"),
                "status": r["status"]["code"],
                "is_late": r["status"]["is_late"],
            } for r in rows],
            "enabled": True,
            "source_type": "official",
            "source_status": "live",
            "source_updated_at": None,
            "source_fetched_at": datetime.now(timezone.utc).isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        out["count"] = len(out["rows"])
        _BOARD_CACHE[key] = (now, out)
        return out
    except Exception as e:
        logger.exception("board failed: %s", e)
        return {"rows": [], "enabled": True, "error": True, "source_type": "official",
                "source_status": "unavailable", "source_updated_at": None,
                "source_fetched_at": None, "generated_at": datetime.now(timezone.utc).isoformat()}


@borders_router.get("/{border_id}")
def border_detail(border_id: str):
    """Детали одного погранперехода (legacy)."""
    b = get_border(border_id)
    if not b:
        return {"error": "Погранпереход не найден"}
    return b
