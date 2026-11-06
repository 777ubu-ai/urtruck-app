"""Серверные предпочтения и повторная проверка необязательной доставки."""
from datetime import datetime, timezone

from database.db import get_conn
from services.bid_expiry import listing_deadline, parse_market_timestamp, auto_renewing_listing

CATEGORIES = ("no_bids", "inactivity", "listing_lifecycle")


def utc_now(now=None):
    value = now or datetime.now(timezone.utc)
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def preferences(user_id, conn=None):
    if conn is None:
        with get_conn() as c:
            return preferences(user_id, c)
    row = conn.execute("SELECT * FROM notification_preferences WHERE user_id=?", (user_id,)).fetchone()
    return {key: bool(row[key]) if row else False for key in CATEGORIES}


def city_key(value):
    return str(value or "").split(",")[0].strip().casefold()


def listing(conn, entity_type, entity_id):
    table = "cargos" if entity_type == "cargo" else "trips" if entity_type == "trip" else None
    if not table:
        return None
    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (entity_id,)).fetchone()
    return dict(row) if row else None


def publication_time(row):
    return parse_market_timestamp(row.get("published_at")) or parse_market_timestamp(row.get("created_at"))


def active_listing(row, now):
    if row and auto_renewing_listing(row):
        return True
    deadline = listing_deadline(row.get("published_at"), row.get("created_at")) if row else None
    return bool(row and row.get("status") == "active" and deadline and utc_now(now) < deadline)


def has_bids(conn, entity_type, entity_id):
    column = "cargo_id" if entity_type == "cargo" else "trip_id"
    return bool(conn.execute(f"SELECT 1 FROM bids WHERE {column}=? LIMIT 1", (entity_id,)).fetchone())


def matching_searches(conn, user_id, from_city, to_city):
    rows = conn.execute("SELECT * FROM saved_searches WHERE user_id=? AND notify=1", (user_id,)).fetchall()
    return [dict(r) for r in rows if city_key(r["from_city"]) == city_key(from_city)
            and city_key(r["to_city"]) == city_key(to_city)]


def delivery_block_reason(user_id, data, *, conn=None, now=None):
    """Операционные события не зависят от настроек советов и напоминаний."""
    kind = str(data.get("kind") or "")
    category = data.get("notification_category")
    if not category:
        category = {"no_bids": "no_bids", "expired": "listing_lifecycle"}.get(kind)
        if kind == "reminder":
            category = "saved_search" if data.get("from") and data.get("to") else "inactivity"
    if not category:
        return None
    if conn is None:
        with get_conn() as c:
            return delivery_block_reason(user_id, data, conn=c, now=now)
    now = utc_now(now)
    if category in CATEGORIES and not preferences(user_id, conn)[category]:
        return "category_disabled"
    if category == "inactivity":
        from datetime import timedelta
        row = conn.execute("SELECT status,updated_at FROM drivers_registration WHERE id=?", (user_id,)).fetchone()
        last = parse_market_timestamp(row["updated_at"]) if row else None
        return None if row and row["status"] == "approved" and (not last or last <= now-timedelta(days=3)) else "user_active"
    entity_type = "cargo" if data.get("cargo_id") else "trip" if data.get("trip_id") else None
    entity_id = data.get("cargo_id") or data.get("trip_id")
    row = listing(conn, entity_type, entity_id) if entity_id else None
    if category == "saved_search":
        if row:
            if not active_listing(row, now):
                return "listing_inactive"
            fr, to = row.get("from_city"), row.get("to_city")
        else:
            fr, to = data.get("from"), data.get("to")
        return None if matching_searches(conn, user_id, fr, to) else "search_disabled"
    owner = row.get("owner_id") if row and entity_type == "cargo" else row.get("driver_id") if row else None
    if not row or owner != user_id:
        return "listing_owner_changed"
    if category == "no_bids":
        from datetime import timedelta
        key = f"no_bids:{entity_type}:{entity_id}"
        if (data.get("event_id") or data.get("event_key")) != key:
            return "legacy_reminder_identity"
        if not active_listing(row, now):
            return "listing_inactive"
        published = publication_time(row)
        if not published or now-published < timedelta(hours=18):
            return "publication_too_recent"
        return "bid_exists" if has_bids(conn, entity_type, entity_id) else None
    if category == "listing_lifecycle":
        if auto_renewing_listing(row):
            return "listing_auto_renewed"
        deadline = listing_deadline(row.get("published_at"), row.get("created_at"))
        # Новая публикация не должна получать отложенное напоминание старого срока.
        if not deadline or data.get("publication_at") != publication_time(row).isoformat():
            return "publication_changed"
        if data.get("lifecycle_stage") == "expired":
            from datetime import timedelta
            return None if row.get("status") == "expired" and deadline <= now < deadline+timedelta(days=1) else "listing_not_expired"
        return None if active_listing(row, now) else "listing_inactive"
    return "unknown_optional_category"
