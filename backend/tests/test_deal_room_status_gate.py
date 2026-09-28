"""Regression: the deal-room door must enforce the SAME deal-status policy
as the legacy /chat/* door.

P1 (FINAL 10/10 audit, 2026-09-14). Before the fix, /chat/conversations/{id}/*
authorized on participation ALONE. A participant of a CANCELLED deal could
still read the transcript, list+download attachments, mark read, and — worst —
UPLOAD a new attachment, which additionally fired a bell + push to a
counterparty who could no longer open that room at all. The legacy door
(api/chat.py, via _assert_chat_is_accepted / _DEAL_CHAT_STATUSES) correctly
returned 403 for every one of those in the same state.

The policy is not ambiguous: test_deal_rooms.py already pins that a cancelled
deal drops the room out of my_rooms() and makes send_message 403. These tests
pin that the second door agrees.

Also pinned here (the deliberate NON-gated endpoints, so a future "tighten
everything" refactor cannot silently break them):
  * /support/escalate must KEEP working on a cancelled deal — a dispute about
    a cancelled deal is exactly when a user needs support.
  * an OUTSIDER must still get "not a participant" (403) and never learn
    deal-state detail — participation is checked BEFORE the status gate.
"""
import uuid

import pytest
from fastapi import HTTPException

from api import deal_room
from database.db import get_conn


def _mk_room_with_deal(status: str):
    """Minimal real rows: a cargo-backed chat room + a deal in `status`."""
    shipper = f"gate-shipper-{uuid.uuid4().hex[:8]}"
    driver = f"gate-driver-{uuid.uuid4().hex[:8]}"
    cargo_id = f"gate-cargo-{uuid.uuid4().hex[:8]}"
    room_id = f"gate-room-{uuid.uuid4().hex[:8]}"
    deal_id = f"gate-deal-{uuid.uuid4().hex[:8]}"

    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_rooms (id, participant_1, participant_2, cargo_id, trip_id) "
            "VALUES (?,?,?,?,NULL)",
            (room_id, shipper, driver, cargo_id),
        )
        c.execute(
            "INSERT INTO deals (id, bid_id, cargo_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (deal_id, f"gate-bid-{uuid.uuid4().hex[:8]}", cargo_id, shipper, driver,
             "Алматы", "Астана", 480000, status, room_id),
        )
    return {"room_id": room_id, "shipper": shipper, "driver": driver,
            "cargo_id": cargo_id, "deal_id": deal_id}


# ── the gate itself ──────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["cancelled", "rejected"])
def test_closed_deal_blocks_the_deal_room_door(status):
    r = _mk_room_with_deal(status)
    for actor in (r["shipper"], r["driver"]):
        with pytest.raises(HTTPException) as exc:
            deal_room._assert_deal_room_open(r["room_id"], actor)
        assert exc.value.status_code == 403, (
            f"{status} deal must close the deal-room door for {actor}"
        )


@pytest.mark.parametrize("status", ["accepted", "in_progress", "at_border",
                                    "delivered", "received", "completed"])
def test_active_and_finished_deal_keeps_the_deal_room_open(status):
    """The fix must not narrow anything for real, chat-eligible statuses —
    including the terminal `completed` one (history stays readable)."""
    r = _mk_room_with_deal(status)
    for actor in (r["shipper"], r["driver"]):
        deal_room._assert_deal_room_open(r["room_id"], actor)  # must not raise


def test_unknown_conversation_is_404_not_500():
    with pytest.raises(HTTPException) as exc:
        deal_room._assert_deal_room_open("gate-room-does-not-exist", "whoever")
    assert exc.value.status_code == 404


# ── the gate is wired into exactly the right endpoints ──────────────────

def test_gate_is_wired_into_all_four_deal_room_endpoints():
    """Structural: participation check FIRST, then the status gate — in each
    of the four endpoints that serve or mutate room content."""
    import ast
    import inspect

    src = inspect.getsource(deal_room)
    tree = ast.parse(src)
    gated = {
        n.name for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and n.name != "_assert_deal_room_open"
        and "_assert_deal_room_open(" in (ast.get_source_segment(src, n) or "")
    }
    assert gated == {
        "conversation_messages",
        "conversation_read",
        "upload_attachment",
        "list_conversation_attachments",
    }, f"unexpected gate placement: {sorted(gated)}"

    # Participation must be asserted BEFORE the status gate, so an outsider
    # gets "not a participant" and never learns anything about deal state.
    for name in sorted(gated):
        fn_src = next(
            ast.get_source_segment(src, n) for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name
        )
        assert fn_src.index("is_participant") < fn_src.index("_assert_deal_room_open("), (
            f"{name}: status gate must come AFTER the participation check"
        )


def test_support_escalation_is_deliberately_not_gated():
    """A dispute about a cancelled deal must stay escalatable."""
    import ast
    import inspect

    src = inspect.getsource(deal_room)
    tree = ast.parse(src)
    fn = next(
        n for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "support_escalate"
    )
    assert "_assert_deal_room_open(" not in (ast.get_source_segment(src, fn) or ""), (
        "support escalation must NOT be closed by the deal-status gate — "
        "users dispute cancelled deals precisely because they were cancelled"
    )
