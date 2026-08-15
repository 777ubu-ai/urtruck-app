"""Отзывы разрешены только по конкретной подтверждённо завершённой сделке.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_completed_reviews.db pytest -q tests/test_deal_completion_reviews.py
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_completed_reviews.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate

_current_user = contextvars.ContextVar("review_user", default=None)


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
from database import db as ddb, reviews_dal
from database.db import get_conn, new_id

ddb.init_db()
from api import marketplace  # noqa: E402,F401 - creates authoritative deal schema

reviews_dal.init_reviews_schema()
from api.reviews import reviews_router  # noqa: E402

app = FastAPI()
app.include_router(reviews_router, prefix="/api/v1/reviews")
client = TestClient(app)

SHIPPER = "review-shipper"
DRIVER = "review-driver"
STRANGER = "review-stranger"


def as_user(uid):
    _current_user.set({"id": uid, "verification_level": 1})


def seed_deal(status="completed", *, shipper=SHIPPER, driver=DRIVER, trip_id=None):
    deal_id = new_id()
    trip_id = trip_id or new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, trip_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (deal_id, trip_id, new_id(), shipper, driver, "Almaty", "Astana", 3000, status),
        )
    return deal_id, trip_id


def payload(deal_id, trip_id, *, target=DRIVER, target_role="driver"):
    return {
        "deal_id": deal_id,
        "trip_id": trip_id,
        "target_id": target,
        "target_role": target_role,
        "rating": 5,
        "text": "ok",
    }


def review_count(deal_id):
    with get_conn() as c:
        return c.execute("SELECT COUNT(*) AS n FROM reviews WHERE deal_id = ?", (deal_id,)).fetchone()["n"]


def test_review_rejected_before_shipper_confirmation_without_write():
    deal_id, trip_id = seed_deal("awaiting_confirmation")
    as_user(SHIPPER)
    response = client.post("/api/v1/reviews", json=payload(deal_id, trip_id))
    assert response.status_code == 403, response.text
    assert review_count(deal_id) == 0


def test_review_requires_concrete_deal_id():
    _, trip_id = seed_deal("completed")
    as_user(SHIPPER)
    body = payload("unused", trip_id)
    body.pop("deal_id")
    response = client.post("/api/v1/reviews", json=body)
    assert response.status_code == 422, response.text


def test_review_rejects_wrong_actor_target_and_trip_without_write():
    deal_id, trip_id = seed_deal("completed")

    as_user(STRANGER)
    stranger = client.post("/api/v1/reviews", json=payload(deal_id, trip_id))
    assert stranger.status_code == 403, stranger.text

    as_user(SHIPPER)
    wrong_target = client.post(
        "/api/v1/reviews",
        json=payload(deal_id, trip_id, target=STRANGER),
    )
    assert wrong_target.status_code == 403, wrong_target.text
    wrong_trip = client.post("/api/v1/reviews", json=payload(deal_id, new_id()))
    assert wrong_trip.status_code == 403, wrong_trip.text
    assert review_count(deal_id) == 0


def test_both_participants_can_review_exact_completed_deal():
    deal_id, trip_id = seed_deal("completed")

    as_user(SHIPPER)
    shipper_review = client.post("/api/v1/reviews", json=payload(deal_id, trip_id))
    assert shipper_review.status_code == 200, shipper_review.text

    as_user(DRIVER)
    driver_review = client.post(
        "/api/v1/reviews",
        json=payload(deal_id, trip_id, target=SHIPPER, target_role="client"),
    )
    assert driver_review.status_code == 200, driver_review.text

    with get_conn() as c:
        rows = c.execute(
            "SELECT deal_id, trip_id, author_id, author_role, target_id, target_role "
            "FROM reviews WHERE deal_id = ? ORDER BY author_id",
            (deal_id,),
        ).fetchall()
    assert len(rows) == 2
    assert {row["deal_id"] for row in rows} == {deal_id}
    assert {row["trip_id"] for row in rows} == {trip_id}
    assert {(row["author_role"], row["target_role"]) for row in rows} == {
        ("client", "driver"),
        ("driver", "client"),
    }


def test_duplicate_is_scoped_to_deal_and_fails_closed():
    first_deal, first_trip = seed_deal("completed")
    second_deal, second_trip = seed_deal("completed")
    as_user(SHIPPER)
    assert client.post("/api/v1/reviews", json=payload(first_deal, first_trip)).status_code == 200
    duplicate = client.post("/api/v1/reviews", json=payload(first_deal, first_trip))
    assert duplicate.status_code == 409, duplicate.text
    other_deal = client.post("/api/v1/reviews", json=payload(second_deal, second_trip))
    assert other_deal.status_code == 200, other_deal.text
    assert review_count(first_deal) == 1
    assert review_count(second_deal) == 1


def test_client_cannot_inject_target_role():
    deal_id, trip_id = seed_deal("completed")
    as_user(SHIPPER)
    response = client.post(
        "/api/v1/reviews",
        json=payload(deal_id, trip_id, target_role="client"),
    )
    assert response.status_code == 422, response.text
    assert review_count(deal_id) == 0
