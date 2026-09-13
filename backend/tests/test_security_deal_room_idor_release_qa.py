"""Release-hardening QA (2026-09-13): IDOR matrix for Deal Room endpoints
(api/deal_room.py) — NOT previously covered by an API-level test. The chat.py
routes (/chat/send, /chat/messages/{room_id}) already have full IDOR coverage
in test_idor_three_accounts.py / test_deal_rooms.py; this file covers the
parallel Deal Room surface mounted at the same /api/v1 prefix:

  - GET  /api/v1/chat/conversations/{id}/messages
  - POST /api/v1/chat/conversations/{id}/read
  - GET  /api/v1/deals/{deal_id}/timeline
  - POST /api/v1/support/escalate
  - POST/GET /api/v1/chat/conversations/{id}/attachments

A — грузоотправитель (owner/shipper, сторона сделки).
B — водитель сделки (bidder, вторая сторона).
C — посторонний авторизованный пользователь (level 1, НЕ участник).

CI-контракт: top-level `def test_*` (см. docstring test_idor_three_accounts.py
для полного объяснения why-not-a-class). Порядок функций важен — pytest
исполняет их в порядке определения, а STATE переиспользуется между ними.
"""
import io
import uuid
import contextvars

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.deal_room import deal_room_router
from api.marketplace import mp_router
from database.db import get_conn, new_id
from tests.auth_harness import override_require_level

app = FastAPI()
app.include_router(deal_room_router, prefix="/api/v1")
app.include_router(mp_router, prefix="/api/v1/market")
override_require_level(app, _fake_require_level(1))
client = TestClient(app)

A = "dr-shipper-" + uuid.uuid4().hex[:8]
B = "dr-driver-" + uuid.uuid4().hex[:8]
C = "dr-stranger-" + uuid.uuid4().hex[:8]

STATE: dict = {}
_ROLE_BY_UID = {A: "client", B: "driver"}


def _as(uid):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+700",
                       "verification_level": 1, "role": _ROLE_BY_UID.get(uid, "client")})


def _seed_cargo(owner_id):
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Shipper", "Almaty", "Moscow", "KZ", "RU",
             "Deal-room IDOR test cargo", "tent", 1000, 0, "active"),
        )
    return cargo_id


def test_00_setup_accepted_deal_with_room():
    cargo_id = _seed_cargo(A)
    _as(B)
    r = client.post("/api/v1/market/bids", json={
        "cargo_id": cargo_id, "amount": 900, "message": "dr idor bid"})
    assert r.status_code == 200, r.text
    body = r.json()
    bid_id = (body.get("bid") or {}).get("id") or body.get("bid_id") or body.get("id")
    assert bid_id, f"bid id не вернулся: {body}"
    _as(A)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 200, r.text
    STATE["deal_id"] = r.json()["deal_id"]
    STATE["room_id"] = r.json().get("chat_room_id")
    assert STATE["room_id"], f"chat_room_id не вернулся: {r.json()}"


# ── /chat/conversations/{id}/messages ──────────────────────────────

def test_01_stranger_cannot_read_conversation_messages():
    _as(C)
    r = client.get(f"/api/v1/chat/conversations/{STATE['room_id']}/messages")
    assert r.status_code == 403, f"C прочитал чужую беседу: {r.status_code} {r.text}"


def test_02_participant_reads_conversation_messages_ok():
    _as(A)
    r = client.get(f"/api/v1/chat/conversations/{STATE['room_id']}/messages")
    assert r.status_code == 200, r.text


def test_03_unknown_conversation_is_404_not_403():
    _as(A)
    r = client.get(f"/api/v1/chat/conversations/{uuid.uuid4().hex}/messages")
    assert r.status_code == 404, f"неизвестная беседа не 404: {r.status_code}"


# ── /chat/conversations/{id}/read ───────────────────────────────────

def test_04_stranger_cannot_mark_foreign_conversation_read():
    _as(C)
    r = client.post(f"/api/v1/chat/conversations/{STATE['room_id']}/read")
    assert r.status_code == 403, f"C отметил чужую беседу прочитанной: {r.status_code} {r.text}"


def test_05_participant_marks_conversation_read_ok():
    _as(B)
    r = client.post(f"/api/v1/chat/conversations/{STATE['room_id']}/read")
    assert r.status_code == 200, r.text


# ── /deals/{deal_id}/timeline ───────────────────────────────────────

def test_06_stranger_cannot_read_deal_timeline():
    _as(C)
    r = client.get(f"/api/v1/deals/{STATE['deal_id']}/timeline")
    assert r.status_code == 403, f"C прочитал таймлайн чужой сделки: {r.status_code} {r.text}"


def test_07_participant_reads_deal_timeline_ok():
    _as(A)
    r = client.get(f"/api/v1/deals/{STATE['deal_id']}/timeline")
    assert r.status_code == 200, r.text


def test_08_unknown_deal_timeline_is_404():
    _as(A)
    r = client.get(f"/api/v1/deals/{uuid.uuid4().hex}/timeline")
    assert r.status_code == 404, f"неизвестная сделка не 404: {r.status_code}"


# ── /support/escalate ────────────────────────────────────────────────

def test_09_stranger_cannot_escalate_foreign_conversation():
    _as(C)
    r = client.post("/api/v1/support/escalate", json={"conversation_id": STATE["room_id"]})
    assert r.status_code == 403, f"C эскалировал чужую беседу в поддержку: {r.status_code} {r.text}"


def test_10_participant_can_escalate_own_conversation():
    _as(A)
    r = client.post("/api/v1/support/escalate", json={"conversation_id": STATE["room_id"], "reason": "test"})
    assert r.status_code == 200, r.text


# ── attachments ──────────────────────────────────────────────────────

_JPG = b"\xff\xd8\xff\xe0" + b"idor-attachment-body" * 16 + b"\xff\xd9"


def test_11_stranger_cannot_upload_attachment_to_foreign_conversation():
    _as(C)
    r = client.post(
        f"/api/v1/chat/conversations/{STATE['room_id']}/attachments",
        files={"file": ("p.jpg", io.BytesIO(_JPG), "image/jpeg")},
    )
    assert r.status_code == 403, f"C загрузил вложение в чужую беседу: {r.status_code} {r.text}"


def test_12_stranger_cannot_list_foreign_attachments():
    _as(C)
    r = client.get(f"/api/v1/chat/conversations/{STATE['room_id']}/attachments")
    assert r.status_code == 403, f"C прочитал вложения чужой беседы: {r.status_code} {r.text}"


def test_13_participant_uploads_and_lists_attachment_ok():
    _as(B)
    r = client.post(
        f"/api/v1/chat/conversations/{STATE['room_id']}/attachments",
        files={"file": ("p.jpg", io.BytesIO(_JPG), "image/jpeg")},
    )
    assert r.status_code == 200, r.text
    _as(A)
    r = client.get(f"/api/v1/chat/conversations/{STATE['room_id']}/attachments")
    assert r.status_code == 200, r.text
    assert len(r.json()["attachments"]) >= 1
