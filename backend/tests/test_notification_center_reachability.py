"""P0-hotfix 28.08.2026 (TestFlight build 17 → 18), §1: push badge есть,
in-app уведомлений нет.

Первопричина (подтверждена статически и по коду, не гадание):
  1. NotificationsScreen был зарегистрирован в AppNavigator, но НИ ОДНА
     кнопка нигде во фронте на него не вела — единственный путь был
     deep-link url='/notifications', которого НИ ОДИН backend-push не
     отправляет (0 совпадений по всему backend/api, backend/services).
     Итог: badge на иконке рос, «список уведомлений» был физически
     недостижим — сирота того же класса, что уже чинили для
     HowItWorks/About (Этап 6.4).
  2. Два реальных backend-события слали push БЕЗ записи в notifications
     (reviews.py, saved_searches.py) — даже после починки входа список
     оставался бы пустым для этих событий.

Этот файл — backend-часть регрессии: подтверждает, что оба события
теперь создают запись в notifications (не просто push). Frontend-часть
(точка входа в ProfileScreen + мгновенный сброс badge) покрыта
tests/frontend/test_notification_center_reachability.mjs.

CI-контракт: top-level def test_* — иначе CI гоняет файл как скрипт мимо
conftest (см. предрелизный аудит 28.08.2026, тот же класс бага).
"""
import uuid

import contextvars

_cu = contextvars.ContextVar("u", default=None)


def _fake_require_level(_min):
    from fastapi import HTTPException

    def dep():
        u = _cu.get()
        if not u:
            raise HTTPException(status_code=401)
        return u

    return dep


from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.reviews import reviews_router
from api.notifications import notif_router
from database.db import get_conn, new_id
from database import reviews_dal
from tests.auth_harness import override_require_level

# conftest.py's session-scoped autouse fixture recreates DB_PATH ПОСЛЕ
# коллекции тестов (module-level код уже выполнен к этому моменту) —
# вызов init здесь на import-время попал бы в файл, который conftest
# затем пересоздаст без схемы reviews. setup_module гарантированно
# выполняется ПОСЛЕ session-фикстуры, на схему актуальной БД.
def setup_module(module):
    reviews_dal.init_reviews_schema()

app = FastAPI()
app.include_router(reviews_router, prefix="/api/v1/reviews")
app.include_router(notif_router, prefix="/api/v1/notifications")
override_require_level(app, _fake_require_level(1))
client = TestClient(app)


def _as(uid):
    _cu.set({"id": uid, "full_name": uid, "phone": "+700", "verification_level": 1})


def _seed_completed_deal(shipper_id, driver_id):
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(deals)").fetchall()}
        base = {
            "id": new_id(), "bid_id": "b-" + uuid.uuid4().hex[:8],
            "shipper_id": shipper_id, "driver_id": driver_id,
            "from_city": "Almaty", "to_city": "Moscow", "amount": 1000,
            "status": "completed",
        }
        keys = [k for k in base if k in cols]
        c.execute(f"INSERT INTO deals ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                  [base[k] for k in keys])
    return base["id"]


def test_review_creates_in_app_notification_for_target():
    author = "review-author-" + uuid.uuid4().hex[:8]
    target = "review-target-" + uuid.uuid4().hex[:8]
    _seed_completed_deal(author, target)  # has_deal_between() требует реальную completed-сделку

    with get_conn() as c:
        before = c.execute(
            "SELECT COUNT(*) n FROM notifications WHERE user_id = ?", (target,)
        ).fetchone()["n"]

    _as(author)
    r = client.post("/api/v1/reviews/", json={
        "target_id": target, "target_role": "driver", "rating": 5,
        "text": "Отличный водитель", "trip_id": None,
    })
    assert r.status_code == 200, r.text

    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC", (target,)
        ).fetchall()
    assert len(rows) == before + 1, "отзыв обязан создавать ровно одну запись в notifications"
    assert rows[0]["url"] == "/profile"
    assert rows[0]["is_read"] == 0

    # unread_count() у получателя обязан вырасти на этот же 1.
    _as(target)
    r2 = client.get("/api/v1/notifications/unread")
    assert r2.status_code == 200
    assert r2.json()["unread"] >= 1


def test_completed_deal_review_eligibility_and_stable_reference():
    author = "eligible-author-" + uuid.uuid4().hex[:8]
    target = "eligible-target-" + uuid.uuid4().hex[:8]
    deal_id = _seed_completed_deal(author, target)

    _as(author)
    eligible = client.get(f"/api/v1/reviews/eligibility/{target}?trip_id={deal_id}")
    assert eligible.status_code == 200, eligible.text
    assert eligible.json()["eligible"] is True

    created = client.post("/api/v1/reviews/", json={
        "target_id": target, "target_role": "driver", "rating": 5,
        "text": "Completed transport", "trip_id": deal_id,
    })
    assert created.status_code == 200, created.text

    duplicate = client.get(f"/api/v1/reviews/eligibility/{target}?trip_id={deal_id}")
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["eligible"] is False
    assert duplicate.json()["already_reviewed"] is True


def test_review_rejects_reference_from_unrelated_deal():
    author = "wrong-ref-author-" + uuid.uuid4().hex[:8]
    target = "wrong-ref-target-" + uuid.uuid4().hex[:8]
    _seed_completed_deal(author, target)
    unrelated_id = _seed_completed_deal(
        "other-shipper-" + uuid.uuid4().hex[:8],
        "other-driver-" + uuid.uuid4().hex[:8],
    )

    _as(author)
    response = client.post("/api/v1/reviews/", json={
        "target_id": target, "target_role": "driver", "rating": 5,
        "trip_id": unrelated_id,
    })
    assert response.status_code == 403, response.text


def test_saved_search_notification_dedupes_by_cargo():
    from api.saved_searches import notify_matching_users

    uid = "ss-user-" + uuid.uuid4().hex[:8]
    cargo_id = "cg-" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        # id — INTEGER PRIMARY KEY AUTOINCREMENT, не задаём вручную.
        c.execute(
            "INSERT INTO saved_searches (user_id, from_city, to_city, notify) "
            "VALUES (?,?,?,1)",
            (uid, "Алматы", "Москва"),
        )

    notify_matching_users("Алматы", "Москва", "тестовый груз", cargo_id)
    notify_matching_users("Алматы", "Москва", "тестовый груз", cargo_id)  # повтор — не дублирует

    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? AND type = 'saved_search'", (uid,)
        ).fetchall()
    assert len(rows) == 1, f"повторный вызов создал дубль: {len(rows)} записей вместо 1"
    assert rows[0]["url"] == f"/cargos/{cargo_id}"
