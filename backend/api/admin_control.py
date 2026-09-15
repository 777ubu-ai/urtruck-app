"""Read-only operational API for the standalone UrTruck Control Center.

This module must not mutate deals, chat, GPS, marketplace or user state.
Operational write actions stay in their existing, separately audited routes.
"""
from fastapi import APIRouter, Depends, Query

from api.admin import check_admin
from database.db import get_conn
from services import presence_service

control_router = APIRouter()


def _table_exists(c, name: str) -> bool:
    return c.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)
    ).fetchone() is not None


def _count(c, table: str, where: str = "1=1", params=()) -> int | None:
    if not _table_exists(c, table):
        return None
    return int(c.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", params).fetchone()[0])


def _today_count(c, table: str, column: str = "created_at", where: str = "1=1", params=()) -> int | None:
    if not _table_exists(c, table):
        return None
    sql = f"SELECT COUNT(*) FROM {table} WHERE date({column})=date('now') AND ({where})"
    return int(c.execute(sql, params).fetchone()[0])


@control_router.get("/ping")
def ping(_admin: str = Depends(check_admin)):
    return {"ok": True, "service": "urtruck-control"}


@control_router.get("/summary")
def summary(_admin: str = Depends(check_admin)):
    presence = presence_service.snapshot()
    with get_conn() as c:
        stats = {
            "users_total": _count(c, "drivers_registration", "role IN (\'driver\',\'client\')"),
            "users_today": _today_count(c, "drivers_registration", where="role IN (\'driver\',\'client\')"),
            "guests_total": _count(c, "drivers_registration", "role=\'guest\'"),
            "drivers_total": _count(c, "drivers_registration", "role='driver'"),
            "approved_drivers": _count(c, "drivers_registration", "role='driver' AND status='approved'"),
            "pending_moderation": _count(c, "drivers_registration", "status IN ('pending','under_review','manual_review')"),
            "shippers_total": _count(c, "drivers_registration", "role='client'"),
            "cargos_active": _count(c, "cargos", "status='active'"),
            "cargos_today": _today_count(c, "cargos"),
            "trips_active": _count(c, "trips", "status IN ('active','booked','in_transit')"),
            "bids_today": _today_count(c, "bids"),
            "deals_total": _count(c, "deals"),
            "deals_active": _count(c, "deals", "status NOT IN ('completed','cancelled')"),
            "deals_today": _today_count(c, "deals"),
            "chat_rooms": _count(c, "chat_rooms"),
            "messages_today": _today_count(c, "chat_messages"),
            "voice_today": _today_count(c, "chat_messages", where="is_voice=1"),
            "gps_active": _count(c, "deal_locations", "datetime(updated_at)>=datetime('now','-20 minutes')"),
            "gps_stale": _count(c, "deal_locations", "datetime(updated_at)<datetime('now','-20 minutes')"),
            "push_pending": _count(c, "push_outbox", "status IN ('pending','processing')"),
            "push_dead": _count(c, "push_outbox", "status='dead'"),
            "reviews_total": _count(c, "reviews"),
            "blacklist_active": _count(c, "blacklist", "is_active=1"),
            "telegram_mentions": _count(c, "telegram_mentions"),
        }
    return {
        "presence": {
            "available": presence["available"],
            "online": presence["online"],
            "by_role": presence["by_role"],
            "by_platform": presence["by_platform"],
            "window_seconds": presence["window_seconds"],
        },
        "stats": stats,
    }


@control_router.get("/online")
def online(_admin: str = Depends(check_admin), window_seconds: int = Query(default=90, ge=30, le=600)):
    return presence_service.snapshot(window_seconds)


@control_router.get("/deals")
def deals(
    _admin: str = Depends(check_admin),
    status: str = Query(default="", max_length=40),
    limit: int = Query(default=100, ge=1, le=250),
):
    with get_conn() as c:
        if not _table_exists(c, "deals"):
            return {"deals": []}
        has_locations = _table_exists(c, "deal_locations")
        location_join = "LEFT JOIN deal_locations l ON l.deal_id=d.id" if has_locations else ""
        location_fields = (
            ", l.lat, l.lng, l.speed, l.heading, l.updated_at AS gps_updated_at"
            if has_locations
            else ", NULL AS lat, NULL AS lng, NULL AS speed, NULL AS heading, NULL AS gps_updated_at"
        )
        where = "WHERE d.status=?" if status else ""
        params = [status] if status else []
        params.append(limit)
        rows = c.execute(
            f"""SELECT d.id, d.cargo_id, d.trip_id, d.shipper_id, d.driver_id,
                       d.from_city, d.to_city, d.amount, d.status, d.chat_room_id,
                       d.created_at, d.updated_at {location_fields}
                FROM deals d {location_join} {where}
                ORDER BY d.updated_at DESC LIMIT ?""",
            params,
        ).fetchall()
    return {"deals": [dict(r) for r in rows]}


@control_router.get("/chats")
def chats(_admin: str = Depends(check_admin), limit: int = Query(default=100, ge=1, le=250)):
    with get_conn() as c:
        if not _table_exists(c, "chat_rooms"):
            return {"chats": []}
        has_messages = _table_exists(c, "chat_messages")
        if has_messages:
            rows = c.execute(
                """SELECT r.id, r.participant_1, r.participant_2, r.cargo_id, r.trip_id,
                          r.last_message, r.last_at, r.created_at,
                          COUNT(m.id) AS message_count,
                          SUM(CASE WHEN m.is_voice=1 THEN 1 ELSE 0 END) AS voice_count
                   FROM chat_rooms r
                   LEFT JOIN chat_messages m ON m.room_id=r.id
                   GROUP BY r.id
                   ORDER BY COALESCE(r.last_at,r.created_at) DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id, participant_1, participant_2, cargo_id, trip_id, last_message, last_at, created_at, 0 AS message_count, 0 AS voice_count FROM chat_rooms ORDER BY COALESCE(last_at,created_at) DESC LIMIT ?",
                (limit,),
            ).fetchall()
    # Message body is intentionally not returned here. Support-content access
    # will require an explicit audited endpoint with reason + staff identity.
    sanitized = []
    for row in rows:
        d = dict(row)
        d.pop("last_message", None)
        sanitized.append(d)
    return {"chats": sanitized}


@control_router.get("/users")
def users(
    _admin: str = Depends(check_admin),
    role: str = Query(default="", max_length=24),
    limit: int = Query(default=100, ge=1, le=250),
):
    with get_conn() as c:
        if not _table_exists(c, "drivers_registration"):
            return {"users": []}
        where = "WHERE role IN ('driver','client')"
        params = []
        if role in ("driver", "client"):
            where += " AND role=?"
            params.append(role)
        params.append(limit)
        rows = c.execute(
            f"""SELECT id, role, full_name, phone, verification_level, status,
                       basic_onboarding_completed, created_at, updated_at
                FROM drivers_registration {where}
                ORDER BY updated_at DESC LIMIT ?""",
            params,
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        phone = str(d.pop("phone", "") or "")
        if phone:
            d["phone_masked"] = (phone[:4] + "••••" + phone[-3:]) if len(phone) > 8 else "••••"
        else:
            d["phone_masked"] = ""
        result.append(d)
    return {"users": result}
