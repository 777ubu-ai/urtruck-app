"""Marketplace API — грузы, рейсы, ставки. Серверное хранение.

Это ЯДРО приложения. Без этого юзеры не видят друг друга.
"""
import sys
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends, Query, Header, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

from database.db import get_conn, new_id
from api.verification_gate import require_level, get_user, _extract_driver
from api.push import send_to_user
from services import file_signing as _cargo_file_signing
from services import storage_service as _cargo_storage


def _sign_cargo_photos(photos):
    """Фото груза хранятся как storage-ключи; отдаём ПОДПИСАННЫЕ ссылки, чтобы
    их видел не только автор (раньше сохранялся локальный blob:/file: uri
    устройства — у другого он пустой). Уже-URL/подписанные оставляем как есть."""
    out = []
    for p in (photos or []):
        if not isinstance(p, str) or not p:
            continue
        if p.startswith(('http://', 'https://', 'data:', 'blob:', 'file:', '/security/storage/', '/storage/')):
            out.append(p)
        else:
            out.append(_cargo_file_signing.sign(p) or p)
    return out

mp_router = APIRouter()


def _maybe_user(authorization: Optional[str]) -> Optional[dict]:
    """Optional auth: return user dict if the caller passed a valid bearer
    token, otherwise None. Never raises. Used by endpoints that have both
    a public/anonymous read path AND an owner-only enriched path — e.g.
    `/market/bids` (D12: owner of cargo must see all bids, including
    QA/agent bidders that the public dirty-filter hides)."""
    if not authorization:
        return None
    try:
        return _extract_driver(authorization)
    except HTTPException:
        return None


# ═══ Public-feed hygiene ═══
#
# Tokens we never want surfacing in the public cargos/trips list. Pre-pilot
# data accumulated test artefacts (Тестер, Баке, "трусы", QA, demo, mock).
# Filter is applied AFTER the SQL fetch so the admin endpoints / DB queries
# can still see everything for moderation. Owner ALWAYS sees own listings via
# /market/my regardless of these filters.
DIRTY_TOKENS = (
    "test", "demo", "seed", "mock", "qa", "playwright",
    "тест", "тестер", "автотест",
    # Только явно тестовые слова; реальные имена (серик, boris и т.д.)
    # убраны — они скрывали настоящих пользователей из ленты (P1 bug).
)
# Date threshold below which an item must justify itself with a future
# pickup_date — anything older than this with no pickup is treated as stale
# pre-pilot leftover.
PUBLIC_CUTOFF_DATE = "2026-05-01"


def _parse_iso_date(s):
    """Try several common shapes ('YYYY-MM-DD', 'DD.MM.YYYY', ISO timestamp).

    Earlier this function sliced the input via `s[:len(fmt.replace('%','')) + 4]`,
    which silently truncated 'YYYY-MM-DD' to 9 chars and dropped the second
    digit of the day. A cargo with pickup '2026-05-25' parsed as date(2026,5,2)
    and was hidden from the public feed as "stale". The fix below feeds each
    format the full string; the trailing regex fallback still handles ISO
    timestamps that carry extra characters past the date.
    """
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    fmts = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y")
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue
    # Fallback: extract a YYYY-MM-DD prefix from longer ISO timestamps
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
        except Exception:
            return None
    return None


def _validate_future_date(value, field_name: str):
    """Stage 52 / P1-8: запрещаем создавать грузы/рейсы с датой в прошлом.

    Принимаем те же форматы что _parse_iso_date (ISO, DD.MM.YYYY).
    - None / пустая строка → разрешено (поле опциональное на схеме).
    - невалидный формат → 400.
    - дата строго раньше сегодняшнего дня → 400.

    Возвращаем распарсенную date или None — это не используется вызывающим
    кодом сейчас (поле сохраняется as-is, чтобы старые клиенты могли
    обратно прочитать тот же формат), но пригодится если будем
    нормализовать в ISO позже.
    """
    if value is None or str(value).strip() == "":
        return None
    parsed = _parse_iso_date(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Неверный формат даты ({field_name})")
    # QA-аудит P1-5: было datetime.now() (локальное время сервера), а БД и
    # остальные проверки в этом файле — UTC. На сервере в UTC при клиенте
    # из UTC+5..+8 валидная «сегодняшняя» дата отбивалась. Сравниваем с
    # UTC-датой минус сутки запаса — покрывает любой клиентский пояс,
    # при этом реально прошедшие даты всё равно отсекаются.
    if parsed < (datetime.utcnow().date() - timedelta(days=1)):
        raise HTTPException(status_code=400, detail=f"{field_name}: дата в прошлом недопустима")
    return parsed


_ALLOWED_POINT_TYPES = ("city", "border", "terminal", "hub")


def _norm_route_triple(country, point_type, point_name):
    """Normalise the structured route triple. Country is an ISO-2 code
    (upper-case); type is one of the allowed shapes, otherwise dropped;
    name is trimmed. Any field may be None — we never invent values
    that the picker did not provide. The result is what gets stored
    in `from_country / from_point_type / from_point_name` (or the `to_*`
    counterpart) so old serialisers that don't know about these
    columns simply see NULL.
    """
    c = (country or "").strip().upper() or None
    if c is not None and (len(c) > 4 or not c.isalpha()):
        c = None
    pt = (point_type or "").strip().lower() or None
    if pt is not None and pt not in _ALLOWED_POINT_TYPES:
        pt = None
    pn = (point_name or "").strip()[:200] or None
    return c, pt, pn


def _is_dirty_text(*fields) -> bool:
    """Cheap substring match for moderation tokens. Case-insensitive, RU+EN.

    QA agents tag their records with "[ar-<runid>]" markers and rely on the
    public feed showing them during a run (cleanup removes them after). Treat
    a row carrying that marker as *not* dirty, even if some other field
    incidentally matches a dirty token (e.g. "QA" inside an agent name).
    """
    blob = " ".join(str(f or "") for f in fields).lower()
    if "[ar-" in blob:
        return False
    return any(tok in blob for tok in DIRTY_TOKENS)


def _public_cargo_ok(row: dict, today=None) -> bool:
    """Decide whether a row should appear in the *public* cargo feed.

    Hides:
      - dirty tokens in cargo_desc/from_city/to_city/cargo_type
      - active cargos created before PUBLIC_CUTOFF_DATE without a future pickup
      - items whose pickup_date is more than 24h in the past
      - items with no pickup_date AND created more than 2 days ago
    Never deletes. Owner-side queries (/market/my) bypass this filter.
    """
    today = today or datetime.utcnow().date()

    if _is_dirty_text(row.get("cargo_desc"), row.get("from_city"),
                      row.get("to_city"), row.get("cargo_type")):
        return False

    pickup = _parse_iso_date(row.get("pickup_date"))
    created = _parse_iso_date(row.get("created_at"))
    cutoff = _parse_iso_date(PUBLIC_CUTOFF_DATE)

    # Stale pickup_date → hide. Модель А: публикация живёт 3 дня (день выезда
    # + 2). Прячем, когда дата загрузки более чем на 2 дня в прошлом.
    if pickup and pickup < (today - timedelta(days=2)):
        return False

    # Created before cutoff → must have a still-valid future pickup, otherwise hide
    if created and cutoff and created < cutoff:
        if not pickup or pickup < today:
            return False

    # No pickup_date AND older than 2 days → hide
    if not pickup and created and created < (today - timedelta(days=2)):
        return False

    return True


def _init():
    base = Path(__file__).resolve().parent.parent / "database"
    for name in ["marketplace_schema.sql", "deals_schema.sql"]:
        schema = base / name
        if schema.exists():
            with get_conn() as c:
                c.executescript(schema.read_text(encoding="utf-8"))
                c.commit()
    # Часть 3 (история цены): таблица price_events + связь chat_messages.event_id.
    # Аддитивно и идемпотентно. Бэкфилл старых ставок НЕ делаем.
    with get_conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS price_events (
                id TEXT PRIMARY KEY,
                bid_id TEXT NOT NULL,
                actor_id TEXT,
                actor_role TEXT,               -- owner | bidder
                amount INTEGER,
                kind TEXT NOT NULL,            -- proposed|updated|countered|accepted|rejected
                comment TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_price_events_bid ON price_events(bid_id, created_at)")
        # chat_messages.event_id — связь спец-сообщения с событием цены.
        try:
            cm_cols = {r["name"] for r in c.execute("PRAGMA table_info(chat_messages)").fetchall()}
            if cm_cols and "event_id" not in cm_cols:
                c.execute("ALTER TABLE chat_messages ADD COLUMN event_id TEXT")
        except Exception:
            pass
        c.commit()

    # Idempotent migration: ensure newer columns exist on legacy DBs.
    # SQLite doesn't support `ALTER TABLE ADD COLUMN IF NOT EXISTS`, so we
    # check pragma_table_info and only add when missing.
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(bids)").fetchall()}
        if "updated_at" not in cols:
            c.execute("ALTER TABLE bids ADD COLUMN updated_at TEXT")
            c.execute("UPDATE bids SET updated_at = created_at WHERE updated_at IS NULL")
        for col, ddl in [
            ("counter_amount",  "ALTER TABLE bids ADD COLUMN counter_amount INTEGER"),
            ("counter_message", "ALTER TABLE bids ADD COLUMN counter_message TEXT"),
            ("counter_by",      "ALTER TABLE bids ADD COLUMN counter_by TEXT"),
            ("counter_at",      "ALTER TABLE bids ADD COLUMN counter_at TEXT"),
        ]:
            if col not in cols:
                c.execute(ddl)
        # Currency on trips/cargos: USD by default, never NULL.
        # Stage 8: add structured route columns on top of the legacy
        # from_city/to_city strings so the registry-aware picker can
        # store country / type / name without losing backward
        # compatibility (the old columns stay populated for any client
        # that hasn't been updated yet).
        ROUTE_COLS = [
            ("from_country",     "TEXT"),
            ("from_point_type",  "TEXT"),
            ("from_point_name",  "TEXT"),
            ("to_country",       "TEXT"),
            ("to_point_type",    "TEXT"),
            ("to_point_name",    "TEXT"),
        ]
        for table in ("trips", "cargos"):
            tcols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})").fetchall()}
            if "currency" not in tcols:
                c.execute(f"ALTER TABLE {table} ADD COLUMN currency TEXT DEFAULT 'USD'")
                c.execute(f"UPDATE {table} SET currency = 'USD' WHERE currency IS NULL")
            for col, ddl_type in ROUTE_COLS:
                if col not in tcols:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl_type}")
        # 3.8: тип оплаты груза (cash|cashless|any) — важный параметр решения
        # водителя. Колонка на cargos; NULL = не указан.
        ccols = {r["name"] for r in c.execute("PRAGMA table_info(cargos)").fetchall()}
        if "payment_type" not in ccols:
            c.execute("ALTER TABLE cargos ADD COLUMN payment_type TEXT")
        # Задача B: живая гео-позиция машины по сделке (последняя точка).
        c.execute("""
            CREATE TABLE IF NOT EXISTS deal_locations (
                deal_id    TEXT PRIMARY KEY,
                lat        REAL NOT NULL,
                lng        REAL NOT NULL,
                heading    REAL,
                speed      REAL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.commit()

_init()


# ═══ Models ═══

class CargoIn(BaseModel):
    from_city: str
    to_city: str
    cargo_desc: str  # max 500 chars, strip
    cargo_type: Optional[str] = "tent"
    weight_tons: Optional[float] = 0
    volume_m3: Optional[float] = 0
    price: Optional[int] = 0
    currency: Optional[str] = "USD"
    payment_type: Optional[str] = None   # cash | cashless | any
    pickup_date: Optional[str] = None
    photos: Optional[List[str]] = None
    # Stage 8: structured route fields. The legacy `from_city` /
    # `to_city` strings stay populated for back-compat; the picker
    # additionally forwards the country/type/name triple so we can
    # filter feed by country or by point type later.
    from_country: Optional[str] = None       # ISO-2 code: 'KZ', 'CN', …
    from_point_type: Optional[str] = None    # 'city' | 'border' | 'terminal'
    from_point_name: Optional[str] = None
    to_country: Optional[str] = None
    to_point_type: Optional[str] = None
    to_point_name: Optional[str] = None

    def __init__(self, **data):
        if 'cargo_desc' in data and data['cargo_desc']:
            data['cargo_desc'] = data['cargo_desc'].strip()[:500]
        if 'from_city' in data and data['from_city']:
            data['from_city'] = data['from_city'].strip()
        if 'to_city' in data and data['to_city']:
            data['to_city'] = data['to_city'].strip()
        super().__init__(**data)


class TripIn(BaseModel):
    from_city: str
    to_city: str
    transit: Optional[str] = None
    truck_type: Optional[str] = "tent"
    # Stage 7: stop sending fake 20/82 defaults from the publish flow —
    # accept None and let the column default kick in if the user left
    # the field blank.
    capacity_tons: Optional[float] = None
    available_m3: Optional[float] = None
    price: Optional[int] = 0
    currency: Optional[str] = "USD"
    departure: Optional[str] = None
    arrival: Optional[str] = None
    from_country: Optional[str] = None
    from_point_type: Optional[str] = None
    from_point_name: Optional[str] = None
    to_country: Optional[str] = None
    to_point_type: Optional[str] = None
    to_point_name: Optional[str] = None


class TripPatchIn(BaseModel):
    """Partial update of an own active trip — every field is optional;
    null/None means 'do not touch'. Currency defaults stay USD."""
    from_city: Optional[str] = None
    to_city: Optional[str] = None
    transit: Optional[str] = None
    truck_type: Optional[str] = None
    capacity_tons: Optional[float] = None
    available_m3: Optional[float] = None
    price: Optional[int] = None
    currency: Optional[str] = None
    departure: Optional[str] = None
    arrival: Optional[str] = None
    from_country: Optional[str] = None
    from_point_type: Optional[str] = None
    from_point_name: Optional[str] = None
    to_country: Optional[str] = None
    to_point_type: Optional[str] = None
    to_point_name: Optional[str] = None


class BidIn(BaseModel):
    cargo_id: Optional[str] = None
    trip_id: Optional[str] = None
    amount: int
    message: Optional[str] = None


class BidUpdateIn(BaseModel):
    amount: Optional[int] = None
    message: Optional[str] = None


class BidCounterIn(BaseModel):
    amount: int
    message: Optional[str] = None


# ═══ Cargos ═══

@mp_router.post("/cargos")
def create_cargo(body: CargoIn, user=Depends(require_level(1))):
    if not body.from_city or not body.to_city:
        raise HTTPException(status_code=400, detail="Укажите откуда и куда")
    if not body.cargo_desc:
        raise HTTPException(status_code=400, detail="Укажите что везти")
    # Stage 52 / P1-8: дата погрузки не может быть в прошлом.
    _validate_future_date(body.pickup_date, "pickup_date")
    # Pilot currency whitelist (Stage 5 / rev. 3): RUB / USD / KZT / CNY.
    # UZS / KGS / EUR / AED removed from publish flows. A typo or removed
    # currency code falls back to USD so the cargos.currency column never
    # ends up NULL/empty. Old rows already in DB with a removed code keep
    # their value (read paths stay permissive).
    currency = (body.currency or "USD").upper()
    if currency not in ("USD", "KZT", "RUB", "CNY"):
        currency = "USD"
    cid = new_id()
    # Stage 8: persist structured route alongside the legacy free-text
    # columns. Country code normalised to upper-case; missing fields
    # stay NULL — `_route_for_row` reads both legacy and structured
    # fields when serialising the row back to clients.
    fc, fpt, fpn = _norm_route_triple(body.from_country, body.from_point_type, body.from_point_name)
    tc, tpt, tpn = _norm_route_triple(body.to_country, body.to_point_type, body.to_point_name)
    with get_conn() as c:
        pay = body.payment_type if body.payment_type in ("cash", "cashless", "any") else None
        c.execute("""
            INSERT INTO cargos (id, owner_id, owner_phone, owner_name,
              from_city, to_city, cargo_desc, cargo_type,
              weight_tons, volume_m3, price, currency, payment_type, pickup_date, photos,
              from_country, from_point_type, from_point_name,
              to_country, to_point_type, to_point_name)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (cid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.cargo_desc, body.cargo_type,
              body.weight_tons, body.volume_m3, body.price, currency, pay,
              body.pickup_date,
              json.dumps(body.photos or [], ensure_ascii=False),
              fc, fpt, fpn, tc, tpt, tpn))

    # Push подписчикам маршрута
    try:
        from api.saved_searches import notify_matching_users
        notify_matching_users(body.from_city, body.to_city, body.cargo_desc, cargo_id=cid)
    except Exception:
        pass

    return {"id": cid, "ok": True}


@mp_router.get("/cargos")
def list_cargos(
    status: str = "active",
    from_city: str = "",
    to_city: str = "",
    cargo_type: str = "",
    # Stage 8: optional structured filters. Direction filter on the
    # client stays simple; these run alongside it for callers that
    # know about the registry shape (admin tools, advanced UI).
    from_country: str = "",
    to_country: str = "",
    from_point_type: str = "",
    to_point_type: str = "",
    show_demo: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    """Публичный список грузов. Demo-контент скрыт по умолчанию."""
    where = ["status = ?"]
    params = [status]
    if from_city:
        where.append("from_city LIKE ?")
        params.append(f"%{from_city}%")
    if to_city:
        where.append("to_city LIKE ?")
        params.append(f"%{to_city}%")
    if cargo_type:
        where.append("cargo_type = ?")
        params.append(cargo_type)
    if from_country:
        where.append("UPPER(from_country) = ?")
        params.append(from_country.upper())
    if to_country:
        where.append("UPPER(to_country) = ?")
        params.append(to_country.upper())
    if from_point_type:
        where.append("from_point_type = ?")
        params.append(from_point_type.lower())
    if to_point_type:
        where.append("to_point_type = ?")
        params.append(to_point_type.lower())

    where_sql = " AND ".join(where)
    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, owner_id, from_city, to_city, cargo_desc, cargo_type,
                   weight_tons, volume_m3, price, currency, payment_type, pickup_date, photos,
                   bids_count, status, created_at,
                   from_country, from_point_type, from_point_name,
                   to_country, to_point_type, to_point_name
            FROM cargos WHERE {where_sql}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (*params, limit, offset)).fetchall()
        total = c.execute(f"SELECT COUNT(*) FROM cargos WHERE {where_sql}", params).fetchone()[0]

    result = []
    today = datetime.utcnow().date()
    for r in rows:
        d = dict(r)
        try:
            d["photos"] = _sign_cargo_photos(json.loads(d.get("photos") or "[]"))
        except Exception:
            # QA-аудит P2-6: раньше битый JSON в photos молча превращался в
            # [] — фото груза «исчезали» без следа. Логируем, чтобы порча
            # данных была видна в логах (поведение для клиента не меняем).
            print(f"[market] bad photos JSON for cargo {d.get('id')}: {d.get('photos')!r}", flush=True)
            d["photos"] = []
        # НЕ отдаём owner_phone — контакт закрыт гейтом
        d.pop("owner_phone", None)
        # Public-feed hygiene (skipped only when caller explicitly asks for it,
        # e.g. an admin tool passing show_demo=true)
        if not show_demo and not _public_cargo_ok(d, today=today):
            continue
        result.append(d)
    # Recompute total to match what the caller actually sees
    return {"cargos": result, "total": len(result)}


@mp_router.post("/cargos/photo")
async def upload_cargo_photo(file: UploadFile = File(...), user=Depends(require_level(1))):
    """Фото груза → storage, возвращаем КЛЮЧ (как у /chat/photo). Ключ кладётся
    в cargos.photos; на выдаче подписывается (_sign_cargo_photos). Раньше фронт
    сохранял локальный uri устройства — у других он не открывался."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл слишком большой")
    key = _cargo_storage.save_image(data, "cargo_photos")
    return {"photo_key": key}


@mp_router.get("/cargos/{cargo_id}")
def get_cargo(cargo_id: str, authorization: Optional[str] = Header(None)):
    with get_conn() as c:
        row = c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Груз не найден")
    d = dict(row)
    try:
        d["photos"] = _sign_cargo_photos(json.loads(d.get("photos") or "[]"))
    except Exception:
        d["photos"] = []
    # Security (B2): контакт закрыт гейтом. owner_phone отдаём ТОЛЬКО владельцу
    # листинга. Раньше detail-эндпоинт делал SELECT * и возвращал телефон всем —
    # аноним перебором id мог собрать базу телефонов грузовладельцев. Список
    # /cargos телефон уже вырезал (:462), теперь и карточка тоже.
    caller = _maybe_user(authorization)
    if not (caller and caller.get("id") == d.get("owner_id")):
        d.pop("owner_phone", None)
    # Инфо о грузоотправителе (доверие: водитель видит, кому ставит ставку) —
    # имя, статус верификации, рейтинг, число отзывов. Без телефона.
    try:
        from database import reviews_dal
        owner_id = d.get("owner_id")
        if owner_id:
            with get_conn() as c2:
                orow = c2.execute(
                    "SELECT full_name, phone, status FROM drivers_registration WHERE id = ?",
                    (owner_id,),
                ).fetchone()
            if orow:
                # 27.07: не показываем «Аноним». Цепочка: имя → хвост телефона
                # (+XXXX) → «Пользователь UrTruck». Пустое full_name бывает у
                # клиентов, вошедших по OTP без ввода имени.
                _nm = (orow["full_name"] or "").strip()
                if not _nm:
                    _ph = "".join(ch for ch in (orow["phone"] or "") if ch.isdigit())
                    _nm = f"+{_ph[-4:]}" if len(_ph) >= 4 else "Пользователь UrTruck"
                d["owner_name"] = _nm
                d["owner_verified"] = (orow["status"] == "approved")
            summary = reviews_dal.get_rating_summary(owner_id)
            d["owner_rating"] = summary.get("average", 0) or 0
            d["owner_reviews_count"] = summary.get("count", 0) or 0
    except Exception:
        pass
    return d


@mp_router.delete("/cargos/{cargo_id}")
def delete_cargo(cargo_id: str, user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute("SELECT owner_id FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        if row["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно удалять только свои грузы")
        c.execute("UPDATE cargos SET status = 'cancelled' WHERE id = ?", (cargo_id,))
        # Ревизия 26.07: живые ставки удалённого груза отменяем каскадом —
        # иначе у водителей вечно висели «мёртвые» предложения без груза.
        c.execute(
            "UPDATE bids SET status = 'cancelled' WHERE cargo_id = ? AND status IN ('pending', 'countered')",
            (cargo_id,),
        )
    return {"ok": True}


@mp_router.patch("/cargos/{cargo_id}/unpublish")
def unpublish_cargo(cargo_id: str, user=Depends(require_level(1))):
    """Снять груз с публикации. Ставит status=unpublished, отклоняет pending-ставки."""
    with get_conn() as c:
        row = c.execute("SELECT owner_id, status FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Груз не найден")
        if row["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно снять только свой груз")
        if row["status"] not in (None, "active"):
            raise HTTPException(status_code=409, detail="Груз уже не активен")
        c.execute("UPDATE cargos SET status = 'unpublished', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (cargo_id,))
        c.execute(
            "UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
            "WHERE cargo_id = ? AND status IN ('pending', 'countered')", (cargo_id,)
        )
    return {"ok": True, "status": "unpublished"}


class CargoPatchIn(BaseModel):
    cargo_desc: Optional[str] = None
    cargo_type: Optional[str] = None
    weight_tons: Optional[float] = None
    volume_m3: Optional[float] = None
    price: Optional[int] = None
    currency: Optional[str] = None
    pickup_date: Optional[str] = None
    payment_type: Optional[str] = None


@mp_router.patch("/cargos/{cargo_id}")
def update_cargo(cargo_id: str, body: CargoPatchIn, user=Depends(require_level(1))):
    """Частичное обновление СВОЕГО активного груза (задача A): цена/описание/
    вес/объём/тип/дата. 403 — не владелец; 404 — нет груза; 409 — груз уже
    не active или есть принятая (не отменённая) сделка."""
    with get_conn() as c:
        row = c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Груз не найден")
        cargo = dict(row)
        if cargo["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно редактировать только свой груз")
        if (cargo.get("status") or "active") != "active":
            raise HTTPException(status_code=409, detail=f"Груз нельзя редактировать в статусе {cargo.get('status')}")
        deal = c.execute(
            "SELECT id FROM deals WHERE cargo_id = ? AND status NOT IN ('cancelled') LIMIT 1",
            (cargo_id,),
        ).fetchone()
        if deal:
            raise HTTPException(status_code=409, detail="Нельзя редактировать — есть принятая сделка")

        updates, params = [], []
        if body.cargo_desc is not None:
            d = body.cargo_desc.strip()[:500]
            if not d:
                raise HTTPException(status_code=400, detail="Описание не может быть пустым")
            updates.append("cargo_desc = ?"); params.append(d)
        if body.cargo_type is not None:
            updates.append("cargo_type = ?"); params.append(body.cargo_type)
        if body.weight_tons is not None:
            if body.weight_tons < 0:
                raise HTTPException(status_code=400, detail="weight_tons должен быть >= 0")
            updates.append("weight_tons = ?"); params.append(body.weight_tons)
        if body.volume_m3 is not None:
            if body.volume_m3 < 0:
                raise HTTPException(status_code=400, detail="volume_m3 должен быть >= 0")
            updates.append("volume_m3 = ?"); params.append(body.volume_m3)
        if body.price is not None:
            if body.price < 0:
                raise HTTPException(status_code=400, detail="price должен быть >= 0")
            updates.append("price = ?"); params.append(body.price)
        if body.currency is not None:
            cur = (body.currency or "USD").upper()
            if cur not in ("USD", "KZT", "RUB", "CNY"):
                raise HTTPException(status_code=400, detail="currency: USD/KZT/RUB/CNY")
            updates.append("currency = ?"); params.append(cur)
        if body.pickup_date is not None:
            updates.append("pickup_date = ?"); params.append(body.pickup_date)
        if body.payment_type is not None:
            pay = body.payment_type if body.payment_type in ("cash", "cashless", "any") else None
            updates.append("payment_type = ?"); params.append(pay)

        if not updates:
            raise HTTPException(status_code=400, detail="Нечего обновлять")
        params.append(cargo_id)
        c.execute(f"UPDATE cargos SET {', '.join(updates)} WHERE id = ?", params)
        updated = dict(c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone())
    return {"ok": True, "cargo": updated}


# ── Накладная (waybill/CMR) ──────────────────────────────────────────────
# По завершении/в ходе сделки стороны получают печатную транспортную
# накладную из данных заказа. Ссылка подписана HMAC (без auth-заголовка —
# открывается в браузере), TTL 7 дней. Секрет — как у file_signing.
import hmac as _wb_hmac
import hashlib as _wb_hashlib
import os as _wb_os
import time as _wb_time
from fastapi.responses import HTMLResponse


def _wb_secret() -> bytes:
    return (_wb_os.getenv("FILE_SIGNING_KEY") or _wb_os.getenv("URTRUCK_API_SECRET") or "").encode("utf-8")


def _wb_sig(deal_id: str, exp: int) -> str:
    return _wb_hmac.new(_wb_secret(), f"waybill|{deal_id}|{exp}".encode(), _wb_hashlib.sha256).hexdigest()


def _party_contact(c, uid, deal):
    """Возвращает (имя, телефон) участника сделки по его user id.

    Раньше телефон искали ТОЛЬКО в drivers_registration — но клиент
    (грузоотправитель) там не хранится (он авторизуется через Supabase OTP),
    поэтому контрагент-клиент отдавался без телефона: кнопка «Позвонить»
    не показывалась и WhatsApp не открывался. Телефон клиента лежит в
    cargos.owner_phone / bids.bidder_phone. Проверяем все источники по
    порядку: регистрация водителя → владелец груза → владелец рейса →
    ставка. Технические placeholder-телефоны (guest_/deleted_) не отдаём."""
    name = None
    phone = None
    r = c.execute(
        "SELECT full_name, phone FROM drivers_registration WHERE id = ?", (uid,)
    ).fetchone()
    if r:
        name = r["full_name"]
        phone = r["phone"]
    if not phone and deal.get("cargo_id"):
        r2 = c.execute(
            "SELECT owner_name, owner_phone FROM cargos WHERE id = ? AND owner_id = ?",
            (deal["cargo_id"], uid),
        ).fetchone()
        if r2:
            name = name or r2["owner_name"]
            phone = phone or r2["owner_phone"]
    if not phone and deal.get("trip_id"):
        r3 = c.execute(
            "SELECT driver_name, driver_phone FROM trips WHERE id = ? AND driver_id = ?",
            (deal["trip_id"], uid),
        ).fetchone()
        if r3:
            name = name or r3["driver_name"]
            phone = phone or r3["driver_phone"]
    if not phone and deal.get("bid_id"):
        r4 = c.execute(
            "SELECT bidder_name, bidder_phone FROM bids WHERE id = ? AND bidder_id = ?",
            (deal["bid_id"], uid),
        ).fetchone()
        if r4:
            name = name or r4["bidder_name"]
            phone = phone or r4["bidder_phone"]
    if phone and str(phone).startswith(("guest_", "deleted_")):
        phone = None
    return name, phone


@mp_router.post("/deals/{deal_id}/waybill-link")
def waybill_link(deal_id: str, user=Depends(require_level(1))):
    """Подписанная ссылка на накладную — только участнику сделки."""
    with get_conn() as c:
        d = c.execute("SELECT shipper_id, driver_id FROM deals WHERE id = ?", (deal_id,)).fetchone()
    if not d:
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    if user["id"] not in (d["shipper_id"], d["driver_id"]):
        raise HTTPException(status_code=403)
    exp = int(_wb_time.time()) + 7 * 24 * 3600
    return {"exp": exp, "sig": _wb_sig(deal_id, exp)}


@mp_router.get("/deals/{deal_id}/waybill")
def waybill_html(deal_id: str, exp: int = 0, sig: str = ""):
    """Печатная накладная (HTML). Доступ по подписи exp+sig (TTL)."""
    if not exp or exp < _wb_time.time() or not _wb_hmac.compare_digest(sig or "", _wb_sig(deal_id, exp)):
        raise HTTPException(status_code=403, detail="Ссылка недействительна или истекла")
    with get_conn() as c:
        d = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not d:
            raise HTTPException(status_code=404)
        d = dict(d)
        cargo = {}
        if d.get("cargo_id"):
            r = c.execute("SELECT cargo_desc, cargo_type, weight_tons, volume_m3, currency, pickup_date FROM cargos WHERE id = ?", (d["cargo_id"],)).fetchone()
            cargo = dict(r) if r else {}
        plate = None
        if d.get("trip_id"):
            tr = c.execute("SELECT driver_id FROM trips WHERE id = ?", (d["trip_id"],)).fetchone()
            if tr and tr["driver_id"]:
                vp = c.execute("SELECT vehicle_plate FROM drivers_registration WHERE id = ?", (tr["driver_id"],)).fetchone()
                plate = vp["vehicle_plate"] if vp else None
        def person(uid):
            # Ищем телефон во всех источниках (регистрация/груз/рейс/ставка),
            # чтобы в накладной был контакт и клиента, и водителя.
            nm, ph = _party_contact(c, uid, d)
            return (nm or "—"), (ph or "—")
        sh_name, sh_phone = person(d["shipper_id"])
        dr_name, dr_phone = person(d["driver_id"])
    cur = (d.get("currency") or cargo.get("currency") or "USD")
    status_ru = {"accepted": "Принят", "in_progress": "В пути", "at_border": "На границе",
                 "delivered": "Доставлен", "cancelled": "Отменён"}.get(d.get("status"), d.get("status") or "—")
    row = lambda k, v: f"<tr><td>{k}</td><td><b>{v or '—'}</b></td></tr>"
    html = f"""<!doctype html><html lang=ru><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Накладная UrTruck № {deal_id[:8].upper()}</title>
<style>body{{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}}
h1{{font-size:20px}}h2{{font-size:14px;color:#666;font-weight:600;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px}}
table{{width:100%;border-collapse:collapse}}td{{padding:7px 10px;border-bottom:1px solid #eee;font-size:14px}}
td:first-child{{color:#666;width:42%}}.head{{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #FF8400;padding-bottom:10px}}
.logo{{font-weight:900;font-size:22px}}.logo span{{color:#FF8400}}.muted{{color:#888;font-size:12px}}
@media print{{.noprint{{display:none}}}}
.printbtn{{background:#FF8400;color:#111;border:none;border-radius:10px;padding:10px 18px;font-weight:800;font-size:14px;margin:16px 0;cursor:pointer}}</style></head><body>
<div class=head><div class=logo>Ur<span>Truck</span></div><div class=muted>Транспортная накладная<br>№ {deal_id[:8].upper()} · {str(d.get('created_at') or '')[:10]}</div></div>
<h2>Маршрут</h2><table>{row('Откуда', d.get('from_city'))}{row('Куда', d.get('to_city'))}{row('Статус', status_ru)}</table>
<h2>Груз</h2><table>{row('Описание', cargo.get('cargo_desc'))}{row('Тип кузова', cargo.get('cargo_type'))}{row('Вес, т', cargo.get('weight_tons'))}{row('Объём, м³', cargo.get('volume_m3'))}{row('Дата загрузки', cargo.get('pickup_date'))}</table>
<h2>Стороны</h2><table>{row('Грузоотправитель', sh_name)}{row('Телефон', sh_phone)}{row('Перевозчик (водитель)', dr_name)}{row('Телефон', dr_phone)}{row('Госномер тягача', plate)}</table>
<h2>Оплата</h2><table>{row('Сумма сделки', f"{d.get('amount')} {cur}")}</table>
<button class="printbtn noprint" onclick="window.print()">🖨 Печать / Сохранить PDF</button>
<p class=muted>Сформировано автоматически платформой UrTruck (urtruck.kz) по данным сделки. Подписи сторон ставятся при загрузке/выгрузке.</p>
</body></html>"""
    return HTMLResponse(html)


# ── Продление одним тапом (Модель А): «Ещё актуально» ────────────────────
# Дата загрузки/выезда сбрасывается на сегодня → публикация снова живёт
# 3 дня и возвращается в общую ленту. Без ручного ввода даты.
@mp_router.post("/cargos/{cargo_id}/extend")
def extend_cargo(cargo_id: str, user=Depends(require_level(1))):
    new_date = datetime.utcnow().date().isoformat()
    with get_conn() as c:
        row = c.execute("SELECT owner_id, status FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Груз не найден")
        if row["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно продлить только свой груз")
        if (row["status"] or "active") != "active":
            raise HTTPException(status_code=409, detail="Груз не активен")
        c.execute("UPDATE cargos SET pickup_date = ? WHERE id = ?", (new_date, cargo_id))
    return {"ok": True, "pickup_date": new_date}


@mp_router.post("/trips/{trip_id}/extend")
def extend_trip(trip_id: str, user=Depends(require_level(1))):
    new_date = datetime.utcnow().date().isoformat()
    with get_conn() as c:
        row = c.execute("SELECT driver_id, status FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Рейс не найден")
        if row["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно продлить только свой рейс")
        if (row["status"] or "active") != "active":
            raise HTTPException(status_code=409, detail="Рейс не активен")
        c.execute("UPDATE trips SET departure = ? WHERE id = ?", (new_date, trip_id))
    return {"ok": True, "departure": new_date}


@mp_router.patch("/trips/{trip_id}/unpublish")
def unpublish_trip(trip_id: str, user=Depends(require_level(1))):
    """Снять рейс с публикации. Ставит status=unpublished, отклоняет pending-ставки."""
    with get_conn() as c:
        row = c.execute("SELECT driver_id, status FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Рейс не найден")
        if row["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно снять только свой рейс")
        if row["status"] not in (None, "active"):
            raise HTTPException(status_code=409, detail="Рейс уже не активен")
        c.execute("UPDATE trips SET status = 'unpublished', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (trip_id,))
        c.execute(
            "UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
            "WHERE trip_id = ? AND status IN ('pending', 'countered')", (trip_id,)
        )
    return {"ok": True, "status": "unpublished"}


# ═══ Trips ═══

@mp_router.post("/trips")
def create_trip(body: TripIn, user=Depends(require_level(1))):
    if not body.from_city or not body.to_city:
        raise HTTPException(status_code=400, detail="Укажите маршрут: откуда и куда")
    # Stage 52 / P1-8: дата выезда не может быть в прошлом.
    _validate_future_date(body.departure, "departure")
    # Same pilot whitelist as create_cargo — see note there.
    currency = (body.currency or "USD").upper()
    if currency not in ("USD", "KZT", "RUB", "CNY"):
        currency = "USD"
    tid = new_id()
    fc, fpt, fpn = _norm_route_triple(body.from_country, body.from_point_type, body.from_point_name)
    tc, tpt, tpn = _norm_route_triple(body.to_country, body.to_point_type, body.to_point_name)
    with get_conn() as c:
        c.execute("""
            INSERT INTO trips (id, driver_id, driver_phone, driver_name,
              from_city, to_city, transit, truck_type,
              capacity_tons, available_m3, price, currency, departure, arrival,
              from_country, from_point_type, from_point_name,
              to_country, to_point_type, to_point_name)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (tid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.transit, body.truck_type,
              body.capacity_tons, body.available_m3, body.price, currency,
              body.departure, body.arrival,
              fc, fpt, fpn, tc, tpt, tpn))
    return {"id": tid, "ok": True}


@mp_router.patch("/trips/{trip_id}")
def update_trip(trip_id: str, body: TripPatchIn, user=Depends(require_level(1))):
    """Partial update of own active trip. Locked once a deal exists.

    - 403 if not owner; 404 if trip missing
    - 409 if status != 'active' or there's a non-cancelled deal on this trip
    - Validates fields the same way create_trip does (route required if
      provided, currency in whitelist, price >= 0)
    - Returns the updated row
    """
    with get_conn() as c:
        row = c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Рейс не найден")
        trip = dict(row)
        if trip["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно редактировать только свой рейс")
        if trip["status"] != "active":
            raise HTTPException(status_code=409, detail=f"Рейс нельзя редактировать в статусе {trip['status']}")
        deal = c.execute(
            "SELECT id FROM deals WHERE trip_id = ? AND status NOT IN ('cancelled') LIMIT 1",
            (trip_id,),
        ).fetchone()
        if deal:
            raise HTTPException(status_code=409, detail="Нельзя редактировать — есть принятая сделка")

        updates = []
        params = []
        for field in ("from_city", "to_city", "transit", "truck_type", "departure", "arrival"):
            v = getattr(body, field)
            if v is not None:
                if field in ("from_city", "to_city") and isinstance(v, str) and not v.strip():
                    raise HTTPException(status_code=400, detail=f"{field} не может быть пустым")
                updates.append(f"{field} = ?")
                params.append(v.strip() if isinstance(v, str) else v)
        if body.capacity_tons is not None:
            if body.capacity_tons < 0:
                raise HTTPException(status_code=400, detail="capacity_tons должен быть >= 0")
            updates.append("capacity_tons = ?"); params.append(body.capacity_tons)
        if body.available_m3 is not None:
            if body.available_m3 < 0:
                raise HTTPException(status_code=400, detail="available_m3 должен быть >= 0")
            updates.append("available_m3 = ?"); params.append(body.available_m3)
        if body.price is not None:
            if body.price < 0:
                raise HTTPException(status_code=400, detail="price должен быть >= 0")
            updates.append("price = ?"); params.append(body.price)
        if body.currency is not None:
            cur = (body.currency or "USD").upper()
            if cur not in ("USD", "KZT", "RUB", "CNY"):
                raise HTTPException(status_code=400, detail="currency: USD/KZT/RUB/CNY")
            updates.append("currency = ?"); params.append(cur)
        # Stage 8: update structured route fields when the patch
        # includes them. We normalise via the same helper used on
        # POST so an invalid type/country drops to NULL instead of
        # corrupting the row.
        if any(getattr(body, f) is not None for f in (
            "from_country", "from_point_type", "from_point_name")):
            fc, fpt, fpn = _norm_route_triple(body.from_country, body.from_point_type, body.from_point_name)
            updates.append("from_country = ?"); params.append(fc)
            updates.append("from_point_type = ?"); params.append(fpt)
            updates.append("from_point_name = ?"); params.append(fpn)
        if any(getattr(body, f) is not None for f in (
            "to_country", "to_point_type", "to_point_name")):
            tc, tpt, tpn = _norm_route_triple(body.to_country, body.to_point_type, body.to_point_name)
            updates.append("to_country = ?"); params.append(tc)
            updates.append("to_point_type = ?"); params.append(tpt)
            updates.append("to_point_name = ?"); params.append(tpn)

        if not updates:
            raise HTTPException(status_code=400, detail="Нечего обновлять")

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(trip_id)
        c.execute(f"UPDATE trips SET {', '.join(updates)} WHERE id = ?", params)
        updated = dict(c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone())

    return {"ok": True, "trip": updated}


@mp_router.get("/trips")
def list_trips(
    status: str = "active",
    from_city: str = "",
    to_city: str = "",
    truck_type: str = "",
    from_country: str = "",
    to_country: str = "",
    from_point_type: str = "",
    to_point_type: str = "",
    show_demo: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    where = ["status = ?"]
    params = [status]
    if from_city:
        where.append("from_city LIKE ?")
        params.append(f"%{from_city}%")
    if to_city:
        where.append("to_city LIKE ?")
        params.append(f"%{to_city}%")
    if truck_type:
        where.append("truck_type = ?")
        params.append(truck_type)
    if from_country:
        where.append("UPPER(from_country) = ?")
        params.append(from_country.upper())
    if to_country:
        where.append("UPPER(to_country) = ?")
        params.append(to_country.upper())
    if from_point_type:
        where.append("from_point_type = ?")
        params.append(from_point_type.lower())
    if to_point_type:
        where.append("to_point_type = ?")
        params.append(to_point_type.lower())

    where_sql = " AND ".join(where)
    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, driver_id, driver_name, from_city, to_city, transit,
                   truck_type, capacity_tons, available_m3, price, currency,
                   departure, arrival, status, created_at,
                   from_country, from_point_type, from_point_name,
                   to_country, to_point_type, to_point_name
            FROM trips WHERE {where_sql}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (*params, limit, offset)).fetchall()

    trips = [dict(r) for r in rows]
    if not show_demo:
        trips = [
            t for t in trips
            if not _is_dirty_text(t.get("driver_name"), t.get("from_city"),
                                  t.get("to_city"), t.get("truck_type"))
        ]
        # Скрываем просроченные рейсы из ПУБЛИЧНОЙ ленты (Модель А: живёт
        # 3 дня — departure + 2). Owner-side /my сюда не проходит — там рейсы
        # остаются с пометкой «Срок истёк».
        _today = datetime.utcnow().date()
        trips = [
            t for t in trips
            if not ((_dep := _parse_iso_date(t.get("departure")))
                    and _dep < (_today - timedelta(days=2)))
        ]
    # Обогащаем каждый рейс РЕАЛЬНЫМИ данными водителя (статус верификации +
    # рейтинг/число отзывов), чтобы фронт не выдумывал «★5.0 · Проверен».
    # Обогащение не должно ронять ленту — при любом сбое отдаём дефолты.
    try:
        from database import reviews_dal
        with get_conn() as c2:
            for t in trips:
                did = t.get("driver_id")
                drow = c2.execute(
                    "SELECT status FROM drivers_registration WHERE id = ?",
                    (did,),
                ).fetchone() if did else None
                t["driver_verified"] = bool(drow and drow["status"] == "approved")
        for t in trips:
            did = t.get("driver_id")
            summary = reviews_dal.get_rating_summary(did) if did else {}
            t["driver_rating"] = summary.get("average", 0) or 0
            t["driver_reviews_count"] = summary.get("count", 0) or 0
    except Exception:
        for t in trips:
            t.setdefault("driver_verified", False)
            t.setdefault("driver_rating", 0)
            t.setdefault("driver_reviews_count", 0)
    return {"trips": trips, "total": len(trips)}


@mp_router.get("/trips/{trip_id}")
def get_trip(trip_id: str, authorization: Optional[str] = Header(None)):
    with get_conn() as c:
        row = c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404)
    d = dict(row)
    # Security (B2): driver_phone — только владельцу рейса. Аноним/чужой по id
    # телефон водителя не получает (сбор базы контактов перебором).
    caller = _maybe_user(authorization)
    if not (caller and caller.get("id") == d.get("driver_id")):
        d.pop("driver_phone", None)
    # Инфо о водителе (доверие: клиент видит, кому доверяет груз) — имя,
    # статус верификации, рейтинг, число отзывов. Зеркально get_cargo:
    # owner_* → driver_*. Без телефона (гейт выше).
    try:
        from database import reviews_dal
        drv_id = d.get("driver_id")
        if drv_id:
            with get_conn() as c2:
                drow = c2.execute(
                    "SELECT full_name, phone, status FROM drivers_registration WHERE id = ?",
                    (drv_id,),
                ).fetchone()
            if drow:
                _nm = (drow["full_name"] or "").strip()
                if not _nm:
                    _ph = "".join(ch for ch in (drow["phone"] or "") if ch.isdigit())
                    _nm = f"+{_ph[-4:]}" if len(_ph) >= 4 else "Пользователь UrTruck"
                d["driver_display_name"] = _nm
                d["driver_verified"] = (drow["status"] == "approved")
            summary = reviews_dal.get_rating_summary(drv_id)
            d["driver_rating"] = summary.get("average", 0) or 0
            d["driver_reviews_count"] = summary.get("count", 0) or 0
    except Exception:
        pass
    return d


# ═══ Bids ═══

# Символы валют для человеко-читаемых строк (push/уведомления). Зеркало
# фронтового CURRENCY_SYMBOLS (src/utils/normalizers.js) — чтобы пуш про ставку
# показывал «420000 ₸», а не хардкод «$420000». Сумма ставки = валюта груза/рейса.
_CURRENCY_SYMBOLS = {"USD": "$", "KZT": "₸", "RUB": "₽", "CNY": "¥", "UZS": "сўм"}


def _money(amount, currency):
    cur = (currency or "USD").upper()
    sym = _CURRENCY_SYMBOLS.get(cur, "$")
    return f"{amount} {sym}" if cur == "UZS" else f"{sym}{amount}"


def _bid_currency(c, bid) -> str:
    """Валюта родителя ставки (груз/рейс) — чтобы пуши/уведомления показывали
    сумму в валюте листинга, а не хардкодным '$'. Fallback USD."""
    r = None
    if bid.get("cargo_id"):
        r = c.execute("SELECT currency FROM cargos WHERE id = ?", (bid["cargo_id"],)).fetchone()
    elif bid.get("trip_id"):
        r = c.execute("SELECT currency FROM trips WHERE id = ?", (bid["trip_id"],)).fetchone()
    return ((dict(r).get("currency") if r else None) or "USD")


def _record_price_event(c, bid_id, actor_id, actor_role, amount, kind, comment=None):
    """Часть 3: записать событие цены в открытой транзакции c. Возвращает
    event_id (для связи chat_messages.event_id) или None при сбое. Fail-tolerant —
    сбой истории не должен ломать сам торг."""
    try:
        eid = new_id()
        c.execute(
            "INSERT INTO price_events (id, bid_id, actor_id, actor_role, amount, kind, comment) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (eid, bid_id, actor_id, actor_role, amount, kind, comment),
        )
        return eid
    except Exception as e:
        print(f"[price_event] write failed (continuing): {e}", flush=True)
        return None


@mp_router.post("/bids")
def create_bid(body: BidIn, user=Depends(require_level(1))):
    # cargo_id или trip_id — хотя бы один (для серверных грузов)
    # Если оба null — разрешаем (для demo/local грузов), ставка просто без привязки

    # PR-B (P0-E): hard 400 на невалидный amount. Раньше backend принимал
    # 0 / отрицательные значения, защищён был только frontend (BidModal:61-64).
    # Через REST API напрямую (или скомпрометированный клиент) можно было
    # засорить таблицу bids нулевыми ставками. Тип int в pydantic ловит
    # non-numeric, но не <= 0.
    if body.amount is None or body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount должен быть > 0")

    bid_id = new_id()
    # PR-B: собираем «post-commit» нотификации в локальные переменные.
    # Раньше create_notification вызывался ВНУТРИ `with get_conn() as c:` —
    # это второе SQLite connection в момент когда первое держит транзакцию.
    # На прод-БД с WAL это могло проходить случайно, на тестах падало в
    # silent try/except → пользователи жалуются "уведомлений нет".
    # accept_bid / reject_bid / update_bid этот баг не имели потому что
    # create_notification у них уже ВНЕ with-блока. Делаем то же тут.
    post_notifs: list = []  # каждый элемент: (recipient_id, title, body, icon, url, push)
    created_room_id = None  # Variant B: канонический room_id, вернём фронту

    with get_conn() as c:
        # M1: нельзя ставить на уже занятый/истёкший груз или рейс. Пустой/
        # None status (legacy-строки) не блокируем — только явный не-active.
        if body.cargo_id:
            cg = c.execute("SELECT status FROM cargos WHERE id = ?", (body.cargo_id,)).fetchone()
            if cg and cg["status"] and cg["status"] != "active":
                raise HTTPException(status_code=409, detail="Груз больше не доступен для ставок")
        if body.trip_id:
            tr = c.execute("SELECT status FROM trips WHERE id = ?", (body.trip_id,)).fetchone()
            if tr and tr["status"] and tr["status"] != "active":
                raise HTTPException(status_code=409, detail="Рейс больше не доступен для ставок")
        # M1: дедуп — у одного автора не должно быть двух активных ставок на
        # тот же груз/рейс (для изменения цены есть PATCH /bids/{id}).
        # Возвращаем id/сумму/сообщение старой ставки в теле 409 — фронт
        # переключит модалку в режим edit и подставит текущие значения
        # вместо тупика «измените её, но кнопка серая».
        dup = c.execute(
            "SELECT id, amount, message FROM bids WHERE bidder_id = ? "
            "AND status IN ('pending','countered') "
            "AND ((cargo_id IS NOT NULL AND cargo_id = ?) OR (trip_id IS NOT NULL AND trip_id = ?))",
            (user["id"], body.cargo_id, body.trip_id),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail={
                "error": "duplicate_bid",
                "message": "У вас уже есть активная ставка — измените её",
                "existing_bid_id": dup["id"],
                "existing_amount": dup["amount"],
                "existing_message": dup["message"],
            })

        c.execute("""
            INSERT INTO bids (id, cargo_id, trip_id, bidder_id, bidder_name, bidder_phone, amount, message)
            VALUES (?,?,?,?,?,?,?,?)
        """, (bid_id, body.cargo_id, body.trip_id, user["id"],
              user.get("full_name"), user.get("phone"), body.amount, body.message))
        # Часть 3: событие цены — предложение (автор ставки = bidder).
        _record_price_event(c, bid_id, user["id"], "bidder", body.amount, "proposed", body.message)

        # Обновляем счётчик
        if body.cargo_id:
            c.execute("UPDATE cargos SET bids_count = bids_count + 1 WHERE id = ?", (body.cargo_id,))
            row = c.execute("SELECT owner_id, from_city, to_city, currency FROM cargos WHERE id = ?", (body.cargo_id,)).fetchone()
            if row:
                money = _money(body.amount, row["currency"])
                # Часть 4 (правило одного места): комнату чата создаём СНАЧАЛА,
                # чтобы deeplink уведомления вёл ПРЯМО в неё (весь торг живёт в
                # чате). Хелпер идемпотентен (UNIQUE пара). Fallback на cargo
                # detail, если комнату не удалось создать.
                try:
                    created_room_id = _ensure_chat_room_inline(
                        c, user["id"], row["owner_id"], body.cargo_id, None, bid_id,
                    )
                except Exception:
                    created_room_id = None
                # «Дом заказа» (02.08.2026): пуш ведёт в карточку груза, а не
                # в чат — там сверху блок ставки и кнопка «💬 Открыть чат»
                # рядом. Комнату по-прежнему создаём заранее (чтобы чат уже
                # был готов, когда клиент решит переписываться).
                bid_url = f"/cargos/{body.cargo_id}?bid={bid_id}"
                # Часть 4: текст пуша = событие + сумма + маршрут.
                title = f"💰 Ставка {money}"
                text = f"{money} · {row['from_city']}→{row['to_city']}"
                post_notifs.append((row["owner_id"], title, text, "💰", bid_url, True))

        if body.trip_id:
            row = c.execute("SELECT driver_id, from_city, to_city, currency FROM trips WHERE id = ?", (body.trip_id,)).fetchone()
            if row:
                money = _money(body.amount, row["currency"])
                # Часть 4: комнату чата — сначала (deeplink ведёт в неё).
                try:
                    created_room_id = _ensure_chat_room_inline(
                        c, user["id"], row["driver_id"], None, body.trip_id, bid_id,
                    )
                except Exception:
                    created_room_id = None
                # «Дом заказа»: пуш → карточка рейса (см. коммент выше).
                bid_url = f"/trips/{body.trip_id}?bid={bid_id}"
                title = f"📦 Заказ {money}"
                text = f"{money} · {row['from_city']}→{row['to_city']}"
                post_notifs.append((row["driver_id"], title, text, "📦", bid_url, True))

    # PR-B: post-commit notifications — connection с bid INSERT уже закрыт,
    # create_notification открывает свой conn без conflict'а с транзакцией.
    # Раздельные try/except: push и InApp независимы — failure одного не
    # должен подавлять другое.
    for recipient, title, text, icon, url, want_push in post_notifs:
        if want_push:
            try:
                send_to_user(recipient, title, text, url=url)
            except Exception:
                pass
        try:
            from api.notifications import create_notification
            create_notification(recipient, "bid_created", title, text, icon, url=url)
        except Exception:
            pass

    # Variant B: возвращаем канонический room_id — фронт открывает чат сразу
    # по нему, без догадок о собеседнике.
    return {"id": bid_id, "ok": True, "room_id": created_room_id}


@mp_router.get("/bids")
def list_bids(
    cargo_id: str = "",
    trip_id: str = "",
    user_id: str = "",
    show_demo: bool = False,
    authorization: Optional[str] = Header(None),
):
    where = []
    params = []
    if cargo_id:
        where.append("b.cargo_id = ?")
        params.append(cargo_id)
    if trip_id:
        where.append("b.trip_id = ?")
        params.append(trip_id)
    if user_id:
        where.append("b.bidder_id = ?")
        params.append(user_id)
    if not where:
        raise HTTPException(status_code=400, detail="Укажите cargo_id, trip_id или user_id")

    with get_conn() as c:
        # currency родителя (груз ИЛИ рейс) на каждой ставке, чтобы фронт рисовал
        # сумму в валюте листинга, а не хардкодным «$». COALESCE: ставка может
        # быть на cargo или на trip. bids.currency колонки нет → имя свободно.
        rows = c.execute(f"""
            SELECT b.*, COALESCE(c.currency, t.currency) AS currency
            FROM bids b
            LEFT JOIN cargos c ON b.cargo_id = c.id
            LEFT JOIN trips t ON b.trip_id = t.id
            WHERE {' AND '.join(where)}
            ORDER BY b.created_at DESC LIMIT 100
        """, params).fetchall()
    bids = [dict(r) for r in rows]
    # Часть 1: сырой список ДО dirty-фильтра — из него честно считаем число
    # предложений и находим собственную ставку вызывающего (dirty-фильтр по
    # prefix 'agent-'/'guest-' иначе прячет и его собственную ставку в QA).
    _raw_bids = list(bids)

    # D12 (Maestro P1): owner of the cargo/trip must see every active bid on
    # their own listing, including bids from QA/agent accounts that the
    # dirty-bidder filter hides from public callers. Without this branch,
    # the marketplace loop is broken end-to-end: a real shipper looking at
    # their own cargo's bid list would never see bids submitted by accounts
    # whose id happens to start with one of the `DIRTY_BIDDER_PREFIXES`
    # tokens — that includes the entire QA actor set (`agent-serik`, etc.),
    # and also any future namespaced internal accounts. Public anonymous and
    # non-owner callers still get the filtered list — no QA data leaks out.
    caller = _maybe_user(authorization)
    is_owner = False
    if caller:
        with get_conn() as c:
            if cargo_id:
                row = c.execute("SELECT owner_id FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
                if row and row["owner_id"] == caller["id"]:
                    is_owner = True
            elif trip_id:
                row = c.execute("SELECT driver_id FROM trips WHERE id = ?", (trip_id,)).fetchone()
                if row and row["driver_id"] == caller["id"]:
                    is_owner = True

    # Hide dirty/test bidders from public bid listings (Тестер, Баке, etc.).
    # Also drop cancelled/rejected bids from public counters so a clean cargo's
    # detail screen doesn't carry stale rejected proposals from pre-pilot data.
    #
    # Stage 52 / P0-6: TestFlight build 1 показывал в cargo detail ставки от
    # `guest_<uuid>` и `agent-<id>`/`Bid Serik [ar-...]`. Текущий _is_dirty_text
    # смотрел только bidder_name + bidder_phone, поэтому guest-/agent-id
    # проходил, если name был пустой или без триггерных токенов. Добавляем
    # явный prefix-фильтр на bidder_id и расширяем скрытые статусы до
    # ('cancelled', 'rejected') — rejected bids не должны забивать public list.
    DIRTY_BIDDER_PREFIXES = ("guest_", "agent-", "test_", "qa_")
    if not show_demo and not is_owner:
        bids = [
            b for b in bids
            # Принятую (accepted) ставку показываем ВСЕГДА, даже если биддер —
            # guest_/agent_ (иначе на принятом грузе CargoDetail видел «0
            # предложений / Будьте первым», хотя сделка уже создана).
            if b.get("status") == "accepted"
            or (
                not (b.get("bidder_id") or "").lower().startswith(DIRTY_BIDDER_PREFIXES)
                and not _is_dirty_text(b.get("bidder_name"), b.get("bidder_phone"))
                and b.get("status") not in ("cancelled", "rejected")
            )
        ]
    elif is_owner and not show_demo:
        # Owner gets the full active-bid set, including dirty/QA bidders.
        # Cancelled / rejected bids stay hidden — they're stale UI noise on
        # the active-bids list. Owner can still inspect those through the
        # /market/my dashboard if needed.
        bids = [b for b in bids if b.get("status") not in ("cancelled", "rejected")]
    # Часть 1 (конфиденциальные ставки, модель InDriver — решение владельца):
    # не-владелец НЕ видит ЧУЖИЕ суммы. Отдаём количество предложений + ТОЛЬКО
    # свою ставку. Принятая (accepted) ставка видна ВСЕМ (сделка заключена).
    # Владелец листинга видит всё как раньше (список/суммы/контр/принять).
    _active = ("pending", "countered", "accepted")
    # count/my_bid — из СЫРОГО списка (до dirty-фильтра), иначе своя QA-ставка
    # (agent-) не попадёт. Реального юзера dirty-фильтр не трогает.
    proposals_count = sum(1 for b in _raw_bids if b.get("status") in _active)
    my_bid = None
    if caller:
        for b in _raw_bids:
            if b.get("bidder_id") == caller["id"] and b.get("status") in _active:
                my_bid = b
                break
    # Конфиденциальный режим (BIDS_CONFIDENTIAL) — под будущую монетизацию.
    # По умолчанию FALSE: ставки открыты для всех, не-владелец видит полный
    # список с суммами (как до фичи). При TRUE — не-владельцу отдаём только
    # принятые (публичные) + собственную ставку, чужие суммы скрыты.
    try:
        import config as _cfg
        _bids_confidential = bool(getattr(_cfg, "BIDS_CONFIDENTIAL", False))
    except Exception:
        _bids_confidential = False
    if _bids_confidential and not is_owner:
        # Только принятые (публично видимы) + собственная ставка бидера (из сырого
        # списка — если dirty-фильтр её убрал, возвращаем через my_bid).
        bids = [b for b in bids if b.get("status") == "accepted"]
        if my_bid and not any(b.get("id") == my_bid.get("id") for b in bids):
            bids.append(my_bid)
    # Security (B2): bidder_phone виден ТОЛЬКО владельцу листинга (он ведёт
    # переговоры). Публичным/чужим вызовам /bids телефон оферента не отдаём —
    # раньше SELECT b.* возвращал bidder_phone любому, кто знает cargo_id.
    if not is_owner:
        for b in bids:
            b.pop("bidder_phone", None)
    # Обогащаем ставки РЕАЛЬНЫМИ данными оферента (статус верификации +
    # рейтинг + число отзывов), чтобы клиент не принимал ставку вслепую
    # (раньше на карточке был rating:0 хардкод). Сбой не ломает список.
    try:
        from database import reviews_dal
        with get_conn() as c3:
            for b in bids:
                did = b.get("bidder_id")
                drow = c3.execute(
                    "SELECT status FROM drivers_registration WHERE id = ?",
                    (did,),
                ).fetchone() if did else None
                b["bidder_verified"] = bool(drow and drow["status"] == "approved")
        for b in bids:
            did = b.get("bidder_id")
            summary = reviews_dal.get_rating_summary(did) if did else {}
            b["bidder_rating"] = summary.get("average", 0) or 0
            b["bidder_reviews_count"] = summary.get("count", 0) or 0
    except Exception:
        for b in bids:
            b.setdefault("bidder_verified", False)
            b.setdefault("bidder_rating", 0)
            b.setdefault("bidder_reviews_count", 0)
    # count = число предложений (видно всем); my_bid — своя ставка (для не-
    # владельца это единственная сумма, которую он видит); is_owner — фронту
    # решать. confidential — ЯВНЫЙ сигнал режима: True только когда сервер
    # реально прячет чужие суммы от этого вызывающего (BIDS_CONFIDENTIAL=true
    # И не владелец). Фронт полагается на него, а не на длину списка — иначе
    # dirty-фильтр QA-ставок (agent-*) в открытом режиме ложно выглядел бы как
    # конфиденциальность.
    return {
        "bids": bids,
        "count": proposals_count,
        "my_bid": my_bid,
        "is_owner": is_owner,
        "confidential": bool(_bids_confidential and not is_owner),
    }


@mp_router.get("/bids/{bid_id}/events")
def bid_price_events(bid_id: str, user=Depends(require_level(1))):
    """Часть 3: история цены по ставке (proposed/updated/countered/accepted/
    rejected), сортировка по времени. Старые ставки без событий → пустой список
    (бэкфилл не делаем).

    Security: история содержит СУММЫ торга — при конфиденциальных ставках
    (Часть 1) её нельзя отдавать анонимно/чужим. Доступ только участникам
    торга: автору ставки (bidder) и владельцу листинга (owner)."""
    with get_conn() as c:
        bid_row = c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
        if not bid_row:
            raise HTTPException(status_code=404, detail="Ставка не найдена")
        bid = dict(bid_row)
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if user["id"] not in (bid.get("bidder_id"), owner_id):
            raise HTTPException(status_code=403)
        rows = c.execute(
            "SELECT id, bid_id, actor_id, actor_role, amount, kind, comment, created_at "
            "FROM price_events WHERE bid_id = ? ORDER BY created_at ASC, id ASC",
            (bid_id,),
        ).fetchall()
    return {"events": [dict(r) for r in rows]}


# ═══ My Dashboard ═══

@mp_router.get("/my")
def my_dashboard(user=Depends(require_level(1))):
    """Всё что касается текущего юзера: мои грузы, мои рейсы, входящие/исходящие ставки."""
    uid = user["id"]
    with get_conn() as c:
        my_cargos = [dict(r) for r in c.execute(
            "SELECT * FROM cargos WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50", (uid,)).fetchall()]
        my_trips = [dict(r) for r in c.execute(
            "SELECT * FROM trips WHERE driver_id = ? ORDER BY created_at DESC LIMIT 50", (uid,)).fetchall()]
        # Ставки которые Я сделал. currency берём у родителя (груз ИЛИ рейс) —
        # для my_bids это единственный источник: груз/рейс чужой, в payload его
        # нет, без JOIN фронт рисовал сумму хардкодным «$». COALESCE: ставка
        # может быть на cargo или на trip.
        # Маршрут ставки: для cargo-ставок — города груза, для trip-ставок —
        # города рейса (раньше trip-ставки шли без маршрута → «— → —» в UI).
        my_bids = [dict(r) for r in c.execute(
            "SELECT b.*, "
            "COALESCE(c.from_city, t.from_city) as cargo_from, "
            "COALESCE(c.to_city, t.to_city) as cargo_to, "
            "COALESCE(c.from_country, t.from_country) AS from_country, "
            "COALESCE(c.to_country, t.to_country) AS to_country, "
            "c.cargo_desc, "
            "COALESCE(c.currency, t.currency) AS currency "
            "FROM bids b LEFT JOIN cargos c ON b.cargo_id = c.id "
            "LEFT JOIN trips t ON b.trip_id = t.id "
            "WHERE b.bidder_id = ? ORDER BY b.created_at DESC LIMIT 50", (uid,)).fetchall()]
        # Ставки на МОИ листинги (входящие): грузы (клиент) И рейсы (водитель).
        # Раньше JOIN шёл только на cargos — ставки клиентов на рейс водителя
        # не попадали в incoming_bids вообще, водитель их нигде не видел.
        # COALESCE: маршрут/валюта — от родителя (груз или рейс).
        incoming_bids = [dict(r) for r in c.execute(
            "SELECT b.*, "
            "COALESCE(c.from_city, t.from_city) as cargo_from, "
            "COALESCE(c.to_city, t.to_city) as cargo_to, "
            "COALESCE(c.from_country, t.from_country) AS from_country, "
            "COALESCE(c.to_country, t.to_country) AS to_country, "
            "c.cargo_desc, "
            "COALESCE(c.currency, t.currency) AS currency "
            "FROM bids b "
            "LEFT JOIN cargos c ON b.cargo_id = c.id "
            "LEFT JOIN trips t ON b.trip_id = t.id "
            "WHERE c.owner_id = ? OR t.driver_id = ? "
            "ORDER BY b.created_at DESC LIMIT 50", (uid, uid)).fetchall()]
        # Мои сделки. LEFT JOIN на cargos (описание/тип кузова/дата подачи) и на
        # drivers_registration (имя водителя/грузоотправителя) — без JOIN карточка
        # сделки на клиенте «Везут»/«Доставлено» рендерилась без груза, без типа
        # кузова и без имени водителя (трекинг показывал машину без подписи).
        # LEFT JOIN, чтобы сделка не пропадала, если cargo удалён.
        my_deals = [dict(r) for r in c.execute(
            "SELECT d.*, "
            "c.cargo_desc AS cargo_desc, c.cargo_type AS cargo_type, "
            "c.currency AS currency, "
            "c.weight_tons AS weight_tons, c.volume_m3 AS volume_m3, "
            "c.pickup_date AS departure, "
            "COALESCE(c.from_country, t.from_country) AS from_country, "
            "COALESCE(c.to_country, t.to_country) AS to_country, "
            "t.truck_type AS truck_type, "
            "dr.full_name AS driver_name, sh.full_name AS shipper_name, "
            "(SELECT m.body FROM chat_messages m WHERE m.room_id = d.chat_room_id "
            " ORDER BY m.created_at DESC LIMIT 1) AS last_message, "
            "(SELECT m.created_at FROM chat_messages m WHERE m.room_id = d.chat_room_id "
            " ORDER BY m.created_at DESC LIMIT 1) AS last_message_at, "
            "(SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = d.chat_room_id "
            " AND m.is_read = 0 AND m.sender_id != ?) AS unread_count "
            "FROM deals d "
            "LEFT JOIN cargos c ON d.cargo_id = c.id "
            "LEFT JOIN trips t ON d.trip_id = t.id "
            "LEFT JOIN drivers_registration dr ON dr.id = d.driver_id "
            "LEFT JOIN drivers_registration sh ON sh.id = d.shipper_id "
            "WHERE d.shipper_id = ? OR d.driver_id = ? "
            "ORDER BY d.created_at DESC LIMIT 50",
            (uid, uid, uid)).fetchall()]

    for cargo in my_cargos:
        try:
            cargo["photos"] = _sign_cargo_photos(json.loads(cargo.get("photos") or "[]"))
        except Exception:
            cargo["photos"] = []

    # Для вкладки «Предложения»: к каждому грузу — количество живых ставок,
    # минимальная цена и время самой свежей ставки. Фронт группирует по cargo.
    cargo_ids = [cg["id"] for cg in my_cargos]
    active_bids_by_cargo = {}
    if cargo_ids:
        with get_conn() as c2:
            ph = ",".join("?" * len(cargo_ids))
            rows = c2.execute(
                f"SELECT cargo_id, COUNT(*) AS cnt, MIN(amount) AS min_price, "
                f"MAX(created_at) AS latest_bid_at "
                f"FROM bids WHERE cargo_id IN ({ph}) AND status IN ('pending','countered') "
                f"GROUP BY cargo_id",
                cargo_ids,
            ).fetchall()
            for r in rows:
                active_bids_by_cargo[r["cargo_id"]] = {
                    "active_bids_count": r["cnt"],
                    "min_bid_price": r["min_price"],
                    "latest_bid_at": r["latest_bid_at"],
                }
    for cargo in my_cargos:
        ab = active_bids_by_cargo.get(cargo["id"], {})
        cargo["active_bids_count"] = ab.get("active_bids_count", 0)
        cargo["min_bid_price"] = ab.get("min_bid_price")
        cargo["latest_bid_at"] = ab.get("latest_bid_at")

    return {
        "my_cargos": my_cargos,
        "my_trips": my_trips,
        "my_bids": my_bids,
        "incoming_bids": incoming_bids,
        "my_deals": my_deals,
    }


# ═══ Drivers list (approved, для клиентов) ═══

@mp_router.get("/drivers")
def list_drivers(truck_type: str = "", limit: int = 30):
    """Список одобренных водителей с авто — для раздела 'Машины'."""
    where = ["status = 'approved'", "vehicle_type IS NOT NULL"]
    params = []
    if truck_type:
        where.append("vehicle_type = ?")
        params.append(truck_type)

    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, phone, full_name, vehicle_type, vehicle_brand, vehicle_plate,
                   vehicle_year, vehicle_capacity_kg, security_score, security_color,
                   vehicle_photo_url, cabin_photo_url
            FROM drivers_registration
            WHERE {' AND '.join(where)}
            ORDER BY security_score DESC LIMIT ?
        """, (*params, limit)).fetchall()

    from database import reviews_dal
    from services import file_signing
    result = []
    for r in rows:
        d = dict(r)
        # Рейтинг
        summary = reviews_dal.get_rating_summary(d["id"])
        d["rating"] = summary.get("average", 0)
        d["reviews_count"] = summary.get("count", 0)
        # Фото фуры — клиент должен видеть машину перед сделкой. Отдаём
        # ПОДПИСАННЫЕ ссылки (не raw ключи), сырые поля убираем.
        photos = []
        for key in (d.pop("vehicle_photo_url", None), d.pop("cabin_photo_url", None)):
            signed = file_signing.sign(key)
            if signed:
                photos.append(signed)
        d["vehicle_photos"] = photos
        d.pop("phone", None)  # не отдаём контакт
        result.append(d)
    return {"drivers": result, "total": len(result)}


# ═══ Trip Status ═══

@mp_router.patch("/trips/{trip_id}/status")
def update_trip_status(trip_id: str, new_status: str, user=Depends(require_level(1))):
    """Обновить статус рейса: active → booked → in_transit → delivered."""
    VALID = ["active", "booked", "in_transit", "delivered", "cancelled"]
    if new_status not in VALID:
        raise HTTPException(status_code=400, detail=f"Допустимые статусы: {', '.join(VALID)}")
    with get_conn() as c:
        trip = c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            raise HTTPException(status_code=404)
        if trip["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Только водитель может менять статус")
        c.execute("UPDATE trips SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_status, trip_id))
        # Обратный синк deal.status — иначе legacy-эндпоинт рейса расходился со
        # статусом сделки (deal остаётся accepted, а trip уже delivered).
        _TRIP_TO_DEAL = {"in_transit": "in_progress", "delivered": "delivered", "cancelled": "cancelled"}
        if new_status in _TRIP_TO_DEAL:
            c.execute(
                "UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE trip_id = ? AND status NOT IN ('delivered','cancelled')",
                (_TRIP_TO_DEAL[new_status], trip_id),
            )

    # Push + InApp notification
    try:
        from api.notifications import create_notification
        labels = {"booked": "📦 Груз принят", "in_transit": "🚛 В пути", "delivered": "✅ Доставлен"}
        if new_status in labels and trip["booked_by"]:
            _turl = f"/trips/{trip_id}"
            send_to_user(trip["booked_by"], labels[new_status], f"{trip['from_city']}→{trip['to_city']}", url=_turl)
            create_notification(trip["booked_by"], "trip_status", labels[new_status],
                                f"Рейс {trip['from_city']}→{trip['to_city']}: {new_status}", "🚛", url=_turl)
    except Exception:
        pass

    return {"ok": True, "status": new_status}


# ═══ Driver Profile (public) ═══

@mp_router.get("/driver-profile/{driver_id}")
def driver_profile(driver_id: str):
    """Публичный профиль водителя — авто, рейтинг, рейсы."""
    with get_conn() as c:
        d = c.execute("""
            SELECT id, full_name, vehicle_type, vehicle_brand, vehicle_plate, vehicle_year,
                   vehicle_capacity_kg, security_score, security_color, created_at
            FROM drivers_registration WHERE id = ? AND status = 'approved'
        """, (driver_id,)).fetchone()
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    d = dict(d)

    # Рейтинг
    from database import reviews_dal
    d["rating"] = reviews_dal.get_rating_summary(driver_id)

    # Активные рейсы
    with get_conn() as c:
        trips = c.execute(
            "SELECT id, from_city, to_city, truck_type, price, departure, status FROM trips WHERE driver_id = ? ORDER BY created_at DESC LIMIT 10",
            (driver_id,),
        ).fetchall()
    d["trips"] = [dict(t) for t in trips]

    # Последние отзывы
    d["reviews"] = reviews_dal.get_reviews_for(driver_id, limit=5)

    return d


def _ensure_chat_room_inline(c, user_a: str, user_b: str, cargo_id, trip_id, bid_id=None) -> str:
    """Variant B: КАНОНИЧЕСКАЯ комната сделки на открытом conn (в транзакции
    вызывающего, без отдельного write-lock). Ключ = deal_key (cargo/trip +
    отсортированная пара) — паритет с api.chat. user_b трактуется как владелец
    (cargo owner / driver рейса), user_a — откликнувшийся (bidder)."""
    p1, p2 = sorted([user_a, user_b])
    if cargo_id:
        dk = f"c:{cargo_id}:{p1}:{p2}"
    elif trip_id:
        dk = f"t:{trip_id}:{p1}:{p2}"
    else:
        dk = f"p:{p1}:{p2}"
    row = c.execute("SELECT id FROM chat_rooms WHERE deal_key = ?", (dk,)).fetchone()
    if row:
        if bid_id:
            c.execute("UPDATE chat_rooms SET bid_id = COALESCE(bid_id, ?) WHERE id = ?", (bid_id, row["id"]))
        return row["id"]
    rid = new_id()
    c.execute(
        "INSERT INTO chat_rooms (id, participant_1, participant_2, owner_id, bidder_id, bid_id, cargo_id, trip_id, deal_key) "
        "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(deal_key) DO NOTHING",
        (rid, p1, p2, user_b, user_a, bid_id, cargo_id, trip_id, dk),
    )
    row = c.execute("SELECT id FROM chat_rooms WHERE deal_key = ?", (dk,)).fetchone()
    return row["id"] if row else rid


def _notify_rejected_siblings(rejected_siblings):
    """Уведомить авторов перебитых ставок, что их предложение отклонено при
    accept выигравшей ставки. Раньше сайд-ставки гасились молча (auto-reject
    в _finalize_accept_inline) — биддер видел «pending», а по факту его уже
    отклонили. Вызывается ПОСЛЕ коммита accept-транзакции."""
    if not rejected_siblings:
        return
    try:
        from api.notifications import create_notification
    except Exception:
        create_notification = None
    for sib in rejected_siblings:
        try:
            with get_conn() as _cc:
                _cur = _bid_currency(_cc, sib)
            if sib.get("cargo_id"):
                url = f"/cargos/{sib['cargo_id']}"
            elif sib.get("trip_id"):
                url = f"/trips/{sib['trip_id']}"
            else:
                url = "/"
            title = "❌ Ставка не выбрана"
            text = f"По заказу выбран другой исполнитель. Предложение {_money(sib.get('amount'), _cur)} отклонено."
            try:
                send_to_user(sib["bidder_id"], title, text, url=url)
            except Exception:
                pass
            if create_notification:
                try:
                    create_notification(sib["bidder_id"], "bid_rejected", title, text, "❌", url=url)
                except Exception:
                    pass
            # P3-fix: след в чате проигравшего биддера — но только если комната
            # УЖЕ существует (торг/контр её создавали). Пустую не плодим.
            try:
                with get_conn() as _cc2:
                    owner_id = _cargo_or_trip_owner_id(_cc2, sib)
                    if owner_id:
                        _p1, _p2 = sorted([sib["bidder_id"], owner_id])
                        if sib.get("cargo_id"):
                            _dk = f"c:{sib['cargo_id']}:{_p1}:{_p2}"
                        elif sib.get("trip_id"):
                            _dk = f"t:{sib['trip_id']}:{_p1}:{_p2}"
                        else:
                            _dk = f"p:{_p1}:{_p2}"
                        _rr = _cc2.execute("SELECT id FROM chat_rooms WHERE deal_key = ?", (_dk,)).fetchone()
                        if _rr:
                            _cc2.execute(
                                "INSERT INTO chat_messages (room_id, sender_id, text) VALUES (?,?,?)",
                                (_rr["id"], "system", title),
                            )
                            _cc2.execute(
                                "UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?",
                                (title[:50], _rr["id"]),
                            )
            except Exception:
                pass
        except Exception:
            pass


def _finalize_accept_inline(c, user, bid: dict, final_amount: int):
    """Shared accept logic used by accept_bid and counter/accept.

    Runs inside an open SQLite transaction (`with get_conn() as c:`).
    Authorises the user, updates linked cargo/trip, marks the winning bid
    as accepted (auto-rejecting siblings), creates a chat_room and a deal.

    Returns: dict(deal_id, chat_room_id, from_city, to_city, shipper_id, driver_id)
    """
    bid_id = bid["id"]
    shipper_id = user["id"]
    driver_id = bid["bidder_id"]
    from_city, to_city = "", ""

    if bid["cargo_id"]:
        cargo = c.execute(
            "SELECT owner_id, from_city, to_city FROM cargos WHERE id = ?", (bid["cargo_id"],)
        ).fetchone()
        if not cargo or cargo["owner_id"] != user["id"]:
            raise HTTPException(status_code=403)
        c.execute(
            "UPDATE cargos SET status = 'taken', taken_by = ? WHERE id = ?",
            (bid["bidder_id"], bid["cargo_id"]),
        )
        from_city, to_city = cargo["from_city"], cargo["to_city"]

    if bid["trip_id"]:
        trip = c.execute(
            "SELECT driver_id, from_city, to_city FROM trips WHERE id = ?", (bid["trip_id"],)
        ).fetchone()
        if trip:
            from_city, to_city = trip["from_city"], trip["to_city"]
            shipper_id = bid["bidder_id"]
            driver_id = trip["driver_id"]
            if trip["driver_id"] != user["id"]:
                raise HTTPException(status_code=403)
            c.execute(
                "UPDATE trips SET status = 'booked', booked_by = ? WHERE id = ?",
                (bid["bidder_id"], bid["trip_id"]),
            )

    # QA-аудит P0 (double-accept race): раньше WHERE id=? без guard —
    # два одновременных accept (двойной тап «Принять» или параллельный
    # accept двух ставок) оба проходили read-check выше и создавали ДВЕ
    # сделки на один груз. Conditional UPDATE + rowcount закрывает гонку:
    # проигравшая транзакция получает rowcount=0 → 409 → полный rollback
    # (включая UPDATE cargos/trips выше по функции).
    cur = c.execute(
        "UPDATE bids SET amount = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND status IN ('pending', 'countered')",
        (final_amount, bid_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Ставка уже обработана")
    # Auto-decline siblings: anything still pending OR countered on the same parent.
    # Сначала собираем перебитые ставки (id/bidder/amount) — их авторов надо
    # уведомить после коммита (см. _notify_rejected_siblings).
    _sibs = c.execute(
        "SELECT id, bidder_id, amount, cargo_id, trip_id FROM bids "
        "WHERE (cargo_id = ? OR trip_id = ?) AND id != ? AND status IN ('pending', 'countered')",
        (bid.get("cargo_id"), bid.get("trip_id"), bid_id),
    ).fetchall()
    rejected_siblings = [dict(r) for r in _sibs]
    c.execute(
        "UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
        "WHERE (cargo_id = ? OR trip_id = ?) AND id != ? AND status IN ('pending', 'countered')",
        (bid.get("cargo_id"), bid.get("trip_id"), bid_id),
    )
    # P3-fix: пишем событие в ценовой timeline каждой перебитой ставки — иначе
    # у проигравших история обрывалась на «proposed» без финала.
    for _sib in rejected_siblings:
        _record_price_event(c, _sib["id"], user["id"], "owner", _sib.get("amount"), "rejected", None)

    chat_room_id = _ensure_chat_room_inline(
        c, shipper_id, driver_id, bid.get("cargo_id"), bid.get("trip_id")
    )

    deal_id = new_id()
    c.execute(
        """
        INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id,
                           from_city, to_city, amount, status, chat_room_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (deal_id, bid.get("cargo_id"), bid.get("trip_id"), bid_id,
         shipper_id, driver_id, from_city, to_city, final_amount,
         "accepted", chat_room_id),
    )

    # PR4 — immutable юридическое событие сделки. actor = текущий пользователь
    # (из auth), created_at ставит сервер. Роль actor'а: тот, кто принял ставку,
    # — владелец cargo (client) или driver рейса (driver). Локальный импорт —
    # избегаем циклов (deal_room_dal не тянет marketplace). Не критично для
    # accept, если запись события упадёт — оборачиваем в try.
    try:
        from database import deal_room_dal
        actor_role = "driver" if bid.get("trip_id") else "client"
        deal_room_dal.create_deal_event(
            "deal.bid_accepted",
            actor_id=user["id"],
            actor_role=actor_role,
            conversation_id=chat_room_id,
            deal_id=deal_id,
            bid_id=bid_id,
            load_id=bid.get("cargo_id"),
            trip_id=bid.get("trip_id"),
            payload={"amount": final_amount, "from_city": from_city, "to_city": to_city},
            conn=c,   # та же открытая транзакция — иначе SQLite write-lock
        )
    except Exception as e:
        print(f"[accept_bid] deal_event write failed (continuing): {e}", flush=True)

    # Системный маркер в чат — чтобы Deal Room сразу не был пустым (раньше до
    # первой смены статуса комната открывалась без единого сообщения).
    try:
        if chat_room_id:
            _mk = f"🤝 Сделка создана · {final_amount}"
            c.execute(
                "INSERT INTO chat_messages (room_id, sender_id, text) VALUES (?,?,?)",
                (chat_room_id, "system", _mk),
            )
            c.execute(
                "UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?",
                (_mk[:50], chat_room_id),
            )
    except Exception as e:
        print(f"[accept_bid] chat marker write failed (continuing): {e}", flush=True)

    return {
        "deal_id": deal_id,
        "chat_room_id": chat_room_id,
        "from_city": from_city,
        "to_city": to_city,
        "shipper_id": shipper_id,
        "driver_id": driver_id,
        "rejected_siblings": rejected_siblings,
    }


@mp_router.post("/bids/{bid_id}/accept")
def accept_bid(bid_id: str, user=Depends(require_level(1))):
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        # Owner cannot accept a bid that is currently countered — driver must
        # accept the counter first.
        if bid["status"] == "countered":
            raise HTTPException(
                status_code=409,
                detail="Сначала водитель должен принять контр-оффер",
            )
        if bid["status"] != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Ставку нельзя принять в статусе {bid['status']}",
            )
        result = _finalize_accept_inline(c, user, bid, bid["amount"])
        # Часть 3: событие — владелец принял ставку (actor=owner).
        _record_price_event(c, bid_id, user["id"], "owner", bid["amount"], "accepted", None)
        _cur = _bid_currency(c, bid)   # валюта ставки для текста уведомления

    # «Дом заказа» (02.08.2026): пуш о принятой ставке ведёт в карточку
    # заказа (там сверху блок сделки + прогресс-бар + кнопка «💬 Открыть
    # чат»), а не в Deal Room. Так и статус доставки, и контакт с
    # контрагентом всегда в одном месте.
    if bid.get("cargo_id"):
        deal_url = f"/cargos/{bid['cargo_id']}"
    elif bid.get("trip_id"):
        deal_url = f"/trips/{bid['trip_id']}"
    else:
        deal_url = f"/deals/{result['deal_id']}"
    title = "✅ Ставка принята!"
    text = f"Ваше предложение {_money(bid['amount'], _cur)} принято! Сделка создана."
    try:
        send_to_user(bid["bidder_id"], title, text, url=deal_url)
    except Exception:
        pass
    try:
        from api.notifications import create_notification
        create_notification(bid["bidder_id"], "bid_accepted", title, text, "✅", url=deal_url)
    except Exception:
        pass

    # Уведомляем авторов перебитых ставок (auto-reject внутри _finalize).
    _notify_rejected_siblings(result.get("rejected_siblings"))

    return {"ok": True, "deal_id": result["deal_id"], "chat_room_id": result["chat_room_id"]}


# ═══ Bid actions: edit / cancel / reject ═══

def _load_bid_or_404(c, bid_id: str) -> dict:
    row = c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Ставка не найдена")
    return dict(row)


def _cargo_or_trip_owner_id(c, bid: dict):
    """Returns the user_id allowed to reject this bid (cargo owner or trip driver)."""
    if bid.get("cargo_id"):
        row = c.execute("SELECT owner_id FROM cargos WHERE id = ?", (bid["cargo_id"],)).fetchone()
        if row:
            return row["owner_id"]
    if bid.get("trip_id"):
        row = c.execute("SELECT driver_id FROM trips WHERE id = ?", (bid["trip_id"],)).fetchone()
        if row:
            return row["driver_id"]
    return None


@mp_router.patch("/bids/{bid_id}")
def update_bid(bid_id: str, body: BidUpdateIn, user=Depends(require_level(1))):
    """Bidder edits their own pending bid (amount and/or message)."""
    if body.amount is None and body.message is None:
        raise HTTPException(status_code=400, detail="Укажите amount или message для обновления")
    if body.amount is not None and body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount должен быть > 0")

    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        if bid["bidder_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно редактировать только свою ставку")
        if bid["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Ставку нельзя изменить в статусе {bid['status']}")

        old_amount = bid["amount"]
        new_amount = body.amount if body.amount is not None else old_amount
        # Нижний предел скидки: нельзя ронять ставку до символической суммы
        # (в проде видели «$5333 → $1»). Разрешаем снижать не более чем на 90%
        # от исходной — глубже это ошибка/абьюз, а не торг.
        if body.amount is not None and old_amount and new_amount < old_amount * 0.1:
            raise HTTPException(
                status_code=400,
                detail="Слишком большая скидка: цену нельзя снижать более чем на 90%",
            )
        new_message = body.message if body.message is not None else bid.get("message")

        c.execute(
            "UPDATE bids SET amount = ?, message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_amount, new_message, bid_id),
        )
        # Часть 3: событие — bidder изменил свою ставку.
        _record_price_event(c, bid_id, user["id"], "bidder", new_amount, "updated", new_message)
        updated = dict(c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone())

    # Discount notification: amount decreased → ping the cargo/trip owner.
    # Stage 52 / P1-11: текст уведомления зависит от роли получателя.
    # - bid на cargo  → owner это client → bidder это водитель.
    # - bid на trip   → owner это driver → bidder это грузовладелец.
    # Иначе на TestFlight build 1 владелец рейса получал «Водитель снизил
    # цену», хотя bidder был грузовладельцем (и наоборот).
    if body.amount is not None and new_amount < old_amount:
        try:
            owner_id = None
            _cur = "USD"
            with get_conn() as c2:
                owner_id = _cargo_or_trip_owner_id(c2, updated)
                _cur = _bid_currency(c2, updated)
            if owner_id:
                recipient_role = "client" if updated.get("cargo_id") else "driver"
                bidder_role_word = "Водитель" if recipient_role == "client" else "Грузовладелец"
                bidder_label = updated.get("bidder_name") or bidder_role_word
                title = f"💰 Скидка: {_money(old_amount, _cur)} → {_money(new_amount, _cur)}"
                text = f"{bidder_label} снизил цену на {_money(old_amount - new_amount, _cur)}"
                if updated.get("cargo_id"):
                    _disc_url = f"/cargos/{updated['cargo_id']}?bid={bid_id}"
                elif updated.get("trip_id"):
                    _disc_url = f"/trips/{updated['trip_id']}?bid={bid_id}"
                else:
                    _disc_url = "/"
                try:
                    send_to_user(owner_id, title, text, url=_disc_url)
                except Exception:
                    pass
                try:
                    from api.notifications import create_notification
                    create_notification(owner_id, "bid", title, text, "💰", url=_disc_url)
                except Exception:
                    pass
        except Exception:
            pass

    return {"ok": True, "bid": updated}


@mp_router.post("/bids/{bid_id}/cancel")
def cancel_bid(bid_id: str, user=Depends(require_level(1))):
    """Bidder cancels their own pending or countered bid."""
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        if bid["bidder_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Можно отменить только свою ставку")
        if bid["status"] not in ("pending", "countered"):
            raise HTTPException(status_code=409, detail=f"Ставку нельзя отменить в статусе {bid['status']}")

        c.execute(
            "UPDATE bids SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (bid_id,),
        )
        # P3-fix: финал в ценовом timeline — раньше отмена не оставляла события.
        _record_price_event(c, bid_id, user["id"], "bidder", bid.get("amount"), "cancelled", None)
        # Decrement bids_count safely (never below 0).
        if bid.get("cargo_id"):
            c.execute(
                "UPDATE cargos SET bids_count = MAX(0, bids_count - 1) WHERE id = ?",
                (bid["cargo_id"],),
            )

    # Уведомляем владельца груза/рейса, что биддер отозвал ставку. Раньше отмена
    # проходила молча — владелец видел прежнее число откликов и «висящую» ставку
    # в «Предложениях», не зная, что она уже снята.
    try:
        with get_conn() as _cc:
            owner_id = _cargo_or_trip_owner_id(_cc, bid)
            _cur = _bid_currency(_cc, bid)
        if owner_id:
            if bid.get("cargo_id"):
                back_url = f"/cargos/{bid['cargo_id']}"
            elif bid.get("trip_id"):
                back_url = f"/trips/{bid['trip_id']}"
            else:
                back_url = "/"
            title = "↩️ Ставка отозвана"
            body_text = f"Предложение {_money(bid['amount'], _cur)} отозвано автором"
            try:
                send_to_user(owner_id, title, body_text, url=back_url)
            except Exception:
                pass
            try:
                from api.notifications import create_notification
                create_notification(owner_id, "bid_cancelled", title, body_text, "↩️", url=back_url)
            except Exception:
                pass
    except Exception:
        pass

    return {"ok": True, "bid_id": bid_id, "status": "cancelled"}


@mp_router.post("/bids/{bid_id}/reject")
def reject_bid(bid_id: str, user=Depends(require_level(1))):
    """Cargo owner or trip owner explicitly rejects a pending or countered bid."""
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if not owner_id or owner_id != user["id"]:
            raise HTTPException(status_code=403, detail="Только владелец груза/рейса может отклонить ставку")
        if bid["status"] not in ("pending", "countered"):
            raise HTTPException(status_code=409, detail=f"Ставку нельзя отклонить в статусе {bid['status']}")

        c.execute(
            "UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (bid_id,),
        )
        # Часть 3: событие — владелец отклонил (actor=owner).
        _record_price_event(c, bid_id, user["id"], "owner", bid.get("amount"), "rejected", None)
        # M2: «отклики» (bids_count) = активные ставки. cancel уже уменьшал
        # счётчик, а reject — нет, из-за чего в ленте число откликов
        # завышалось после отклонений. Симметрично уменьшаем здесь.
        if bid.get("cargo_id"):
            c.execute(
                "UPDATE cargos SET bids_count = MAX(0, bids_count - 1) WHERE id = ?",
                (bid["cargo_id"],),
            )

    # Notify the bidder. Часть 4: deeplink ведёт в чат сделки (не на лист).
    title = "❌ Ставка отклонена"
    with get_conn() as _cc:
        _cur = _bid_currency(_cc, bid)
        try:
            _rr = _ensure_chat_room_inline(
                _cc, bid["bidder_id"], _cargo_or_trip_owner_id(_cc, bid),
                bid.get("cargo_id"), bid.get("trip_id"), bid_id,
            )
        except Exception:
            _rr = None
    # «Дом заказа»: биддер попадает в карточку СВОЕЙ ставки (груз/рейс),
    # а не в чат — там сразу видно, что ставка отклонена, и можно поставить
    # новую или уйти. Чат — фолбэк, если по какой-то причине нет id.
    if bid.get("cargo_id"):
        back_url = f"/cargos/{bid['cargo_id']}"
    elif bid.get("trip_id"):
        back_url = f"/trips/{bid['trip_id']}"
    elif _rr:
        back_url = f"/chats/{_rr}"
    else:
        back_url = "/"
    body_text = f"Ваше предложение {_money(bid['amount'], _cur)} отклонено"
    try:
        send_to_user(bid["bidder_id"], title, body_text, url=back_url)
    except Exception:
        pass
    try:
        from api.notifications import create_notification
        create_notification(bid["bidder_id"], "bid_rejected", title, body_text, "❌", url=back_url)
    except Exception:
        pass

    return {"ok": True, "bid_id": bid_id, "status": "rejected"}


# ═══ Counter-offer + chat-before-accept ═══

@mp_router.post("/bids/{bid_id}/counter")
def counter_bid(bid_id: str, body: BidCounterIn, user=Depends(require_level(1))):
    """Cargo/trip owner sends a counter-offer to a pending bid."""
    if body.amount is None or body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount должен быть > 0")
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if not owner_id or owner_id != user["id"]:
            raise HTTPException(status_code=403, detail="Только владелец груза/рейса может отправить контр-оффер")
        if bid["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Контр-оффер нельзя отправить в статусе {bid['status']}")

        c.execute(
            "UPDATE bids SET status = 'countered', counter_amount = ?, counter_message = ?, "
            "counter_by = 'owner', counter_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (body.amount, body.message, bid_id),
        )
        # Часть 3: событие — владелец прислал контр (actor=owner).
        _record_price_event(c, bid_id, user["id"], "owner", body.amount, "countered", body.message)
        # Часть 4: комната чата пары (deeplink уведомления ведёт в неё).
        try:
            _counter_room = _ensure_chat_room_inline(
                c, bid["bidder_id"], owner_id, bid.get("cargo_id"), bid.get("trip_id"), bid_id,
            )
        except Exception:
            _counter_room = None
        updated = dict(c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone())

    # «Дом заказа»: контр-оффер ведёт биддера в карточку заказа (там сверху
    # плашка «🔁 Встречная цена X — Принять / Своя цена / Отклонить»), а не
    # сразу в чат. Чат — фолбэк.
    if bid.get("cargo_id"):
        counter_url = f"/cargos/{bid['cargo_id']}?bid={bid_id}"
    elif bid.get("trip_id"):
        counter_url = f"/trips/{bid['trip_id']}?bid={bid_id}"
    elif _counter_room:
        counter_url = f"/chats/{_counter_room}"
    else:
        counter_url = "/"
    with get_conn() as c2:
        cur = _bid_currency(c2, bid)
    title = f"🔁 Контр-оффер: {_money(body.amount, cur)}"
    # Роль-зависимый текст: для bid на груз контр шлёт владелец груза; для bid
    # на рейс — владелец рейса (водитель). Иначе биддеру на рейс приходило
    # неверное «Владелец груза предложил».
    _owner_word = "Владелец груза" if bid.get("cargo_id") else "Владелец рейса"
    text = f"{_owner_word} предложил {_money(body.amount, cur)} вместо {_money(bid['amount'], cur)}"
    try:
        send_to_user(bid["bidder_id"], title, text, url=counter_url)
    except Exception:
        pass
    try:
        from api.notifications import create_notification
        create_notification(bid["bidder_id"], "bid_countered", title, text, "🔁", url=counter_url)
    except Exception:
        pass

    return {"ok": True, "bid": updated}


@mp_router.post("/bids/{bid_id}/counter/accept")
def accept_counter(bid_id: str, user=Depends(require_level(1))):
    """Bidder accepts the counter-offer; deal/chat are created."""
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        if bid["bidder_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Только автор ставки может принять контр-оффер")
        if bid["status"] != "countered":
            raise HTTPException(status_code=409, detail=f"Нет активного контр-оффера (статус {bid['status']})")
        counter = bid.get("counter_amount")
        if not counter:
            # Defensive: status='countered' without amount means data corruption.
            raise HTTPException(status_code=409, detail="Контр-оффер без суммы")

        # The owner is the user we authorise the accept *as* — load from bid context.
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if not owner_id:
            raise HTTPException(status_code=409, detail="Не найден владелец груза/рейса")
        owner_user = {"id": owner_id}
        result = _finalize_accept_inline(c, owner_user, bid, counter)
        # Часть 3: событие — bidder принял контр-оффер (actor=bidder).
        _record_price_event(c, bid_id, user["id"], "bidder", counter, "accepted", None)

    # Push to both sides.
    # M3: роль того, кто согласился, зависит от типа ставки. cargo-bid →
    # bidder это водитель; trip-bid → bidder это грузовладелец. Иначе
    # владельцу рейса приходило неверное «Водитель согласился».
    agreed_word = "Водитель" if bid.get("cargo_id") else "Грузовладелец"
    # «Дом заказа»: пуш о сделке ведёт в карточку заказа, а не в Deal Room.
    if bid.get("cargo_id"):
        deal_url = f"/cargos/{bid['cargo_id']}"
    elif bid.get("trip_id"):
        deal_url = f"/trips/{bid['trip_id']}"
    else:
        deal_url = f"/deals/{result['deal_id']}"
    with get_conn() as c2:
        cur = _bid_currency(c2, bid)
    money = _money(counter, cur)
    from api.notifications import create_notification
    # 🔴 fix: раньше accept_counter слал ТОЛЬКО push (ненадёжный) и НЕ создавал
    # in-app уведомление → при недоставленном пуше сторона о сделке не узнавала
    # («наверх приходит, вниз нет»). Теперь и push, и надёжный колокольчик обеим
    # сторонам + deep-link на /deals/{id} + сумма в валюте листинга.
    recipients = (
        (owner_id, "✅ Контр-оффер принят", f"{agreed_word} согласился на {money}. Сделка создана."),
        (bid["bidder_id"], "✅ Сделка создана", f"Цена: {money}"),
    )
    for uid_, title_, text_ in recipients:
        try:
            send_to_user(uid_, title_, text_, url=deal_url)
        except Exception:
            pass
        try:
            create_notification(uid_, "deal_created", title_, text_, "✅", url=deal_url)
        except Exception:
            pass

    # Уведомляем авторов перебитых ставок (auto-reject внутри _finalize).
    _notify_rejected_siblings(result.get("rejected_siblings"))

    return {"ok": True, "deal_id": result["deal_id"], "chat_room_id": result["chat_room_id"], "amount": counter}


@mp_router.post("/bids/{bid_id}/counter/cancel")
def cancel_counter_as_owner(bid_id: str, user=Depends(require_level(1))):
    """Cargo/trip owner отменяет СВОЮ встречную цену. Ставка возвращается в
    pending — теперь owner может принять оригинал одной кнопкой. Дизайн-
    система 2026 (приказ владельца 02.08): «две кнопки: Принять и Отклонить,
    без «отменить встречную» — водитель это не поймёт». Endpoint для того,
    чтобы фронт под капотом делал cancel→accept одним нажатием «Принять $X»."""
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if not owner_id or owner_id != user["id"]:
            raise HTTPException(status_code=403, detail="Только владелец груза/рейса может отменить свою встречную")
        if bid["status"] != "countered":
            raise HTTPException(status_code=409, detail=f"Нет активной встречной (статус {bid['status']})")
        c.execute(
            "UPDATE bids SET status = 'pending', counter_amount = NULL, counter_message = NULL, "
            "counter_by = NULL, counter_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (bid_id,),
        )
        _record_price_event(c, bid_id, user["id"], "owner", bid.get("amount"), "counter_cancelled", None)
    return {"ok": True, "bid_id": bid_id, "status": "pending"}


@mp_router.post("/bids/{bid_id}/counter/decline")
def decline_counter(bid_id: str, user=Depends(require_level(1))):
    """Bidder declines the counter; bid returns to 'pending', counter fields cleared."""
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        if bid["bidder_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Только автор ставки может отклонить контр-оффер")
        if bid["status"] != "countered":
            raise HTTPException(status_code=409, detail=f"Нет активного контр-оффера (статус {bid['status']})")
        c.execute(
            "UPDATE bids SET status = 'pending', counter_amount = NULL, counter_message = NULL, "
            "counter_by = NULL, counter_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (bid_id,),
        )
        # P3-fix: фиксируем отказ от контр-оффера в ценовом timeline.
        _record_price_event(c, bid_id, user["id"], "bidder", bid.get("amount"), "declined", None)

    try:
        owner_id = None
        _cur = "USD"
        with get_conn() as c2:
            owner_id = _cargo_or_trip_owner_id(c2, bid)
            _cur = _bid_currency(c2, bid)
        if owner_id:
            if bid.get("cargo_id"):
                _dc_url = f"/cargos/{bid['cargo_id']}?bid={bid_id}"
            elif bid.get("trip_id"):
                _dc_url = f"/trips/{bid['trip_id']}?bid={bid_id}"
            else:
                _dc_url = "/"
            # Роль-зависимо: контр отклоняет биддер. Для bid на груз биддер —
            # водитель; для bid на рейс — грузовладелец.
            _decliner_word = "Водитель" if bid.get("cargo_id") else "Грузовладелец"
            try:
                send_to_user(owner_id, "❌ Контр-оффер отклонён", f"{_decliner_word} отказался от вашего контр-оффера", url=_dc_url)
            except Exception:
                pass
            try:
                from api.notifications import create_notification
                create_notification(owner_id, "bid", "❌ Контр-оффер отклонён",
                                    f"Ставка {_money(bid['amount'], _cur)} снова в статусе pending", "❌", url=_dc_url)
            except Exception:
                pass
    except Exception:
        pass

    return {"ok": True, "bid_id": bid_id, "status": "pending"}


@mp_router.post("/bids/{bid_id}/chat")
def open_chat_for_bid(bid_id: str, user=Depends(require_level(1))):
    """Open (or fetch) a chat room for a still-active bid, *before* accept.

    chat_rooms schema does not require deal_id, so this is safe: we reuse the
    same `(participant_1, participant_2)` UNIQUE pair logic as accept_bid.
    Allowed for the bidder and the cargo/trip owner while the bid is in
    pending or countered state.
    """
    with get_conn() as c:
        bid = _load_bid_or_404(c, bid_id)
        if bid["status"] not in ("pending", "countered"):
            raise HTTPException(status_code=409, detail=f"Чат недоступен в статусе {bid['status']}")
        owner_id = _cargo_or_trip_owner_id(c, bid)
        if not owner_id:
            raise HTTPException(status_code=409, detail="Не найден владелец груза/рейса")
        if user["id"] not in (bid["bidder_id"], owner_id):
            raise HTTPException(status_code=403, detail="Чат доступен только участникам сделки")
        chat_room_id = _ensure_chat_room_inline(
            c, bid["bidder_id"], owner_id, bid.get("cargo_id"), bid.get("trip_id")
        )

    return {"ok": True, "chat_room_id": chat_room_id}


# ═══ Deals ═══

@mp_router.get("/deals")
def list_deals(user=Depends(require_level(1))):
    uid = user["id"]
    with get_conn() as c:
        rows = c.execute("""
            SELECT * FROM deals
            WHERE shipper_id = ? OR driver_id = ?
            ORDER BY created_at DESC LIMIT 100
        """, (uid, uid)).fetchall()
    return {"deals": [dict(r) for r in rows]}


@mp_router.get("/deals/{deal_id}")
def get_deal(deal_id: str, user=Depends(require_level(1))):
    """Return a deal + the cargo/trip context the chat-room UI needs.

    D2 (Maestro P1): historically this returned only the deals row
    (from_city/to_city/amount). The chat-room DealRoomCard also asks for
    `cargo_desc` (for the «Груз» line) and `currency` (for the «Ставка»
    line) and `plate`. Those live on cargos / trips respectively. Joining
    them in once here is cheaper than making the frontend hit two endpoints
    on every Deal Room open."""
    uid = user["id"]
    with get_conn() as c:
        row = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        d = dict(row)
        if uid not in (d["shipper_id"], d["driver_id"]):
            raise HTTPException(status_code=403)
        # Cargo enrichment — cargo_desc + currency for the "Ставка" line.
        if d.get("cargo_id"):
            cr = c.execute(
                "SELECT cargo_desc, currency FROM cargos WHERE id = ?", (d["cargo_id"],)
            ).fetchone()
            if cr:
                d.setdefault("cargo_desc", cr["cargo_desc"])
                d.setdefault("currency", cr["currency"])
        # Trip enrichment — plate (госномер тягача) from drivers_registration.
        if d.get("trip_id"):
            tr = c.execute("SELECT driver_id FROM trips WHERE id = ?", (d["trip_id"],)).fetchone()
            if tr and tr["driver_id"]:
                vp = c.execute("SELECT vehicle_plate FROM drivers_registration WHERE id = ?", (tr["driver_id"],)).fetchone()
                if vp and vp["vehicle_plate"]:
                    d.setdefault("plate", vp["vehicle_plate"])
        # Телефон КОНТРАГЕНТА по сделке — для звонка после заключения сделки.
        # Endpoint строго gated (выше 403 для не-участников), поэтому отдать
        # телефон второй стороны безопасно. Технические placeholder-телефоны
        # (guest_/deleted_) не отдаём.
        other_id = d["driver_id"] if uid == d["shipper_id"] else d["shipper_id"]
        if other_id:
            cp_name, cp_phone = _party_contact(c, other_id, d)
            if cp_phone:
                d["counterparty_phone"] = cp_phone
            if cp_name:
                d["counterparty_name"] = cp_name
    return d


@mp_router.patch("/deals/{deal_id}/status")
def update_deal_status(deal_id: str, new_status: str, user=Depends(require_level(1))):
    # Этап-хаб заказа: добавлен промежуточный статус at_border («На границе») —
    # ключевой для коридора Китай↔КЗ. Порядок: accepted → in_progress →
    # at_border → delivered (cancelled — из любого рабочего).
    VALID = ["accepted", "in_progress", "at_border", "delivered", "cancelled"]
    if new_status not in VALID:
        raise HTTPException(status_code=400, detail=f"Допустимые статусы: {', '.join(VALID)}")
    # Разрешённые переходы. Раньше валидации не было — двойной тап или
    # рассинхрон фронта мог перескочить accepted → delivered, минуя «в пути»/
    # «на границе». Отмена доступна из любого рабочего статуса; at_border можно
    # пропустить (внутренние рейсы без границы) — accepted → delivered нельзя.
    _FLOW = {
        "accepted":    {"in_progress", "cancelled"},
        "in_progress": {"at_border", "delivered", "cancelled"},
        "at_border":   {"delivered", "cancelled"},
        "delivered":   set(),
        "cancelled":   set(),
    }
    uid = user["id"]
    with get_conn() as c:
        row = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        deal = dict(row)
        if uid not in (deal["shipper_id"], deal["driver_id"]):
            raise HTTPException(status_code=403)
        cur_status = deal.get("status") or "accepted"
        if new_status == cur_status:
            return {"ok": True, "status": new_status}  # идемпотентно, без шума
        allowed = _FLOW.get(cur_status)
        if allowed is not None and new_status not in allowed:
            raise HTTPException(status_code=409, detail=f"Недопустимый переход: {cur_status} → {new_status}")
        c.execute("UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                   (new_status, deal_id))
        if new_status == "delivered" and deal["cargo_id"]:
            c.execute("UPDATE cargos SET status = 'completed' WHERE id = ?", (deal["cargo_id"],))
        elif new_status == "cancelled" and deal["cargo_id"]:
            c.execute("UPDATE cargos SET status = 'active', taken_by = NULL WHERE id = ?", (deal["cargo_id"],))
        # Синхронизация trip status при смене deal status
        _DEAL_TO_TRIP = {"in_progress": "in_transit", "at_border": "in_transit", "delivered": "delivered", "cancelled": "cancelled"}
        if deal.get("trip_id") and new_status in _DEAL_TO_TRIP:
            c.execute("UPDATE trips SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (_DEAL_TO_TRIP[new_status], deal["trip_id"]))
    # 🔴 fix: раньше смена статуса сделки (Начать перевозку / Я доехал / отмена)
    # слала ТОЛЬКО push и не создавала in-app уведомление → ведение сделки не
    # оставляло следа в колокольчике. Теперь и push, и колокольчик другой стороне,
    # сумма в валюте груза/рейса, deep-link на /deals/{id}.
    try:
        other_id = deal["driver_id"] if uid == deal["shipper_id"] else deal["shipper_id"]
        labels = {"in_progress": "🚛 Рейс начался", "at_border": "🛂 На границе", "delivered": "✅ Доставлен", "cancelled": "❌ Отменено"}
        if new_status in labels:
            cur = "USD"
            with get_conn() as c2:
                src = ("cargos", deal["cargo_id"]) if deal.get("cargo_id") else (("trips", deal["trip_id"]) if deal.get("trip_id") else None)
                if src:
                    r = c2.execute(f"SELECT currency FROM {src[0]} WHERE id = ?", (src[1],)).fetchone()
                    cur = ((dict(r).get("currency") if r else None) or "USD")
            body_txt = f"{deal['from_city']}→{deal['to_city']} · {_money(deal['amount'], cur)}"
            # «Дом заказа»: смена статуса ведёт в карточку заказа с прогресс-
            # баром отслеживания. Раньше — в Deal Room (чат), но статус ≠
            # переписка.
            if deal.get("cargo_id"):
                deal_url = f"/cargos/{deal['cargo_id']}"
            elif deal.get("trip_id"):
                deal_url = f"/trips/{deal['trip_id']}"
            else:
                deal_url = f"/deals/{deal_id}"
            try:
                send_to_user(other_id, labels[new_status], body_txt, url=deal_url)
            except Exception:
                pass
            try:
                from api.notifications import create_notification
                create_notification(other_id, "deal_status", labels[new_status], body_txt, "🚛", url=deal_url)
            except Exception:
                pass
    except Exception:
        pass
    # События сделки в immutable-timeline (не только push): смена статуса
    # пишется в ленту, чтобы Deal Room показывал живую хронологию сделки,
    # а не только принятие ставки.
    try:
        from database import deal_room_dal
        actor_role = "client" if uid == deal["shipper_id"] else "driver"
        deal_room_dal.create_deal_event(
            "deal.status_changed",
            actor_id=uid,
            actor_role=actor_role,
            deal_id=deal_id,
            load_id=deal.get("cargo_id"),
            trip_id=deal.get("trip_id"),
            payload={"status": new_status},
        )
    except Exception:
        pass
    # Системное сообщение в чат — чтобы оба участника видели смену статуса inline
    try:
        chat_labels = {
            "in_progress": "🚛 Рейс начался",
            "at_border": "🛂 Груз на границе",
            "delivered": "✅ Груз доставлен",
            "cancelled": "❌ Сделка отменена",
        }
        if new_status in chat_labels and deal.get("chat_room_id"):
            with get_conn() as c3:
                c3.execute(
                    "INSERT INTO chat_messages (room_id, sender_id, text) VALUES (?,?,?)",
                    (deal["chat_room_id"], "system", chat_labels[new_status]),
                )
                c3.execute(
                    "UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (chat_labels[new_status][:50], deal["chat_room_id"]),
                )
    except Exception:
        pass
    return {"ok": True, "status": new_status}


# ═══ Задача B: живое отслеживание машины ═══

class DealLocationIn(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None
    speed: Optional[float] = None


@mp_router.post("/deals/{deal_id}/location")
def update_deal_location(deal_id: str, body: DealLocationIn, user=Depends(require_level(1))):
    """Водитель сделки шлёт свою гео-позицию. Только driver сделки и только
    пока сделка в работе (accepted/in_progress/at_border)."""
    with get_conn() as c:
        d = c.execute("SELECT driver_id, status FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not d:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        if d["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Геопозицию отправляет только водитель сделки")
        if d["status"] not in ("accepted", "in_progress", "at_border"):
            raise HTTPException(status_code=409, detail="Сделка не в работе")
        c.execute(
            "INSERT INTO deal_locations (deal_id, lat, lng, heading, speed, updated_at) "
            "VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) "
            "ON CONFLICT(deal_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, "
            "heading=excluded.heading, speed=excluded.speed, updated_at=CURRENT_TIMESTAMP",
            (deal_id, body.lat, body.lng, body.heading, body.speed),
        )
    return {"ok": True}


@mp_router.get("/deals/{deal_id}/location")
def get_deal_location(deal_id: str, user=Depends(require_level(1))):
    """Участник сделки (грузоотправитель или водитель) читает последнюю
    позицию машины. has_location=false, если водитель ещё не слал гео."""
    with get_conn() as c:
        d = c.execute("SELECT shipper_id, driver_id FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not d:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        if user["id"] not in (d["shipper_id"], d["driver_id"]):
            raise HTTPException(status_code=403, detail="Нет доступа к сделке")
        loc = c.execute(
            "SELECT lat, lng, heading, speed, updated_at FROM deal_locations WHERE deal_id = ?",
            (deal_id,),
        ).fetchone()
    if not loc:
        return {"ok": True, "has_location": False}
    return {"ok": True, "has_location": True, "location": dict(loc)}
