"""Регрессия: owner-фильтр и раздел до LIMIT, все страницы и изоляция."""
import json
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.marketplace import mp_router
from database.db import get_conn
from tests.test_market_dashboard import client, as_user


def seed(kind, uid, status, count):
    table, owner = ("cargos", "owner_id") if kind == "cargo" else ("trips", "driver_id")
    ids = [str(uuid.uuid4()) for _ in range(count)]
    with get_conn() as c:
        for item_id in ids:
            if kind == "cargo":
                c.execute("INSERT INTO cargos (id,owner_id,from_city,to_city,cargo_desc,status,pickup_date,created_at,photos) "
                          "VALUES (?,?, 'Almaty','Astana','Мебель',?,'2099-01-01','2026-10-15 00:00:00',?)",
                          (item_id, uid, status, json.dumps(["cargo_photos/fixture.jpg"])))
            else:
                c.execute("INSERT INTO trips (id,driver_id,from_city,to_city,status,departure,created_at) "
                          "VALUES (?,?, 'Almaty','Astana',?,'2099-01-01','2026-10-15 00:00:00')",
                          (item_id, uid, status))
    return set(ids)


@pytest.mark.parametrize("kind,role", [("cargo", "client"), ("trip", "driver")])
def test_all_own_pages_archive_and_foreign_records(kind, role, monkeypatch):
    monkeypatch.setattr("api.marketplace._cargo_file_signing.sign", lambda key: "/signed/" + key)
    uid = "paged-" + str(uuid.uuid4())
    active = seed(kind, uid, "active", 121)
    archive = seed(kind, uid, "unpublished", 70)
    seed(kind, uid, "taken" if kind == "cargo" else "booked", 3)
    seed(kind, "foreign-" + uid, "active", 15)
    as_user(uid, role)
    for section, expected in [("active", active), ("archive", archive)]:
        offset, seen = 0, []
        while True:
            r = client.get(f"/api/v1/market/my/listings?kind={kind}&section={section}&offset={offset}")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["total"] == len(expected)
            assert data["archive_total"] == 70
            assert len(data["items"]) <= 50
            assert all(x["owner_id" if kind == "cargo" else "driver_id"] == uid for x in data["items"])
            if kind == "cargo" and data["items"]:
                assert len(data["items"][0]["photos"]) == 1
                assert data["items"][0]["photos"][0] == "/signed/cargo_photos/fixture.jpg"
            seen.extend(x["id"] for x in data["items"])
            if data["next_offset"] is None:
                break
            assert data["next_offset"] > offset
            offset = data["next_offset"]
        assert len(seen) == len(set(seen)) == len(expected)
        assert set(seen) == expected


@pytest.mark.parametrize("query", ["kind=deals", "section=completed", "limit=201", "limit=0", "offset=-1"])
def test_invalid_page_rejected(query):
    as_user("paged-validator")
    assert client.get("/api/v1/market/my/listings?" + query).status_code == 422


def test_empty_owner_and_large_offset_are_empty():
    uid = "empty-" + str(uuid.uuid4())
    as_user(uid)
    r = client.get("/api/v1/market/my/listings?offset=5000&owner_id=another")
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0, "archive_total": 0, "next_offset": None}


def test_unauthenticated_real_dependency_denies_listing():
    app = FastAPI()
    app.include_router(mp_router, prefix="/market")
    r = TestClient(app).get("/market/my/listings")
    assert r.status_code in (401, 403)
    assert "items" not in r.json()


def test_legacy_dashboard_contract_unchanged():
    as_user("legacy-" + str(uuid.uuid4()))
    r = client.get("/api/v1/market/my")
    assert r.status_code == 200
    assert set(r.json()) == {"my_cargos", "my_trips", "my_bids", "incoming_bids", "my_deals"}


@pytest.mark.parametrize("kind,resource", [("cargo", "cargos"), ("trip", "trips")])
def test_public_pages_and_empty_hygiene_window(kind, resource):
    uid = "public-" + str(uuid.uuid4())
    expected = seed(kind, uid, "active", 101)
    tag = "Almaty-" + uuid.uuid4().hex
    owner = "owner_id" if kind == "cargo" else "driver_id"
    with get_conn() as c:
        c.execute(f"UPDATE {resource} SET from_city=?, published_at='2026-10-15 00:00:00' WHERE {owner}=?", (tag, uid))
    seen, offset = [], 0
    while True:
        r = client.get(f"/api/v1/market/{resource}", params={"from_city": tag, "offset": offset, "limit": 50})
        assert r.status_code == 200
        data = r.json()
        assert len(data[resource]) <= 50
        assert all("owner_phone" not in x and "driver_phone" not in x for x in data[resource])
        seen.extend(x["id"] for x in data[resource])
        if data["next_offset"] is None:
            break
        assert data["next_offset"] > offset
        offset = data["next_offset"]
    assert len(seen) == len(set(seen)) == 101
    assert set(seen) == expected
    # Первые 50 строк скрыты hygiene, но за ними есть реальные объявления.
    dirty_field = "cargo_desc" if kind == "cargo" else "driver_name"
    with get_conn() as c:
        c.execute(f"UPDATE {resource} SET {dirty_field}='demo', published_at='2099-01-01' "
                  f"WHERE id IN (SELECT id FROM {resource} WHERE {owner}=? ORDER BY id DESC LIMIT 50)", (uid,))
    data = client.get(f"/api/v1/market/{resource}", params={"from_city": tag, "limit": 50}).json()
    assert data[resource] == [] and data["next_offset"] == 50
    next_page = client.get(f"/api/v1/market/{resource}", params={"from_city": tag, "limit": 50, "offset": 50}).json()
    assert len(next_page[resource]) == 50
    assert next_page["next_offset"] == 100
