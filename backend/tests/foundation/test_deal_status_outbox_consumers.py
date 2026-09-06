"""AC6: DealStatusChanged / DealCancelled outbox consumers.

Root cause (2026-09-06 corrective architecture audit): under
DEALS_V2_ENABLED=true, api/marketplace.py's update_deal_status() returns
before ever reaching the block that sends push + in-app notification for a
status transition — that block lives entirely on the legacy branch. The V2
service emitted DealStatusChanged/DealCancelled events, but
acceptance_handlers() acknowledged them with `lambda event: None`. This file
proves the fix: the same events now produce a real push_outbox row and a
real in-app notification, deduped by the domain event id, without
resurrecting the no-op for DealCreated (which never had an independent
side effect of its own — see deals_handlers.acceptance_handlers docstring).
"""
import json
import sqlite3

from backend.infrastructure.outbox.deals_handlers import (
    _DEAL_STATUS_LABELS,
    _deal_status_deep_link,
    acceptance_handlers,
    enqueue_status_push,
    handle_deal_status_changed,
    record_status_notifications,
)
from backend.infrastructure.outbox.model import OutboxEvent
from backend.infrastructure.outbox.worker import PersistentOutboxWorker
from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService, _format_money


SCHEMA = (
    open("backend/database/marketplace_schema.sql").read()
    + open("backend/database/deals_schema.sql").read()
    + open("backend/database/chat_schema.sql").read()
    + open("backend/database/push_schema.sql").read()
)


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) "
        "VALUES ('c1','ship','Алматы','Астана','x','active')"
    )
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',1000,'pending')")
    conn.commit()
    return conn


def ctx(key):
    return CommandContext("op-" + key, "corr-" + key, key)


def _pending(conn, event_type):
    return conn.execute(
        "SELECT * FROM domain_outbox WHERE event_type=? ORDER BY created_at", (event_type,)
    ).fetchall()


def accept_and_transition(conn, target="in_progress", key="t1", actor_id="drv", actor_role="driver"):
    conn.execute("BEGIN IMMEDIATE")
    service = DealsBidsService(conn)
    accepted = service.accept_bid("b1", Actor("ship", "client"), ctx("accept-" + key))
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    result = service.transition_deal(accepted["deal_id"], target, Actor(actor_id, actor_role), ctx(key))
    conn.commit()
    return accepted, result


# ─── 1. transition_deal now records enough FACTS for a consumer to act on ───

def test_transition_deal_emits_recipient_route_and_amount_facts():
    conn = db()
    # accepted -> in_progress is DRIVER_ONLY: the driver performs it, so the
    # notified counterparty (recipient) must be the shipper.
    accepted, _ = accept_and_transition(conn, "in_progress", actor_id="drv", actor_role="driver")
    row = _pending(conn, "DealStatusChanged")[0]
    payload = json.loads(row["payload"])
    assert payload["from_status"] == "accepted"
    assert payload["to_status"] == "in_progress"
    assert payload["actor_id"] == "drv"
    assert payload["recipient_user_ids"] == ["ship"]
    assert payload["cargo_id"] == "c1"
    assert payload["from_city"] == "Алматы" and payload["to_city"] == "Астана"
    assert payload["amount"] == 1000
    assert payload["amount_display"] == "$1000"  # no currency column set -> USD default, matches legacy _money(amount, None)


def test_cancelled_transition_emits_DealCancelled_not_DealStatusChanged():
    conn = db()
    accept_and_transition(conn, "cancelled", key="c1", actor_id="ship", actor_role="client")
    assert _pending(conn, "DealCancelled")
    assert not _pending(conn, "DealStatusChanged")


def test_money_formatting_matches_legacy_marketplace_helper():
    """Characterization test: modules/deals/.../service.py duplicates
    api/marketplace.py's _CURRENCY_SYMBOLS/_money() (to avoid an
    architecture-inverting import) — assert they stay identical."""
    import re

    marketplace_src = open("backend/api/marketplace.py").read()
    match = re.search(r'_CURRENCY_SYMBOLS = (\{[^\n]+\})', marketplace_src)
    assert match, "legacy _CURRENCY_SYMBOLS not found — update the duplicate check"
    legacy_symbols = eval(match.group(1))  # noqa: S307 — static literal from our own source, test-only
    for currency, symbol in legacy_symbols.items():
        assert _format_money(100, currency) == (f"100 {symbol}" if currency == "UZS" else f"{symbol}100")


# ─── 2. enqueue_status_push: push_outbox row shape + dedupe ───

def test_enqueue_status_push_creates_one_row_per_recipient():
    conn = db()
    accepted, _ = accept_and_transition(conn, "in_progress")
    event_row = _pending(conn, "DealStatusChanged")[0]
    event = OutboxEvent(
        event_row["event_id"], event_row["event_type"], event_row["aggregate_type"],
        event_row["aggregate_id"], json.loads(event_row["payload"]), None,
    )
    inserted = enqueue_status_push(conn, event)
    assert inserted == 1
    row = conn.execute("SELECT * FROM push_outbox").fetchone()
    assert row["recipient_user_id"] == "ship"
    assert row["event_type"] == "deal.status"
    payload = json.loads(row["payload"])
    assert payload["data"]["status"] == "in_progress"
    assert payload["data"]["event_key"] == event.event_id
    assert payload["data"]["url"] == "/cargos/c1"
    # No push_devices row for "ship" in this isolated DB -> _recipient_locale
    # falls back to "RU", and "deal_status" IS in the RU catalog, so the
    # catalog-localized copy wins over our Russian fallback string — that is
    # the correct, already-existing behavior of push_sender._localize_system_copy.
    from services.push_sender import _SYSTEM_PUSH_COPY

    assert payload["title"] == _SYSTEM_PUSH_COPY["RU"]["deal_status"][0]
    assert "Алматы" in payload["body"] and "Астана" in payload["body"]


def test_enqueue_status_push_retry_does_not_duplicate():
    conn = db()
    accepted, _ = accept_and_transition(conn, "in_progress")
    event_row = _pending(conn, "DealStatusChanged")[0]
    event = OutboxEvent(
        event_row["event_id"], event_row["event_type"], event_row["aggregate_type"],
        event_row["aggregate_id"], json.loads(event_row["payload"]), None,
    )
    assert enqueue_status_push(conn, event) == 1
    assert enqueue_status_push(conn, event) == 0  # ON CONFLICT DO NOTHING
    assert conn.execute("SELECT COUNT(*) FROM push_outbox").fetchone()[0] == 1


def test_deal_created_event_produces_zero_push_rows():
    """DealCreated has no independent side effect — confirms the
    intentional no-op is not silently swallowing a real requirement."""
    conn = db()
    event = OutboxEvent("evt-1", "DealCreated", "deal", "d1", {"recipient_user_ids": ["ship"]}, None)
    assert enqueue_status_push(conn, event) == 0


# ─── 3. record_status_notifications: in-app bell, not localized, deduped ───

def test_record_status_notifications_calls_create_notification_once_per_recipient(monkeypatch):
    calls = []

    def fake_create_notification(user_id, type_, title, body, icon, url=None, event_key=None):
        calls.append((user_id, type_, title, body, icon, url, event_key))

    monkeypatch.setattr("api.notifications.create_notification", fake_create_notification)
    event = OutboxEvent(
        "evt-status-1", "DealStatusChanged", "deal", "d1",
        {
            "to_status": "at_border", "recipient_user_ids": ["ship", "drv"],
            "cargo_id": "c1", "from_city": "Алматы", "to_city": "Астана",
            "amount_display": "₸1000",
        },
        None,
    )
    record_status_notifications(event)
    assert len(calls) == 2
    user_ids = {c[0] for c in calls}
    assert user_ids == {"ship", "drv"}
    for user_id, type_, title, body, icon, url, event_key in calls:
        assert type_ == "deal_status"
        assert title == _DEAL_STATUS_LABELS["at_border"]
        assert "Алматы→Астана" in body
        assert url == "/cargos/c1"
        assert event_key == f"domain:evt-status-1:{user_id}"


# ─── 4. end-to-end through the real outbox worker (mirrors BidAccepted's
#        own wiring test) ───

def test_worker_processes_deal_status_changed_end_to_end(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "api.notifications.create_notification",
        lambda *a, **k: calls.append((a, k)),
    )
    conn = db()
    accepted, _ = accept_and_transition(conn, "in_progress")
    worker = PersistentOutboxWorker(conn, acceptance_handlers(conn))
    processed = []
    while True:
        outcome = worker.process_one()
        if outcome is None:
            break
        processed.append(outcome)
    assert processed and all(o == "processed" for o in processed)
    assert conn.execute("SELECT COUNT(*) FROM push_outbox WHERE recipient_user_id='ship'").fetchone()[0] == 1
    # accept_and_transition() runs accept_bid() first (emits BidAccepted,
    # already-tested elsewhere) and then transition_deal() — this worker
    # loop drains BOTH, so exactly one deal_status call to "ship" plus one
    # bid_accepted call to "drv" (the bidder) is expected, not just one.
    deal_status_calls = [c for c in calls if c[0][1] == "deal_status"]
    assert len(deal_status_calls) == 1
    assert deal_status_calls[0][0][0] == "ship"
    # Retrying an already-processed event must not re-enqueue or re-notify.
    calls.clear()
    conn.execute("UPDATE domain_outbox SET status='pending' WHERE event_type='DealStatusChanged'")
    conn.commit()
    while worker.process_one() is not None:
        pass
    assert conn.execute("SELECT COUNT(*) FROM push_outbox WHERE recipient_user_id='ship'").fetchone()[0] == 1
    deal_status_calls = [c for c in calls if c[0][1] == "deal_status"]
    assert len(deal_status_calls) == 1  # create_notification's own event_key ON CONFLICT DO NOTHING makes the retry safe/idempotent


def test_deep_link_prefers_cargo_then_trip_then_deal_id():
    assert _deal_status_deep_link(
        OutboxEvent("e", "DealStatusChanged", "deal", "d1", {"cargo_id": "c1", "trip_id": "t1"}, None)
    ) == "/cargos/c1"
    assert _deal_status_deep_link(
        OutboxEvent("e", "DealStatusChanged", "deal", "d1", {"trip_id": "t1"}, None)
    ) == "/trips/t1"
    assert _deal_status_deep_link(
        OutboxEvent("e", "DealStatusChanged", "deal", "d1", {}, None)
    ) == "/deals/d1"
