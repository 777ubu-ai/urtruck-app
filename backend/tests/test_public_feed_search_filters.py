"""Server-side search filters must run before pagination and sorting."""
import uuid

import pytest

from api import marketplace
from database.db import get_conn
from tests.test_market_dashboard import as_user, client


def _seed(kind, *, city, country, amount, currency, day, owner=None):
    item_id = "search-" + uuid.uuid4().hex
    with get_conn() as c:
        if kind == "cargo":
            c.execute(
                "INSERT INTO cargos (id,owner_id,from_city,to_city,cargo_desc,cargo_type,price,currency,pickup_date,status,created_at,published_at,from_country,to_country) "
                "VALUES (?,?,?,?,?,?,?,?,?,'active','2026-10-15 00:00:00','2026-10-15 00:00:00',?,?)",
                (item_id, owner or "shipper-" + uuid.uuid4().hex, city, "Поти", "Обычный груз", "tent", amount, currency, day, country, "GE"),
            )
        else:
            c.execute(
                "INSERT INTO trips (id,driver_id,driver_name,from_city,to_city,truck_type,price,currency,departure,status,created_at,published_at,from_country,to_country) "
                "VALUES (?,?,? ,?, 'Поти','tent',?,?,?,'active','2026-10-15 00:00:00','2026-10-15 00:00:00',?,'GE')",
                (item_id, owner or "driver-" + uuid.uuid4().hex, "Verified Carrier", city, amount, currency, day, country),
            )
    return item_id


@pytest.mark.parametrize("kind,endpoint", [("cargo", "cargos"), ("trip", "trips")])
def test_search_filters_apply_before_page_and_price_sort_is_currency_scoped(kind, endpoint):
    matching_late = _seed(kind, city="Ош", country="KG", amount=1200, currency="KZT", day="2099-10-20")
    _seed(kind, city="Ош", country="KG", amount=500, currency="USD", day="2099-10-20")
    _seed(kind, city="Ош", country="KG", amount=800, currency="KZT", day="2099-10-25")
    _seed(kind, city="Брест", country="BY", amount=100, currency="KZT", day="2099-10-20")

    params = {
        "from_city": "Ош", "from_country": "KG", "to_country": "GE",
        "date_from": "2099-10-20", "date_to": "2099-10-20",
        "min_price": 1000, "currency": "KZT", "sort_by": "price_asc",
        "limit": 1, "offset": 0,
    }
    response = client.get(f"/api/v1/market/{endpoint}", params=params)
    assert response.status_code == 200, response.text
    payload = response.json()
    rows = payload[endpoint]
    assert [row["id"] for row in rows] == [matching_late]
    assert payload["search_contract"] == 1
    assert payload["page_count"] == 1
    assert payload["has_more"] is False


def test_invalid_search_bounds_and_cross_currency_price_sort_are_rejected():
    assert client.get("/api/v1/market/cargos", params={"min_price": 200, "max_price": 100, "currency": "USD"}).status_code == 422
    assert client.get("/api/v1/market/trips", params={"sort_by": "price_asc"}).status_code == 422
    assert client.get("/api/v1/market/trips", params={"sort_by": "sql desc", "currency": "USD"}).status_code == 422


def test_price_order_is_global_within_selected_currency_and_date_filter_accepts_legacy_day_format():
    expensive = _seed("cargo", city="Минск", country="BY", amount=5000, currency="USD", day="20.10.2099")
    cheap = _seed("cargo", city="Минск", country="BY", amount=1000, currency="USD", day="2099-10-20")
    _seed("cargo", city="Минск", country="BY", amount=10, currency="KZT", day="2099-10-20")

    response = client.get("/api/v1/market/cargos", params={
        "from_city": "Минск", "date_from": "2099-10-20", "date_to": "2099-10-20",
        "currency": "USD", "sort_by": "price_asc", "limit": 50,
    })
    assert response.status_code == 200, response.text
    rows = response.json()["cargos"]
    assert [row["id"] for row in rows] == [cheap, expensive]
    assert all(row["currency"] == "USD" for row in rows)


def test_price_sort_has_stable_global_pages_and_saved_match_after_first_page(monkeypatch):
    ids = [
        _seed("cargo", city="Астана", country="KZ", amount=amount, currency="USD", day="2099-10-20", owner="page-owner")
        for amount in range(1, 61)
    ]
    late_saved = ids[-1]
    with get_conn() as c:
        c.execute(
            "INSERT INTO favorites (user_id,item_type,item_id) VALUES ('page-owner','cargo',?)",
            (late_saved,),
        )

    second = client.get("/api/v1/market/cargos", params={
        "from_city": "Астана", "currency": "USD", "sort_by": "price_asc", "limit": 10, "offset": 50,
    })
    assert second.status_code == 200, second.text
    assert [row["price"] for row in second.json()["cargos"]] == list(range(51, 61))
    assert second.json()["has_more"] is False

    monkeypatch.setattr(marketplace, "_maybe_user", lambda _authorization: {"id": "page-owner"})
    saved = client.get("/api/v1/market/cargos", params={"saved_only": "true"})
    assert saved.status_code == 200, saved.text
    assert [row["id"] for row in saved.json()["cargos"]] == [late_saved]


def test_saved_only_is_owner_scoped_and_requires_auth(monkeypatch):
    saved_id = _seed("cargo", city="Ош", country="KG", amount=1200, currency="KZT", day="2099-10-20", owner="favorite-owner")
    _seed("cargo", city="Ош", country="KG", amount=900, currency="KZT", day="2099-10-20", owner="other-owner")
    with get_conn() as c:
        c.execute("INSERT INTO favorites (user_id,item_type,item_id) VALUES ('favorite-owner','cargo',?)", (saved_id,))

    denied = client.get("/api/v1/market/cargos", params={"saved_only": "true"})
    assert denied.status_code == 401

    monkeypatch.setattr(marketplace, "_maybe_user", lambda _authorization: {"id": "favorite-owner"})
    response = client.get("/api/v1/market/cargos", params={"saved_only": "true"})
    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()["cargos"]] == [saved_id]


def test_saved_only_lookup_uses_owner_type_item_index():
    with get_conn() as c:
        plan = c.execute(
            "EXPLAIN QUERY PLAN SELECT 1 FROM cargos "
            "WHERE EXISTS (SELECT 1 FROM favorites f "
            "WHERE f.user_id = ? AND f.item_type = ? AND f.item_id = cargos.id)",
            ("owner", "cargo"),
        ).fetchall()
    details = " ".join(row["detail"] for row in plan)
    assert "sqlite_autoindex_favorites_1" in details
