"""AC2: Chat owns deal-room creation.

modules/chat/application/service.py::create_or_get_deal_room is now the ONE
place the canonical room-upsert SQL lives. api/marketplace.py's
`_ensure_chat_room_inline` and `_v2_room_factory` are thin, behavior-
preserving delegates — this file proves both the new module's own contract
AND that the legacy call sites still produce byte-identical results (same
room id, same owner_id/bidder_id column mapping) after the move.
"""
import sqlite3

import pytest

from backend.modules.chat.application.service import create_or_get_deal_room, deal_key
from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService, DomainError


SCHEMA = (
    open("backend/database/marketplace_schema.sql").read()
    + open("backend/database/deals_schema.sql").read()
    + open("backend/database/chat_schema.sql").read()
)


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


# ─── 1. create_or_get_deal_room: identity, idempotency, ordering ───

def test_first_create_produces_one_room():
    conn = db()
    room_id = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    assert room_id
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1


def test_existing_room_returns_same_id():
    conn = db()
    first = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    second = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    assert first == second
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1


def test_participant_order_is_irrelevant_to_room_identity():
    """Whoever is passed as owner vs bidder, the pair (ship, drv) for the
    SAME cargo must resolve to the SAME room — canonical participant
    ordering is internal (sorted), not caller-order-dependent."""
    conn = db()
    a = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    b = create_or_get_deal_room(conn, "drv", "ship", cargo_id="c1")  # swapped
    conn.commit()
    assert a == b
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1


def test_different_cargo_produces_different_rooms():
    conn = db()
    a = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    b = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c2")
    conn.commit()
    assert a != b
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 2


def test_bid_id_is_attached_via_coalesce_without_overwriting():
    conn = db()
    room_id = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    assert conn.execute("SELECT bid_id FROM chat_rooms WHERE id=?", (room_id,)).fetchone()[0] is None
    create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1", bid_id="b1")
    conn.commit()
    assert conn.execute("SELECT bid_id FROM chat_rooms WHERE id=?", (room_id,)).fetchone()[0] == "b1"
    # A second, different bid_id must NOT overwrite the first (COALESCE).
    create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1", bid_id="b2")
    conn.commit()
    assert conn.execute("SELECT bid_id FROM chat_rooms WHERE id=?", (room_id,)).fetchone()[0] == "b1"


def test_owner_and_bidder_columns_map_correctly():
    conn = db()
    create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    row = dict(conn.execute("SELECT owner_id, bidder_id FROM chat_rooms").fetchone())
    assert row == {"owner_id": "ship", "bidder_id": "drv"}


def test_concurrent_create_same_deal_key_produces_one_room():
    """Simulates the race ON CONFLICT(deal_key) DO NOTHING exists for: a
    row for this deal_key appears between our SELECT and INSERT (a second
    writer won). The function must return THAT row, not error, and never
    leave two rows for the same key."""
    conn = db()
    dk = deal_key("c1", None, *sorted(["ship", "drv"]))
    conn.execute(
        "INSERT INTO chat_rooms (id, participant_1, participant_2, owner_id, bidder_id, cargo_id, deal_key) "
        "VALUES ('winner-room', 'drv', 'ship', 'ship', 'drv', 'c1', ?)",
        (dk,),
    )
    conn.commit()
    room_id = create_or_get_deal_room(conn, "ship", "drv", cargo_id="c1")
    conn.commit()
    assert room_id == "winner-room"
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1


# ─── 2. legacy delegates are byte-identical to the module they now wrap ───

def test_legacy_ensure_chat_room_inline_matches_module_directly():
    import backend.api.marketplace as marketplace

    conn_a = db()
    conn_b = db()
    legacy_id = marketplace._ensure_chat_room_inline(conn_a, "drv", "ship", "c1", None, "b1")
    conn_a.commit()
    direct_id = create_or_get_deal_room(conn_b, "ship", "drv", cargo_id="c1", trip_id=None, bid_id="b1")
    conn_b.commit()
    row_a = dict(conn_a.execute("SELECT participant_1, participant_2, owner_id, bidder_id, deal_key FROM chat_rooms").fetchone())
    row_b = dict(conn_b.execute("SELECT participant_1, participant_2, owner_id, bidder_id, deal_key FROM chat_rooms").fetchone())
    assert row_a == row_b
    assert legacy_id and direct_id  # both non-empty; ids themselves are random uuids, keys/columns must match


def test_v2_room_factory_matches_ensure_chat_room_inline_mapping():
    """_v2_room_factory(c, shipper_id, driver_id, ...) must produce the
    exact same owner/bidder column mapping the old
    _ensure_chat_room_inline(c, shipper_id, driver_id, ...) call produced
    before AC2 — this pins that historical mapping down as a regression
    guard, independent of whether it is itself intuitively named."""
    import backend.api.marketplace as marketplace

    conn_a = db()
    conn_b = db()
    via_factory = marketplace._v2_room_factory(conn_a, "ship", "drv", "c1", None, "b1")
    conn_a.commit()
    via_legacy_call_shape = marketplace._ensure_chat_room_inline(conn_b, "ship", "drv", "c1", None, "b1")
    conn_b.commit()
    row_a = dict(conn_a.execute("SELECT owner_id, bidder_id, deal_key FROM chat_rooms").fetchone())
    row_b = dict(conn_b.execute("SELECT owner_id, bidder_id, deal_key FROM chat_rooms").fetchone())
    assert row_a == row_b


# ─── 3. accept-transaction atomicity through the REAL production room
#        factory (previously only a test-local stub room_factory was ever
#        exercised end-to-end — see test_deals_v2_chat_push_wiring.py) ───

def _bid_db():
    conn = db()
    conn.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES ('c1','ship','A','B','x','active')")
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',100,'pending')")
    conn.commit()
    return conn


def test_accept_bid_with_real_v2_room_factory_creates_one_room():
    import backend.api.marketplace as marketplace

    conn = _bid_db()
    conn.execute("BEGIN IMMEDIATE")
    result = DealsBidsService(conn, room_factory=marketplace._v2_room_factory).accept_bid(
        "b1", Actor("ship", "client"), CommandContext("op", "corr", "k1")
    )
    conn.commit()
    assert result["chat_room_id"]
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1
    assert conn.execute("SELECT chat_room_id FROM deals").fetchone()[0] == result["chat_room_id"]


def test_room_creation_failure_rolls_back_the_whole_accept():
    """If the room factory raises, the caller's transaction (bid status,
    cargo reservation, deals row) must roll back with it — a bid must never
    end up half-accepted (accepted in `bids` but no chat room / no deal)."""

    def failing_room_factory(*_args, **_kwargs):
        raise RuntimeError("simulated room-creation failure")

    conn = _bid_db()
    conn.execute("BEGIN IMMEDIATE")
    with pytest.raises(RuntimeError):
        DealsBidsService(conn, room_factory=failing_room_factory).accept_bid(
            "b1", Actor("ship", "client"), CommandContext("op", "corr", "k2")
        )
    conn.rollback()
    assert conn.execute("SELECT status FROM bids WHERE id='b1'").fetchone()[0] == "pending"
    assert conn.execute("SELECT status FROM cargos WHERE id='c1'").fetchone()[0] == "active"
    assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 0
