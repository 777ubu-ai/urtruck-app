"""Отдельное SQLite-хранилище для внешней ленты. Таблицы не затрагивают сделки UrTruck."""
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone

from database.external_freight_connection import get_conn, new_id

MAX_TEXT = 20000
MAX_BATCH = 50
ACTIVE_HOURS = 168
KNOWN_BODY_TYPES = {"tent", "ref", "izoterm", "board", "tipper", "lowboy"}


def _utc(value=None):
    if value is None:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def init_schema():
    with get_conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS external_freight_items (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('cargo','vehicle')),
          source_id TEXT NOT NULL, source_message_id TEXT NOT NULL, segment_id TEXT NOT NULL DEFAULT '0',
          source_published_at TEXT, ingested_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          expires_at TEXT, original_text TEXT NOT NULL, source_revision TEXT NOT NULL,
          origin TEXT, destination TEXT, origin_country TEXT, destination_country TEXT,
          origin_folded TEXT, destination_folded TEXT,
          cargo_name TEXT, body_types TEXT, weight REAL, volume REAL,
          vehicle_count INTEGER, loading_date TEXT, ready_text TEXT, amount REAL, currency TEXT,
          price_state TEXT NOT NULL DEFAULT 'unknown' CHECK(price_state IN ('known','negotiable','unknown')),
          contacts TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'review'
            CHECK(status IN ('active','review','closed','hidden','expired')),
          origin_source TEXT, created_by TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_external_freight_source_segment
          ON external_freight_items(source_id, source_message_id, segment_id);
        CREATE INDEX IF NOT EXISTS ix_external_freight_publication
          ON external_freight_items(kind,status,source_published_at DESC,id DESC,expires_at,ingested_at);
        CREATE INDEX IF NOT EXISTS ix_external_freight_expiry
          ON external_freight_items(status, expires_at);
        CREATE INDEX IF NOT EXISTS ix_external_freight_price
          ON external_freight_items(status,currency,amount,id);
        CREATE TABLE IF NOT EXISTS external_freight_item_body_types (
          item_id TEXT NOT NULL, body_type TEXT NOT NULL,
          PRIMARY KEY(item_id,body_type),
          FOREIGN KEY(item_id) REFERENCES external_freight_items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_external_freight_body_type ON external_freight_item_body_types(body_type,item_id);
        CREATE TABLE IF NOT EXISTS external_freight_bookmarks (
          owner_id TEXT NOT NULL, item_id TEXT NOT NULL, saved_at TEXT NOT NULL,
          PRIMARY KEY(owner_id,item_id),
          FOREIGN KEY(item_id) REFERENCES external_freight_items(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS ix_external_freight_bookmark_item
          ON external_freight_bookmarks(item_id);
        CREATE TABLE IF NOT EXISTS external_freight_audit (
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
          created_at TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS external_freight_delivery (
          source_id TEXT NOT NULL, source_message_id TEXT NOT NULL, segment_id TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, delivered_at TEXT, last_error TEXT,
          PRIMARY KEY(source_id, source_message_id, segment_id)
        );
        CREATE TABLE IF NOT EXISTS external_freight_metrics (
          event_day TEXT NOT NULL, event_name TEXT NOT NULL, event_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(event_day,event_name)
        );
        """)
        columns = {row["name"] for row in c.execute("PRAGMA table_info(external_freight_items)").fetchall()}
        for name in ("origin_country", "destination_country", "origin_folded", "destination_folded"):
            if name not in columns:
                c.execute(f"ALTER TABLE external_freight_items ADD COLUMN {name} TEXT")
        c.execute("CREATE INDEX IF NOT EXISTS ix_external_freight_origin_route ON external_freight_items(kind,status,origin_folded,source_published_at DESC,id DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_external_freight_destination_route ON external_freight_items(kind,status,destination_folded,source_published_at DESC,id DESC)")


def count_active_items(kind: str) -> int:
    """Тот же срок видимости, что у публичной ленты; без страниц и закладок."""
    if kind not in {"cargo", "vehicle"}:
        raise ValueError("invalid_feed_kind")
    with get_conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM external_freight_items WHERE kind=? AND status='active' AND expires_at>?",
            (kind, _utc().isoformat()),
        ).fetchone()[0]


def normalize_record(raw: dict, *, require_reviewed=True):
    if not isinstance(raw, dict):
        raise ValueError("record_must_be_object")
    if not isinstance(raw.get("original_text"), str):
        raise ValueError("invalid_original_text")
    text = raw["original_text"]
    if not text.strip() or len(text) > MAX_TEXT:
        raise ValueError("invalid_original_text")
    kind = raw.get("kind")
    status = raw.get("status", "active")
    if kind not in {"cargo", "vehicle"}:
        status = "review"
        kind = "cargo"
    if status not in {"active", "review", "closed", "hidden"}:
        raise ValueError("invalid_status")
    if require_reviewed and raw.get("classification_status") != "approved" and status != "closed":
        status = "review"
    published = _utc(raw.get("source_published_at")) if raw.get("source_published_at") else None
    now = _utc()
    if published is None:
        status = "review"
    elif published > now + timedelta(minutes=5):
        status = "review"
    item_id = str(raw.get("id") or new_id())
    source_id = str(raw.get("source_id") or "")
    source_message_id = str(raw.get("source_message_id") or "")
    segment_id = str(raw.get("segment_id") or "0")
    if len(item_id) > 80 or len(source_id) > 120 or len(source_message_id) > 160 or len(segment_id) > 80:
        raise ValueError("source_identity_too_long")
    if not source_id or not source_message_id:
        raise ValueError("source_identity_required")
    try:
        amount = None if raw.get("amount") is None else float(raw["amount"])
        weight = None if raw.get("weight") is None else float(raw["weight"])
        volume = None if raw.get("volume") is None else float(raw["volume"])
        vehicle_count = None if raw.get("vehicle_count") is None else int(raw["vehicle_count"])
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("invalid_numeric_field") from exc
    if any(x is not None and (not math.isfinite(x) or x < 0 or x > 1_000_000_000) for x in (amount, weight, volume)):
        raise ValueError("numeric_field_out_of_range")
    if vehicle_count is not None and (float(raw["vehicle_count"]) != vehicle_count or not 1 <= vehicle_count <= 10000):
        raise ValueError("invalid_vehicle_count")
    currency = str(raw.get("currency") or "").strip().upper() or None
    if currency and (len(currency) != 3 or not currency.isalpha()):
        raise ValueError("invalid_currency")
    price_state = raw.get("price_state") or ("known" if amount is not None and currency else "unknown")
    if price_state not in {"known", "negotiable", "unknown"}:
        raise ValueError("invalid_price_state")
    if price_state == "known" and (amount is None or not currency or not currency.isalpha() or len(currency) != 3):
        raise ValueError("price_requires_amount_and_currency")
    if price_state == "known" and amount <= 0:
        raise ValueError("known_price_must_be_positive")
    bodies = raw.get("body_types") or []
    if not isinstance(bodies, list) or len(bodies) > 12 or any(not isinstance(x, str) or len(x) > 40 for x in bodies):
        raise ValueError("invalid_body_types")
    if any(x not in KNOWN_BODY_TYPES for x in bodies):
        status = "review"
        bodies = [x for x in bodies if x in KNOWN_BODY_TYPES]
    contacts = raw.get("contacts") or []
    if not isinstance(contacts, list) or len(contacts) > 20 or any(not isinstance(x, str) or len(x) > 200 for x in contacts):
        raise ValueError("invalid_contacts")
    source_revision = str(raw.get("source_revision") or "")
    if len(source_revision) > 160:
        raise ValueError("source_revision_too_long")
    revision = hashlib.sha256((source_revision + "\0" + text).encode("utf-8")).hexdigest()
    origin_country = _bounded(raw.get("origin_country"), 3).upper() if raw.get("origin_country") else None
    destination_country = _bounded(raw.get("destination_country"), 3).upper() if raw.get("destination_country") else None
    if any(code and not re.fullmatch(r"[A-Z]{2,3}", code) for code in (origin_country, destination_country)):
        raise ValueError("invalid_country_code")
    return {
        "id": item_id, "kind": kind, "source_id": source_id, "source_message_id": source_message_id,
        "segment_id": segment_id, "source_published_at": published.isoformat() if published else None, "ingested_at": now.isoformat(),
        "updated_at": now.isoformat(), "expires_at": (published + timedelta(hours=ACTIVE_HOURS)).isoformat() if published else None,
        "original_text": text, "source_revision": revision,
        "origin": _bounded(raw.get("origin"), 240), "destination": _bounded(raw.get("destination"), 240),
        "origin_country": origin_country, "destination_country": destination_country,
        "origin_folded": (_bounded(raw.get("origin"), 240) or "").casefold(),
        "destination_folded": (_bounded(raw.get("destination"), 240) or "").casefold(),
        "cargo_name": _bounded(raw.get("cargo_name"), 240), "body_types": json.dumps(bodies, ensure_ascii=False),
        "weight": weight, "volume": volume, "vehicle_count": vehicle_count,
        "loading_date": _bounded(raw.get("loading_date"), 80), "ready_text": _bounded(raw.get("ready_text"), 240),
        "amount": amount, "currency": currency, "price_state": price_state,
        "contacts": json.dumps(contacts, ensure_ascii=False), "status": "expired" if published and published + timedelta(hours=ACTIVE_HOURS) <= now else status,
        "origin_source": _bounded(raw.get("origin_source"), 120), "created_by": _bounded(raw.get("created_by"), 120),
    }


def _bounded(value, limit):
    if value is None:
        return None
    value = str(value).strip()
    if len(value) > limit:
        raise ValueError("text_field_too_long")
    return value or None


def import_records(records):
    if not isinstance(records, list) or len(records) > MAX_BATCH:
        raise ValueError("invalid_batch_size")
    normalized_batch = [normalize_record(raw) for raw in records]
    results = []
    columns = ["kind", "source_published_at", "ingested_at", "updated_at", "expires_at", "original_text", "source_revision", "origin", "destination", "origin_country", "destination_country", "origin_folded", "destination_folded", "cargo_name", "body_types", "weight", "volume", "vehicle_count", "loading_date", "ready_text", "amount", "currency", "price_state", "contacts", "status", "origin_source", "created_by"]
    with get_conn() as c:
        for values in normalized_batch:
            current = c.execute("SELECT * FROM external_freight_items WHERE source_id=? AND source_message_id=? AND segment_id=?", (values["source_id"], values["source_message_id"], values["segment_id"])).fetchone()
            if current:
                values["id"] = current["id"]
                # Replay/edit must keep its original admission time so a new
                # ingest cannot move the row into an in-progress cursor snapshot.
                values["ingested_at"] = current["ingested_at"]
                if current["source_published_at"]:
                    values["source_published_at"] = current["source_published_at"]
                    values["expires_at"] = (_utc(current["source_published_at"])
                                             + timedelta(hours=ACTIVE_HOURS)).isoformat()
                elif current["expires_at"]:
                    values["expires_at"] = current["expires_at"]
                unchanged = all(values[key] == current[key] for key in columns
                                if key not in {"status", "ingested_at", "updated_at", "expires_at", "source_published_at"})
                if current["status"] in {"hidden", "closed"} or (
                        current["status"] == "active" and values["status"] == "review" and unchanged):
                    values["status"] = current["status"]
                if values["status"] == "closed":
                    values["kind"] = current["kind"]
                if values["status"] == "active" and (not values["expires_at"] or _utc(values["expires_at"]) <= _utc()):
                    values["status"] = "expired"
                assignments = ",".join(f"{key}=?" for key in columns)
                c.execute(f"UPDATE external_freight_items SET {assignments} WHERE id=?", [values[key] for key in columns] + [values["id"]])
                action = "updated" if not unchanged or values["status"] != current["status"] else "replayed"
            else:
                all_columns = ["id", "source_id", "source_message_id", "segment_id"] + columns
                c.execute(f"INSERT INTO external_freight_items ({','.join(all_columns)}) VALUES ({','.join('?' for _ in all_columns)})", [values[k] for k in all_columns])
                action = "created"
            c.execute("INSERT INTO external_freight_audit(id,item_id,actor,action,created_at,details) VALUES(?,?,?,?,?,?)", (new_id(), values["id"], "importer", action, _utc().isoformat(), "{}"))
            c.execute("DELETE FROM external_freight_item_body_types WHERE item_id=?", (values["id"],))
            c.executemany("INSERT INTO external_freight_item_body_types(item_id,body_type) VALUES(?,?)", [(values["id"], body) for body in json.loads(values["body_types"])])
            results.append({"id": values["id"], "result": action, "status": values["status"]})
    return results


def _serialize(row):
    item = dict(row)
    item.pop("origin_folded", None)
    item.pop("destination_folded", None)
    for key in ("body_types", "contacts"):
        try:
            item[key] = json.loads(item[key] or "[]")
        except (TypeError, ValueError):
            item[key] = []
    return item


def list_items(*, kind, origin=None, destination=None, body_type=None, body_query=None, published_from=None, published_to=None,
               origin_country=None, destination_country=None, currency=None, min_price=None, max_price=None,
               sort="newest", limit=30, cursor=None, owner_id=None, saved_only=False):
    now = _utc().isoformat()
    snapshot_at = now
    last_date = last_id = None
    cursor_filters = {
        "owner_id": str(owner_id) if owner_id is not None else None, "saved_only": bool(saved_only),
        "origin": origin, "destination": destination, "body_type": body_type,
        **({"body_query": body_query} if body_query else {}),
        "origin_country": origin_country.upper() if origin_country else None,
        "destination_country": destination_country.upper() if destination_country else None,
        "published_from": published_from, "published_to": published_to,
        "currency": currency.upper() if currency else None,
        "min_price": min_price, "max_price": max_price,
    }
    if cursor:
        try:
            decoded = json.loads(__import__("base64").urlsafe_b64decode(cursor + "==").decode())
            if decoded["kind"] != kind or decoded.get("sort", "newest") != sort:
                raise ValueError
            if decoded.get("filters") != cursor_filters:
                raise ValueError
            snapshot_at, last_date, last_id = decoded["snapshot"], decoded["date"], decoded["id"]
        except Exception as exc:
            raise ValueError("invalid_cursor") from exc
    clauses = ["kind=?", "ingested_at<=?"]
    params = [kind, snapshot_at]
    if saved_only:
        if not owner_id:
            raise ValueError("bookmark_owner_required")
        clauses.append("EXISTS (SELECT 1 FROM external_freight_bookmarks b WHERE b.item_id=external_freight_items.id AND b.owner_id=?)")
        params.append(str(owner_id))
    else:
        clauses.extend(["status='active'", "expires_at>?"])
        params.append(now)
    for field, value in (("origin_folded", origin), ("destination_folded", destination)):
        if value:
            clauses.append(f"{field} LIKE ?")
            params.append(f"{str(value).strip().casefold()}%")
    if origin_country:
        clauses.append("origin_country=?")
        params.append(origin_country.upper())
    if destination_country:
        clauses.append("destination_country=?")
        params.append(destination_country.upper())
    if body_type:
        clauses.append("EXISTS (SELECT 1 FROM external_freight_item_body_types b WHERE b.item_id=external_freight_items.id AND b.body_type=?)")
        params.append(body_type)
    if body_query:
        escaped = str(body_query).strip().casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        clauses.append("(EXISTS (SELECT 1 FROM external_freight_item_body_types b WHERE b.item_id=external_freight_items.id AND CASEFOLD(b.body_type) LIKE ? ESCAPE '\\') OR CASEFOLD(original_text) LIKE ? ESCAPE '\\')")
        params.extend([pattern, pattern])
    if published_from:
        clauses.append("source_published_at>=?")
        params.append(_utc(published_from).isoformat())
    if published_to:
        clauses.append("source_published_at<=?")
        params.append(_utc(published_to).isoformat())
    if currency:
        clauses.append("currency=?")
        params.append(currency.upper())
    if min_price is not None:
        clauses.append("amount>=?")
        params.append(min_price)
    if max_price is not None:
        clauses.append("amount<=?")
        params.append(max_price)
    sort_error = None
    price_currencies = []
    with get_conn() as c:
        currency_rows = c.execute(
            f"SELECT DISTINCT currency FROM external_freight_items WHERE {' AND '.join(clauses)} "
            "AND price_state='known' AND amount IS NOT NULL AND currency IS NOT NULL ORDER BY currency",
            tuple(params),
        ).fetchall()
        price_currencies = [str(row[0]).upper() for row in currency_rows]
        effective_sort = sort
        if sort.startswith("price_") and not currency and len(price_currencies) != 1:
            effective_sort = "newest"
            sort_error = "mixed_currency" if len(price_currencies) > 1 else "price_unavailable"
    if effective_sort.startswith("price_"):
        clauses.append("amount IS NOT NULL")
    if last_date is not None and last_id:
        if effective_sort == "price_asc":
            clauses.append("(amount>? OR (amount=? AND id>?))")
            params.extend([float(last_date), float(last_date), last_id])
        elif effective_sort == "price_desc":
            clauses.append("(amount<? OR (amount=? AND id<?))")
            params.extend([float(last_date), float(last_date), last_id])
        else:
            clauses.append("(source_published_at<? OR (source_published_at=? AND id<?))")
            params.extend([last_date, last_date, last_id])
    order = "amount ASC, id ASC" if effective_sort == "price_asc" else "amount DESC, id DESC" if effective_sort == "price_desc" else "source_published_at DESC, id DESC"
    with get_conn() as c:
        rows = c.execute(f"SELECT * FROM external_freight_items WHERE {' AND '.join(clauses)} ORDER BY {order} LIMIT ?", (*params, min(max(int(limit), 1), 100) + 1)).fetchall()
    has_more = len(rows) > min(max(int(limit), 1), 100)
    rows = rows[:min(max(int(limit), 1), 100)]
    next_cursor = None
    if has_more and rows:
        import base64
        final = rows[-1]
        cursor_value = final["amount"] if effective_sort.startswith("price_") else final["source_published_at"]
        raw = json.dumps({"kind": kind, "sort": sort, "filters": cursor_filters, "snapshot": snapshot_at, "date": cursor_value, "id": final["id"]}, separators=(",", ":")).encode()
        next_cursor = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    saved_ids = set()
    if owner_id and rows:
        # Не скачиваем все закладки владельца ради страницы из 30 карточек.
        placeholders = ",".join("?" for _ in rows)
        with get_conn() as c:
            saved_ids = {r[0] for r in c.execute(f"SELECT item_id FROM external_freight_bookmarks WHERE owner_id=? AND item_id IN ({placeholders})", (str(owner_id), *(row["id"] for row in rows)))}
    items = []
    for row in rows:
        if row["status"] in {"hidden", "review"}:
            item = {"id": row["id"], "kind": row["kind"], "status": "unavailable", "saved": True}
        else:
            item = _serialize(row)
            item["saved"] = row["id"] in saved_ids
            if item["status"] == "active" and item["expires_at"] and item["expires_at"] <= now:
                item["status"] = "expired"
        items.append(item)
    return {"items": items, "next_cursor": next_cursor, "has_more": has_more, "snapshot_at": snapshot_at,
            "sort_applied": effective_sort, "price_sort_available": len(price_currencies) == 1,
            "price_currencies": price_currencies, "sort_error": sort_error}


def set_bookmark(owner_id, item_id, kind, saved):
    """Явное идемпотентное состояние; владелец приходит только из auth."""
    with get_conn() as c:
        row = c.execute("SELECT kind,status,expires_at FROM external_freight_items WHERE id=?", (item_id,)).fetchone()
        existing = c.execute("SELECT 1 FROM external_freight_bookmarks WHERE owner_id=? AND item_id=?", (str(owner_id), item_id)).fetchone()
        if not row or row["kind"] != kind:
            return None
        if saved:
            if not existing and (row["status"] != "active" or not row["expires_at"] or row["expires_at"] <= _utc().isoformat()):
                return None
            c.execute("INSERT OR IGNORE INTO external_freight_bookmarks(owner_id,item_id,saved_at) VALUES(?,?,?)", (str(owner_id), item_id, _utc().isoformat()))
        else:
            c.execute("DELETE FROM external_freight_bookmarks WHERE owner_id=? AND item_id=?", (str(owner_id), item_id))
    return {"id": item_id, "saved": bool(saved)}


def get_item(item_id, owner_id=None):
    with get_conn() as c:
        row = c.execute("""SELECT * FROM external_freight_items WHERE id=?
          AND status IN ('active','expired','closed')
          AND ((status='active' AND expires_at>?) OR EXISTS (
            SELECT 1 FROM external_freight_bookmarks b
            WHERE b.item_id=external_freight_items.id AND b.owner_id=?))""",
          (item_id, _utc().isoformat(), str(owner_id) if owner_id is not None else "")).fetchone()
    return _serialize(row) if row else None


def hide_item(item_id, actor):
    with get_conn() as c:
        cur = c.execute("UPDATE external_freight_items SET status='hidden',updated_at=? WHERE id=? AND status!='hidden'", (_utc().isoformat(), item_id))
        if cur.rowcount:
            c.execute("INSERT INTO external_freight_audit(id,item_id,actor,action,created_at,details) VALUES(?,?,?,?,?,?)", (new_id(), item_id, str(actor)[:120], "hidden", _utc().isoformat(), "{}"))
        return cur.rowcount > 0


ALLOWED_EVENTS = {"feed_open", "filter_apply", "card_expand", "contact_copy", "own_listing_entry"}


def record_event(event_name):
    if event_name not in ALLOWED_EVENTS:
        raise ValueError("invalid_event")
    day = _utc().date().isoformat()
    with get_conn() as c:
        c.execute("INSERT INTO external_freight_metrics(event_day,event_name,event_count) VALUES(?,?,1) ON CONFLICT(event_day,event_name) DO UPDATE SET event_count=event_count+1", (day, event_name))
