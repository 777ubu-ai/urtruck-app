"""Marketplace API — грузы, рейсы, ставки. Серверное хранение.

Это ЯДРО приложения. Без этого юзеры не видят друг друга.
"""
import sys
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List

from database.db import get_conn, new_id
from api.verification_gate import require_level, get_user
from api.push import send_to_user

mp_router = APIRouter()


# ═══ Public-feed hygiene ═══
#
# Tokens we never want surfacing in the public cargos/trips list. Pre-pilot
# data accumulated test artefacts (Тестер, Баке, "трусы", QA, demo, mock).
# Filter is applied AFTER the SQL fetch so the admin endpoints / DB queries
# can still see everything for moderation. Owner ALWAYS sees own listings via
# /market/my regardless of these filters.
DIRTY_TOKENS = (
    "test", "demo", "seed", "mock", "qa", "playwright",
    "тест", "тестер", "баке", "володя", "автотест", "трусы",
    "белик", "серик",
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

    # Stale pickup_date: more than 24h in the past → hide
    if pickup and pickup < (today - timedelta(days=1)):
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
        for table in ("trips", "cargos"):
            tcols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})").fetchall()}
            if "currency" not in tcols:
                c.execute(f"ALTER TABLE {table} ADD COLUMN currency TEXT DEFAULT 'USD'")
                c.execute(f"UPDATE {table} SET currency = 'USD' WHERE currency IS NULL")
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
    pickup_date: Optional[str] = None
    photos: Optional[List[str]] = None

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
    capacity_tons: Optional[float] = 20
    available_m3: Optional[float] = 82
    price: Optional[int] = 0
    currency: Optional[str] = "USD"
    departure: Optional[str] = None
    arrival: Optional[str] = None


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
    # Same currency whitelist as create_trip — anything else falls back to USD
    # so a typo never produces NULL/empty in the cargos.currency column.
    currency = (body.currency or "USD").upper()
    if currency not in ("USD", "KZT", "RUB", "CNY", "UZS"):
        currency = "USD"
    cid = new_id()
    with get_conn() as c:
        c.execute("""
            INSERT INTO cargos (id, owner_id, owner_phone, owner_name,
              from_city, to_city, cargo_desc, cargo_type,
              weight_tons, volume_m3, price, currency, pickup_date, photos)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (cid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.cargo_desc, body.cargo_type,
              body.weight_tons, body.volume_m3, body.price, currency,
              body.pickup_date,
              json.dumps(body.photos or [], ensure_ascii=False)))

    # Push подписчикам маршрута
    try:
        from api.saved_searches import notify_matching_users
        notify_matching_users(body.from_city, body.to_city, body.cargo_desc)
    except Exception:
        pass

    return {"id": cid, "ok": True}


@mp_router.get("/cargos")
def list_cargos(
    status: str = "active",
    from_city: str = "",
    to_city: str = "",
    cargo_type: str = "",
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

    where_sql = " AND ".join(where)
    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, owner_id, from_city, to_city, cargo_desc, cargo_type,
                   weight_tons, volume_m3, price, currency, pickup_date, photos,
                   bids_count, status, created_at
            FROM cargos WHERE {where_sql}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (*params, limit, offset)).fetchall()
        total = c.execute(f"SELECT COUNT(*) FROM cargos WHERE {where_sql}", params).fetchone()[0]

    result = []
    today = datetime.utcnow().date()
    for r in rows:
        d = dict(r)
        try:
            d["photos"] = json.loads(d.get("photos") or "[]")
        except Exception:
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


@mp_router.get("/cargos/{cargo_id}")
def get_cargo(cargo_id: str):
    with get_conn() as c:
        row = c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Груз не найден")
    d = dict(row)
    try:
        d["photos"] = json.loads(d.get("photos") or "[]")
    except Exception:
        d["photos"] = []
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
    return {"ok": True}


# ═══ Trips ═══

@mp_router.post("/trips")
def create_trip(body: TripIn, user=Depends(require_level(1))):
    if not body.from_city or not body.to_city:
        raise HTTPException(status_code=400, detail="Укажите маршрут: откуда и куда")
    currency = (body.currency or "USD").upper()
    if currency not in ("USD", "KZT", "RUB", "CNY", "UZS"):
        currency = "USD"
    tid = new_id()
    with get_conn() as c:
        c.execute("""
            INSERT INTO trips (id, driver_id, driver_phone, driver_name,
              from_city, to_city, transit, truck_type,
              capacity_tons, available_m3, price, currency, departure, arrival)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (tid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.transit, body.truck_type,
              body.capacity_tons, body.available_m3, body.price, currency,
              body.departure, body.arrival))
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
            if cur not in ("USD", "KZT", "RUB", "CNY", "UZS"):
                raise HTTPException(status_code=400, detail="currency: USD/KZT/RUB/CNY/UZS")
            updates.append("currency = ?"); params.append(cur)

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

    where_sql = " AND ".join(where)
    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, driver_id, driver_name, from_city, to_city, transit,
                   truck_type, capacity_tons, available_m3, price, currency,
                   departure, arrival, status, created_at
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
    return {"trips": trips, "total": len(trips)}


@mp_router.get("/trips/{trip_id}")
def get_trip(trip_id: str):
    with get_conn() as c:
        row = c.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404)
    return dict(row)


# ═══ Bids ═══

@mp_router.post("/bids")
def create_bid(body: BidIn, user=Depends(require_level(1))):
    # cargo_id или trip_id — хотя бы один (для серверных грузов)
    # Если оба null — разрешаем (для demo/local грузов), ставка просто без привязки

    bid_id = new_id()
    with get_conn() as c:
        c.execute("""
            INSERT INTO bids (id, cargo_id, trip_id, bidder_id, bidder_name, bidder_phone, amount, message)
            VALUES (?,?,?,?,?,?,?,?)
        """, (bid_id, body.cargo_id, body.trip_id, user["id"],
              user.get("full_name"), user.get("phone"), body.amount, body.message))

        # Обновляем счётчик
        if body.cargo_id:
            c.execute("UPDATE cargos SET bids_count = bids_count + 1 WHERE id = ?", (body.cargo_id,))
            row = c.execute("SELECT owner_id, from_city, to_city FROM cargos WHERE id = ?", (body.cargo_id,)).fetchone()
            if row:
                title = f"💰 Новое предложение ${body.amount}"
                text = f"{user.get('full_name', 'Водитель')} предлагает ${body.amount} за {row['from_city']}→{row['to_city']}"
                try:
                    send_to_user(row["owner_id"], title, text, url="/")
                    from api.notifications import create_notification
                    create_notification(row["owner_id"], "bid", title, text, "💰")
                except Exception:
                    pass

        if body.trip_id:
            row = c.execute("SELECT driver_id, from_city, to_city FROM trips WHERE id = ?", (body.trip_id,)).fetchone()
            if row:
                try:
                    send_to_user(row["driver_id"],
                        f"📦 Новый заказ ${body.amount}",
                        f"Клиент предлагает ${body.amount} за {row['from_city']}→{row['to_city']}",
                        url="/")
                except Exception:
                    pass

    return {"id": bid_id, "ok": True}


@mp_router.get("/bids")
def list_bids(cargo_id: str = "", trip_id: str = "", user_id: str = "", show_demo: bool = False):
    where = []
    params = []
    if cargo_id:
        where.append("cargo_id = ?")
        params.append(cargo_id)
    if trip_id:
        where.append("trip_id = ?")
        params.append(trip_id)
    if user_id:
        where.append("bidder_id = ?")
        params.append(user_id)
    if not where:
        raise HTTPException(status_code=400, detail="Укажите cargo_id, trip_id или user_id")

    with get_conn() as c:
        rows = c.execute(f"""
            SELECT * FROM bids WHERE {' AND '.join(where)}
            ORDER BY created_at DESC LIMIT 100
        """, params).fetchall()
    bids = [dict(r) for r in rows]
    # Hide dirty/test bidders from public bid listings (Тестер, Баке, etc.).
    # Also drop cancelled/rejected bids from public counters so a clean cargo's
    # detail screen doesn't carry stale rejected proposals from pre-pilot data.
    if not show_demo:
        bids = [
            b for b in bids
            if not _is_dirty_text(b.get("bidder_name"), b.get("bidder_phone"))
            and b.get("status") not in ("cancelled",)
        ]
    return {"bids": bids}


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
        # Ставки которые Я сделал
        my_bids = [dict(r) for r in c.execute(
            "SELECT b.*, c.from_city as cargo_from, c.to_city as cargo_to, c.cargo_desc "
            "FROM bids b LEFT JOIN cargos c ON b.cargo_id = c.id "
            "WHERE b.bidder_id = ? ORDER BY b.created_at DESC LIMIT 50", (uid,)).fetchall()]
        # Ставки на МОИ грузы (входящие)
        incoming_bids = [dict(r) for r in c.execute(
            "SELECT b.*, c.from_city as cargo_from, c.to_city as cargo_to, c.cargo_desc "
            "FROM bids b JOIN cargos c ON b.cargo_id = c.id "
            "WHERE c.owner_id = ? ORDER BY b.created_at DESC LIMIT 50", (uid,)).fetchall()]
        # Мои сделки (не должны зависеть от наличия cargos)
        my_deals = [dict(r) for r in c.execute(
            "SELECT * FROM deals WHERE shipper_id = ? OR driver_id = ? ORDER BY created_at DESC LIMIT 50",
            (uid, uid)).fetchall()]

    for cargo in my_cargos:
        try:
            cargo["photos"] = json.loads(cargo.get("photos") or "[]")
        except Exception:
            cargo["photos"] = []

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
                   vehicle_year, vehicle_capacity_kg, security_score, security_color
            FROM drivers_registration
            WHERE {' AND '.join(where)}
            ORDER BY security_score DESC LIMIT ?
        """, (*params, limit)).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        # Рейтинг
        from database import reviews_dal
        summary = reviews_dal.get_rating_summary(d["id"])
        d["rating"] = summary.get("average", 0)
        d["reviews_count"] = summary.get("count", 0)
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

    # Push + InApp notification
    try:
        from api.notifications import create_notification
        labels = {"booked": "📦 Груз принят", "in_transit": "🚛 В пути", "delivered": "✅ Доставлен"}
        if new_status in labels and trip["booked_by"]:
            send_to_user(trip["booked_by"], labels[new_status], f"{trip['from_city']}→{trip['to_city']}", url="/")
            create_notification(trip["booked_by"], "trip_status", labels[new_status],
                                f"Рейс {trip['from_city']}→{trip['to_city']}: {new_status}", "🚛")
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


def _ensure_chat_room_inline(c, user_a: str, user_b: str, cargo_id, trip_id) -> str:
    """Idempotent room lookup/insert on the *current* SQLite connection.

    Mirrors api.chat._get_or_create_room but stays inside the caller's
    transaction to avoid SQLite write locks.
    """
    p1, p2 = sorted([user_a, user_b])
    row = c.execute(
        "SELECT id FROM chat_rooms WHERE participant_1 = ? AND participant_2 = ?", (p1, p2)
    ).fetchone()
    if row:
        return row["id"]
    rid = new_id()
    c.execute(
        "INSERT INTO chat_rooms (id, participant_1, participant_2, cargo_id, trip_id) VALUES (?,?,?,?,?)",
        (rid, p1, p2, cargo_id, trip_id),
    )
    return rid


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

    c.execute(
        "UPDATE bids SET amount = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (final_amount, bid_id),
    )
    # Auto-decline siblings: anything still pending OR countered on the same parent.
    c.execute(
        "UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
        "WHERE (cargo_id = ? OR trip_id = ?) AND id != ? AND status IN ('pending', 'countered')",
        (bid.get("cargo_id"), bid.get("trip_id"), bid_id),
    )

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
    return {
        "deal_id": deal_id,
        "chat_room_id": chat_room_id,
        "from_city": from_city,
        "to_city": to_city,
        "shipper_id": shipper_id,
        "driver_id": driver_id,
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

    try:
        send_to_user(bid["bidder_id"], "✅ Ставка принята!", f"Ваше предложение ${bid['amount']} принято!", url="/")
    except Exception:
        pass

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
        new_message = body.message if body.message is not None else bid.get("message")

        c.execute(
            "UPDATE bids SET amount = ?, message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_amount, new_message, bid_id),
        )
        updated = dict(c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone())

    # Discount notification: amount decreased → ping the cargo/trip owner.
    if body.amount is not None and new_amount < old_amount:
        try:
            owner_id = None
            with get_conn() as c2:
                owner_id = _cargo_or_trip_owner_id(c2, updated)
            if owner_id:
                title = f"💰 Скидка: ${old_amount} → ${new_amount}"
                text = updated.get("bidder_name") or "Водитель"
                text = f"{text} снизил цену на ${old_amount - new_amount}"
                try:
                    send_to_user(owner_id, title, text, url="/")
                except Exception:
                    pass
                try:
                    from api.notifications import create_notification
                    create_notification(owner_id, "bid", title, text, "💰")
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
        # Decrement bids_count safely (never below 0).
        if bid.get("cargo_id"):
            c.execute(
                "UPDATE cargos SET bids_count = MAX(0, bids_count - 1) WHERE id = ?",
                (bid["cargo_id"],),
            )

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

    # Notify the bidder.
    try:
        send_to_user(bid["bidder_id"], "❌ Ставка отклонена", f"Ваше предложение ${bid['amount']} отклонено", url="/")
    except Exception:
        pass
    try:
        from api.notifications import create_notification
        create_notification(bid["bidder_id"], "bid", "❌ Ставка отклонена", f"${bid['amount']}", "❌")
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
        updated = dict(c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone())

    try:
        title = f"🔁 Контр-оффер: ${body.amount}"
        text = f"Владелец груза предложил ${body.amount} вместо ${bid['amount']}"
        send_to_user(bid["bidder_id"], title, text, url="/")
    except Exception:
        pass
    try:
        from api.notifications import create_notification
        create_notification(bid["bidder_id"], "bid", title, text, "🔁")
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

    # Push to both sides.
    try:
        send_to_user(owner_id, "✅ Контр-оффер принят", f"Водитель согласился на ${counter}", url="/")
    except Exception:
        pass
    try:
        send_to_user(bid["bidder_id"], "✅ Сделка создана", f"Цена: ${counter}", url="/")
    except Exception:
        pass

    return {"ok": True, "deal_id": result["deal_id"], "chat_room_id": result["chat_room_id"], "amount": counter}


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

    try:
        owner_id = None
        with get_conn() as c2:
            owner_id = _cargo_or_trip_owner_id(c2, bid)
        if owner_id:
            try:
                send_to_user(owner_id, "❌ Контр-оффер отклонён", "Водитель отказался от вашего контр-оффера", url="/")
            except Exception:
                pass
            try:
                from api.notifications import create_notification
                create_notification(owner_id, "bid", "❌ Контр-оффер отклонён",
                                    f"Ставка ${bid['amount']} снова в статусе pending", "❌")
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
    uid = user["id"]
    with get_conn() as c:
        row = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    d = dict(row)
    if uid not in (d["shipper_id"], d["driver_id"]):
        raise HTTPException(status_code=403)
    return d


@mp_router.patch("/deals/{deal_id}/status")
def update_deal_status(deal_id: str, new_status: str, user=Depends(require_level(1))):
    VALID = ["accepted", "in_progress", "delivered", "cancelled"]
    if new_status not in VALID:
        raise HTTPException(status_code=400, detail=f"Допустимые статусы: {', '.join(VALID)}")
    uid = user["id"]
    with get_conn() as c:
        row = c.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        deal = dict(row)
        if uid not in (deal["shipper_id"], deal["driver_id"]):
            raise HTTPException(status_code=403)
        c.execute("UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                   (new_status, deal_id))
        if new_status == "delivered" and deal["cargo_id"]:
            c.execute("UPDATE cargos SET status = 'completed' WHERE id = ?", (deal["cargo_id"],))
        elif new_status == "cancelled" and deal["cargo_id"]:
            c.execute("UPDATE cargos SET status = 'active', taken_by = NULL WHERE id = ?", (deal["cargo_id"],))
    # Push другой стороне
    try:
        other_id = deal["driver_id"] if uid == deal["shipper_id"] else deal["shipper_id"]
        labels = {"in_progress": "🚛 Рейс начался", "delivered": "✅ Доставлен", "cancelled": "❌ Отменено"}
        if new_status in labels:
            send_to_user(other_id, labels[new_status], f"{deal['from_city']}→{deal['to_city']} · ${deal['amount']}", url="/")
    except Exception:
        pass
    return {"ok": True, "status": new_status}
