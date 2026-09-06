"""Chat application service (AC2 room creation, AC4 message persistence — 2026-09-07).

`create_or_get_deal_room` moved here verbatim from api/marketplace.py's
`_ensure_chat_room_inline`, which is where the actual canonical room-
creation logic has lived since the "Variant B" migration (see
api/chat.py's `_deal_key` — same key format, declared independently there
for its own lookups). This is the ONE owner of room *creation*; api/chat.py
keeps reading/using rooms it did not create without needing to change.

`persist_message` moved here from api/chat.py's send_message() — the
idempotent insert-or-return core only (see its own docstring for exactly
what did and did not move in this increment).

Deliberately connection-scoped, not connection-owning throughout this
module: callers pass their own open `sqlite3.Connection`, already inside a
transaction (accept_bid's bid/cargo/deal writes, or send_message's request
transaction). A failure here must roll back with the caller's whole
operation — a bid must never end up "half accepted", a message must never
end up "half sent". This module must never open or commit its own
connection for that reason.
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


def persist_message(
    conn: sqlite3.Connection,
    room_id: str,
    sender_id: str,
    text: str | None,
    photo_url: str | None = None,
    is_voice: bool = False,
    voice_duration=None,
    client_msg_id: str | None = None,
) -> dict:
    """AC4 (2026-09-07, scoped increment): the idempotent insert-or-return
    core of api/chat.py's send_message(), moved here verbatim. This is
    ONLY the persistence/idempotency slice — authorization (room
    membership, `_assert_chat_is_accepted`), rate limiting, push, and the
    support/demo-bot auto-reply triggers deliberately stay in api/chat.py
    for this increment (see AC4 status in the AC5 legacy-adapter doc for
    the rest of the canonical send flow this does not yet cover).

    Idempotency has two layers, both preserved exactly from the original:
    a SELECT-first dedupe (the common case: a retried request after the
    first response was lost) and a fallback catch of the UNIQUE(room_id,
    sender_id, client_msg_id) IntegrityError (the race: two concurrent
    retries with the same client_msg_id — the loser's INSERT collides, and
    that collision IS success, not an error, for an idempotent send).

    Returns {"deduped": bool, "message_id": int|None, "created_at": str|None}.
    A caller MUST still separately decide whether to fire push/bot-reply
    side effects — this function never does, matching its module-level
    connection-scoped/no-side-effect convention (see create_or_get_deal_room).
    """
    if client_msg_id:
        existing = conn.execute(
            "SELECT id, created_at FROM chat_messages WHERE room_id = ? AND sender_id = ? AND client_msg_id = ?",
            (room_id, sender_id, client_msg_id),
        ).fetchone()
        if existing:
            return {"deduped": True, "message_id": existing["id"], "created_at": existing["created_at"]}
    try:
        conn.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text, photo_url, is_voice, voice_duration, client_msg_id) VALUES (?,?,?,?,?,?,?)",
            (room_id, sender_id, text, photo_url, 1 if is_voice else 0, voice_duration, client_msg_id),
        )
    except sqlite3.IntegrityError:
        if not client_msg_id:
            raise
        existing = conn.execute(
            "SELECT id, created_at FROM chat_messages WHERE room_id = ? AND sender_id = ? AND client_msg_id = ?",
            (room_id, sender_id, client_msg_id),
        ).fetchone()
        if not existing:
            raise
        return {"deduped": True, "message_id": existing["id"], "created_at": existing["created_at"]}
    preview = (text or "📷 Фото")[:50]
    conn.execute("UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?", (preview, room_id))
    created = (
        conn.execute(
            "SELECT id, created_at FROM chat_messages WHERE room_id = ? AND sender_id = ? AND client_msg_id = ?",
            (room_id, sender_id, client_msg_id),
        ).fetchone()
        if client_msg_id
        else None
    )
    return {
        "deduped": False,
        "message_id": created["id"] if created else None,
        "created_at": created["created_at"] if created else None,
    }
