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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from services.border_service import get_all_borders, get_border, search_borders, get_borders_grouped

logger = logging.getLogger("api.borders")

borders_router = APIRouter()


# ----------------------------------------------------------------
# Auth helper — общий стиль с другими эндпоинтами UrTruck.
# user_id вытаскивается из Bearer-токена (ur_reg_token). На время
# отсутствия централизованного auth-helper используем минимальный stub.
# TODO: заменить на единый Depends() когда такой появится.
# ----------------------------------------------------------------
def _current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization required")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty token")
    # TODO: верификация токена и извлечение user_id из БД registration_dal
    return token  # для MVP используем токен как user_id (как в legacy registration flow)


# ----------------------------------------------------------------
# CGR scoreboard (TZ §3.1) — конкретный путь ДО /{border_id}
# ----------------------------------------------------------------
@borders_router.get("/scoreboard")
def get_scoreboard():
    """Live-табло загруженности с CGR.

    Если CGR_FEATURE_ENABLED=true и данные свежие — отдаём из cgr_scoreboard.
    Если данных нет / устарели — фолбэк на legacy mock с пометкой status='stale'.
    """
    try:
        from cgr.settings import cgr_settings
    except Exception:
        cgr_settings = None  # CGR ещё не подключён — отдаём legacy

    if cgr_settings is None or not cgr_settings.feature_enabled:
        # Фолбэк: legacy mock
        legacy = search_borders(None)
        return {
            "fetched_at": None,
            "checkpoints": [
                {
                    "code": b["id"],
                    "name_ru": b["name"],
                    "name_en": b.get("name_en"),
                    "country_to": b["countries"].split("↔")[-1] if "↔" in b.get("countries", "") else "",
                    "directions": {
                        "in": {"queue_length": b.get("trucks_in_queue"), "estimated_wait_minutes": int(b.get("estimated_wait_hours", 0) * 60)},
                        "out": {"queue_length": None, "estimated_wait_minutes": None},
                    },
                    "status": "legacy_mock",
                    "last_updated": b.get("updated_at"),
                }
                for b in legacy
            ],
        }

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


@borders_router.get("/lookup")
async def lookup_by_plate(plate: str = ""):
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
        from cgr import booking_service
        return await booking_service.lookup_by_plate(plate)
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
    all_active = cgr_dal.get_active_bookings()
    mine = [b for b in all_active if b["urtruck_user_id"] == user_id]
    return {"bookings": mine}


@borders_router.get("/bookings/{booking_id}")
def get_booking(booking_id: int, user_id: str = Depends(_current_user_id)):
    from database import cgr_dal
    b = cgr_dal.get_booking(booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b["urtruck_user_id"] != user_id:
        # Privacy: чужие брони не отдаём (раздел 6.5 чеклиста)
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
        q = c["directions"]["in"]["queue_length"]
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
        })
    # самые загруженные сверху — водителю это важнее всего
    out.sort(key=lambda b: -(b["trucks_in_queue"] or 0))
    return {"borders": out}


# ── Трек 1: полное онлайн-табло (номера + статус по пункту) ──────────────
# Кэш 60с: /board живо фетчит несколько страниц HTML у CGR — без кэша тап по
# каждому пункту дёргал бы CGR заново. Ключ = (checkpoint, status).
import time as _time
_BOARD_CACHE: dict = {}
_BOARD_TTL = 60


@borders_router.get("/board")
async def get_board(checkpoint: str = "", status: str = ""):
    """Полное онлайн-табло CGR: строки очереди (ГРНЗ + статус + слот времени)
    по пунктам пропуска. ПУБЛИЧНО (данные public-list, без авторизации).
    Фильтр: checkpoint (подстрока названия), status."""
    try:
        from cgr.settings import cgr_settings
        if not cgr_settings.feature_enabled:
            return {"rows": [], "enabled": False}
    except Exception:
        return {"rows": [], "enabled": False}

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
    except Exception as e:
        logger.exception("board failed: %s", e)
        return {"rows": [], "enabled": True, "error": True}


@borders_router.get("/{border_id}")
def border_detail(border_id: str):
    """Детали одного погранперехода (legacy)."""
    b = get_border(border_id)
    if not b:
        return {"error": "Погранпереход не найден"}
    return b
