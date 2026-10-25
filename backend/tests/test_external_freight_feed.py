"""Контракт отдельной внешней ленты на отдельной изолированной тестовой БД."""
import os
import sqlite3
import stat
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import external_freight
from api.verification_gate import require_admin
from database import external_freight_dal as dal
from database.external_freight_connection import get_conn

_actor = None


def _actor_dep():
    from fastapi import HTTPException
    actor = _actor
    if not actor:
        raise HTTPException(status_code=401, detail="auth_required")
    return actor


def _admin_dep():
    from fastapi import HTTPException
    actor = _actor
    if not actor or actor.get("role") not in {"admin", "support"}:
        raise HTTPException(status_code=403, detail="admin_required")
    return actor


app = FastAPI()
app.include_router(external_freight.router, prefix="/api/v1/external-freight")
for route in external_freight.router.routes:
    for dependency in getattr(route, "dependant", ()).dependencies if getattr(route, "dependant", None) else []:
        if getattr(dependency.call, "__name__", "") == "dependency":
            app.dependency_overrides[dependency.call] = _actor_dep
        elif dependency.call is require_admin:
            app.dependency_overrides[dependency.call] = _admin_dep
client = TestClient(app)


@pytest.fixture(autouse=True)
def _feed_setup(monkeypatch, tmp_path):
    global _actor
    _actor = None
    monkeypatch.setenv("EXTERNAL_FREIGHT_FEED_ENABLED", "true")
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORTER_KEY", "test-importer-key-only")
    monkeypatch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(tmp_path / "external.sqlite3"))
    dal.init_schema()
    yield
    with get_conn() as c:
        c.execute("DELETE FROM external_freight_bookmarks")
        c.execute("DELETE FROM external_freight_audit")
        c.execute("DELETE FROM external_freight_delivery")
        c.execute("DELETE FROM external_freight_metrics")
        c.execute("DELETE FROM external_freight_item_body_types")
        c.execute("DELETE FROM external_freight_items")


def _record(*, source="telegram-test", message=None, kind="cargo", text="Ищу машину для перевозки груза", published=None,
            origin="Ташкент", destination="Алматы", origin_country=None, destination_country=None,
            amount=None, currency=None, body_types=None, status="active"):
    return {
        "source_id": source, "source_message_id": message or uuid.uuid4().hex, "segment_id": "0", "kind": kind,
        "source_published_at": (published or datetime.now(timezone.utc)).isoformat(), "original_text": text,
        "origin_country": origin_country, "destination_country": destination_country,
        "origin": origin, "destination": destination, "amount": amount, "currency": currency,
        "body_types": body_types or [], "contacts": ["+7 777 000 00 00"], "status": status,
    }


def _import(record, *, key="test-importer-key-only"):
    return client.post("/api/v1/external-freight/import", headers={"X-External-Importer-Key": key}, json={"records": [record]})


def test_import_requires_secret_and_user_is_read_only():
    record = _record()
    assert client.post("/api/v1/external-freight/import", json={"records": [record]}).status_code == 401
    assert _import(record, key="wrong").status_code == 401
    global _actor
    _actor = {"id": "client-1", "role": "client"}
    assert client.post("/api/v1/external-freight", json={"records": [record]}).status_code == 405
    assert client.get("/api/v1/external-freight").status_code == 200


def test_roles_only_see_their_feed_kind_and_publications_are_not_transactions():
    cargo = _record(source="tg-cargo", text="Нужен тент, груз готов")
    vehicle = _record(source="tg-vehicle", kind="vehicle", text="Есть свободный тент, ищу груз")
    a, b = _import(cargo).json()["results"][0]["id"], _import(vehicle).json()["results"][0]["id"]
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    listed = client.get("/api/v1/external-freight").json()["items"]
    assert [row["id"] for row in listed] == [a]
    assert client.get(f"/api/v1/external-freight/{b}").status_code == 404
    _actor = {"id": "shipper", "role": "client"}
    listed = client.get("/api/v1/external-freight").json()["items"]
    assert [row["id"] for row in listed] == [b]
    assert client.get(f"/api/v1/external-freight/{a}").status_code == 404


def test_ambiguous_missing_date_and_closed_source_are_not_published():
    ambiguous = _record(source="ambiguous", text="Есть груз и свободная машина", kind="cargo")
    missing_date = _record(source="no-date", text="Нужен тент, груз готов")
    missing_date.pop("source_published_at")
    closed = _record(source="closed", text="Нужен тент, груз готов. Уже нашли машину")
    items = [_import(x).json()["results"][0] for x in (ambiguous, missing_date, closed)]
    assert [item["status"] for item in items] == ["review", "review", "closed"]
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight").json()["items"] == []


def test_bulk_cargo_wording_is_not_misclassified_as_a_free_vehicle():
    text = "Актуальные загрузки: требуются машины. Груз: хлопок, маршрут Алматы → Ташкент"
    cargo = _record(source="bulk-cargo", message="cargo", kind="cargo", text=text)
    wrong_role = _record(source="bulk-cargo", message="vehicle", kind="vehicle", text=text)
    cargo_result = _import(cargo).json()["results"][0]
    wrong_role_result = _import(wrong_role).json()["results"][0]

    assert cargo_result["status"] == "active"
    assert wrong_role_result["status"] == "review"

    mixed = _record(
        source="mixed-intent",
        text="Порожний тент, ищу груз. Груз: полиэтилен, одновременно требуются 3 машины",
        kind="vehicle",
    )
    assert _import(mixed).json()["results"][0]["status"] == "review"


def test_replay_and_edit_preserve_original_publication_and_identity_with_seven_day_expiry():
    published = datetime.now(timezone.utc) - timedelta(hours=20)
    original = _record(source="replay", message="1", published=published)
    first = _import(original).json()["results"][0]
    with get_conn() as c:
        before_row = c.execute("SELECT expires_at,ingested_at,source_revision FROM external_freight_items WHERE id=?", (first["id"],)).fetchone()
        before, before_ingested_at, before_revision = before_row["expires_at"], before_row["ingested_at"], before_row["source_revision"]
    second = _import(original).json()["results"][0]
    edited = {**original, "original_text": "Нужен тент, груз готов. Обновили описание", "source_revision": original.get("source_revision")}
    third = _import(edited).json()["results"][0]
    with get_conn() as c:
        row = c.execute("SELECT id,expires_at,ingested_at,source_revision FROM external_freight_items WHERE source_id='replay' AND source_message_id='1'").fetchone()
    assert second["id"] == first["id"] == third["id"] == row["id"]
    assert row["expires_at"] == (published + timedelta(days=7)).isoformat()
    assert row["ingested_at"] == before_ingested_at
    assert row["source_revision"] != before_revision
    assert second["result"] == "replayed" and third["result"] == "updated"


def test_replay_extends_legacy_expiry_from_original_publication():
    published = datetime.now(timezone.utc) - timedelta(days=6)
    record = _record(source="retention-migration", message="1", published=published)
    first = _import(record).json()["results"][0]
    old_expiry = (published + timedelta(hours=120)).isoformat()
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET expires_at=?,status='expired' WHERE id=?", (old_expiry, first["id"]))

    replay = _import(record).json()["results"][0]
    with get_conn() as c:
        row = c.execute("SELECT id,source_published_at,expires_at,status FROM external_freight_items WHERE id=?", (first["id"],)).fetchone()

    assert replay["id"] == first["id"] == row["id"]
    assert replay["result"] == "updated"
    assert row["source_published_at"] == published.isoformat()
    assert row["expires_at"] == (published + timedelta(days=7)).isoformat()
    assert row["status"] == "active"


def test_expired_rows_are_hidden_without_cleanup_job():
    expired = _record(source="old", published=datetime.now(timezone.utc) - timedelta(hours=121))
    inserted = _import(expired).json()["results"][0]
    assert inserted["status"] == "expired"
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight").json()["items"] == []


def test_import_validates_whole_batch_before_writing_and_does_not_turn_unknown_into_zero():
    good = _record(source="atomic", message="one", text="Нужен тент, груз готов")
    bad = _record(source="atomic", message="two", text="Нужен тент, груз готов", amount=0, currency="USD")
    response = client.post("/api/v1/external-freight/import", headers={"X-External-Importer-Key": "test-importer-key-only"}, json={"records": [good, bad]})
    assert response.status_code == 422
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM external_freight_items WHERE source_id='atomic'").fetchone()[0] == 0
    no_price = _record(source="no-zero", amount=None, currency=None)
    assert _import(no_price).json()["results"][0]["status"] == "active"
    with get_conn() as c:
        item = c.execute("SELECT amount,price_state FROM external_freight_items WHERE source_id='no-zero'").fetchone()
    assert item["amount"] is None and item["price_state"] == "unknown"


def test_all_filters_are_combined_currency_sort_and_cursor_are_stable():
    ids = []
    for amount in (300, 100, 200):
        record = _record(source="filters", text="Нужен тент, груз готов", amount=amount, currency="USD", body_types=["tent"], origin_country="UZ", destination_country="KZ")
        ids.append(_import(record).json()["results"][0]["id"])
    _import(_record(source="filters", text="Нужен тент, груз готов", amount=1, currency="KZT", body_types=["ref"], origin_country="UZ", destination_country="KZ"))
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    date_from = (datetime.now(timezone.utc)-timedelta(days=1)).isoformat()
    date_to = (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    params = {"origin": "таш", "destination": "алм", "origin_country": "UZ", "destination_country": "KZ", "body_type": "tent", "currency": "USD", "min_price": 100, "max_price": 300, "sort": "price_asc", "published_from": date_from, "published_to": date_to, "limit": 2}
    response = client.get("/api/v1/external-freight", params=params)
    assert response.status_code == 200, response.text
    first = response.json()
    assert [row["amount"] for row in first["items"]] == [100.0, 200.0]
    assert first["has_more"] is True
    page2 = client.get("/api/v1/external-freight", params={**params, "cursor": first["next_cursor"]}).json()
    assert [row["amount"] for row in page2["items"]] == [300.0]
    assert set(row["id"] for row in first["items"] + page2["items"]) == set(ids)
    homogeneous = client.get("/api/v1/external-freight", params={"sort": "price_desc", "body_type": "tent", "limit": 10}).json()
    assert homogeneous["price_currencies"] == ["USD"]
    assert homogeneous["sort_applied"] == "price_desc"
    assert homogeneous["sort_error"] is None
    assert [row["amount"] for row in homogeneous["items"]] == [300.0, 200.0, 100.0]
    mixed = client.get("/api/v1/external-freight", params={"sort": "price_asc", "limit": 1}).json()
    assert mixed["sort_applied"] == "newest"
    assert mixed["sort_error"] == "mixed_currency"
    assert set(mixed["price_currencies"]) == {"USD", "KZT"}
    assert mixed["has_more"] is True
    page2 = client.get("/api/v1/external-freight", params={"sort": "price_asc", "limit": 1, "cursor": mixed["next_cursor"]}).json()
    assert mixed["items"][0]["id"] != page2["items"][0]["id"]
    assert page2["sort_applied"] == "newest"


def test_cursor_snapshot_excludes_new_rows_but_keeps_replayed_rows():
    records = [_record(source="snapshot", message=str(i), text="Нужен тент, груз готов") for i in range(3)]
    for record in records:
        _import(record)
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    first = client.get("/api/v1/external-freight", params={"limit": 1}).json()
    assert first["has_more"]
    _import({**records[0], "original_text": "Нужен тент, груз готов. Обновлённый текст"})
    new_record = _record(source="snapshot-new", message="new", text="Нужен тент, груз готов")
    _import(new_record)
    second = client.get("/api/v1/external-freight", params={"limit": 1, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["source_id"] == "snapshot"
    assert second["items"][0]["source_message_id"] != first["items"][0]["source_message_id"]


def test_admin_hide_audits_and_removes_only_external_listing():
    item_id = _import(_record(source="hide" )).json()["results"][0]["id"]
    global _actor
    _actor = {"id": "operator-1", "role": "support"}
    assert client.post(f"/api/v1/external-freight/{item_id}/hide").status_code == 200
    with get_conn() as c:
        assert c.execute("SELECT status FROM external_freight_items WHERE id=?", (item_id,)).fetchone()[0] == "hidden"
        assert c.execute("SELECT COUNT(*) FROM external_freight_audit WHERE item_id=?", (item_id,)).fetchone()[0] == 2


@pytest.mark.parametrize("text,kind,status", [
    ("Нужен тент, груз готов", "cargo", "active"),
    ("Есть свободный тент, ищу груз", "vehicle", "active"),
    ("груз тент машина", None, "review"),
    ("Нужен груз. Есть свободная машина", "vehicle", "active"),
    ("Нужен груз. Свободный тент. Алматы → Ташкент", "vehicle", "active"),
    ("Нужен тент. Есть груз и свободная машина", None, "review"),
    ("Уже нашли машину", None, "closed"),
])
def test_conservative_classifier(text, kind, status):
    from services.external_freight_classifier import classify_message
    result = classify_message(text)
    assert result["kind"] == kind
    assert result["status"] == status


def test_agent_adapter_durable_retry_and_edit_are_independent_of_telegram(tmp_path, monkeypatch):
    import json
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter

    now = [1000.0]
    calls = []
    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def read(self): return json.dumps({"results": [{"id": "external-1", "result": "created"}]}).encode()
    def send(request, timeout):
        calls.append((request, timeout))
        return Response()
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    db_path = str(tmp_path / "agent-state.db")
    adapter = ExternalFreightFeedAdapter(db_path=db_path, api_url="https://qa.example", importer_key="secret", opener=send, clock=lambda: now[0])
    record = _record(source="agent", message="42")
    assert adapter.enqueue(record) is True
    assert adapter.enqueue(record) is False
    restarted = ExternalFreightFeedAdapter(db_path=db_path, api_url="https://qa.example", importer_key="secret", opener=send, clock=lambda: now[0])
    assert restarted.pending_count() == 1
    result = restarted.flush_once()
    assert result["status"] == "delivered" and result["sent"] == 1
    assert calls[0][1] == 8 and calls[0][0].full_url.endswith("/api/v1/external-freight/import")
    changed = {**record, "original_text": "Нужен тент, груз готов. Изменено"}
    assert restarted.enqueue(changed) is True
    assert restarted.pending_count() == 1


def test_agent_adapter_maps_private_queue_shape_without_forwarding_queue_fields(tmp_path, monkeypatch):
    import json
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter

    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    sent = []

    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def read(self): return json.dumps({"results": [{"id": "item-1", "result": "created"}]}).encode()

    def opener(request, timeout):
        sent.append(json.loads(request.data.decode()))
        return Response()

    adapter = ExternalFreightFeedAdapter(
        db_path=str(tmp_path / "queue-adapter.db"), api_url="https://isolated.invalid",
        importer_key="local-test-only", opener=opener,
    )
    queue_row = {
        "id": 901, "source": "reviewed-channel", "source_id": 44,
        "source_message": 771, "source_date": 1792540800,
        "text": "Нужен тент, груз готов\nХоргос → Алматы\n25 т\nЦена договорная",
        "phones": '["+7 700 123 45 67"]', "fingerprint": "private-fingerprint",
        "status": "published", "destination_message": 1901,
    }
    assert adapter.enqueue(queue_row) is True
    assert adapter.flush_once()["status"] == "delivered"
    mapped = sent[0]["records"][0]
    assert mapped["source_message_id"] == "771"
    assert mapped["origin"] == "Хоргос" and mapped["destination"] == "Алматы"
    assert mapped["price_state"] == "negotiable"
    assert mapped["contacts"] == ["+7 700 123 45 67"]
    assert mapped["source_published_at"] == "2026-10-21T00:00:00+00:00"
    assert not {"text", "phones", "fingerprint", "destination_message"}.intersection(mapped)


def test_adapter_recovers_after_server_commit_and_lost_response_without_duplicate(tmp_path, monkeypatch):
    import json
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter

    now = [5000.0]
    calls = [0]
    responses = []
    class Response:
        status = 200
        def __init__(self, body): self.body = body
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def read(self): return self.body
    def send(request, timeout):
        calls[0] += 1
        answer = client.post("/api/v1/external-freight/import", headers={"X-External-Importer-Key": "test-importer-key-only", "Content-Type": "application/json"}, content=request.data)
        responses.append((answer.status_code, answer.text))
        assert answer.status_code == 200, answer.text
        if calls[0] == 1:
            raise TimeoutError("response lost after commit")
        return Response(answer.content)
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    record = _record(source="lost-response", message="message-7", text="Нужен тент, груз готов")
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "durable.db"), api_url="https://qa.example", importer_key="server-only", opener=send, clock=lambda: now[0])
    adapter.enqueue(record)
    assert adapter.flush_once()["status"] == "retry_scheduled"
    assert responses[0][0] == 200, responses[0]
    with get_conn() as c:
        first_id = c.execute("SELECT id FROM external_freight_items WHERE source_id='lost-response'").fetchone()[0]
        assert c.execute("SELECT COUNT(*) FROM external_freight_items WHERE source_id='lost-response'").fetchone()[0] == 1
    now[0] += 5
    restarted = ExternalFreightFeedAdapter(db_path=str(tmp_path / "durable.db"), api_url="https://qa.example", importer_key="server-only", opener=send, clock=lambda: now[0])
    assert restarted.flush_once()["status"] == "delivered"
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM external_freight_items WHERE source_id='lost-response'").fetchone()[0] == 1
        assert c.execute("SELECT id FROM external_freight_items WHERE source_id='lost-response'").fetchone()[0] == first_id
    assert calls[0] == 2


def test_translation_is_disabled_without_loading_shared_ai(monkeypatch):
    import sys
    monkeypatch.setitem(sys.modules, "services.translate_service", None)
    item_id = _import(_record(source="ai-down", text="Нужен тент. 1500 KZT")).json()["results"][0]["id"]
    globals()["_actor"] = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight").json()["items"][0]["id"] == item_id
    assert client.put(f"/api/v1/external-freight/{item_id}/bookmark").status_code == 200
    for lang in ("RU", "KK", "ZH", "EN"):
        response = client.post(f"/api/v1/external-freight/{item_id}/translate", params={"target_lang": lang})
        assert response.status_code == 503
        assert response.json()["detail"]["error"] == "external_feed_translation_disabled"
    assert sys.modules["services.translate_service"] is None


def test_bookmarks_are_idempotent_private_and_role_scoped():
    global _actor
    item_id = _import(_record(text="Нужен тент, груз готов")).json()["results"][0]["id"]
    _actor = {"id": "saved-owner", "role": "driver"}
    url = f"/api/v1/external-freight/{item_id}/bookmark"
    for _ in range(2):
        assert client.put(url).json() == {"id": item_id, "saved": True}
    assert client.get("/api/v1/external-freight").json()["items"][0]["saved"] is True
    assert len(client.get("/api/v1/external-freight?saved_only=true").json()["items"]) == 1
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM external_freight_bookmarks").fetchone()[0] == 1
    _actor = {"id": "other-driver", "role": "driver"}
    assert client.get("/api/v1/external-freight?saved_only=true").json()["items"] == []
    assert client.delete(url).status_code == 200
    _actor = {"id": "shipper", "role": "client"}
    assert client.put(url).status_code == 404
    _actor = {"id": "saved-owner", "role": "driver"}
    assert len(client.get("/api/v1/external-freight?saved_only=true").json()["items"]) == 1
    assert client.delete(url).json()["saved"] is False
    assert client.delete(url).json()["saved"] is False
    assert client.get("/api/v1/external-freight?saved_only=true").json()["items"] == []
    _actor = None
    assert client.put(url).status_code == 401


def test_saved_expired_closed_and_hidden_do_not_leak_or_extend_ttl():
    global _actor
    item_id = _import(_record(text="Нужен тент, груз готов")).json()["results"][0]["id"]
    _actor = {"id": "saved-owner", "role": "driver"}
    url = f"/api/v1/external-freight/{item_id}/bookmark"
    assert client.put(url).status_code == 200
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET expires_at=? WHERE id=?", (past, item_id))
    assert client.get("/api/v1/external-freight").json()["items"] == []
    saved = client.get("/api/v1/external-freight?saved_only=true").json()["items"][0]
    assert saved["status"] == "expired" and saved["contacts"]
    assert client.get(f"/api/v1/external-freight/{item_id}").status_code == 200
    _actor = {"id": "not-saved", "role": "driver"}
    assert client.get(f"/api/v1/external-freight/{item_id}").status_code == 404
    _actor = {"id": "saved-owner", "role": "driver"}
    assert client.put(url).status_code == 200
    with get_conn() as c:
        assert c.execute("SELECT expires_at FROM external_freight_items WHERE id=?", (item_id,)).fetchone()[0] == past
        c.execute("UPDATE external_freight_items SET status='closed' WHERE id=?", (item_id,))
    assert client.get("/api/v1/external-freight?saved_only=true").json()["items"][0]["status"] == "closed"
    dal.hide_item(item_id, "operator")
    saved = client.get("/api/v1/external-freight?saved_only=true").json()["items"][0]
    assert saved == {"id": item_id, "kind": "cargo", "status": "unavailable", "saved": True}
    assert client.get(f"/api/v1/external-freight/{item_id}").status_code == 404
    assert client.post(f"/api/v1/external-freight/{item_id}/translate?target_lang=EN").status_code == 404
    assert client.delete(url).status_code == 200


@pytest.mark.parametrize("failure", [False, True])
def test_adapter_inflight_edit_survives_stale_ack_or_error(tmp_path, monkeypatch, failure):
    import json
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    record = _record(source="inflight", message="one")
    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def read(self): return json.dumps({"results": [{"id": "one", "result": "updated"}]}).encode()
    def send(request, timeout):
        adapter.enqueue({**record, "original_text": "Нужен тент. Новая версия"})
        # Другой sender не должен обогнать ещё не завершившийся запрос.
        assert adapter.flush_once()["status"] == "busy"
        if failure:
            raise TimeoutError("lost response")
        return Response()
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "inflight.db"), api_url="https://qa.example", importer_key="test", opener=send)
    adapter.enqueue(record)
    adapter.flush_once()
    assert adapter.pending_count() == 1
    with adapter._connect() as db:
        row = db.execute("SELECT * FROM selected_outbox").fetchone()
        assert row["attempts"] == 0 and row["next_attempt_at"] == 0
        assert json.loads(row["payload"])["original_text"].endswith("Новая версия")
    adapter.opener = lambda *a, **kw: Response()
    assert adapter.flush_once()["status"] == "delivered"
    assert adapter.pending_count() == 0


def test_import_read_bookmark_do_not_touch_primary_database_or_actor(monkeypatch):
    import config
    import sqlite3
    from database import db

    def snapshot():
        with sqlite3.connect(config.DB_PATH) as conn:
            return tuple(conn.iterdump())

    before = snapshot()
    def forbidden_primary_connection():
        raise AssertionError("Лента не должна открывать основную БД для хранения")
    monkeypatch.setattr(db, "get_conn", forbidden_primary_connection)
    item_id = _import(_record(source="isolated", text="Нужен тент, груз готов")).json()["results"][0]["id"]
    global _actor
    _actor = {"id": "scope-driver", "role": "driver", "profile": {"name": "Тест"}}
    actor_before = repr(_actor)
    assert client.get("/api/v1/external-freight").json()["items"][0]["id"] == item_id
    assert client.put(f"/api/v1/external-freight/{item_id}/bookmark").status_code == 200
    assert client.get("/api/v1/external-freight?saved_only=true").json()["items"][0]["id"] == item_id
    assert client.delete(f"/api/v1/external-freight/{item_id}/bookmark").status_code == 200
    assert snapshot() == before
    assert repr(_actor) == actor_before
    with get_conn() as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert tables and all(name.startswith("external_freight_") for name in tables)


def test_external_connection_rejects_primary_file_and_alias(tmp_path, monkeypatch):
    import config
    from pathlib import Path
    from database.external_freight_connection import database_path
    with monkeypatch.context() as patch:
        patch.setenv("EXTERNAL_FREIGHT_DB_PATH", config.DB_PATH)
        with pytest.raises(RuntimeError, match="must_be_separate"):
            database_path()
        alias = tmp_path / "primary-alias.sqlite3"
        alias.symlink_to(Path(config.DB_PATH).resolve())
        patch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(alias))
        with pytest.raises(RuntimeError, match="must_be_separate"):
            database_path()


def test_external_database_and_existing_wal_files_are_private(tmp_path, monkeypatch):
    path = tmp_path / "private-feed.sqlite3"
    raw = sqlite3.connect(path)
    try:
        raw.execute("PRAGMA journal_mode=WAL")
        raw.execute("CREATE TABLE sample (value TEXT)")
        raw.execute("INSERT INTO sample VALUES ('private')")
        raw.commit()
        for candidate in (path, Path(f"{path}-wal"), Path(f"{path}-shm")):
            assert candidate.exists()
            candidate.chmod(0o644)

        with monkeypatch.context() as patch:
            patch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(path))
            with get_conn() as conn:
                assert conn.execute("SELECT value FROM sample").fetchone()[0] == "private"

        for candidate in (path, Path(f"{path}-wal"), Path(f"{path}-shm")):
            assert stat.S_IMODE(candidate.stat().st_mode) == 0o600
    finally:
        raw.close()


def test_new_external_database_sidecars_are_private_with_permissive_umask(tmp_path, monkeypatch):
    path = tmp_path / "new-private-feed.sqlite3"
    previous_umask = os.umask(0o022)
    try:
        with monkeypatch.context() as patch:
            patch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(path))
            with get_conn() as conn:
                conn.execute("CREATE TABLE sample (value TEXT)")
                conn.execute("INSERT INTO sample VALUES ('private')")
                conn.commit()
                for candidate in (path, Path(f"{path}-wal"), Path(f"{path}-shm")):
                    assert candidate.exists()
                    assert stat.S_IMODE(candidate.stat().st_mode) == 0o600
    finally:
        os.umask(previous_umask)


def test_review_approval_uses_only_external_database(monkeypatch):
    from database import db
    def forbidden_main_connection(*args, **kwargs):
        pytest.fail("Лента обратилась к основной базе")
    monkeypatch.setattr(db, "get_conn", forbidden_main_connection)
    item_id = _import(_record(source="approve-isolation", text="Есть груз и свободная машина")).json()["results"][0]["id"]
    global _actor
    _actor = {"id": "operator", "role": "support"}
    assert client.post(f"/api/v1/external-freight/{item_id}/approve").status_code == 200
    assert client.post(f"/api/v1/external-freight/{item_id}/approve").status_code == 409
    with get_conn() as c:
        assert c.execute("SELECT status FROM external_freight_items WHERE id=?", (item_id,)).fetchone()[0] == "active"
        assert c.execute("SELECT COUNT(*) FROM external_freight_audit WHERE item_id=? AND action='approved'", (item_id,)).fetchone()[0] == 1


def test_count_is_authorized_role_scoped_and_excludes_inactive_and_expired(monkeypatch):
    global _actor
    assert client.get("/api/v1/external-freight/count").status_code == 401
    for index in range(3):
        _import(_record(source=f"count-{index}"))
    _import(_record(source="count-vehicle", kind="vehicle", text="Есть свободный тент, ищу груз"))
    _import(_record(source="count-review", text="Есть груз и свободная машина"))
    hidden = _import(_record(source="count-hidden")).json()["results"][0]["id"]
    _actor = {"id": "support", "role": "support"}
    client.post(f"/api/v1/external-freight/{hidden}/hide")
    expired = _import(_record(source="count-expired")).json()["results"][0]["id"]
    # Даже без запуска cleanup истёкшая active-запись не учитывается.
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET expires_at=? WHERE id=?", ((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(), expired))
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight/count?kind=vehicle&limit=1").json() == {"kind": "cargo", "count": 3}
    _actor = {"id": "client", "role": "client"}
    assert client.get("/api/v1/external-freight/count").json() == {"kind": "vehicle", "count": 1}
    _actor = {"id": "guest", "role": "guest"}
    assert client.get("/api/v1/external-freight/count").status_code == 403
    monkeypatch.setenv("EXTERNAL_FREIGHT_FEED_ENABLED", "false")
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight/count").status_code == 404


def test_count_zero_and_six_digit_count_without_cap():
    global _actor
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight/count").json()["count"] == 0
    item_id = _import(_record(source="count-large")).json()["results"][0]["id"]
    with get_conn() as c:
        c.execute("""WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<100000)
            INSERT INTO external_freight_items(id,kind,source_id,source_message_id,segment_id,source_published_at,ingested_at,updated_at,expires_at,original_text,source_revision,status)
            SELECT 'large-'||n,'cargo','large',CAST(n AS TEXT),'0',source_published_at,ingested_at,updated_at,expires_at,original_text,source_revision,'active'
            FROM numbers CROSS JOIN external_freight_items WHERE id=?""", (item_id,))
    assert client.get("/api/v1/external-freight/count").json()["count"] == 100001


def test_manual_approval_survives_identical_replay_but_changed_payload_requires_review():
    global _actor
    record = _record(source="manual-replay", text="Есть груз и свободная машина")
    item_id = _import(record).json()["results"][0]["id"]
    _actor = {"id": "operator", "role": "support"}
    assert client.post(f"/api/v1/external-freight/{item_id}/approve").status_code == 200
    with get_conn() as c:
        before = dict(c.execute("SELECT * FROM external_freight_items WHERE id=?", (item_id,)).fetchone())
    repeated = _import(record).json()["results"][0]
    assert repeated["result"] == "replayed"
    assert repeated["status"] == "active"
    with get_conn() as c:
        after = dict(c.execute("SELECT * FROM external_freight_items WHERE id=?", (item_id,)).fetchone())
    assert after["expires_at"] == before["expires_at"]
    assert after["ingested_at"] == before["ingested_at"]
    _actor = {"id": "driver", "role": "driver"}
    assert client.get("/api/v1/external-freight/count").json()["count"] == 1
    changed = _import({**record, "amount": 2500, "currency": "USD"}).json()["results"][0]
    assert changed["status"] == "review"
    assert client.get("/api/v1/external-freight/count").json()["count"] == 0


def test_permanent_422_quarantines_only_invalid_record_and_corrected_generation_delivers(tmp_path, monkeypatch):
    import urllib.error
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    calls = []
    def opener(request, timeout):
        import json
        payload = json.loads(request.data)
        calls.append(len(payload["records"]))
        response = client.post("/api/v1/external-freight/import", headers={"X-External-Importer-Key": "test-importer-key-only"}, json=payload)
        if response.status_code >= 400:
            raise urllib.error.HTTPError(request.full_url, response.status_code, "test", {}, None)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return response.content
        return Response()
    options = dict(db_path=str(tmp_path / "adapter.sqlite3"), api_url="https://qa2.urtruck.kz",
                   importer_key="test-importer-key-only", opener=opener)
    adapter = ExternalFreightFeedAdapter(**options)
    bad = _record(source="a-invalid", message="one", amount=2_000_000_000, currency="KZT")
    good = _record(source="b-valid", message="two", amount=1500, currency="KZT")
    adapter.enqueue(bad)
    adapter.enqueue(good)
    result = adapter.flush_once()
    assert result["sent"] == 1
    assert adapter.pending_count() == 0
    assert adapter.quarantined_count() == 1
    assert calls == [2, 1, 1]
    restarted = ExternalFreightFeedAdapter(**options)
    assert restarted.flush_once()["status"] == "idle"
    assert not restarted.enqueue(bad)
    assert restarted.enqueue({**bad, "amount": 2500})
    assert restarted.quarantined_count() == 0
    assert restarted.flush_once()["sent"] == 1
    assert restarted.pending_count() == 0


@pytest.mark.parametrize("failure_status", [401, 403, 429, 503])
def test_isolation_does_not_quarantine_auth_rate_or_temporary_failure(tmp_path, monkeypatch, failure_status):
    import urllib.error
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    attempts = []
    def send(request, timeout):
        attempts.append(1)
        raise urllib.error.HTTPError(request.full_url, 422 if len(attempts) == 1 else failure_status, "test", {}, None)
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "state.sqlite3"), api_url="https://qa2.urtruck.kz",
        importer_key="test", opener=send)
    adapter.enqueue(_record(source="a"))
    adapter.enqueue(_record(source="b"))
    result = adapter.flush_once()
    assert result["status"] == "retry_scheduled"
    assert result["http_status"] == failure_status
    assert result["pending"] == 2
    assert adapter.quarantined_count() == 0
    assert len(attempts) == 2


def test_stale_422_never_quarantines_corrected_inflight_generation(tmp_path, monkeypatch):
    import json
    import urllib.error
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    record = _record(source="generation", amount=2_000_000_000, currency="KZT")
    calls = []
    def send(request, timeout):
        calls.append(1)
        if len(calls) == 2:
            adapter.enqueue({**record, "amount": 1500})
        if len(calls) <= 2:
            raise urllib.error.HTTPError(request.full_url, 422, "test", {}, None)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps({"results": [{"id": "one", "result": "created"}]}).encode()
        return Response()
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "state.sqlite3"), api_url="https://qa2.urtruck.kz",
        importer_key="test", opener=send)
    adapter.enqueue(record)
    assert adapter.flush_once()["pending"] == 1
    assert adapter.quarantined_count() == 0
    assert adapter.flush_once()["sent"] == 1


def test_full_invalid_batch_cannot_starve_following_valid_record(tmp_path, monkeypatch):
    import json
    import urllib.error
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    def send(request, timeout):
        records = json.loads(request.data)["records"]
        if any(r.get("amount", 0) > 1_000_000_000 for r in records):
            raise urllib.error.HTTPError(request.full_url, 422, "test", {}, None)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps({"results": [{"id": r["source_id"], "result": "created"} for r in records]}).encode()
        return Response()
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "state.sqlite3"), api_url="https://qa2.urtruck.kz",
        importer_key="test", opener=send)
    for index in range(50):
        adapter.enqueue(_record(source=f"a-invalid-{index:02}", amount=2_000_000_000, currency="KZT"))
    adapter.enqueue(_record(source="z-valid", amount=1500, currency="KZT"))
    first = adapter.flush_once()
    assert first["sent"] == 0
    assert first["quarantined"] == 50
    assert first["pending"] == 1
    assert adapter.flush_once()["sent"] == 1
    assert adapter.pending_count() == 0


def test_bridge_edit_and_close_reach_real_importer_without_extending_ttl(tmp_path, monkeypatch):
    import hashlib
    import sqlite3
    import urllib.error
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    from services.external_freight_queue_bridge import PublishedQueueBridge
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    source = tmp_path / "published.sqlite3"
    published = (datetime.now(timezone.utc)-timedelta(hours=6)).timestamp()
    with sqlite3.connect(source) as c:
        c.execute("CREATE TABLE queue(id INTEGER PRIMARY KEY,source_id TEXT,source_message INTEGER,source_date REAL,text TEXT,phones TEXT,status TEXT,destination_message INTEGER)")
        c.execute("INSERT INTO queue VALUES(1,'vehicle',1,?,?,'[]','published',1)", (published, "Алматы → Ташкент\nЕсть свободный тент, ищу груз"))
    def send(request, timeout):
        response = client.post("/api/v1/external-freight/import",
            headers={"X-External-Importer-Key": "test-importer-key-only", "Content-Type": "application/json"}, content=request.data)
        if response.status_code != 200:
            raise urllib.error.HTTPError(request.full_url, response.status_code, "test", {}, None)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return response.content
        return Response()
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "bridge.sqlite3"),
        api_url="https://qa2.urtruck.kz", importer_key="test-importer-key-only", opener=send)
    def run():
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        result = PublishedQueueBridge(source, adapter).run_once()
        assert hashlib.sha256(source.read_bytes()).hexdigest() == before
        assert result["sent"] == 1
    run()
    with get_conn() as c:
        before = dict(c.execute("SELECT * FROM external_freight_items").fetchone())
    assert before["kind"] == "vehicle"
    with sqlite3.connect(source) as c:
        c.execute("UPDATE queue SET text=text || '\nЦена 1500 USD',source_date=source_date+3600")
    run()
    with get_conn() as c:
        edited = dict(c.execute("SELECT * FROM external_freight_items").fetchone())
    assert edited["id"] == before["id"]
    assert edited["amount"] == 1500
    assert edited["expires_at"] == before["expires_at"]
    assert edited["source_published_at"] == before["source_published_at"]
    with sqlite3.connect(source) as c:
        c.execute("UPDATE queue SET text='Уже нашли машину'")
    run()
    with get_conn() as c:
        closed = dict(c.execute("SELECT * FROM external_freight_items").fetchone())
    assert closed["status"] == "closed"
    assert closed["kind"] == "vehicle"
    assert closed["id"] == before["id"]
    assert closed["expires_at"] == before["expires_at"]
    global _actor
    _actor = {"id": "client", "role": "client"}
    assert client.get("/api/v1/external-freight/count").json()["count"] == 0


@pytest.mark.parametrize("partial_quarantine_column", [False, True])
def test_adapter_schema_upgrade_preserves_legacy_pending_payload(tmp_path, partial_quarantine_column):
    import json
    import sqlite3
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    state = tmp_path / "legacy.sqlite3"
    payload = json.dumps(_record(source="legacy-state", message="one"))
    with sqlite3.connect(state) as c:
        c.execute("""CREATE TABLE selected_outbox(source_id TEXT,source_message_id TEXT,segment_id TEXT,
            payload TEXT,attempts INTEGER DEFAULT 0,next_attempt_at REAL DEFAULT 0,
            delivered_at REAL,last_http_status INTEGER,PRIMARY KEY(source_id,source_message_id,segment_id))""")
        c.execute("INSERT INTO selected_outbox(source_id,source_message_id,segment_id,payload) VALUES('legacy-state','one','0',?)", (payload,))
        if partial_quarantine_column:
            c.execute("ALTER TABLE selected_outbox ADD COLUMN quarantined_at TEXT")
    adapter = ExternalFreightFeedAdapter(db_path=str(state), api_url="https://qa2.urtruck.kz", importer_key="test")
    assert adapter.pending_count() == 1
    with adapter._connect() as c:
        row = c.execute("SELECT * FROM selected_outbox").fetchone()
        assert row["payload"] == payload
        assert row["generation"] == 1
        assert row["quarantined_at"] is None and row["quarantine_reason"] is None


def test_isolation_time_budget_preserves_unexamined_rows_for_retry(tmp_path, monkeypatch):
    import time
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "budget.sqlite3"),
        api_url="https://qa2.urtruck.kz", importer_key="test", clock=lambda: 1000,
        opener=lambda *args, **kwargs: pytest.fail("После истечения бюджета сеть не вызывается"))
    adapter.enqueue(_record(source="budget"))
    with adapter._connect() as c:
        rows = c.execute("SELECT * FROM selected_outbox").fetchall()
    result = adapter._isolate_validation_errors(rows, 1000, time.monotonic()-1)
    assert result["status"] == "retry_scheduled"
    assert result["pending"] == 1
    assert adapter.quarantined_count() == 0
    with adapter._connect() as c:
        row = c.execute("SELECT * FROM selected_outbox").fetchone()
        assert row["next_attempt_at"] == 1005 and row["attempts"] == 1


def test_condition_edits_do_not_close_listing_but_explicit_closure_does():
    global _actor
    _actor = {"id": "driver-test", "role": "driver"}
    from services.external_freight_parser import map_selected_message
    raw = _record(source='closure-context', message='one', text='Нужен тент, груз готов\nАлматы → Москва')
    def send(text):
        mapped = map_selected_message({**raw, 'original_text': text})
        response = _import(mapped)
        assert response.status_code == 200
        return response.json()['results'][0]
    original = send(raw['original_text'])
    for condition in ['Кузов закрытый, тент', 'Граница закрыта до 25.10, погрузка 26.10']:
        updated = send(raw['original_text'] + '\n' + condition)
        assert updated['id'] == original['id']
        assert updated['status'] == 'active'
        assert client.get('/api/v1/external-freight/count').json()['count'] == 1
    closed = send(raw['original_text'] + '\nСтатус: закрыто')
    assert closed['id'] == original['id']
    assert closed['status'] == 'closed'
    assert client.get('/api/v1/external-freight/count').json()['count'] == 0


def test_import_and_read_preserve_explicit_jpy_without_currency_conversion():
    global _actor
    _actor = {"id": "driver-test", "role": "driver"}
    from services.external_freight_parser import map_selected_message
    text = 'Токио → Осака\nИщу машину для перевозки\nГруз: оборудование\nЦена 2000 ¥ (JPY)'
    record = map_selected_message(_record(source='explicit-jpy', text=text))
    response = _import(record)
    assert response.status_code == 200
    item_id = response.json()['results'][0]['id']
    read = client.get(f'/api/v1/external-freight/{item_id}')
    assert read.status_code == 200
    item = read.json()['item']
    assert (item['amount'], item['currency'], item['original_text']) == (2000, 'JPY', text)


def test_continuous_source_to_api_both_roles_without_telegram_publication(tmp_path, monkeypatch):
    """Полная цепочка на синтетической БД; не является живой приёмкой QA2."""
    import importlib.util
    import json
    from pathlib import Path
    from services.external_freight_queue_bridge import IncomingQueueBridge
    from services.external_freight_import_adapter import ExternalFreightFeedAdapter
    script=next(parent/'ops/telegram-feed/feed.py' for parent in Path(__file__).parents if (parent/'ops/telegram-feed/feed.py').exists())
    spec=importlib.util.spec_from_file_location('integration_collector',script)
    collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
    source=tmp_path/'source.sqlite3';db=collector.database(source)
    published=collector.utcnow()
    collector.capture_for_app(db,'test_channel',98765,1,'Алматы → Москва\nНужна машина\nГруз: шины',published)
    collector.capture_for_app(db,'test_channel',98765,2,'Астана → Бишкек\nЕсть свободная машина',published)
    monkeypatch.setenv('EXTERNAL_FREIGHT_IMPORT_ENABLED','true')
    def opener(request,timeout):
        response=client.post('/api/v1/external-freight/import',headers={'X-External-Importer-Key':'test-importer-key-only'},json=json.loads(request.data))
        class Response:
            status=response.status_code
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return response.content
        return Response()
    adapter=ExternalFreightFeedAdapter(db_path=str(tmp_path/'adapter.sqlite3'),api_url='https://qa2.urtruck.kz',importer_key='test-importer-key-only',opener=opener)
    assert IncomingQueueBridge(source,adapter).run_once()['sent']==2
    global _actor
    for role,kind in [('driver','cargo'),('client','vehicle')]:
        _actor={'id':'actor-'+role,'role':role}
        rows=client.get('/api/v1/external-freight').json()['items']
        assert len(rows)==1 and rows[0]['kind']==kind and rows[0]['contacts']==[]
        assert rows[0]['price_state']=='unknown'
    assert IncomingQueueBridge(source,adapter).run_once()['sent']==0
    assert db.execute('select count(*) from queue').fetchone()[0]==0


def test_explicit_partial_vehicle_location_is_visible_to_shipper_without_phone_or_price():
    from services.external_freight_parser import map_selected_message
    record=map_selected_message({'source_id':'tg-free-location','source_message':1,
        'source_date':datetime.now(timezone.utc).timestamp(),
        'text':'Свободный Реф в Маньчжурии , готов к погрузке. Рассмотрю варианты за Урал в сторону Запада.'})
    response=_import(record)
    assert response.status_code==200
    result=response.json()['results'][0]
    assert result['status']=='active'
    global _actor
    _actor={'id':'partial-shipper','role':'client'}
    item=client.get('/api/v1/external-freight').json()['items'][0]
    assert item['id']==result['id'] and item['kind']=='vehicle'
    assert item['origin']=='Маньчжурии' and item['destination'] is None
    assert item['price_state']=='unknown' and item['contacts']==[]
    assert _import(record).json()['results'][0]['result']=='replayed'
    _actor={'id':'partial-driver','role':'driver'}
    assert client.get('/api/v1/external-freight').json()['items']==[]
