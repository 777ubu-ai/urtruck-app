"""P0 regression: bid-status TOCTOU race between accept_bid and the other
check-then-act bid mutations (counter_bid / cancel_bid / cancel_counter_as_owner
/ decline_counter / update_bid / reject_bid), and its downstream effect on the
"one active deal per cargo/trip" invariant.

Root cause (pre-fix): every one of those six endpoints reads `bids.status`
via a plain SELECT, checks it in Python, and then writes with an UNCONDITIONAL
`UPDATE bids SET status=... WHERE id=?` -- no `WHERE status = <expected>`
re-check at write time. `_finalize_accept_inline` (used by accept_bid/
accept_counter) is the only one that guards its write
(`WHERE status IN ('pending','countered')` + rowcount check). Two real,
concurrently-running requests -- one of them a genuine accept -- can
interleave so the loser's write silently clobbers the winner's already-
committed, deal-backed status.

Determinism: no sleep-based timing anywhere. A single, real synchronization
checkpoint is created by monkeypatching `_cargo_or_trip_owner_id` -- a real
function every one of the six endpoints already calls between its read-check
and its write -- to signal a `threading.Event` once "thread B" has completed
its stale read, then block on a second `threading.Event` until "thread A"
has fully committed. This reproduces the exact interleaving a live server
under real concurrent load can produce (both endpoints are plain `def`
routes, run via FastAPI's threadpool, each opening its own SQLite
connection -- see Block 3 audit), without needing to guess at timing.

Run standalone from backend/:
    DB_PATH=/tmp/urtruck_test_p0_race.db python -m tests.test_p0_deal_bid_race

Or via pytest (conftest.py owns DB_PATH/schema in that mode).
"""
import os
import sys
import threading
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_p0_race.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()

import api.marketplace as marketplace  # noqa: E402  (schema _init() runs on import)
from database.db import get_conn, new_id  # noqa: E402

# accept_bid/_finalize_accept_inline write into chat_rooms/chat_messages and
# notifications (best-effort try/except) -- make sure those tables exist so
# a race test isn't polluted by unrelated "no such table" noise.
for _schema_name in ("chat_schema.sql", "notifications_schema.sql"):
    _p = ROOT / "database" / _schema_name
    if _p.exists():
        with get_conn() as _c:
            _c.executescript(_p.read_text(encoding="utf-8"))


# ─────────────────────────── fixtures / helpers ───────────────────────────

def seed_cargo(owner_id: str, price: int = 1000) -> str:
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow", "Test cargo", "tent", price, 0, "active"),
        )
    return cargo_id


def seed_bid(cargo_id: str, bidder_id: str, amount: int = 900) -> str:
    bid_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO bids (id, cargo_id, bidder_id, bidder_name, amount, status) "
            "VALUES (?,?,?,?,?, 'pending')",
            (bid_id, cargo_id, bidder_id, "Bidder", amount),
        )
    return bid_id


def get_bid(bid_id: str) -> dict:
    with get_conn() as c:
        row = c.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone()
        return dict(row) if row else None


def get_cargo(cargo_id: str) -> dict:
    with get_conn() as c:
        row = c.execute("SELECT * FROM cargos WHERE id=?", (cargo_id,)).fetchone()
        return dict(row) if row else None


def get_deals_for_cargo(cargo_id: str) -> list:
    with get_conn() as c:
        rows = c.execute("SELECT * FROM deals WHERE cargo_id=?", (cargo_id,)).fetchall()
        return [dict(r) for r in rows]


class _RaceCheckpoint:
    """Monkeypatches `marketplace._cargo_or_trip_owner_id` so that, for one
    specific bid_id, the call blocks between a competing endpoint's read and
    its write. Restores the original function on __exit__ no matter what."""

    def __init__(self, target_bid_id: str):
        self.target_bid_id = target_bid_id
        self.reached = threading.Event()
        self.release = threading.Event()
        self._real = marketplace._cargo_or_trip_owner_id

    def _patched(self, c, bid):
        if bid.get("id") == self.target_bid_id:
            self.reached.set()
            if not self.release.wait(timeout=5):
                raise RuntimeError("race checkpoint: release event never set (test deadlock)")
        return self._real(c, bid)

    def __enter__(self):
        marketplace._cargo_or_trip_owner_id = self._patched
        return self

    def __exit__(self, *exc):
        marketplace._cargo_or_trip_owner_id = self._real
        return False


def _run_in_thread(fn, **kwargs):
    result, error = {}, {}

    def _target():
        try:
            result["value"] = fn(**kwargs)
        except Exception as e:  # noqa: BLE001 - test needs the raw exception
            error["value"] = e

    t = threading.Thread(target=_target)
    t.start()
    return t, result, error


# ───────────────────────────────── tests ──────────────────────────────────

def test_accept_bid_vs_counter_bid_race_does_not_corrupt_accepted_state():
    """Thread A: accept_bid(B). Thread B: counter_bid(B), whose read of
    status='pending' happened before A committed.

    Pre-fix (documented, reproducible): B's unconditional `UPDATE bids SET
    status='countered' WHERE id=?` clobbers the just-accepted bid, so the DB
    ends up with a committed, deal-backed 'accepted' bid whose `status`
    column now reads 'countered' -- the exact "accepted deal + bid says
    countered again" corruption this P0 track was opened to close.

    Post-fix requirement: whichever of the two requests loses the race gets
    a clean 409 and makes NO write; the winner's state is never overwritten.
    """
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)

    with _RaceCheckpoint(bid_id) as cp:
        body = marketplace.BidCounterIn(amount=950, message=None)
        t_b, counter_result, counter_error = _run_in_thread(
            marketplace.counter_bid, bid_id=bid_id, body=body, user={"id": owner_id}
        )

        assert cp.reached.wait(timeout=5), "counter_bid never reached the race checkpoint"

        # Thread A: accept_bid runs to completion (commits) while B is parked
        # past its own stale read.
        accept_result = marketplace.accept_bid(bid_id=bid_id, user={"id": owner_id})
        assert accept_result["ok"] is True
        deal_id = accept_result["deal_id"]

        cp.release.set()
        t_b.join(timeout=5)

    bid_after = get_bid(bid_id)
    deals_after = get_deals_for_cargo(cargo_id)
    accepted_deal = next((d for d in deals_after if d["id"] == deal_id), None)

    print(f"[race] bid.status after race            = {bid_after['status']!r}")
    print(f"[race] counter_bid result                = {counter_result.get('value')!r}")
    print(f"[race] counter_bid error                 = {counter_error.get('value')!r}")
    print(f"[race] deals for cargo (count={len(deals_after)}) = {deals_after}")

    assert accepted_deal is not None and accepted_deal["status"] == "accepted", (
        "accept_bid should have committed a deal regardless of the race"
    )
    # THE INVARIANT: a bid backing a committed, accepted deal must never be
    # observably in any other status. Pre-fix this fails (status=='countered').
    assert bid_after["status"] == "accepted", (
        f"TOCTOU corruption reproduced: bid backing accepted deal {deal_id!r} "
        f"now reads status={bid_after['status']!r} (expected 'accepted'). "
        f"counter_bid's concurrent write was not rejected as stale."
    )
    # The loser must have failed loudly (409), not silently "succeeded".
    assert counter_error.get("value") is not None, (
        "counter_bid should have raised (stale-state 409) once accept_bid won the race"
    )
    from fastapi import HTTPException
    err = counter_error["value"]
    assert isinstance(err, HTTPException) and err.status_code == 409, (
        f"expected a clean 409 from the losing counter_bid, got {err!r}"
    )
    assert len(deals_after) == 1, (
        f"expected exactly one deal for cargo {cargo_id!r}, found {len(deals_after)}"
    )


def test_db_rejects_second_active_deal_for_same_cargo():
    """Defense-in-depth, independent of any request-level race timing: even
    if every application-level guard were somehow bypassed (a future
    regression, a new accept-style code path that forgets the conditional
    UPDATE), the database itself must refuse to hold two non-terminal deals
    for the same cargo_id at once.

    Pre-fix: `deals.cargo_id` carries no uniqueness constraint at all (only
    a plain, non-unique index) -- this INSERT succeeds, silently doubling the
    cargo. Post-fix: a partial UNIQUE index on
    `deals(cargo_id) WHERE status NOT IN ('completed','cancelled')` rejects it
    with sqlite3.IntegrityError.
    """
    import sqlite3

    owner_id, bidder1, bidder2 = new_id(), new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid1 = seed_bid(cargo_id, bidder1)
    bid2 = seed_bid(cargo_id, bidder2)

    accept_result = marketplace.accept_bid(bid_id=bid1, user={"id": owner_id})
    assert accept_result["ok"] is True

    # bid2 was auto-rejected as a sibling by accept_bid -- that's fine, this
    # test only cares about whether the SCHEMA itself would allow a second
    # active `deals` row for the same cargo to exist, independent of how a
    # bid reached 'accepted'/'pending' again (that's the race the other test
    # already proves is reachable at the application layer).
    second_deal_id = new_id()
    integrity_error = None
    try:
        with get_conn() as c:
            c.execute(
                """
                INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id,
                                   from_city, to_city, amount, status, chat_room_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (second_deal_id, cargo_id, None, bid2, owner_id, bidder2,
                 "Almaty", "Moscow", 900, "accepted", None),
            )
    except sqlite3.IntegrityError as e:
        integrity_error = e

    deals_after = get_deals_for_cargo(cargo_id)
    print(f"[db-guard] second INSERT integrity_error = {integrity_error!r}")
    print(f"[db-guard] deals for cargo after          = {deals_after}")

    assert integrity_error is not None, (
        f"P0 CONFIRMED: the database allowed a second non-terminal deal "
        f"({second_deal_id!r}) for cargo {cargo_id!r} alongside the already-"
        f"accepted {accept_result['deal_id']!r} -- no schema-level uniqueness "
        f"constraint exists on deals(cargo_id) for active statuses."
    )
    assert len(deals_after) == 1


# ────────────────── concurrency regression matrix (A–J) ───────────────────
#
# Post-fix, correctness no longer depends on WHICH of two concurrent
# requests wins -- the conditional UPDATE + rowcount guard on every
# bid-mutating endpoint (and the parent cargo/trip guard in
# _finalize_accept_inline) makes exactly one of any two conflicting
# concurrent calls succeed and the other fail cleanly with 409, under any
# interleaving. So these tests fire both calls from real threads started as
# close together as a `threading.Barrier` can manage and only assert the
# INVARIANTS (exactly one winner, exactly one deal, consistent state,
# no unhandled exception) -- they do not need to force a specific loser.

from fastapi import HTTPException  # noqa: E402


def _run_pair(fn_a, kwargs_a, fn_b, kwargs_b):
    barrier = threading.Barrier(2)
    results, errors = {}, {}

    def _make(key, fn, kwargs):
        def _target():
            try:
                barrier.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            try:
                results[key] = fn(**kwargs)
            except Exception as e:  # noqa: BLE001
                errors[key] = e
        return _target

    ta = threading.Thread(target=_make("a", fn_a, kwargs_a))
    tb = threading.Thread(target=_make("b", fn_b, kwargs_b))
    ta.start()
    tb.start()
    ta.join(timeout=5)
    tb.join(timeout=5)
    return results, errors


def _assert_exactly_one_winner_one_409(results, errors, label):
    n_ok = len(results)
    n_409 = sum(1 for e in errors.values() if isinstance(e, HTTPException) and e.status_code == 409)
    n_other = len(errors) - n_409
    print(f"[{label}] results={results} errors={ {k: repr(v) for k, v in errors.items()} }")
    assert n_other == 0, f"[{label}] unexpected non-409 error(s): {errors}"
    assert n_ok == 1 and n_409 == 1, (
        f"[{label}] expected exactly one winner and one clean 409, "
        f"got {n_ok} winner(s) and {n_409} 409(s) (total calls=2)"
    )


def test_matrix_A_sibling_bids_concurrent_accept_yields_one_deal():
    """A: sibling bid1-accept vs bid2-accept on the same cargo -> exactly one deal."""
    owner_id, bidder1, bidder2 = new_id(), new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid1 = seed_bid(cargo_id, bidder1)
    bid2 = seed_bid(cargo_id, bidder2)

    results, errors = _run_pair(
        marketplace.accept_bid, {"bid_id": bid1, "user": {"id": owner_id}},
        marketplace.accept_bid, {"bid_id": bid2, "user": {"id": owner_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "A")
    deals = get_deals_for_cargo(cargo_id)
    assert len(deals) == 1, f"[A] expected exactly one deal, got {deals}"


def test_matrix_C_accept_bid_vs_cancel_bid():
    """C: accept_bid vs cancel_bid (bidder) on the same bid -> one winner, consistent state."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)

    results, errors = _run_pair(
        marketplace.accept_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
        marketplace.cancel_bid, {"bid_id": bid_id, "user": {"id": bidder_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "C")
    bid_after = get_bid(bid_id)
    deals = get_deals_for_cargo(cargo_id)
    if "a" in results:  # accept won
        assert bid_after["status"] == "accepted" and len(deals) == 1
    else:  # cancel won
        assert bid_after["status"] == "cancelled" and len(deals) == 0


def test_matrix_D_accept_bid_vs_reject_bid():
    """D: accept_bid vs reject_bid (owner) on the same bid."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)

    results, errors = _run_pair(
        marketplace.accept_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
        marketplace.reject_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "D")
    bid_after = get_bid(bid_id)
    deals = get_deals_for_cargo(cargo_id)
    if "a" in results:
        assert bid_after["status"] == "accepted" and len(deals) == 1
    else:
        assert bid_after["status"] == "rejected" and len(deals) == 0


def test_matrix_E_accept_bid_vs_update_bid():
    """E: accept_bid vs update_bid (bidder edits amount) on the same bid.

    Unlike every other matrix pair, this one is NOT "exactly one winner" --
    update_bid never touches `status`, so it and a concurrent accept_bid are
    not mutually exclusive at the DB-guard level. Both CAN legitimately
    succeed (the bidder's price edit landed, then the owner's accept used the
    fresh price) -- that is correct, not a bug. The bug this specifically
    regression-covers (found via this matrix, not the original report): a
    concurrent accept_bid must NEVER commit a deal at a STALE amount that
    silently discards a price edit update_bid just reported as successful.
    """
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id, amount=900)

    results, errors = _run_pair(
        marketplace.accept_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
        marketplace.update_bid, {
            "bid_id": bid_id, "user": {"id": bidder_id},
            "body": marketplace.BidUpdateIn(amount=920, message=None),
        },
    )
    n_ok = len(results)
    n_409 = sum(1 for e in errors.values() if isinstance(e, HTTPException) and e.status_code == 409)
    print(f"[E] results={results} errors={ {k: repr(v) for k, v in errors.items()} }")
    assert len(errors) == n_409, f"[E] unexpected non-409 error(s): {errors}"
    assert n_ok in (1, 2), f"[E] expected 1 or 2 successes, got {n_ok}"

    bid_after = get_bid(bid_id)
    deals = get_deals_for_cargo(cargo_id)

    if "a" in results:  # accept_bid committed a deal, regardless of update_bid's outcome
        assert bid_after["status"] == "accepted" and len(deals) == 1
        # THE INVARIANT: the deal amount must equal whatever amount was
        # actually committed on the bid row at accept time -- 920 if
        # update_bid won/landed first, 900 if it didn't run/lost. It must
        # NEVER silently be a stale pre-transaction value that contradicts
        # what update_bid told the bidder succeeded.
        expected_amount = 920 if "b" in results else 900
        assert deals[0]["amount"] == expected_amount, (
            f"[E] deal amount {deals[0]['amount']} does not match the actually-committed "
            f"bid amount (expected {expected_amount}) -- a concurrent price edit was silently lost"
        )
        assert bid_after["amount"] == expected_amount
    else:  # accept_bid lost outright (got 409), only update_bid succeeded
        assert bid_after["status"] == "pending" and bid_after["amount"] == 920 and len(deals) == 0


def test_matrix_F_accept_counter_vs_cancel_counter_as_owner():
    """F: accept_counter (bidder) vs cancel_counter_as_owner on the same countered bid."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)
    marketplace.counter_bid(bid_id=bid_id, body=marketplace.BidCounterIn(amount=950, message=None),
                             user={"id": owner_id})

    results, errors = _run_pair(
        marketplace.accept_counter, {"bid_id": bid_id, "user": {"id": bidder_id}},
        marketplace.cancel_counter_as_owner, {"bid_id": bid_id, "user": {"id": owner_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "F")
    bid_after = get_bid(bid_id)
    deals = get_deals_for_cargo(cargo_id)
    if "a" in results:
        assert bid_after["status"] == "accepted" and len(deals) == 1
    else:
        assert bid_after["status"] == "pending" and len(deals) == 0


def test_matrix_G_accept_counter_vs_decline_counter():
    """G: accept_counter (bidder) vs decline_counter (bidder, different tab/device) on the same countered bid."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)
    marketplace.counter_bid(bid_id=bid_id, body=marketplace.BidCounterIn(amount=950, message=None),
                             user={"id": owner_id})

    results, errors = _run_pair(
        marketplace.accept_counter, {"bid_id": bid_id, "user": {"id": bidder_id}},
        marketplace.decline_counter, {"bid_id": bid_id, "user": {"id": bidder_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "G")
    bid_after = get_bid(bid_id)
    deals = get_deals_for_cargo(cargo_id)
    if "a" in results:
        assert bid_after["status"] == "accepted" and len(deals) == 1
    else:
        assert bid_after["status"] == "pending" and len(deals) == 0


def test_matrix_H_double_tap_accept_bid():
    """H: the exact same accept_bid call fired twice concurrently (double-tap)."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)

    results, errors = _run_pair(
        marketplace.accept_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
        marketplace.accept_bid, {"bid_id": bid_id, "user": {"id": owner_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "H")
    deals = get_deals_for_cargo(cargo_id)
    assert len(deals) == 1
    assert get_bid(bid_id)["status"] == "accepted"


def test_matrix_I_double_tap_accept_counter():
    """I: accept_counter fired twice concurrently on the same countered bid."""
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)
    marketplace.counter_bid(bid_id=bid_id, body=marketplace.BidCounterIn(amount=950, message=None),
                             user={"id": owner_id})

    results, errors = _run_pair(
        marketplace.accept_counter, {"bid_id": bid_id, "user": {"id": bidder_id}},
        marketplace.accept_counter, {"bid_id": bid_id, "user": {"id": bidder_id}},
    )
    _assert_exactly_one_winner_one_409(results, errors, "I")
    deals = get_deals_for_cargo(cargo_id)
    assert len(deals) == 1
    assert get_bid(bid_id)["status"] == "accepted"


def test_matrix_J_parent_delete_and_unpublish_blocked_by_active_deal():
    """J: delete_cargo / unpublish_cargo / unpublish_trip must all refuse once
    a deal for that listing is active (not merely "the bid is accepted" --
    the *parent listing* must not silently become cancelled/unpublished out
    from under a live deal). Sequential, not a timing race: this is the P0
    item 5 invariant (active deal <-> parent listing), regression-covered
    directly rather than raced.
    """
    owner_id, bidder_id = new_id(), new_id()
    cargo_id = seed_cargo(owner_id)
    bid_id = seed_bid(cargo_id, bidder_id)
    accept = marketplace.accept_bid(bid_id=bid_id, user={"id": owner_id})
    assert accept["ok"] is True

    try:
        marketplace.delete_cargo(cargo_id=cargo_id, user={"id": owner_id})
        raise AssertionError("delete_cargo must refuse a cargo with an active deal")
    except HTTPException as e:
        assert e.status_code == 409, f"expected 409, got {e}"

    try:
        marketplace.unpublish_cargo(cargo_id=cargo_id, user={"id": owner_id})
        raise AssertionError("unpublish_cargo must refuse a cargo with an active deal")
    except HTTPException as e:
        assert e.status_code == 409, f"expected 409, got {e}"

    cargo_after = get_cargo(cargo_id)
    deals_after = get_deals_for_cargo(cargo_id)
    assert cargo_after["status"] == "taken", f"cargo status must be untouched, got {cargo_after['status']!r}"
    assert len(deals_after) == 1 and deals_after[0]["status"] == "accepted"


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            print(f"\n=== {name} ===")
            try:
                fn()
                print(f"PASS: {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL: {name}\n  {e}")
            except Exception as e:  # noqa: BLE001
                failures += 1
                print(f"ERROR: {name}\n  {type(e).__name__}: {e}")
    print(f"\n{'='*60}\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
