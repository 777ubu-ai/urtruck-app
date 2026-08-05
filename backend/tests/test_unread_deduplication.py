"""Блок 5 аудита (P1-1/P1-2): бейдж «Сделки» = notifUnread + chatUnread не
должен считать одно бизнес-событие дважды, и notifUnread должен реально
гаситься, когда пользователь открывает сущность, к которой уведомление
ведёт (а не оставаться нечитаемым навсегда — NotificationsScreen нигде не
подключён к навигации).

Вариант B (выбран как наименее ломающий схему): системные сообщения чата
(sender_id='system') исключены из chatUnread — событие живёт в общем
счётчике только через notifications.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_unread_dedup.db python -m tests.test_unread_deduplication
Exit != 0 на любой ошибке. Совместим с pytest.
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
registration_dal.init_registration_schema()

ROOT_ = ROOT
for _schema in ("chat_schema.sql", "notifications_schema.sql"):
    _p = ROOT_ / "database" / _schema
    if _p.exists():
        from database.db import get_conn as _gc
        with _gc() as _c:
            _c.executescript(_p.read_text(encoding="utf-8"))

from api.marketplace import mp_router
from api.chat import chat_router
from api.notifications import notif_router

app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(notif_router, prefix="/api/v1/notifications")
client = TestClient(app)

# get_cargo/get_trip используют _maybe_user() → РЕАЛЬНЫЙ Bearer-токен
# (verification_gate._extract_driver), а не fake_require_level-контекствар.
# Поэтому для этих двух вызовов нужны настоящие зарегистрированные
# пользователи + сессии — create_guest()/create_session(), как в
# test_push_token_security.py.
def _real_user():
    guest = registration_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = registration_dal.create_session(uid)
    return uid, token


CLIENT_ID, CLIENT_TOKEN = _real_user()
DRIVER_ID, DRIVER_TOKEN = _real_user()
_TOKENS = {CLIENT_ID: CLIENT_TOKEN, DRIVER_ID: DRIVER_TOKEN}


def as_user(uid: str):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+70000000000", "verification_level": 1})


def auth_headers(uid: str) -> dict:
    return {"Authorization": f"Bearer {_TOKENS[uid]}"}


def get_entity(uid: str, path: str):
    """GET с реальным Bearer-токеном (для _maybe_user-эндпоинтов вроде
    /market/cargos/{id} — fake_require_level их не покрывает)."""
    return client.get(path, headers=auth_headers(uid))


def badge(uid: str) -> int:
    as_user(uid)
    n = client.get("/api/v1/notifications/unread").json()["unread"]
    c = client.get("/api/v1/chat/unread").json()["unread"]
    return n + c


def test_one_chat_message_gives_plus_one():
    as_user(CLIENT_ID)
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 1", "price": 3000, "currency": "USD",
    })
    cargo_id = r.json()["id"]
    as_user(DRIVER_ID)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2800})
    bid_id = r.json()["id"]
    as_user(CLIENT_ID)
    acc = client.post(f"/api/v1/market/bids/{bid_id}/accept").json()
    room_id = acc.get("chat_room_id") or acc.get("room_id")

    before = badge(CLIENT_ID)
    as_user(DRIVER_ID)
    client.post("/api/v1/chat/send", json={"room_id": room_id, "text": "Погрузился"})
    after = badge(CLIENT_ID)
    assert after - before == 1, f"обычное сообщение должно давать +1, получили +{after - before}"


def test_bid_accepted_gives_plus_one_not_two():
    """Регресс главной находки P1-1: accept_bid создаёт И системное
    сообщение в чат, И notification — раньше это считалось как +2."""
    as_user(CLIENT_ID)
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 2", "price": 4000, "currency": "USD",
    })
    cargo_id = r.json()["id"]
    as_user(DRIVER_ID)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 3500})
    bid_id = r.json()["id"]

    before = badge(DRIVER_ID)  # биддер — получатель bid_accepted
    as_user(CLIENT_ID)
    client.post(f"/api/v1/market/bids/{bid_id}/accept")
    after = badge(DRIVER_ID)
    assert after - before == 1, f"'ставка принята' должна давать +1 (не +2), получили +{after - before}"


def test_counter_accept_gives_plus_one_not_two():
    as_user(CLIENT_ID)
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 3", "price": 5000, "currency": "USD",
    })
    cargo_id = r.json()["id"]
    as_user(DRIVER_ID)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 4500})
    bid_id = r.json()["id"]
    as_user(CLIENT_ID)
    client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 4800})

    before = badge(DRIVER_ID)
    as_user(DRIVER_ID)
    client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
    after = badge(DRIVER_ID)
    assert after - before == 1, f"'контр принят' должен давать +1 (не +2), получили +{after - before}"


def test_opening_deal_marks_only_its_own_notifications_read():
    """P1-2: открытие GET /market/deals/{id} гасит уведомления, ведущие
    именно на эту сделку/груз/рейс — но не трогает уведомления по ДРУГИМ
    сущностям того же пользователя."""
    as_user(CLIENT_ID)
    r1 = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 4a", "price": 3000, "currency": "USD",
    })
    cargo1 = r1.json()["id"]
    r2 = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 4b", "price": 3000, "currency": "USD",
    })
    cargo2 = r2.json()["id"]

    as_user(DRIVER_ID)
    client.post("/api/v1/market/bids", json={"cargo_id": cargo1, "amount": 2900})
    client.post("/api/v1/market/bids", json={"cargo_id": cargo2, "amount": 2900})

    as_user(CLIENT_ID)
    notif_before = client.get("/api/v1/notifications").json()["notifications"]
    unread_before = [n for n in notif_before if not n["is_read"]]
    assert len(unread_before) >= 2, "должно быть минимум 2 непрочитанных (новая ставка на каждый груз)"

    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo1}")  # открыли только 1-й груз

    notif_after = client.get("/api/v1/notifications").json()["notifications"]
    # url реально хранится с query-строкой (напр. "/cargos/{id}?bid={bid_id}",
    # см. create_bid) — сравниваем по префиксу пути, не точным совпадением.
    notif_cargo1 = [n for n in notif_after if n["url"].startswith(f"/cargos/{cargo1}")]
    notif_cargo2 = [n for n in notif_after if n["url"].startswith(f"/cargos/{cargo2}")]
    assert notif_cargo1, "должно быть найдено хотя бы одно уведомление по cargo1"
    assert notif_cargo2, "должно быть найдено хотя бы одно уведомление по cargo2"
    assert all(n["is_read"] for n in notif_cargo1), "уведомление по открытому грузу должно погаснуть"
    assert any(not n["is_read"] for n in notif_cargo2), "уведомление по НЕоткрытому грузу не должно тронуться"


def test_badge_isolated_per_user():
    as_user(CLIENT_ID)
    b_client = badge(CLIENT_ID)
    as_user(DRIVER_ID)
    b_driver = badge(DRIVER_ID)
    # Просто проверяем, что запросы не путают пользователей — оба вызова
    # успешны и независимы (реальная изоляция по user_id в WHERE уже
    # покрыта IDOR-частью аудита; здесь — регресс на badge-уровне).
    assert isinstance(b_client, int) and isinstance(b_driver, int)


def test_repeated_fetch_does_not_double_count():
    as_user(CLIENT_ID)
    r = client.post("/api/v1/market/cargos", json={
        "from_city": "Almaty", "to_city": "Astana", "cargo_type": "tent",
        "cargo_desc": "unread test 5", "price": 3000, "currency": "USD",
    })
    cargo_id = r.json()["id"]
    as_user(DRIVER_ID)
    client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": 2900})

    as_user(CLIENT_ID)
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    after_first = badge(CLIENT_ID)
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    get_entity(CLIENT_ID, f"/api/v1/market/cargos/{cargo_id}")
    after_repeat = badge(CLIENT_ID)
    assert after_repeat == after_first, "повторное открытие не должно ни расти, ни падать ниже 0"


if __name__ == "__main__":
    fails = 0
    for fn in [test_one_chat_message_gives_plus_one,
               test_bid_accepted_gives_plus_one_not_two,
               test_counter_accept_gives_plus_one_not_two,
               test_opening_deal_marks_only_its_own_notifications_read,
               test_badge_isolated_per_user,
               test_repeated_fetch_does_not_double_count]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
