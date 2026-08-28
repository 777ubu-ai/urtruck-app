"""IDOR/доступ — три аккаунта по §9 предрелизного ТЗ (28.08.2026).

A — грузоотправитель (владелец груза и сторона сделки).
B — водитель сделки (bidder, вторая сторона).
C — посторонний авторизованный пользователь (level 1, НЕ участник).

C обязан получить отказ (403/404) при попытке прочитать или изменить:
ставку, сделку, чат, GPS/tracking, груз. B не может принять свою ставку
и не может подтвердить получение за грузоотправителя; A не может отметить
доставку за водителя. Роли FSM проверяются на backend.

ВАЖНО про CI-контракт: тесты объявлены как top-level `def test_*` (а не в
классе) — CI (`pr-quality-gate.yml`, `full-qa-audit.yml`) определяет
pytest-файлы через `grep '^def test_'` и иначе запускает файл как скрипт,
где conftest не применяется и падает импорт api.chat (drivers_registration).
Полную схему БД поднимает session-fixture в conftest.py — свою init НЕ делаем.
Порядок функций важен: pytest исполняет их в порядке определения.
"""
import uuid

import contextvars
from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


verification_gate.require_level = _fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.marketplace import mp_router
from api.chat import chat_router
from database.db import get_conn, new_id

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
client = TestClient(app)

A = "idor-shipper-" + uuid.uuid4().hex[:8]
B = "idor-driver-" + uuid.uuid4().hex[:8]
C = "idor-stranger-" + uuid.uuid4().hex[:8]

# Общее состояние между упорядоченными тест-функциями.
STATE: dict = {}


def _as(uid):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+700",
                       "verification_level": 1})


def _seed_cargo(owner_id):
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "from_country, to_country, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Shipper", "Almaty", "Moscow", "KZ", "RU",
             "IDOR test cargo", "tent", 1000, 0, "active"),
        )
    return cargo_id


def test_00_setup_cargo_and_bid():
    STATE["cargo_id"] = _seed_cargo(A)
    _as(B)
    r = client.post("/api/v1/market/bids", json={
        "cargo_id": STATE["cargo_id"], "amount": 900, "message": "idor bid"})
    assert r.status_code == 200, r.text
    body = r.json()
    STATE["bid_id"] = (body.get("bid") or {}).get("id") or body.get("bid_id") or body.get("id")
    assert STATE["bid_id"], f"bid id не вернулся: {body}"


# ── ставка ──────────────────────────────────────────────

def test_01_stranger_cannot_accept_foreign_bid():
    _as(C)
    r = client.post(f"/api/v1/market/bids/{STATE['bid_id']}/accept")
    assert r.status_code in (403, 404), f"C принял чужую ставку: {r.status_code} {r.text}"


def test_02_driver_cannot_accept_own_bid():
    _as(B)
    r = client.post(f"/api/v1/market/bids/{STATE['bid_id']}/accept")
    assert r.status_code in (403, 404), f"B принял собственную ставку: {r.status_code} {r.text}"


def test_03_stranger_cannot_reject_foreign_bid():
    _as(C)
    r = client.post(f"/api/v1/market/bids/{STATE['bid_id']}/reject")
    assert r.status_code in (403, 404), f"C отклонил чужую ставку: {r.status_code} {r.text}"


def test_04_owner_accepts_creates_exactly_one_deal():
    _as(A)
    r = client.post(f"/api/v1/market/bids/{STATE['bid_id']}/accept")
    assert r.status_code == 200, r.text
    STATE["deal_id"] = r.json()["deal_id"]
    STATE["room_id"] = r.json().get("chat_room_id")
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM deals WHERE bid_id = ?",
                      (STATE["bid_id"],)).fetchone()["n"]
    assert n == 1, f"Ставка породила {n} сделок вместо 1"


def test_05_repeat_accept_no_second_deal():
    _as(A)
    r = client.post(f"/api/v1/market/bids/{STATE['bid_id']}/accept")
    assert r.status_code == 409, f"Повторный accept: {r.status_code}"
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM deals WHERE bid_id = ?",
                      (STATE["bid_id"],)).fetchone()["n"]
    assert n == 1


# ── сделка: статусы и роли ─────────────────────────────

def test_06_stranger_cannot_change_deal_status():
    _as(C)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "in_progress"})
    assert r.status_code == 403, f"C сменил статус сделки: {r.status_code} {r.text}"


def test_07_shipper_cannot_start_trip_for_driver():
    _as(A)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "in_progress"})
    assert r.status_code == 403, f"A стартовал рейс за водителя: {r.status_code} {r.text}"


def test_08_driver_cannot_skip_to_delivered():
    _as(B)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "delivered"})
    assert r.status_code in (400, 409), f"accepted→delivered прошёл: {r.status_code} {r.text}"


def test_09_driver_starts_trip_ok():
    _as(B)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "in_progress"})
    assert r.status_code == 200, r.text


def test_10_shipper_cannot_mark_delivered_for_driver():
    _as(B)
    client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                 params={"new_status": "at_border"})
    _as(A)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "delivered"})
    assert r.status_code == 403, f"A отметил доставку за водителя: {r.status_code} {r.text}"


def test_11_driver_cannot_confirm_receipt_for_shipper():
    _as(B)
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "delivered"})
    assert r.status_code == 200, r.text
    r = client.patch(f"/api/v1/market/deals/{STATE['deal_id']}/status",
                     params={"new_status": "received"})
    assert r.status_code == 403, f"B подтвердил получение за A: {r.status_code} {r.text}"


# ── чат ─────────────────────────────────────────────────

def test_12_stranger_cannot_read_chat():
    assert STATE.get("room_id"), "chat_room_id не вернулся из accept"
    _as(C)
    r = client.get(f"/api/v1/chat/messages/{STATE['room_id']}")
    assert r.status_code in (403, 404), f"C прочитал чужой чат: {r.status_code}"


def test_13_stranger_cannot_send_to_chat():
    _as(C)
    r = client.post("/api/v1/chat/send", json={
        "room_id": STATE["room_id"], "text": "intruder",
        "client_msg_id": uuid.uuid4().hex})
    assert r.status_code in (403, 404), f"C написал в чужой чат: {r.status_code} {r.text}"


def test_14_participant_reads_chat_ok():
    _as(A)
    r = client.get(f"/api/v1/chat/messages/{STATE['room_id']}")
    assert r.status_code == 200, r.text


# ── GPS / tracking ──────────────────────────────────────

def test_15_stranger_cannot_read_tracking():
    _as(C)
    r = client.get(f"/api/v1/market/deals/{STATE['deal_id']}/tracking")
    assert r.status_code == 403, f"C прочитал GPS-состояние: {r.status_code}"


def test_16_stranger_cannot_request_tracking():
    _as(C)
    r = client.post(f"/api/v1/market/deals/{STATE['deal_id']}/tracking/request")
    assert r.status_code in (403, 404), f"C запросил tracking: {r.status_code}"


def test_17_stranger_cannot_stop_tracking():
    _as(C)
    r = client.post(f"/api/v1/market/deals/{STATE['deal_id']}/tracking/stop")
    assert r.status_code in (403, 404), f"C остановил tracking: {r.status_code}"


# ── груз ────────────────────────────────────────────────

def test_18_stranger_cannot_cancel_foreign_cargo():
    cargo2 = _seed_cargo(A)
    _as(C)
    r = client.delete(f"/api/v1/market/cargos/{cargo2}")
    assert r.status_code in (403, 404), f"C удалил чужой груз: {r.status_code}"
    r = client.patch(f"/api/v1/market/cargos/{cargo2}/unpublish")
    assert r.status_code in (403, 404), f"C распубликовал чужой груз: {r.status_code}"


def test_19_stranger_cannot_edit_foreign_cargo():
    _as(C)
    r = client.patch(f"/api/v1/market/cargos/{STATE['cargo_id']}",
                     json={"price": 1})
    assert r.status_code in (403, 404, 409), f"C отредактировал чужой груз: {r.status_code}"
