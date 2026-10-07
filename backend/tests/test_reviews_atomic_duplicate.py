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
        c.execute("INSERT INTO deals VALUES('deal-1','trip-1','cargo-1','completed','author','target')")
        c.execute("INSERT INTO deals VALUES('deal-2','trip-2','cargo-2','completed','author','target')")
    app = FastAPI()
    app.include_router(reviews.reviews_router, prefix='/reviews')
    dependency = next(r for r in reviews.reviews_router.routes if r.path == '' and 'POST' in r.methods).dependant.dependencies[0].call
    app.dependency_overrides[dependency] = lambda: {'id': 'author', 'role': 'client'}
    monkeypatch.setattr(reviews, 'limit_review_create', lambda _: None)
    import api.push, api.notifications
    monkeypatch.setattr(api.push, 'send_to_user', lambda *a, **k: None)
    monkeypatch.setattr(api.notifications, 'create_notification', lambda *a, **k: None)
    return TestClient(app), conn


@pytest.mark.parametrize('references', [
    ('deal-1', 'deal-1'),
    ('deal-1', 'cargo-1'),
    ('cargo-1', 'deal-1'),
    (None, None),
])
def test_concurrent_review_posts_create_one_row(review_client, monkeypatch, references):
    client, conn = review_client
    with_reference = references[0] is not None
    name = 'has_already_reviewed' if with_reference else 'has_reviewed_target'
    original = getattr(reviews_dal, name)
    barrier = Barrier(2)
    def check(*args):
        result = original(*args)
        barrier.wait(timeout=5)
        return result
    monkeypatch.setattr(reviews_dal, name, check)
    payloads = [
        {'target_id': 'target', 'target_role': 'driver', 'rating': 5, 'trip_id': reference}
        for reference in references
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda payload: client.post('/reviews', json=payload), payloads))
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


@pytest.mark.parametrize('references', [
    ('deal-1', 'cargo-1'),
    ('cargo-1', 'deal-1'),
])
def test_alternate_listing_reference_is_canonicalized_and_deduplicated(review_client, references):
    client, conn = review_client
    def post(reference):
        return client.post('/reviews', json={
            'target_id': 'target', 'target_role': 'driver', 'rating': 5, 'trip_id': reference,
        })
    assert post(references[0]).status_code == 200
    assert post(references[1]).status_code == 409
    with conn() as c:
        rows = c.execute('SELECT trip_id FROM reviews').fetchall()
        assert [row['trip_id'] for row in rows] == ['deal-1']


def test_legacy_alias_row_is_detected_for_canonical_deal(review_client):
    client, conn = review_client
    with conn() as c:
        c.execute(
            "INSERT INTO reviews (id, trip_id, author_id, author_role, target_id, target_role, rating) "
            "VALUES ('legacy-review', 'cargo-1', 'author', 'client', 'target', 'driver', 5)"
        )
    response = client.post('/reviews', json={
        'target_id': 'target', 'target_role': 'driver', 'rating': 4, 'trip_id': 'deal-1',
    })
    assert response.status_code == 409
    with conn() as c:
        assert c.execute('SELECT COUNT(*) FROM reviews').fetchone()[0] == 1


def test_shared_legacy_listing_alias_does_not_block_distinct_deal_ids(review_client):
    client, conn = review_client
    with conn() as c:
        c.execute(
            "INSERT INTO deals VALUES('deal-3','trip-3','cargo-1','completed','author','target')"
        )
    def post(reference):
        return client.post('/reviews', json={
            'target_id': 'target', 'target_role': 'driver', 'rating': 5, 'trip_id': reference,
        })
    assert post('deal-1').status_code == 200
    assert post('deal-3').status_code == 200
    with conn() as c:
        assert c.execute('SELECT COUNT(*) FROM reviews').fetchone()[0] == 2


def test_ambiguous_legacy_alias_fails_closed_without_deleting_history(review_client):
    client, conn = review_client
    with conn() as c:
        c.execute(
            "INSERT INTO deals VALUES('deal-3','trip-3','cargo-1','completed','author','target')"
        )
        c.execute(
            "INSERT INTO reviews (id, trip_id, author_id, author_role, target_id, target_role, rating) "
            "VALUES ('legacy-review', 'cargo-1', 'author', 'client', 'target', 'driver', 5)"
        )

    for deal_id in ('deal-1', 'deal-3'):
        response = client.post('/reviews', json={
            'target_id': 'target', 'target_role': 'driver', 'rating': 4, 'trip_id': deal_id,
        })
        assert response.status_code == 409
        assert response.json()['detail'] == 'Старый отзыв нельзя однозначно связать со сделкой; требуется сверка'

    with conn() as c:
        rows = c.execute('SELECT id, trip_id FROM reviews ORDER BY id').fetchall()
        assert [(row['id'], row['trip_id']) for row in rows] == [('legacy-review', 'cargo-1')]
