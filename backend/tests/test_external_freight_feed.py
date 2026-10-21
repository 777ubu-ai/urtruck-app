"""Контракт отдельной внешней ленты на общей изолированной тестовой БД."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import external_freight
from api.verification_gate import require_admin
from database import external_freight_dal as dal
from database.db import get_conn

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
def _feed_setup(monkeypatch):
    global _actor
    _actor = None
    monkeypatch.setenv("EXTERNAL_FREIGHT_FEED_ENABLED", "true")
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORTER_KEY", "test-importer-key-only")
    dal.init_schema()
    yield
    with get_conn() as c:
        c.execute("DELETE FROM external_freight_bookmarks")
        c.execute("DELETE FROM external_freight_translations")
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


def test_replay_and_edit_preserve_original_expiry_and_identity():
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
    assert row["expires_at"] == before
    assert row["ingested_at"] == before_ingested_at
    assert row["source_revision"] != before_revision
    assert second["result"] == "replayed" and third["result"] == "updated"


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
    assert client.get("/api/v1/external-freight", params={"sort": "price_asc"}).status_code == 422


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


def test_translation_is_explicit_cached_per_revision_and_preserves_numbers(monkeypatch):
    import api.external_freight as api_module
    item_id = _import(_record(source="translation", text="Нужен тент. 1500 KZT, +7 777 000 00 00")).json()["results"][0]["id"]
    _actor = {"id": "driver", "role": "driver"}
    # TestClient runs requests on its own thread; route dependencies use the
    # process-shared test actor declared above.
    globals()["_actor"] = _actor
    calls = []
    monkeypatch.setattr(api_module, "_translate_preserving_tokens", lambda text, lang: calls.append((text, lang)) or text.replace("Нужен", "Need"))
    first = client.post(f"/api/v1/external-freight/{item_id}/translate", params={"target_lang": "EN"})
    second = client.post(f"/api/v1/external-freight/{item_id}/translate", params={"target_lang": "EN"})
    assert first.status_code == 200 and second.status_code == 200
    assert len(calls) == 1 and second.json()["cached"] is True
    assert "1500" in first.json()["translated_text"] and "+7 777 000 00 00" in first.json()["translated_text"]
    assert client.post(f"/api/v1/external-freight/{item_id}/translate", params={"target_lang": "FR"}).status_code == 422


def test_translation_token_guard_rejects_changed_number(monkeypatch):
    import services.translate_service as translate_service
    # The route's validator compares protected-token sequences after sentinel
    # restoration; this focused regression proves the sentinel contract.
    from api.external_freight import _translate_preserving_tokens
    monkeypatch.setattr(translate_service, "translate_text", lambda text, lang: {"translated_text": text.replace("UTMARKER0000X", "")})
    with pytest.raises(translate_service.TranslationError):
        _translate_preserving_tokens("1500 KZT", "en")


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
