"""Chat application service — canonical deal-room creation (AC2, 2026-09-07).

Moved here verbatim from api/marketplace.py's `_ensure_chat_room_inline`,
which is where the actual canonical room-creation logic has lived since the
"Variant B" migration (see api/chat.py's `_deal_key` — same key format,
declared independently there for its own lookups). This is the ONE owner of
room *creation*; api/chat.py keeps reading/using rooms it did not create
without needing to change.

Deliberately connection-scoped, not connection-owning: callers (Deals V2's
`_v2_room_factory`, and legacy `_finalize_accept_inline` /
`accept_counter`) pass their own open `sqlite3.Connection`, already inside a
`BEGIN IMMEDIATE` transaction that also writes `bids`/`cargos`/`trips`/
`deals`. If room creation fails, the caller's transaction rolls back the
whole accept — a bid does not get "half accepted". This module must never
open or commit its own connection for this reason.
"""
import sqlite3

try:
    from database.db import new_id
except ImportError:  # repository-root imports used by tests
    from backend.database.db import new_id


def deal_key(cargo_id, trip_id, participant_1: str, participant_2: str) -> str:
    """Canonical room identity. cargo takes priority over trip; with
    neither, falls back to a plain participant-pair (support/general chat).
    participant_1/participant_2 MUST already be the sorted pair — this
    mirrors api/chat.py's own `_deal_key` exactly (same format, kept as a
    separate declaration there deliberately — see module docstring)."""
    if cargo_id:
        return f"c:{cargo_id}:{participant_1}:{participant_2}"
    if trip_id:
        return f"t:{trip_id}:{participant_1}:{participant_2}"
    return f"p:{participant_1}:{participant_2}"


def create_or_get_deal_room(
    conn: sqlite3.Connection,
    shipper_or_owner_id: str,
    driver_or_bidder_id: str,
    cargo_id=None,
    trip_id=None,
    bid_id=None,
) -> str:
    """Idempotent create-or-get for the canonical deal room, on the
    CALLER's open connection/transaction (see module docstring for why).

    `driver_or_bidder_id` is the party who responded (bidder); the other
    argument is the cargo owner or trip driver — this naming/order matches
    the historical `_ensure_chat_room_inline(c, user_a, user_b, ...)`
    exactly, where user_a=bidder, user_b=owner. Preserves: existing room ID
    when a room already exists for this deal_key, canonical participant
    ordering (sorted pair, order-independent), and the same
    `ON CONFLICT(deal_key) DO NOTHING` upsert race-safety two concurrent
    accepts on the same deal_key cannot create two rooms.
    """
    p1, p2 = sorted([driver_or_bidder_id, shipper_or_owner_id])
    dk = deal_key(cargo_id, trip_id, p1, p2)
    row = conn.execute("SELECT id FROM chat_rooms WHERE deal_key = ?", (dk,)).fetchone()
    if row:
        if bid_id:
            conn.execute("UPDATE chat_rooms SET bid_id = COALESCE(bid_id, ?) WHERE id = ?", (bid_id, row["id"]))
        return row["id"]
    room_id = new_id()
    conn.execute(
        "INSERT INTO chat_rooms (id, participant_1, participant_2, owner_id, bidder_id, bid_id, cargo_id, trip_id, deal_key) "
        "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(deal_key) DO NOTHING",
        (room_id, p1, p2, shipper_or_owner_id, driver_or_bidder_id, bid_id, cargo_id, trip_id, dk),
    )
    # Concurrent create losing the ON CONFLICT race: re-read to return the
    # room the winner actually created, never our own discarded row id.
    row = conn.execute("SELECT id FROM chat_rooms WHERE deal_key = ?", (dk,)).fetchone()
    return row["id"] if row else room_id
