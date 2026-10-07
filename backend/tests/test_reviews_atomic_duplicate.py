"""Real HTTP handler + DAL/SQLite, deterministic concurrent duplicate checks."""
import sqlite3
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import reviews
from database import reviews_dal


@pytest.fixture
def review_client(tmp_path, monkeypatch):
    path = tmp_path / 'reviews.db'
    @contextmanager
    def conn():
        c = sqlite3.connect(path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()
    monkeypatch.setattr(reviews_dal, 'get_conn', conn)
    reviews_dal.init_reviews_schema()
    with conn() as c:
        c.execute('CREATE TABLE deals(id TEXT, trip_id TEXT, cargo_id TEXT, status TEXT, shipper_id TEXT, driver_id TEXT)')
        c.execute("INSERT INTO deals VALUES('deal-1','trip-1',NULL,'completed','author','target')")
        c.execute("INSERT INTO deals VALUES('deal-2','trip-2',NULL,'completed','author','target')")
    app = FastAPI()
    app.include_router(reviews.reviews_router, prefix='/reviews')
    dependency = next(r for r in reviews.reviews_router.routes if r.path == '' and 'POST' in r.methods).dependant.dependencies[0].call
    app.dependency_overrides[dependency] = lambda: {'id': 'author', 'role': 'client'}
    monkeypatch.setattr(reviews, 'limit_review_create', lambda _: None)
    import api.push, api.notifications
    monkeypatch.setattr(api.push, 'send_to_user', lambda *a, **k: None)
    monkeypatch.setattr(api.notifications, 'create_notification', lambda *a, **k: None)
    return TestClient(app), conn


@pytest.mark.parametrize('reference', ['deal-1', None])
def test_concurrent_review_posts_create_one_row(review_client, monkeypatch, reference):
    client, conn = review_client
    name = 'has_already_reviewed' if reference else 'has_reviewed_target'
    original = getattr(reviews_dal, name)
    barrier = Barrier(2)
    def check(*args):
        result = original(*args)
        barrier.wait(timeout=5)
        return result
    monkeypatch.setattr(reviews_dal, name, check)
    payload = {'target_id': 'target', 'target_role': 'driver', 'rating': 5, 'trip_id': reference}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post('/reviews', json=payload), range(2)))
    assert sorted(r.status_code for r in responses) == [200, 409]
    with conn() as c:
        assert c.execute('SELECT COUNT(*) FROM reviews').fetchone()[0] == 1


def test_distinct_completed_deals_and_access_guards(review_client):
    client, conn = review_client
    def post(reference, target='target'):
        return client.post('/reviews', json={'target_id': target, 'target_role': 'driver', 'rating': 5, 'trip_id': reference})
    assert post('deal-1').status_code == 200
    assert post('deal-2').status_code == 200
    assert post('deal-1').status_code == 409
    assert post('foreign-reference').status_code == 403
    assert post('deal-1', 'stranger').status_code == 403
    assert post('deal-1', 'author').status_code == 400
