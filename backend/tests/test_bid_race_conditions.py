"""P1-6 (предрелизный deep-audit 05.09.2026): lost-update гонки мутаций ставок.

Дефект: cancel_bid / reject_bid / update_bid / counter_bid / decline_counter
читали ставку (SELECT в autocommit, без транзакции) и затем делали
`UPDATE bids SET ... WHERE id = ?` БЕЗ предиката исходного статуса (TOCTOU).
Параллельный accept успевал принять ставку между SELECT и UPDATE «жертвы»,
после чего UPDATE молча перетирал уже принятую ставку:

  accept ‖ update  → bid accepted c amount=2000, deal.amount=3000 (расход цены)
  accept ‖ cancel  → bid cancelled при живой accepted-сделке и cargo=taken
  accept ‖ reject  → bid rejected при живой сделке
  accept ‖ counter → bid countered при живой сделке
  accept_counter ‖ decline_counter → bid pending при живой сделке

Фикс: предикат допустимых исходных статусов прямо в UPDATE + rowcount=0 → 409
(тот же паттерн, что в _finalize_accept_inline / _transition_deal).

Harness: настоящее двухпоточное исполнение. Поток-«жертва» останавливается
МЕЖДУ SELECT (внутри _load_bid_or_404) и UPDATE через monkeypatch + Event;
поток-«акцептор» в этот момент полностью завершает accept. Каждая пара
гоняется RACE_ITERATIONS раз — единичный зелёный прогон не доказательство.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_bid_races.db python -m pytest tests/test_bid_race_conditions.py -q
"""
import contextvars
import os
import sys
import threading
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_bid_races.db")
# Вместе с БД чистим и её WAL-хвосты: осиротевшие -wal/-shm от прошлого
# прогона на свежесозданном пустом файле — источник плавающих
# «no such table» в совместном сюите.
for _suffix in ("", "-wal", "-shm"):
    Path(TEST_DB + _suffix).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u
    return dep


verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database.db import get_conn, new_id

ddb.init_db()

import api.marketplace as mp
from api.marketplace import mp_router

# chat_rooms нужна accept-пути (создание комнаты сделки).
_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with get_conn() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))
_notif_schema_path = ROOT / "database" / "notifications_schema.sql"
if _notif_schema_path.exists():
    with get_conn() as _c_notif:
        _c_notif.executescript(_notif_schema_path.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

import pytest
import config as _config


@pytest.fixture(scope="module", autouse=True)
def _dedicated_db():
    """Собственный файл БД на весь модуль. Общий conftest-сюит принудительно
    подменяет DB_PATH на shared-файл и пересоздаёт его session-fixture'ой —
    для конкуррентных тестов это источник плавающих «no such table» (unlink
    .db при живых -wal/-shm). Здесь подменяем config.DB_PATH на время модуля
    и восстанавливаем на выходе — суита не задета."""
    prev = _config.DB_PATH
    own = "/tmp/urtruck_test_bid_races_dedicated.db"
    for sfx in ("", "-wal", "-shm"):
        Path(own + sfx).unlink(missing_ok=True)
    _config.DB_PATH = own
    ddb.init_db()
    mp._init()
    for _schema in (_chat_schema_path, _notif_schema_path):
        if _schema.exists():
            with get_conn() as cc:
                cc.executescript(_schema.read_text(encoding="utf-8"))
    yield
    _config.DB_PATH = prev

OWNER = "race-owner"
BIDDER = "race-bidder"

RACE_ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))

# ── Пауза «жертвы» между SELECT и UPDATE ─────────────────────────────────
# Патчим _load_bid_or_404: запрос, помеченный contextvar'ом _victim_marker
# (contextvars доносятся из вызывающего потока до sync-эндпоинта через
# TestClient — тем же путём, что и _current_user выше), после чтения ставки
# сигналит reached и ждёт resume — окно TOCTOU растянуто детерминированно.

_victim_marker = contextvars.ContextVar("victim", default=False)

_orig_load = mp._load_bid_or_404


class _Pause:
    active = False
    reached = threading.Event()
    resume = threading.Event()

    @classmethod
    def reset(cls):
        cls.active = True
        cls.reached = threading.Event()
        cls.resume = threading.Event()

    @classmethod
    def off(cls):
        cls.active = False
        cls.resume.set()


def _paused_load(c, bid_id):
    row = _orig_load(c, bid_id)
    if _Pause.active and _victim_marker.get():
        _Pause.reached.set()
        _Pause.resume.wait(timeout=10)
    return row


mp._load_bid_or_404 = _paused_load


def as_user(uid):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def seed_cargo_and_bid(price=3000, bid_amount=3000, bid_status="pending",
                       counter_amount=None):
    cargo_id, bid_id = new_id(), new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, OWNER, "+700", "Owner", "Almaty", "Moscow",
             "Race cargo", "tent", price, 1, "active"),
        )
        c.execute(
            "INSERT INTO bids (id, cargo_id, bidder_id, bidder_name, bidder_phone, amount, status, "
            "counter_amount, counter_by) VALUES (?,?,?,?,?,?,?,?,?)",
            (bid_id, cargo_id, BIDDER, "Bidder", "+701", bid_amount, bid_status,
             counter_amount, "owner" if counter_amount else None),
        )
    return cargo_id, bid_id


def db_row(sql, *params):
    with get_conn() as c:
        r = c.execute(sql, params).fetchone()
        return dict(r) if r else None


def run_pair(victim_call, accept_call):
    """victim_call/accept_call: callables() -> httpx.Response.
    Жертва паузится после SELECT; акцептор завершает accept целиком;
    жертва продолжает. Возвращает (victim_response, accept_response)."""
    results = {}

    def _victim():
        try:
            _victim_marker.set(True)
            results["victim"] = victim_call()
        except Exception as e:  # pragma: no cover
            results["victim"] = e

    _Pause.reset()
    t = threading.Thread(target=_victim, name="victim")
    t.start()
    reached = _Pause.reached.wait(timeout=30)
    if not reached:
        _Pause.off()
        t.join(timeout=15)
        raise AssertionError(
            f"жертва не дошла до паузы после SELECT; victim={results.get('victim')!r} "
            f"body={getattr(results.get('victim'), 'text', None)!r}"
        )
    try:
        results["accept"] = accept_call()
    finally:
        _Pause.off()
    t.join(timeout=15)
    assert not t.is_alive(), "поток-жертва завис"
    assert not isinstance(results["victim"], Exception), f"жертва упала: {results['victim']!r}"
    return results["victim"], results["accept"]


def _accept(bid_id, as_uid=OWNER):
    def call():
        as_user(as_uid)
        return client.post(f"/api/v1/market/bids/{bid_id}/accept")
    return call


def assert_consistent_after_accept(cargo_id, bid_id, expected_amount):
    bid = db_row("SELECT * FROM bids WHERE id = ?", bid_id)
    deal = db_row("SELECT * FROM deals WHERE bid_id = ?", bid_id)
    cargo = db_row("SELECT * FROM cargos WHERE id = ?", cargo_id)
    assert deal is not None, "accept прошёл, но сделки нет"
    assert bid["status"] == "accepted", f"принятая ставка перетёрта: status={bid['status']!r}"
    assert deal["status"] == "accepted", f"сделка не accepted: {deal['status']!r}"
    assert bid["amount"] == deal["amount"] == expected_amount, (
        f"расход цены: bid.amount={bid['amount']} deal.amount={deal['amount']} ожидалось {expected_amount}"
    )
    assert cargo["status"] == "taken", f"cargo не taken: {cargo['status']!r}"


def test_race_accept_vs_update_bid():
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid(bid_amount=3000)

        def victim():
            as_user(BIDDER)
            return client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 2000})

        v, a = run_pair(victim, _accept(bid_id))
        assert a.status_code == 200, f"[iter {i}] accept упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: update_bid после accept вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status, amount FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 3000)


def test_race_accept_vs_cancel_bid():
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid()

        def victim():
            as_user(BIDDER)
            return client.post(f"/api/v1/market/bids/{bid_id}/cancel")

        v, a = run_pair(victim, _accept(bid_id))
        assert a.status_code == 200, f"[iter {i}] accept упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: cancel_bid после accept вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 3000)


def test_race_accept_vs_reject_bid():
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid()

        def victim():
            as_user(OWNER)
            return client.post(f"/api/v1/market/bids/{bid_id}/reject")

        v, a = run_pair(victim, _accept(bid_id))
        assert a.status_code == 200, f"[iter {i}] accept упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: reject_bid после accept вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 3000)


def test_race_accept_vs_counter_bid():
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid()

        def victim():
            as_user(OWNER)
            return client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 2500})

        v, a = run_pair(victim, _accept(bid_id))
        assert a.status_code == 200, f"[iter {i}] accept упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: counter_bid после accept вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 3000)


def test_race_accept_counter_vs_decline_counter():
    """Биддер одновременно жмёт «Принять контр» и «Отклонить контр»."""
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid(bid_amount=3000, bid_status="countered",
                                              counter_amount=2800)

        def victim():
            as_user(BIDDER)
            return client.post(f"/api/v1/market/bids/{bid_id}/counter/decline")

        def accept_counter():
            as_user(BIDDER)
            return client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")

        v, a = run_pair(victim, accept_counter)
        assert a.status_code == 200, f"[iter {i}] accept_counter упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: decline_counter после accept_counter вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 2800)


def test_race_accept_counter_vs_owner_cancel_counter():
    """Owner отменяет свою встречную, пока биддер её принимает."""
    for i in range(RACE_ITERATIONS):
        cargo_id, bid_id = seed_cargo_and_bid(bid_amount=3000, bid_status="countered",
                                              counter_amount=2800)

        def victim():
            as_user(OWNER)
            return client.post(f"/api/v1/market/bids/{bid_id}/counter/cancel")

        def accept_counter():
            as_user(BIDDER)
            return client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")

        v, a = run_pair(victim, accept_counter)
        assert a.status_code == 200, f"[iter {i}] accept_counter упал: {a.status_code} {a.text}"
        assert v.status_code == 409, (
            f"[iter {i}] LOST UPDATE: counter/cancel после accept_counter вернул {v.status_code} "
            f"(ставка: {db_row('SELECT status FROM bids WHERE id = ?', bid_id)})"
        )
        assert_consistent_after_accept(cargo_id, bid_id, 2800)


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(list(globals().items())):
        if name.startswith("test_") and callable(fn):
            try:
                fn(); print(f"  ✅ {name}")
            except Exception as e:
                fails += 1; print(f"  ❌ {name}: {e}")
    sys.exit(1 if fails else 0)
