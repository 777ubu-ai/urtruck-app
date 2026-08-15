"""Регресс P0: GET /market/my (my_dashboard) не падает 500.

Баг (#146): подзапрос last_message использовал несуществующую колонку
`chat_messages.body` → `sqlite3.OperationalError: no such column: m.body` →
весь дашборд «Мои грузы»/«Мои рейсы» отдавал 500. Фикс: `m.body` → `m.text`.

Проверяем:
  1) /market/my для клиента (владельца груза) → 200;
  2) /market/my для водителя → 200;
  3) last_message берётся из chat_messages.text;
  4) пустой чат (комната без сообщений) не вызывает 500.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_mydash.db python -m tests.test_market_dashboard
Exit != 0 на любой ошибке. Совместим с pytest (функции test_*).
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_mydash.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Патчим require_level ДО импорта marketplace (как в test_bid_actions).
from api import verification_gate
from tests.marketplace_harness import set_test_actor

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
from database import registration_dal
ddb.init_db()
registration_dal.init_registration_schema()  # my_dashboard JOIN'ит drivers_registration

from api.marketplace import mp_router  # _init() создаёт cargos/bids/deals

# chat_rooms/chat_messages из chat_schema.sql (без импорта api.chat).
from database.db import get_conn, new_id
_chat_sql = ROOT / "database" / "chat_schema.sql"
if _chat_sql.exists():
    with get_conn() as c:
        c.executescript(_chat_sql.read_text(encoding="utf-8"))
_notif_sql = ROOT / "database" / "notifications_schema.sql"
if _notif_sql.exists():
    with get_conn() as c:
        c.executescript(_notif_sql.read_text(encoding="utf-8"))

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
client = TestClient(app)

CLIENT_ID = "test-client-dash"
DRIVER_ID = "test-driver-dash"

def as_user(uid):
    actor = set_test_actor(uid, role="driver" if uid == DRIVER_ID else "client")
    _current_user.set(actor)

def _seed_deal_with_message(text: str | None):
    """Создаёт cargo(client) → bid(driver) → accept → deal + chat_room.
    Если text задан — вставляет сообщение; иначе комната остаётся без нашего
    сообщения (пустой-чат кейс). Возвращает (cargo_id, room_id)."""
    as_user(CLIENT_ID)
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "dash test", "price": 4000, "currency": "USD"})
    assert r.status_code in (200, 201), r.text
    cargo_id = r.json()["id"]
    as_user(DRIVER_ID)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 3500})
    assert r.status_code in (200, 201), r.text
    bid_id = r.json()["id"]
    as_user(CLIENT_ID)
    r = client.post(f"/api/v1/market/bids/{bid_id}/accept")
    assert r.status_code in (200, 201), r.text
    room_id = r.json().get("chat_room_id")
    with get_conn() as c:
        if text is not None and room_id:
            # id — автоинкремент (INTEGER PK), не задаём вручную
            c.execute("INSERT INTO chat_messages (room_id, sender_id, text) VALUES (?,?,?)",
                      (room_id, DRIVER_ID, text))
        elif room_id:
            # пустой чат: убрать любые авто-сообщения (маркер сделки)
            c.execute("DELETE FROM chat_messages WHERE room_id = ?", (room_id,))
    return cargo_id, room_id


def test_my_dashboard_client_200_with_last_message():
    _seed_deal_with_message("Загрузился, выезжаю")
    as_user(CLIENT_ID)
    r = client.get("/api/v1/market/my")
    assert r.status_code == 200, f"client /my → {r.status_code}: {r.text}"
    deals = r.json().get("my_deals", [])
    lasts = [d.get("last_message") for d in deals]
    assert "Загрузился, выезжаю" in lasts, f"last_message из text не найден: {lasts}"


def test_my_dashboard_driver_200():
    as_user(DRIVER_ID)
    r = client.get("/api/v1/market/my")
    assert r.status_code == 200, f"driver /my → {r.status_code}: {r.text}"


def test_my_dashboard_empty_chat_no_500():
    _seed_deal_with_message(None)  # комната без сообщений
    as_user(CLIENT_ID)
    r = client.get("/api/v1/market/my")
    assert r.status_code == 200, f"empty-chat /my → {r.status_code}: {r.text}"


if __name__ == "__main__":
    fails = 0
    for fn in [test_my_dashboard_client_200_with_last_message,
               test_my_dashboard_driver_200,
               test_my_dashboard_empty_chat_no_500]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
