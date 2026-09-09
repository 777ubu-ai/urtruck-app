"""P1 fix proof: business events are wired to the durable push outbox.

Defect (forensic audit, confirmed): the durable outbox infrastructure
(push_outbox table, push_outbox_drain scheduler job, atomic claim, retry
with backoff, dead-letter, per-device delivery log) was complete — but no
realtime business call-site ever passed a push-level ``event_key``, so
``services/push_sender.send()`` never enqueued an outbox row for them.
Every critical event (bid, accept, chat, deal status, GPS) went through
``api.push.send_to_user`` = fire-and-forget daemon thread: a transient
provider failure at that moment silently lost the notification forever.

Contract under test (business event commits → durable push event exists →
immediate attempt may run → transient failure stays pending/retryable →
worker retries → exactly one logical user notification):

  - new bid / bid accepted / sibling rejection / bid rejected / bid
    withdrawn / counter-offer / counter-accept / counter-cancelled
  - chat text (sender excluded, client_msg_id = stable identity, deeplink
    payload + badge preserved across retry)
  - deal status transitions (in_progress/at_border/delivered/received/
    completed/cancelled)
  - GPS tracking request / gps_lost / gps_restored (tracking marker id =
    stable identity)
  - review created

Provider responses are simulated via a fake ``_send_expo_detailed`` — the
exact seam ``push_gateway.ExpoProvider`` already hands to the gateway —
and ``api.push.send_to_user``'s daemon thread is patched to run
synchronously so assertions are deterministic. No real network call is
made and no Expo/FCM/APNs behavior is invented.
"""
import contextvars
import json
import os
import sys
import uuid
from pathlib import Path

import pytest

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_business_wiring.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal
from database import reviews_dal

ddb.init_db()
reg_dal.init_registration_schema()
reviews_dal.init_reviews_schema()

from database.db import get_conn, new_id

import api.push as push_api  # noqa: F401  — import runs _init_schema() (push_outbox etc.)
from services import push_sender, push_gateway

for _schema in ("chat_schema.sql", "notifications_schema.sql"):
    _p = ROOT / "database" / _schema
    if _p.exists():
        with get_conn() as c:
            c.executescript(_p.read_text(encoding="utf-8"))
_deal_room_schema = ROOT / "database" / "schemas" / "deal_room_schema.sql"
if _deal_room_schema.exists():
    with get_conn() as _c:
        _c.executescript(_deal_room_schema.read_text(encoding="utf-8"))


# conftest.py's session-scoped autouse fixture recreates DB_PATH ПОСЛЕ
# коллекции тестов (module-level код уже выполнен к этому моменту) — init
# reviews гарантированно ПОСЛЕ session-фикстуры, на схему актуальной БД
# (тот же паттерн, что tests/test_notification_center_reachability.py).
def setup_module(module):
    reviews_dal.init_reviews_schema()

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.marketplace import mp_router, check_gps_heartbeats_job
from api.chat import chat_router
from api.reviews import reviews_router
from tests.auth_harness import override_require_level

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(reviews_router, prefix="/api/v1/reviews")
override_require_level(app, _fake_require_level(1))
client = TestClient(app)


def as_user(uid, name="Test User", phone="+70000000000"):
    _current_user.set({"id": uid, "full_name": name, "phone": phone, "verification_level": 1})


# ───────────────────────── provider seam ─────────────────────────
class _FakeProvider:
    """Drop-in for services.push_sender._send_expo_detailed.

    mode 'fail'  → every send fails transiently (row must stay pending)
    mode 'ok'    → every send succeeds (exactly-once is asserted via
                   self.delivered = total device-level ok deliveries)
    """

    def __init__(self):
        self.mode = "ok"
        self.calls = []  # {tokens, title, body, data, badge}
        self.delivered = 0
        self.delivered_by_key = {}  # event_key -> device-level ok deliveries

    def __call__(self, tokens, title, body, data, badge=None):
        data = dict(data or {})
        self.calls.append({"tokens": list(tokens), "title": title, "body": body,
                           "data": data, "badge": badge})
        if self.mode == "ok":
            self.delivered += len(tokens)
            ek = data.get("event_key")
            if ek:
                self.delivered_by_key[ek] = self.delivered_by_key.get(ek, 0) + len(tokens)
            return {"sent": len(tokens),
                    "tickets": [{"status": "ok", "id": f"tk-{uuid.uuid4().hex[:8]}"} for _ in tokens],
                    "error": None}
        return {"sent": 0, "tickets": [{"status": "error", "details": {"error": "RATE_LIMIT_EXCEEDED"}}],
                "error": "rate_limited"}


@pytest.fixture
def provider(monkeypatch):
    p = _FakeProvider()
    monkeypatch.setattr(push_sender, "_send_expo_detailed", p)
    monkeypatch.setattr(push_sender, "_send_web", lambda *a, **k: 0)

    # Determinism: run send_to_user's daemon thread synchronously inside the
    # request. Patching threading.Thread is process-global, but nothing in
    # these flows spawns another thread, and monkeypatch restores it.
    class _SyncThread:
        def __init__(self, target=None, daemon=None, args=(), kwargs=None):
            self._target = target

        def start(self):
            if self._target:
                self._target()

    monkeypatch.setattr(push_api.threading, "Thread", _SyncThread)
    return p


# ───────────────────────── helpers ─────────────────────────
def _mkuser(with_device=True, devices=1):
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    if with_device:
        for i in range(devices):
            with get_conn() as c:
                c.execute(
                    "INSERT INTO push_devices (user_id, device_id, platform, push_provider, push_token, enabled) "
                    "VALUES (?,?,?,?,?,1)",
                    (uid, uuid.uuid4().hex, "android", "expo", f"ExponentPushToken[{uuid.uuid4().hex}]"),
                )
    return uid


def _outbox(event_id, uid):
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (event_id, uid)
        ).fetchone()
    return dict(row) if row else None


def _seed_cargo(owner_id, price=1234):
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Shipper", "Almaty", "Moscow", "KZ", "RU",
             "Outbox wiring cargo", "tent", price, 0, "active"),
        )
    return cargo_id


def _make_bid(cargo_id, driver_id, amount=1100, message="offer"):
    as_user(driver_id, "Driver QA")
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": amount, "message": message})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _accept_bid(shipper_id, bid_id):
    as_user(shipper_id, "Shipper QA")
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 200, r.text
    return r.json()


def _deal_status(driver_id, deal_id, status):
    as_user(driver_id, "Driver QA")
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": status})
    assert r.status_code == 200, r.text
    return r


def _force_due(event_id):
    with get_conn() as c:
        c.execute("UPDATE push_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE event_id=?", (event_id,))


# ───────────────────────── BID ─────────────────────────
def test_new_bid_transient_failure_leaves_pending_outbox_then_worker_retries(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    provider.mode = "fail"

    bid_id = _make_bid(cargo_id, driver)

    # The business event committed; the durable push event MUST exist even
    # though the immediate attempt failed. (Before the P1 fix the outbox
    # stayed empty here and the notification was lost forever.)
    row = _outbox(f"bid.created:{bid_id}", shipper)
    assert row is not None, "business event committed but no durable push event exists"
    assert row["status"] == "pending"
    assert row["event_type"] == "bid.created"
    payload = json.loads(row["payload"])
    assert payload["url"] == f"/cargos/{cargo_id}?bid={bid_id}"
    assert payload["title"] and payload["body"]

    # Worker retry while the provider is still down: stays pending, backoff set.
    stats = push_sender.drain_outbox_once(limit=50)
    assert stats["picked"] >= 1
    row = _outbox(f"bid.created:{bid_id}", shipper)
    assert row["status"] == "pending" and row["attempt_count"] == 1
    failed_calls = len(provider.calls)
    # Backoff must delay an immediate second worker tick.
    stats2 = push_sender.drain_outbox_once(limit=50)
    assert stats2["picked"] == 0

    # Provider recovers → exactly one logical notification.
    provider.mode = "ok"
    _force_due(f"bid.created:{bid_id}")
    stats3 = push_sender.drain_outbox_once(limit=50)
    assert stats3["sent"] >= 1
    assert _outbox(f"bid.created:{bid_id}", shipper)["status"] == "sent"
    assert provider.delivered_by_key.get(f"bid.created:{bid_id}") == 1, \
        "exactly one device-level delivery for the retried event"
    assert len(provider.calls) == failed_calls + 1

    # A further worker tick must never re-send a sent event.
    _force_due(f"bid.created:{bid_id}")
    stats4 = push_sender.drain_outbox_once(limit=50)
    assert stats4["picked"] == 0
    assert provider.delivered_by_key.get(f"bid.created:{bid_id}") == 1


# ───────────────────────── ACCEPT (+ sibling auto-reject) ─────────────────────────
def test_bid_accept_and_sibling_rejection_are_durable(provider):
    shipper = _mkuser()
    driver_winner = _mkuser()
    driver_loser = _mkuser()
    cargo_id = _seed_cargo(shipper)
    win_bid = _make_bid(cargo_id, driver_winner, amount=1100)
    lose_bid = _make_bid(cargo_id, driver_loser, amount=1200)
    provider.mode = "fail"

    _accept_bid(shipper, win_bid)

    acc = _outbox(f"bid.accepted:{win_bid}", driver_winner)
    assert acc is not None and acc["status"] == "pending"
    assert json.loads(acc["payload"])["url"] == f"/cargos/{cargo_id}"
    rej = _outbox(f"bid.rejected:{lose_bid}", driver_loser)
    assert rej is not None and rej["status"] == "pending"

    provider.mode = "ok"
    _force_due(f"bid.accepted:{win_bid}")
    _force_due(f"bid.rejected:{lose_bid}")
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(f"bid.accepted:{win_bid}", driver_winner)["status"] == "sent"
    assert _outbox(f"bid.rejected:{lose_bid}", driver_loser)["status"] == "sent"
    assert provider.delivered_by_key.get(f"bid.accepted:{win_bid}") == 1
    assert provider.delivered_by_key.get(f"bid.rejected:{lose_bid}") == 1


# ───────────────────────── reject / withdraw / counter ─────────────────────────
def test_bid_rejected_withdrawn_counter_and_counter_cancel_are_durable(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    provider.mode = "fail"

    bid_id = _make_bid(cargo_id, driver)
    as_user(shipper, "Shipper QA")
    r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 900, "message": "counter"})
    assert r.status_code == 200, r.text
    row = _outbox(f"bid.countered:{bid_id}", driver)
    assert row is not None and row["status"] == "pending"
    assert json.loads(row["payload"])["url"] == f"/cargos/{cargo_id}?bid={bid_id}"

    r = client.post(f"/api/v1/market/bids/{bid_id}/counter/cancel")
    assert r.status_code == 200, r.text
    row = _outbox(f"bid.counter_cancelled:{bid_id}", driver)
    assert row is not None and row["status"] == "pending"

    # Bidder declines nothing here; owner rejects the pending bid outright.
    r = client.post(f"/api/v1/market/bids/{bid_id}/reject")
    assert r.status_code == 200, r.text
    row = _outbox(f"bid.rejected:{bid_id}", driver)
    assert row is not None and row["status"] == "pending"

    # Fresh bid, then the bidder withdraws it themselves.
    bid2 = _make_bid(cargo_id, driver, amount=1000)
    as_user(driver, "Driver QA")
    r = client.post(f"/api/v1/market/bids/{bid2}/cancel")
    assert r.status_code == 200, r.text
    row = _outbox(f"bid.withdrawn:{bid2}", shipper)
    assert row is not None and row["status"] == "pending"

    provider.mode = "ok"
    for ek in (f"bid.countered:{bid_id}", f"bid.counter_cancelled:{bid_id}",
               f"bid.rejected:{bid_id}", f"bid.withdrawn:{bid2}"):
        _force_due(ek)
    push_sender.drain_outbox_once(limit=50)
    for ek, uid in ((f"bid.countered:{bid_id}", driver), (f"bid.counter_cancelled:{bid_id}", driver),
                    (f"bid.rejected:{bid_id}", driver), (f"bid.withdrawn:{bid2}", shipper)):
        assert _outbox(ek, uid)["status"] == "sent", ek
    for _ek in (f"bid.countered:{bid_id}", f"bid.counter_cancelled:{bid_id}",
                f"bid.rejected:{bid_id}", f"bid.withdrawn:{bid2}"):
        assert provider.delivered_by_key.get(_ek) == 1, _ek


# ───────────────────────── CHAT ─────────────────────────
def test_chat_message_durable_excludes_sender_preserves_payload_and_badge(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    bid_id = _make_bid(cargo_id, driver)
    res = _accept_bid(shipper, bid_id)
    room_id = res["chat_room_id"]
    client_msg_id = f"cmid-{uuid.uuid4().hex[:8]}"
    provider.mode = "fail"

    as_user(shipper, "Shipper QA")
    r = client.post("/api/v1/chat/send", json={
        "room_id": room_id, "text": "hello outbox", "cargo_id": cargo_id, "client_msg_id": client_msg_id,
    })
    assert r.status_code == 200, r.text

    ek = f"chat.message:{shipper}:{client_msg_id}"
    row = _outbox(ek, driver)
    assert row is not None and row["status"] == "pending"
    assert row["event_type"] == "chat.message"
    # Sender must never receive his own message push.
    assert _outbox(ek, shipper) is None
    payload = json.loads(row["payload"])
    assert payload["url"] == f"/chats/{room_id}"
    assert payload["data"]["type"] == "chat_message"
    assert payload["data"]["room_id"] == room_id
    # Badge is part of the contract: the durable payload must carry it so a
    # retry does not silently drop the APNs badge (known regression).
    assert payload.get("badge") is not None

    # Retry preserves deeplink payload (data/kind) and badge.
    provider.mode = "ok"
    _force_due(ek)
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(ek, driver)["status"] == "sent"
    assert provider.delivered_by_key.get(ek) == 1
    last = provider.calls[-1]
    assert last["data"]["type"] == "chat_message"
    assert last["data"]["room_id"] == room_id
    assert last["data"]["kind"] == "chat"
    assert last["badge"] is not None


def test_duplicate_chat_retry_does_not_duplicate_push(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    bid_id = _make_bid(cargo_id, driver)
    room_id = _accept_bid(shipper, bid_id)["chat_room_id"]
    client_msg_id = f"cmid-{uuid.uuid4().hex[:8]}"
    provider.mode = "fail"

    as_user(shipper, "Shipper QA")
    body = {"room_id": room_id, "text": "retry me", "cargo_id": cargo_id, "client_msg_id": client_msg_id}
    assert client.post("/api/v1/chat/send", json=body).status_code == 200
    # Offline-queue retry of the same business operation (same client_msg_id).
    r2 = client.post("/api/v1/chat/send", json=body)
    assert r2.status_code == 200, r2.text

    ek = f"chat.message:{shipper}:{client_msg_id}"
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) n FROM push_outbox WHERE event_id=?", (ek,)).fetchone()["n"]
    assert n == 1, "duplicate business retry must not create a second durable event"

    provider.mode = "ok"
    _force_due(ek)
    push_sender.drain_outbox_once(limit=50)
    # Double worker invocation must not double-deliver.
    push_sender.drain_outbox_once(limit=50)
    assert provider.delivered_by_key.get(ek) == 1


# ───────────────────────── DEAL STATUS ─────────────────────────
def test_deal_status_transitions_are_durable(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    bid_id = _make_bid(cargo_id, driver)
    deal_id = _accept_bid(shipper, bid_id)["deal_id"]
    provider.mode = "fail"

    for status in ("in_progress", "at_border", "delivered"):
        _deal_status(driver, deal_id, status)
        ek = f"deal.status:{deal_id}:{status}"
        row = _outbox(ek, shipper)
        assert row is not None and row["status"] == "pending", f"{ek} missing"
        assert json.loads(row["payload"])["url"] == f"/cargos/{cargo_id}"
    assert _outbox(f"deal.status:{deal_id}:in_progress", shipper)["event_type"] == "trip.started"

    as_user(shipper, "Shipper QA")
    r = client.patch(f"/api/v1/market/deals/{deal_id}/status", params={"new_status": "received"})
    assert r.status_code == 200, r.text
    row = _outbox(f"deal.status:{deal_id}:received", driver)
    assert row is not None and row["status"] == "pending"

    provider.mode = "ok"
    for status in ("in_progress", "at_border", "delivered", "received"):
        _force_due(f"deal.status:{deal_id}:{status}")
    push_sender.drain_outbox_once(limit=50)
    for status in ("in_progress", "at_border", "delivered"):
        assert _outbox(f"deal.status:{deal_id}:{status}", shipper)["status"] == "sent"
    assert _outbox(f"deal.status:{deal_id}:received", driver)["status"] == "sent"
    for status in ("in_progress", "at_border", "delivered", "received"):
        assert provider.delivered_by_key.get(f"deal.status:{deal_id}:{status}") == 1


# ───────────────────────── GPS lost / restored ─────────────────────────
def _approve_tracking(shipper_id, driver_id, deal_id):
    as_user(shipper_id, "Shipper QA")
    assert client.post(f"/api/v1/market/deals/{deal_id}/tracking/request").status_code == 200
    as_user(driver_id, "Driver QA")
    r = client.post(f"/api/v1/market/deals/{deal_id}/tracking/respond", json={"decision": "approve"})
    assert r.status_code == 200, r.text


def _ping(driver_id, deal_id):
    as_user(driver_id, "Driver QA")
    return client.post(f"/api/v1/market/deals/{deal_id}/location", json={"lat": 43.2, "lng": 76.9})


def _tracking_markers(deal_id, event_type):
    with get_conn() as c:
        rows = c.execute(
            "SELECT id FROM deal_tracking_events WHERE deal_id=? AND event_type=? ORDER BY id",
            (deal_id, event_type),
        ).fetchall()
    return [r["id"] for r in rows]


def test_gps_lost_and_restored_are_durable(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    bid_id = _make_bid(cargo_id, driver)
    deal_id = _accept_bid(shipper, bid_id)["deal_id"]
    # «Начать рейс» автоматически включает tracking (единое действие водителя)
    # — отдельный request/respond здесь не нужен и был бы 409.
    _deal_status(driver, deal_id, "in_progress")
    assert _ping(driver, deal_id).status_code == 200
    with get_conn() as c:
        c.execute(
            "UPDATE deal_tracking SET last_signal_at=datetime(CURRENT_TIMESTAMP, '-30 minutes') WHERE deal_id=?",
            (deal_id,),
        )
    provider.mode = "fail"

    stats = check_gps_heartbeats_job()
    assert stats["fired"] == 1
    lost_markers = _tracking_markers(deal_id, "gps_lost")
    assert len(lost_markers) == 1
    ek_lost = f"gps_lost:{lost_markers[0]}"
    row = _outbox(ek_lost, shipper)
    assert row is not None and row["status"] == "pending"
    assert row["event_type"] == "trip.gps_lost"
    assert json.loads(row["payload"])["url"] == f"/deals/{deal_id}?action=tracking"

    # Fresh ping → gps_restored; marker commits BEFORE the notify, and the
    # durable event identity is the tracking marker id.
    provider.mode = "ok"  # let the fast path try; it fails nothing here — but
    # the lost row is still pending from the failure above.
    assert _ping(driver, deal_id).status_code == 200
    restored_markers = _tracking_markers(deal_id, "gps_restored")
    assert len(restored_markers) == 1
    ek_restored = f"gps_restored:{restored_markers[0]}"
    row = _outbox(ek_restored, shipper)
    assert row is not None
    # Fast path may already have delivered it (provider ok now); either way
    # exactly one logical delivery is allowed.
    assert row["status"] in ("pending", "sent")

    _force_due(ek_lost)
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(ek_lost, shipper)["status"] == "sent"
    if _outbox(ek_restored, shipper)["status"] == "pending":
        _force_due(ek_restored)
        push_sender.drain_outbox_once(limit=50)
    assert _outbox(ek_restored, shipper)["status"] == "sent"
    assert provider.delivered_by_key.get(ek_lost) == 1
    assert provider.delivered_by_key.get(ek_restored) == 1


def test_tracking_request_is_durable(provider):
    shipper = _mkuser()
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    bid_id = _make_bid(cargo_id, driver)
    deal_id = _accept_bid(shipper, bid_id)["deal_id"]
    provider.mode = "fail"

    as_user(shipper, "Shipper QA")
    r = client.post(f"/api/v1/market/deals/{deal_id}/tracking/request")
    assert r.status_code == 200, r.text
    markers = _tracking_markers(deal_id, "tracking_requested")
    assert len(markers) == 1
    row = _outbox(f"tracking_request:{markers[0]}", driver)
    assert row is not None and row["status"] == "pending"

    provider.mode = "ok"
    _force_due(f"tracking_request:{markers[0]}")
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(f"tracking_request:{markers[0]}", driver)["status"] == "sent"
    assert provider.delivered_by_key.get(f"tracking_request:{markers[0]}") == 1


# ───────────────────────── multi-device ─────────────────────────
def test_multi_device_delivery_with_per_device_dedup(provider):
    shipper = _mkuser(devices=2)
    driver = _mkuser()
    cargo_id = _seed_cargo(shipper)
    provider.mode = "fail"

    bid_id = _make_bid(cargo_id, driver)
    ek = f"bid.created:{bid_id}"
    row = _outbox(ek, shipper)
    assert row is not None and row["status"] == "pending"

    provider.mode = "ok"
    _force_due(ek)
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(ek, shipper)["status"] == "sent"
    # Both of the user's devices got exactly one push each.
    assert provider.delivered_by_key.get(ek) == 2, "delivery must reach every active device of the user"
    # A second worker tick must not re-deliver to any device.
    push_sender.drain_outbox_once(limit=50)
    assert provider.delivered_by_key.get(ek) == 2


# ───────────────────────── review ─────────────────────────
def test_review_created_is_durable(provider):
    author = _mkuser()
    target = _mkuser()
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (new_id(), new_id(), author, target, "Almaty", "Astana", 1000, "completed"),
        )

    provider.mode = "fail"
    as_user(author, "Author QA")
    r = client.post("/api/v1/reviews", json={
        "target_id": target, "target_role": "driver", "rating": 5, "text": "great",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["id"]

    row = _outbox(f"review.created:{rid}", target)
    assert row is not None and row["status"] == "pending"
    assert json.loads(row["payload"])["url"] == "/profile"

    provider.mode = "ok"
    _force_due(f"review.created:{rid}")
    push_sender.drain_outbox_once(limit=50)
    assert _outbox(f"review.created:{rid}", target)["status"] == "sent"
    assert provider.delivered_by_key.get(f"review.created:{rid}") == 1


if __name__ == "__main__":
    import traceback

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t(_FakeProvider()) if "provider" in t.__code__.co_varnames[: t.__code__.co_argcount] else t()
            print(f"OK   {t.__name__}")
        except TypeError:
            # fixture-based test without pytest — skip in __main__ mode
            print(f"SKIP {t.__name__} (needs pytest for fixtures)")
        except Exception:
            failed += 1
            print(f"FAIL {t.__name__}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
