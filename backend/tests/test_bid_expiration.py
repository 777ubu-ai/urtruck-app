"""Bid expiration contract (26.08.2026).

Focused PR: ставки водителей не должны жить бесконечно и не должны
приниматься после истечения срока. Тесты покрывают:

  * schema: expires_at колонка есть и заполняется при create.
  * TTL: пустой BID_TTL_HOURS = 48ч по умолчанию, env-параметризация.
  * accept_bid ДО expires_at → 200, создаётся deal.
  * accept_bid ПОСЛЕ expires_at → 409 bid_expired, deal НЕ создаётся,
    статус перешёл в 'expired' (lazy-expiration).
  * повторный accept expired ставки не создаёт дубль сделки.
  * update_bid и counter_bid отказываются работать с expired.
  * update_bid и counter_bid обновляют expires_at (свежий срок жизни).
  * list_bids отдаёт 'expired' статус после lazy-transition.
  * legacy-ставка без expires_at не считается истёкшей (fail-open),
    чтобы фикс не выключил разом активные ставки на проде.

Все тесты — pytest-style, разделённые фикстуры, изолированный DB через
DB_PATH (pr-quality-gate.yml задаёт свой).
"""
import contextvars
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

TEST_DB = os.environ.setdefault(
    "DB_PATH", "/tmp/urtruck_test_bid_expiration.db"
)
Path(TEST_DB).unlink(missing_ok=True)

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

ddb.init_db()

from api import marketplace as mp
from api.marketplace import mp_router  # runs _init() → bids table

from database.db import get_conn as _get_conn_for_setup

for name in ("chat_schema.sql", "notifications_schema.sql"):
    p = ROOT / "database" / name
    if p.exists():
        with _get_conn_for_setup() as _c:
            _c.executescript(p.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)


def as_user(uid, name="Ivan Petrov", phone="+70000000000"):
    # NB: не "Test User" — public dirty-фильтр в list_bids прячет ставки
    # с "test" в имени (DIRTY_TOKENS в marketplace.py:160), поэтому такой
    # bidder не пройдёт в публичном list_bids ответе. Настоящее имя нужно
    # именно для сценария test_list_bids_returns_expired_status_...
    _current_user.set(
        {"id": uid, "full_name": name, "phone": phone, "verification_level": 1}
    )


def seed_cargo(owner_id, price=3000):
    from database.db import get_conn, new_id

    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                cargo_id,
                owner_id,
                "+700",
                "Owner",
                "Almaty",
                "Moscow",
                "Test cargo",
                "tent",
                price,
                0,
                "active",
            ),
        )
    return cargo_id


def create_bid(cargo_id, amount=3000, bidder="driver-x"):
    as_user(bidder)
    r = client.post(
        "/api/v1/market/bids",
        json={"cargo_id": cargo_id, "amount": amount, "message": "offer"},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def read_bid(bid_id):
    from database.db import get_conn

    with get_conn() as c:
        row = c.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
        return dict(row) if row else None


def set_expires_at(bid_id, iso):
    """Test helper: пишем произвольный expires_at, чтобы симулировать
    прошедшее время без реального sleep."""
    from database.db import get_conn

    with get_conn() as c:
        c.execute("UPDATE bids SET expires_at = ? WHERE id = ?", (iso, bid_id))
        c.commit()


# ─── Tests ────────────────────────────────────────────────────────────────


def test_schema_has_expires_at_column():
    from database.db import get_conn

    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(bids)").fetchall()}
    assert "expires_at" in cols, "bids.expires_at column expected after migration"


def test_ttl_default_is_48_hours(monkeypatch):
    monkeypatch.delenv("BID_TTL_HOURS", raising=False)
    assert mp._bid_ttl_hours() == 48


def test_ttl_env_override(monkeypatch):
    monkeypatch.setenv("BID_TTL_HOURS", "12")
    assert mp._bid_ttl_hours() == 12


def test_ttl_env_invalid_falls_back_to_48(monkeypatch):
    monkeypatch.setenv("BID_TTL_HOURS", "not-a-number")
    assert mp._bid_ttl_hours() == 48
    monkeypatch.setenv("BID_TTL_HOURS", "-5")
    assert mp._bid_ttl_hours() == 48


def test_create_bid_populates_expires_at():
    cargo_id = seed_cargo(owner_id="owner-1")
    bid_id = create_bid(cargo_id, bidder="driver-1")
    row = read_bid(bid_id)
    assert row["expires_at"], "expires_at must be set on create"
    exp = datetime.fromisoformat(row["expires_at"])
    now = datetime.utcnow()
    # Свежая ставка живёт около 48ч (по умолчанию). Даём небольшой запас
    # ±10 минут, чтобы тест не флейкил на медленной CI-машине.
    delta = exp - now
    assert timedelta(hours=47, minutes=50) < delta < timedelta(hours=48, minutes=10), (
        f"expected ~48h TTL, got {delta}"
    )


def test_accept_pending_bid_within_ttl_creates_deal():
    cargo_id = seed_cargo(owner_id="owner-2")
    bid_id = create_bid(cargo_id, bidder="driver-2")
    as_user("owner-2")
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 200, r.text
    assert r.json().get("deal_id"), "deal must be created"
    assert read_bid(bid_id)["status"] == "accepted"


def test_accept_expired_bid_is_refused_and_transitions_status():
    cargo_id = seed_cargo(owner_id="owner-3")
    bid_id = create_bid(cargo_id, bidder="driver-3")
    # Симулируем: ставка истекла час назад.
    past = (datetime.utcnow() - timedelta(hours=1)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    as_user("owner-3")
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 409, r.text
    body = r.json()
    detail = body.get("detail")
    assert isinstance(detail, dict), f"expected structured detail, got {detail!r}"
    assert detail.get("error") == "bid_expired"
    assert detail.get("expires_at") == past
    # Lazy transition: статус в БД теперь 'expired'.
    assert read_bid(bid_id)["status"] == "expired"


def test_expired_bid_does_not_create_deal():
    cargo_id = seed_cargo(owner_id="owner-4")
    bid_id = create_bid(cargo_id, bidder="driver-4")
    past = (datetime.utcnow() - timedelta(minutes=5)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    as_user("owner-4")
    client.post(f"/api/v1/market/bids/{bid_id}/accept")  # first attempt, 409

    from database.db import get_conn

    with get_conn() as c:
        rows = c.execute(
            "SELECT COUNT(*) AS n FROM deals WHERE cargo_id = ?", (cargo_id,)
        ).fetchone()
    assert rows["n"] == 0, "no deal must be created from an expired bid"


def test_repeat_accept_of_expired_bid_stays_409_no_duplicate():
    cargo_id = seed_cargo(owner_id="owner-5")
    bid_id = create_bid(cargo_id, bidder="driver-5")
    past = (datetime.utcnow() - timedelta(hours=2)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    as_user("owner-5")
    r1 = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    r2 = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r1.status_code == 409
    assert r2.status_code == 409
    # Всё ещё нет ни одной сделки.
    from database.db import get_conn

    with get_conn() as c:
        n = c.execute(
            "SELECT COUNT(*) AS n FROM deals WHERE cargo_id = ?", (cargo_id,)
        ).fetchone()["n"]
    assert n == 0, "no duplicate deal on retry"


def test_update_expired_bid_refused():
    cargo_id = seed_cargo(owner_id="owner-6")
    bid_id = create_bid(cargo_id, bidder="driver-6")
    past = (datetime.utcnow() - timedelta(minutes=1)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    as_user("driver-6")
    r = client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 2900})
    assert r.status_code == 409, r.text
    assert r.json()["detail"].get("error") == "bid_expired"


def test_update_bid_refreshes_expires_at():
    cargo_id = seed_cargo(owner_id="owner-7")
    bid_id = create_bid(cargo_id, bidder="driver-7")
    before = read_bid(bid_id)["expires_at"]
    # Симулируем: ставка почти истекла (5 минут до конца).
    almost = (datetime.utcnow() + timedelta(minutes=5)).isoformat(timespec="seconds")
    set_expires_at(bid_id, almost)

    as_user("driver-7")
    r = client.patch(f"/api/v1/market/bids/{bid_id}", json={"amount": 2900})
    assert r.status_code == 200, r.text

    after = read_bid(bid_id)["expires_at"]
    # Свежий expires_at должен снова быть ~48ч вперёд.
    exp = datetime.fromisoformat(after)
    delta = exp - datetime.utcnow()
    assert delta > timedelta(hours=47), f"update must refresh TTL, got {delta}"
    # after не должен совпадать с "почти истёкшим" значением, которое мы
    # затёрли. Сравнение с исходным `before` намеренно опускаем — оба
    # значения ~48ч, но округлены до секунд, поэтому в быстрых unit-run'ах
    # могут совпасть посекундно (флейк).
    assert after != almost


def test_counter_expired_bid_refused():
    cargo_id = seed_cargo(owner_id="owner-8")
    bid_id = create_bid(cargo_id, bidder="driver-8")
    past = (datetime.utcnow() - timedelta(hours=1)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    as_user("owner-8")
    r = client.post(
        f"/api/v1/market/bids/{bid_id}/counter",
        json={"amount": 2800, "message": "counter"},
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"].get("error") == "bid_expired"


def test_counter_bid_refreshes_expires_at():
    cargo_id = seed_cargo(owner_id="owner-9")
    bid_id = create_bid(cargo_id, bidder="driver-9")
    # Ставка почти истекла (5 минут).
    almost = (datetime.utcnow() + timedelta(minutes=5)).isoformat(timespec="seconds")
    set_expires_at(bid_id, almost)

    as_user("owner-9")
    r = client.post(
        f"/api/v1/market/bids/{bid_id}/counter",
        json={"amount": 2800, "message": "counter"},
    )
    assert r.status_code == 200, r.text
    after = read_bid(bid_id)["expires_at"]
    exp = datetime.fromisoformat(after)
    delta = exp - datetime.utcnow()
    assert delta > timedelta(hours=47), (
        f"counter must refresh TTL from counter moment, got {delta}"
    )


def test_list_bids_returns_expired_status_after_lazy_transition():
    cargo_id = seed_cargo(owner_id="owner-10")
    bid_id = create_bid(cargo_id, bidder="driver-10")
    past = (datetime.utcnow() - timedelta(hours=3)).isoformat(timespec="seconds")
    set_expires_at(bid_id, past)

    # Public list (unauth): статус уже expired благодаря list_bids →
    # _maybe_expire_bid.
    r = client.get(f"/api/v1/market/bids?cargo_id={cargo_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    all_bids = body["bids"]
    found = [b for b in all_bids if b["id"] == bid_id]
    assert found, "the expired bid must still appear in the list"
    assert found[0]["status"] == "expired"


def test_legacy_bid_without_expires_at_is_treated_as_alive():
    """Fail-open: старые ставки на проде создавались до этого фикса и
    имеют expires_at IS NULL. Одномоментное включение фикса не должно их
    гасить."""
    cargo_id = seed_cargo(owner_id="owner-11")
    bid_id = create_bid(cargo_id, bidder="driver-11")
    # Симулируем legacy: expires_at = NULL.
    set_expires_at(bid_id, None)

    as_user("owner-11")
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code == 200, r.text
    assert r.json().get("deal_id")


def test_is_expired_iso_helpers():
    """Unit-контракт для _is_expired_iso: fail-open на None/пустое/битое,
    строгое сравнение по времени иначе."""
    now = datetime.utcnow()
    assert mp._is_expired_iso(None) is False
    assert mp._is_expired_iso("") is False
    assert mp._is_expired_iso("not-an-iso") is False
    past = (now - timedelta(seconds=1)).isoformat(timespec="seconds")
    future = (now + timedelta(hours=1)).isoformat(timespec="seconds")
    assert mp._is_expired_iso(past, now=now) is True
    assert mp._is_expired_iso(future, now=now) is False
