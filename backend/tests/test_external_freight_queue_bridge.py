import hashlib
import json
import sqlite3

import pytest

from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from services.external_freight_queue_bridge import PublishedQueueBridge, validate_qa_target

NOW = 1792576800


@pytest.fixture
def bridge(tmp_path, monkeypatch):
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    source = tmp_path / "source.sqlite3"
    with sqlite3.connect(source) as db:
        db.execute("""CREATE TABLE queue(id INTEGER PRIMARY KEY, source_id TEXT,
            source_message INTEGER, source_date REAL, text TEXT, phones TEXT,
            status TEXT, destination_message INTEGER)""")
    calls = []
    def opener(request, timeout):
        records = json.loads(request.data)["records"]
        calls.extend(records)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self):
                return json.dumps({"results": [{"id": str(i), "result": "created"}
                                              for i in range(1, len(records) + 1)]}).encode()
        return Response()
    adapter = ExternalFreightFeedAdapter(db_path=str(tmp_path / "state.sqlite3"),
        api_url="https://qa2.urtruck.kz", importer_key="test-only",
        opener=opener, clock=lambda: NOW)
    return PublishedQueueBridge(source, adapter), calls


def add(bridge, ident=1, status="published", date=NOW, text=None, destination=None):
    with sqlite3.connect(bridge.source_path) as db:
        db.execute("INSERT INTO queue VALUES(?,?,?,?,?,?,?,?)",
            (ident, "test-source", ident, date,
             text or "Алашанькоу → Ташкент\nНужен тент 22 т\nГруз готов",
             "[]", status, destination if destination is not None else ident))


def test_only_published_and_fresh_without_source_mutation(bridge):
    worker, calls = bridge
    for i, status in enumerate(["published", "queued", "sending", "rejected", "uncertain"], 1):
        add(worker, i, status)
    add(worker, 6, date=NOW - 120 * 3600 - 1)
    add(worker, 7, date=NOW + 301)
    before = hashlib.sha256(worker.source_path.read_bytes()).hexdigest()
    result = worker.run_once()
    assert result["scanned"] == result["sent"] == 1
    assert len(calls) == 1
    assert hashlib.sha256(worker.source_path.read_bytes()).hexdigest() == before


def test_replay_and_late_publication_reconciliation(bridge):
    worker, calls = bridge
    add(worker, 1, status="uncertain", destination=10)
    add(worker, 2, destination=20)
    assert worker.run_once()["sent"] == 1
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET status='published' WHERE id=1")
    assert worker.run_once()["sent"] == 1
    assert worker.run_once()["scanned"] == 0
    assert len(calls) == 2
    assert {r["source_message_id"] for r in calls} == {"1", "2"}


def test_network_failure_survives_new_worker_and_preserves_payload(bridge):
    worker, calls = bridge
    add(worker)
    original_opener = worker.adapter.opener
    worker.adapter.opener = lambda *args, **kwargs: (_ for _ in ()).throw(OSError("offline"))
    assert worker.run_once()["status"] == "retry_scheduled"
    assert worker.adapter.pending_count() == 1
    worker.adapter.opener = original_opener
    worker.adapter.clock = lambda: NOW + 61
    resumed = PublishedQueueBridge(worker.source_path, worker.adapter)
    result = resumed.run_once()
    assert result["scanned"] == 0
    assert result["sent"] == 1
    assert worker.adapter.pending_count() == 0
    assert calls[0]["source_published_at"] == "2026-10-21T10:00:00+00:00"


def test_missing_route_is_review(bridge):
    worker, calls = bridge
    add(worker, text="Нужен тент 22 тонны. Груз готов")
    assert worker.run_once()["review"] == 1
    assert calls[0]["status"] == "review"


def test_disabled_or_missing_key_does_not_deliver(bridge, monkeypatch):
    worker, calls = bridge
    add(worker)
    monkeypatch.delenv("EXTERNAL_FREIGHT_IMPORT_ENABLED")
    assert worker.run_once()["status"] == "disabled"
    monkeypatch.setenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "true")
    worker.adapter.importer_key = ""
    assert worker.run_once()["status"] == "not_configured"
    assert calls == []


@pytest.mark.parametrize("url", [
    "https://urtruck.kz", "http://qa2.urtruck.kz", "https://qa2.urtruck.kz.evil.test",
    "https://user:pass@qa2.urtruck.kz", "https://qa2.urtruck.kz/path",
    "https://qa2.urtruck.kz?redirect=production",
])
def test_production_and_other_destinations_rejected(url):
    with pytest.raises(ValueError):
        validate_qa_target(url)


def test_bad_source_record_does_not_block_following_record(bridge):
    worker, calls = bridge
    add(worker, 1, text="x" * 31000)
    add(worker, 2)
    result = worker.run_once()
    assert result["rejected"] == 1
    assert result["sent"] == 1
    assert worker.run_once()["scanned"] == 0
