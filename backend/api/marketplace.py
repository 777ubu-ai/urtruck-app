"""Marketplace API — грузы, рейсы, ставки. Серверное хранение.

Это ЯДРО приложения. Без этого юзеры не видят друг друга.
"""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List

from database.db import get_conn, new_id
from api.verification_gate import require_level, get_user
from api.push import send_to_user

mp_router = APIRouter()


def _init():
    base = Path(__file__).resolve().parent.parent / "database"
    for name in ["marketplace_schema.sql", "deals_schema.sql"]:
        schema = base / name
        if schema.exists():
            with get_conn() as c:
                c.executescript(schema.read_text(encoding="utf-8"))
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
    departure: Optional[str] = None
    arrival: Optional[str] = None


class BidIn(BaseModel):
    cargo_id: Optional[str] = None
    trip_id: Optional[str] = None
    amount: int
    message: Optional[str] = None


# ═══ Cargos ═══

@mp_router.post("/cargos")
def create_cargo(body: CargoIn, user=Depends(require_level(1))):
    if not body.from_city or not body.to_city:
        raise HTTPException(status_code=400, detail="Укажите откуда и куда")
    if not body.cargo_desc:
        raise HTTPException(status_code=400, detail="Укажите что везти")
    cid = new_id()
    with get_conn() as c:
        c.execute("""
            INSERT INTO cargos (id, owner_id, owner_phone, owner_name,
              from_city, to_city, cargo_desc, cargo_type,
              weight_tons, volume_m3, price, pickup_date, photos)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (cid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.cargo_desc, body.cargo_type,
              body.weight_tons, body.volume_m3, body.price, body.pickup_date,
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
                   weight_tons, volume_m3, price, pickup_date, photos, bids_count,
                   status, created_at
            FROM cargos WHERE {where_sql}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (*params, limit, offset)).fetchall()
        total = c.execute(f"SELECT COUNT(*) FROM cargos WHERE {where_sql}", params).fetchone()[0]

    result = []
    for r in rows:
        d = dict(r)
        try:
            d["photos"] = json.loads(d.get("photos") or "[]")
        except Exception:
            d["photos"] = []
        # НЕ отдаём owner_phone — контакт закрыт гейтом
        d.pop("owner_phone", None)
        result.append(d)
    return {"cargos": result, "total": total}


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
    tid = new_id()
    with get_conn() as c:
        c.execute("""
            INSERT INTO trips (id, driver_id, driver_phone, driver_name,
              from_city, to_city, transit, truck_type,
              capacity_tons, available_m3, price, departure, arrival)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (tid, user["id"], user.get("phone"), user.get("full_name"),
              body.from_city, body.to_city, body.transit, body.truck_type,
              body.capacity_tons, body.available_m3, body.price,
              body.departure, body.arrival))
    return {"id": tid, "ok": True}


@mp_router.get("/trips")
def list_trips(
    status: str = "active",
    from_city: str = "",
    to_city: str = "",
    truck_type: str = "",
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
                   truck_type, capacity_tons, available_m3, price,
                   departure, arrival, status, created_at
            FROM trips WHERE {where_sql}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (*params, limit, offset)).fetchall()
        total = c.execute(f"SELECT COUNT(*) FROM trips WHERE {where_sql}", params).fetchone()[0]

    return {"trips": [dict(r) for r in rows], "total": total}


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
def list_bids(cargo_id: str = "", trip_id: str = "", user_id: str = ""):
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
    return {"bids": [dict(r) for r in rows]}


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

    for cargo in my_cargos:
        try: cargo["photos"] = json.loads(cargo.get("photos") or "[]")
        except: cargo["photos"] = []

        # Мои сделки
        my_deals = [dict(r) for r in c.execute(
            "SELECT * FROM deals WHERE shipper_id = ? OR driver_id = ? ORDER BY created_at DESC LIMIT 50",
            (uid, uid)).fetchall()]

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


@mp_router.post("/bids/{bid_id}/accept")
def accept_bid(bid_id: str, user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        bid = dict(row)

        from_city, to_city = "", ""
        shipper_id = user["id"]
        driver_id = bid["bidder_id"]

        # Проверяем владельца + обновляем статус
        if bid["cargo_id"]:
            cargo = c.execute("SELECT owner_id, from_city, to_city FROM cargos WHERE id = ?", (bid["cargo_id"],)).fetchone()
            if not cargo or cargo["owner_id"] != user["id"]:
                raise HTTPException(status_code=403)
            c.execute("UPDATE cargos SET status = 'taken', taken_by = ? WHERE id = ?",
                       (bid["bidder_id"], bid["cargo_id"]))
            from_city, to_city = cargo["from_city"], cargo["to_city"]

        if bid["trip_id"]:
            trip = c.execute("SELECT driver_id, from_city, to_city FROM trips WHERE id = ?", (bid["trip_id"],)).fetchone()
            if trip:
                from_city, to_city = trip["from_city"], trip["to_city"]
                shipper_id = bid["bidder_id"]
                driver_id = trip["driver_id"]
                if trip["driver_id"] != user["id"]:
                    raise HTTPException(status_code=403)
                c.execute("UPDATE trips SET status = 'booked', booked_by = ? WHERE id = ?",
                           (bid["bidder_id"], bid["trip_id"]))

        c.execute("UPDATE bids SET status = 'accepted' WHERE id = ?", (bid_id,))
        c.execute("UPDATE bids SET status = 'rejected' WHERE (cargo_id = ? OR trip_id = ?) AND id != ? AND status = 'pending'",
                   (bid.get("cargo_id"), bid.get("trip_id"), bid_id))

        # Создаём chat_room (inline — в том же соединении, иначе SQLite lock)
        p1, p2 = sorted([shipper_id, driver_id])
        existing_room = c.execute(
            "SELECT id FROM chat_rooms WHERE participant_1 = ? AND participant_2 = ?", (p1, p2)
        ).fetchone()
        if existing_room:
            chat_room_id = existing_room["id"]
        else:
            chat_room_id = new_id()
            c.execute(
                "INSERT INTO chat_rooms (id, participant_1, participant_2, cargo_id, trip_id) VALUES (?,?,?,?,?)",
                (chat_room_id, p1, p2, bid.get("cargo_id"), bid.get("trip_id")),
            )

        # Создаём deal
        deal_id = new_id()
        c.execute("""
            INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id,
                               from_city, to_city, amount, status, chat_room_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (deal_id, bid.get("cargo_id"), bid.get("trip_id"), bid_id,
              shipper_id, driver_id, from_city, to_city, bid["amount"],
              "accepted", chat_room_id))

    # Push водителю
    try:
        send_to_user(bid["bidder_id"], "✅ Ставка принята!", f"Ваше предложение ${bid['amount']} принято!", url="/")
    except Exception:
        pass

    return {"ok": True, "deal_id": deal_id, "chat_room_id": chat_room_id}


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
