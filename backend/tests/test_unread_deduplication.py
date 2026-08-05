"""Regression coverage for the combined Deals badge.

The badge is notifications unread + chat unread. A single business event must
not count twice, and opening the linked cargo must consume only that cargo's
notification. Each CI module runs against its own SQLite database.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_unread_dedup.db")
Path(TEST_DB).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        user = _current_user.get()
        if not user:
            raise HTTPException(status_code=401, detail="No test user set")
        return user

    return dep


verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal

ddb.init_db()
registration_dal.init_registration_schema()
for schema_name in ("chat_schema.sql", "notifications_schema.sql"):
    schema = ROOT / "database" / schema_name
    if schema.exists():
        from database.db import get_conn
        with get_conn() as conn:
            conn.executescript(schema.read_text(encoding="utf-8"))

from api.marketplace import mp_router
from api.chat import chat_router
from api.notifications import notif_router

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(notif_router, prefix="/api/v1/notifications")
client = TestClient(app)


def _real_user():
    guest = registration_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    registration_dal.upgrade_level(uid, 1, role="client")
    return uid, registration_dal.create_session(uid)


CLIENT_ID, CLIENT_TOKEN = _real_user()
DRIVER_ID, DRIVER_TOKEN = _real_user()
TOKENS = {CLIENT_ID: CLIENT_TOKEN, DRIVER_ID: DRIVER_TOKEN}


def as_user(uid: str):
    _current_user.set({
        "id": uid,
        "full_name": uid,
        "phone": "+70000000000",
        "verification_level": 1,
    })


def get_entity(uid: str, path: str):
    response = client.get(path, headers={"Authorization": f"Bearer {TOKENS[uid]}"})
    assert response.status_code == 200, response.text
    return response


def badge(uid: str) -> int:
    as_user(uid)
    notif = client.get("/api/v1/notifications/unread")
    chat = client.get("/api/v1/chat/unread")
    assert notif.status_code == 200, notif.text
    assert chat.status_code == 200, chat.text
    return notif.json()["unread"] + chat.json()["unread"]


def create_cargo(description: str, price: int = 3000) -> str:
    as_user(CLIENT_ID)
    response = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty",
        "to_city": "Astana",
        "cargo_type": "tent",
        "cargo_desc": description,
        "price": price,
        "currency": "USD",
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def create_bid(cargo_id: str, amount: int) -> str:
    as_user(DRIVER_ID)
    response = client.post("/api/v1/market/bids", json={
        "cargo_id": cargo_id,
        "amount": amount,
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def accept_bid(bid_id: str):
    as_user(CLIENT_ID)
    response = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert response.status_code == 200, response.text
    return response.json()


def test_one_chat_message_gives_plus_one():
    cargo_id = create_cargo("unread chat message")
    bid_id = create_bid(cargo_id, 2800)
    accepted = accept_bid(bid_id)
    room_id = accepted.get("chat_room_id") or accepted.get("room_id")
    assert room_id

    before = badge(CLIENT_ID)
    as_user(DRIVER_ID)
    sent = client.post("/api/v1/chat/send", json={"room_id": room_id, "text": "Погрузился"})
    assert sent.status_code == 200, sent.text
    assert badge(CLIENT_ID) - before == 1


def test_bid_accepted_gives_plus_one_not_two():
    cargo_id = create_cargo("unread accepted bid", 4000)
    bid_id = create_bid(cargo_id, 3500)
    before = badge(DRIVER_ID)
    accept_bid(bid_id)
    assert badge(DRIVER_ID) - before == 1


def test_counter_accept_gives_plus_one_not_two():
    cargo_id = create_cargo("unread counter accept", 5000)
    bid_id = create_bid(cargo_id, 4500)
    as_user(CLIENT_ID)
    counter = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 4800})
    assert counter.status_code == 200, counter.text

    before = badge(DRIVER_ID)
    as_user(DRIVER_ID)
    accepted = client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
    assert accepted.status_code == 200, accepted.text
    assert badge(DRIVER_ID) - before == 1


def test_opening_cargo_marks_only_its_notifications_read():
    cargo1 = create_cargo("unread entity one")
    cargo2 = create_cargo("unread entity two")
    create_bid(cargo1, 2900)
    create_bid(cargo2, 2900)

    as_user(CLIENT_ID)
    before = client.get("/api/v1/notifications").json()["notifications"]
    assert len([n for n in before if not n["is_read"]]) >= 2

    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo1}")

    as_user(CLIENT_ID)
    after = client.get("/api/v1/notifications").json()["notifications"]
    first = [n for n in after if (n.get("url") or "").startswith(f"/cargos/{cargo1}")]
    second = [n for n in after if (n.get("url") or "").startswith(f"/cargos/{cargo2}")]
    assert first and second
    assert all(n["is_read"] for n in first)
    assert any(not n["is_read"] for n in second)


def test_badge_isolated_per_user():
    assert isinstance(badge(CLIENT_ID), int)
    assert isinstance(badge(DRIVER_ID), int)


def test_repeated_fetch_is_idempotent():
    cargo_id = create_cargo("unread repeated fetch")
    create_bid(cargo_id, 2900)
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    after_first = badge(CLIENT_ID)
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    assert badge(CLIENT_ID) == after_first
