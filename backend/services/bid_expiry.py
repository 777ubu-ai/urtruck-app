"""Server-side expiry for marketplace listings and bids.

Product rule (2026-08-20):
- an unaccepted bid is actionable for at most 48 hours since its last activity;
- a listing's pickup/departure date is a hard ceiling: once that calendar day
  is in the past, the active listing and its still-open bids expire;
- accepted deals are never deleted or auto-cancelled by this cleanup;
- expired rows stay in the database for history/audit and move to Archive in UI.
"""
from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
import re
import uuid
from typing import Optional

from database.db import get_conn

BID_TTL_HOURS = 48
OPEN_BID_STATUSES = ("pending", "countered")
ACTIVE_DEAL_STATUSES = (
    "accepted",
    "in_progress",
    "at_border",
    "awaiting_confirmation",
    "delivered",
    "received",
)


def _utc_naive(now: Optional[datetime] = None) -> datetime:
    value = now or datetime.utcnow()
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def parse_market_date(value):
    """Parse the date shapes already accepted by marketplace.py."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw[:10] if fmt == "%Y-%m-%d" else raw, fmt).date()
        except (TypeError, ValueError):
            pass
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if match:
        try:
            return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3))).date()
        except ValueError:
            return None
    return None


def parse_market_timestamp(value):
    """Parse SQLite/ISO timestamps as UTC-naive datetimes."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    return None


def bid_deadline(updated_at, created_at, ttl_hours: int = BID_TTL_HOURS):
    activity = parse_market_timestamp(updated_at) or parse_market_timestamp(created_at)
    return activity + timedelta(hours=ttl_hours) if activity else None


def _has_active_deal(conn, *, cargo_id=None, trip_id=None) -> bool:
    if not cargo_id and not trip_id:
        return False
    placeholders = ",".join("?" for _ in ACTIVE_DEAL_STATUSES)
    if cargo_id:
        row = conn.execute(
            f"SELECT 1 FROM deals WHERE cargo_id = ? AND status IN ({placeholders}) LIMIT 1",
            (cargo_id, *ACTIVE_DEAL_STATUSES),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM deals WHERE trip_id = ? AND status IN ({placeholders}) LIMIT 1",
            (trip_id, *ACTIVE_DEAL_STATUSES),
        ).fetchone()
    return bool(row)


def _price_event(conn, bid, reason: str) -> None:
    """Best-effort terminal event. Expiry must not fail if an old DB lacks it."""
    try:
        conn.execute(
            "INSERT INTO price_events (id, bid_id, actor_id, actor_role, amount, kind, comment) "
            "VALUES (?, ?, NULL, 'system', ?, 'expired', ?)",
            (str(uuid.uuid4()), bid["id"], bid["amount"], reason),
        )
    except Exception:
        pass


def _expire_with_conn(conn, now: datetime) -> dict:
    today = now.date()
    expired_cargos = []
    expired_trips = []
    expired_bids = []
    reasons = {}

    # Date is a hard ceiling for an ACTIVE listing, but never mutate an
    # accepted/active deal. This repairs the parent status first so new bids
    # are rejected by the existing create_bid(status == active) guard.
    for row in conn.execute(
        "SELECT id, pickup_date FROM cargos WHERE status = 'active' AND pickup_date IS NOT NULL"
    ).fetchall():
        departure = parse_market_date(row["pickup_date"])
        if departure and departure < today and not _has_active_deal(conn, cargo_id=row["id"]):
            cur = conn.execute(
                "UPDATE cargos SET status='expired', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND status='active'",
                (row["id"],),
            )
            if cur.rowcount:
                expired_cargos.append(row["id"])

    for row in conn.execute(
        "SELECT id, departure FROM trips WHERE status = 'active' AND departure IS NOT NULL"
    ).fetchall():
        departure = parse_market_date(row["departure"])
        if departure and departure < today and not _has_active_deal(conn, trip_id=row["id"]):
            cur = conn.execute(
                "UPDATE trips SET status='expired', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND status='active'",
                (row["id"],),
            )
            if cur.rowcount:
                expired_trips.append(row["id"])

    # Now close every still-open bid whose 48h activity window ended or whose
    # parent is no longer actionable. Accepted/rejected/cancelled rows are not
    # selected and therefore cannot be changed by this job.
    rows = conn.execute(
        "SELECT b.id, b.cargo_id, b.trip_id, b.amount, b.created_at, b.updated_at, "
        "c.status AS cargo_status, c.pickup_date, "
        "t.status AS trip_status, t.departure "
        "FROM bids b "
        "LEFT JOIN cargos c ON c.id=b.cargo_id "
        "LEFT JOIN trips t ON t.id=b.trip_id "
        "WHERE b.status IN ('pending','countered')"
    ).fetchall()

    touched_cargos = set()
    for row in rows:
        bid = dict(row)
        deadline = bid_deadline(bid.get("updated_at"), bid.get("created_at"))
        ttl_expired = deadline is not None and deadline <= now
        reason = None

        if bid.get("cargo_id"):
            parent_status = bid.get("cargo_status")
            parent_date = parse_market_date(bid.get("pickup_date"))
            if parent_status is None:
                reason = "listing_missing"
            elif parent_status != "active":
                reason = "listing_inactive"
            elif parent_date and parent_date < today:
                reason = "listing_date_passed"
        elif bid.get("trip_id"):
            parent_status = bid.get("trip_status")
            parent_date = parse_market_date(bid.get("departure"))
            if parent_status is None:
                reason = "listing_missing"
            elif parent_status != "active":
                reason = "listing_inactive"
            elif parent_date and parent_date < today:
                reason = "listing_date_passed"
        elif ttl_expired:
            # Legacy/unlinked bids can still age out by TTL.
            reason = "bid_ttl_48h"

        if reason is None and ttl_expired:
            reason = "bid_ttl_48h"
        if reason is None:
            continue

        cur = conn.execute(
            "UPDATE bids SET status='expired', updated_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND status IN ('pending','countered')",
            (bid["id"],),
        )
        if not cur.rowcount:
            continue
        expired_bids.append(bid["id"])
        reasons[bid["id"]] = reason
        _price_event(conn, bid, reason)
        if bid.get("cargo_id"):
            touched_cargos.add(bid["cargo_id"])

    # `bids_count` is a cached active-response count. Recompute it rather than
    # decrementing blindly, which also repairs old drift in production data.
    for cargo_id in touched_cargos:
        conn.execute(
            "UPDATE cargos SET bids_count=(SELECT COUNT(*) FROM bids "
            "WHERE cargo_id=? AND status IN ('pending','countered')) WHERE id=?",
            (cargo_id, cargo_id),
        )

    return {
        "expired_bids": expired_bids,
        "expired_cargos": expired_cargos,
        "expired_trips": expired_trips,
        "reasons": reasons,
        "now": now.isoformat(timespec="seconds") + "Z",
    }


def expire_stale_marketplace(now: Optional[datetime] = None, conn=None) -> dict:
    """Expire stale listings/offers atomically.

    `conn` is injectable for deterministic unit tests. Production callers omit
    it and use the normal DB context manager, which commits on success.
    """
    current = _utc_naive(now)
    if conn is not None:
        return _expire_with_conn(conn, current)
    with get_conn() as db_conn:
        return _expire_with_conn(db_conn, current)
