"""P0 2026-09-03 — жизненный цикл прочтения BID-уведомления.

Физически доказанный дефект (двухтелефонный QA):
Fedya создаёт ставку → Boris получает Android system push → тап открывает
правильный экран → но in-app/backend unread остаётся 1, бейдж не гаснет.
При ACCEPT и CHAT то же самое работает корректно (reference PASS).

ПЕРВОПРИЧИНА: гашение уведомлений происходит НА СЕРВЕРЕ как side-effect
загрузки сущности — в GET /cargos/{id} и GET /trips/{id}, и оба блока
gated условием `if caller and caller.get("id")`. Эндпоинты optional-auth
(_maybe_user), поэтому анонимный запрос успешно отдаёт карточку, но
гашение МОЛЧА пропускает. Фронтенд вызывал их через
marketAPI.getCargo/getTrip БЕЗ заголовка Authorization (authedFetch,
вопреки имени, токен не подставляет), т.е. анонимно → BID-уведомление
никогда не помечалось прочитанным.

У ACCEPT дефект был замаскирован: там уже существует сделка, и экран
дополнительно грузит строго-авторизованный GET /deals/{id}, который гасит
и /cargos/{id} тоже. У CHAT — отдельный механизм unread (read state
сообщений), к URL-матчингу уведомлений не относящийся.

Тесты ниже проверяют оба уровня:
  * поведенческий — эндпоинт с токеном гасит, без токена не гасит;
  * lifecycle A-E — сколько именно уведомлений гаснет и остаётся.
"""
import pytest

from database import db as ddb

ddb.init_db()

from database import registration_dal as reg_dal
from database.db import get_conn, new_id
from api import marketplace as marketplace_api
from api.marketplace import get_cargo, get_trip

# ВАЖНО: `api.notifications` импортируется ЛЕНИВО, внутри функций.
#
# tests/test_notification_center_reachability.py работает только если он —
# ПЕРВЫЙ импортёр `api.notifications`: он патчит
# `verification_gate.require_level` и лишь ПОСЛЕ этого импортирует
# notif_router, чтобы эндпоинты связались с подменённой зависимостью.
# Python кеширует модули, а pytest импортирует все тест-модули на коллекции
# в алфавитном порядке — и `test_bid_*` идёт раньше `test_notification_*`.
# Импорт api.notifications на уровне нашего модуля связывал бы роутер с
# НАСТОЯЩИМ require_level, и тот тест получал бы 401.
#
# `api.marketplace` держать на уровне модуля безопасно: он импортирует
# api.notifications только внутри функций (проверено — транзитивно не тянет).


def _notifications_api():
    from api.notifications import create_notification, mark_notifications_read_by_urls
    return create_notification, mark_notifications_read_by_urls


def create_notification(*args, **kwargs):
    return _notifications_api()[0](*args, **kwargs)


def mark_notifications_read_by_urls(*args, **kwargs):
    return _notifications_api()[1](*args, **kwargs)

# Харнесс-загрязнение (зафиксировано 03.09.2026): tests/test_unread_deduplication.py
# на УРОВНЕ МОДУЛЯ выполняет `marketplace_api._maybe_user = fake_maybe_user`.
# pytest импортирует все тест-модули на коллекции, ДО запуска любого теста,
# поэтому эта подмена протекает на весь процесс: реальный сессионный токен
# перестаёт резолвиться, и эндпоинт видит анонимного вызывающего.
#
# Наш модуль импортируется раньше (алфавитно test_bid_* < test_unread_*), так
# что здесь `_maybe_user` ещё подлинный — сохраняем его и возвращаем на время
# КАЖДОГО нашего теста, после чего восстанавливаем то, что было. Иначе
# поведенческие проверки авторизации зависели бы от порядка коллекции.
_ORIGINAL_MAYBE_USER = marketplace_api._maybe_user


@pytest.fixture(autouse=True)
def _restore_real_auth_resolver():
    patched = marketplace_api._maybe_user
    marketplace_api._maybe_user = _ORIGINAL_MAYBE_USER
    try:
        yield
    finally:
        marketplace_api._maybe_user = patched


def _reset_notifications():
    with get_conn() as c:
        c.execute("DELETE FROM notifications")


def _new_user():
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    return uid, reg_dal.create_session(uid)


def _seed_cargo(owner_id: str) -> str:
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, "
            "to_city, cargo_desc, cargo_type, price, bids_count, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+700", "Owner", "Almaty", "Moscow",
             "Test cargo", "tent", 100000, 0, "active"),
        )
    return cargo_id


def _seed_trip(driver_id: str) -> str:
    trip_id = new_id()
    with get_conn() as c:
        cols = {dict(r)["name"] for r in c.execute("PRAGMA table_info(trips)").fetchall()}
        payload = {
            "id": trip_id,
            "driver_id": driver_id,
            "from_city": "Almaty",
            "to_city": "Moscow",
            "truck_type": "tent",
            "price": 500000,
            "status": "active",
        }
        payload = {k: v for k, v in payload.items() if k in cols}
        keys = ",".join(payload)
        marks = ",".join("?" for _ in payload)
        c.execute(f"INSERT INTO trips ({keys}) VALUES ({marks})", tuple(payload.values()))
    return trip_id


def _unread(user_id: str) -> int:
    with get_conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
            (user_id,),
        ).fetchone()[0]


# ─────────────────────────────────────────────────────────────────────────
# Поведенческое доказательство первопричины: гашение требует авторизации
# ─────────────────────────────────────────────────────────────────────────

def test_anonymous_cargo_fetch_does_not_clear_bid_notification():
    """Ровно этот путь и давал вечный unread=1: запрос без Authorization."""
    _reset_notifications()
    owner_id, _token = _new_user()
    cargo_id = _seed_cargo(owner_id)
    create_notification(
        owner_id, "bid_created", "💰 Ставка", "test", "💰",
        url=f"/cargos/{cargo_id}?bid={new_id()}",
    )
    assert _unread(owner_id) == 1

    # Аноним получает карточку (эндпоинт optional-auth), но гашения нет.
    get_cargo(cargo_id, authorization=None)
    assert _unread(owner_id) == 1, (
        "анонимный GET /cargos/{id} не должен гасить (и не гасит) уведомления — "
        "именно поэтому фронтенд обязан присылать Authorization"
    )


def test_authenticated_cargo_fetch_clears_bid_notification():
    """С токеном тот же эндпоинт гасит BID-уведомление: 1 → 0."""
    _reset_notifications()
    owner_id, token = _new_user()
    cargo_id = _seed_cargo(owner_id)
    create_notification(
        owner_id, "bid_created", "💰 Ставка", "test", "💰",
        url=f"/cargos/{cargo_id}?bid={new_id()}",
    )
    assert _unread(owner_id) == 1

    get_cargo(cargo_id, authorization=f"Bearer {token}")
    assert _unread(owner_id) == 0, "авторизованное открытие карговой карточки гасит BID-уведомление"


def test_authenticated_trip_fetch_clears_driver_bid_notification():
    """Симметрия для ставки по рейсу (url=/trips/{id}?bid=...)."""
    _reset_notifications()
    driver_id, token = _new_user()
    trip_id = _seed_trip(driver_id)
    create_notification(
        driver_id, "bid_created", "📦 Заказ", "test", "📦",
        url=f"/trips/{trip_id}?bid={new_id()}",
    )
    assert _unread(driver_id) == 1

    get_trip(trip_id, authorization=f"Bearer {token}")
    assert _unread(driver_id) == 0


# ─────────────────────────────────────────────────────────────────────────
# A-E: сколько именно гаснет и что остаётся
# ─────────────────────────────────────────────────────────────────────────

def test_a_new_bid_gives_exactly_one_unread():
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    assert _unread(uid) == 1


def test_b_and_c_opening_the_bid_target_marks_that_notification_and_only_it():
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 1
    assert _unread(uid) == 0


def test_d_two_independent_unread_open_one_leaves_the_other():
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c2?bid=b2")
    assert _unread(uid) == 2
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 1
    assert _unread(uid) == 1, "открытие одной карточки не должно гасить чужие события"


def test_e_repeated_open_is_idempotent():
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 1
    # Повторный тап: гасить уже нечего, состояние не портится.
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 0
    assert _unread(uid) == 0


def test_two_bids_on_the_same_cargo_both_clear_on_open():
    """Несколько ставок по одному грузу ведут на один путь — гаснут вместе."""
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    create_notification(uid, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b2")
    assert _unread(uid) == 2
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 2
    assert _unread(uid) == 0


# ─────────────────────────────────────────────────────────────────────────
# F, G: reference PASS не должен измениться
# ─────────────────────────────────────────────────────────────────────────

def test_f_accept_notification_clearing_unchanged():
    """bid_accepted шлёт url=/cargos/{id} (или /deals/{id}) — поведение то же."""
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "bid_accepted", "✅", "", "✅", url="/cargos/c1")
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 1
    assert _unread(uid) == 0

    _reset_notifications()
    create_notification(uid, "bid_accepted", "✅", "", "✅", url="/deals/d1")
    # Открытие сделки гасит все три варианта url (см. GET /deals/{id}).
    assert mark_notifications_read_by_urls(uid, ["/deals/d1", "/cargos/c1", "/trips/t1"]) == 1
    assert _unread(uid) == 0


def test_g_chat_notification_is_isolated_from_entity_paths():
    """CHAT живёт на /chats/{room} и не гаснет от открытия груза/рейса."""
    _reset_notifications()
    uid, _ = _new_user()
    create_notification(uid, "chat", "💬", "", "💬", url="/chats/room-1")
    assert mark_notifications_read_by_urls(uid, ["/cargos/c1"]) == 0
    assert _unread(uid) == 1, "открытие карточки груза не должно гасить чат-уведомление"
    assert mark_notifications_read_by_urls(uid, ["/chats/room-1"]) == 1
    assert _unread(uid) == 0


def test_clearing_never_leaks_across_users():
    _reset_notifications()
    uid_a, _ = _new_user()
    uid_b, _ = _new_user()
    create_notification(uid_a, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b1")
    create_notification(uid_b, "bid_created", "💰", "", "💰", url="/cargos/c1?bid=b2")
    assert mark_notifications_read_by_urls(uid_a, ["/cargos/c1"]) == 1
    assert _unread(uid_a) == 0
    assert _unread(uid_b) == 1, "гашение у одного пользователя не трогает другого"
