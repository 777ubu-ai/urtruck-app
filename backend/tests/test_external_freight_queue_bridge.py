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


def test_delivered_source_edit_and_closure_are_replayed_after_restart(bridge):
    worker, calls = bridge
    add(worker)
    assert worker.run_once()["sent"] == 1
    published_at = calls[-1]["source_published_at"]
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET text=text || '\nЦена 5800 USD', phones=? WHERE id=1", ('["+77770000001"]',))
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["sent"] == 1
    assert calls[-1]["amount"] == 5800
    assert calls[-1]["contacts"] == ["+77770000001"]
    assert calls[-1]["source_published_at"] == published_at
    assert worker.run_once()["scanned"] == 0
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET text='Уже нашли машину' WHERE id=1")
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["sent"] == 1
    assert calls[-1]["status"] == "closed"
    assert calls[-1]["source_published_at"] == published_at
    assert worker.run_once()["scanned"] == 0


def test_contact_only_edit_is_replayed_and_legacy_seen_schema_migrates(bridge):
    worker, calls = bridge
    add(worker)
    # Старая схема без ревизий сохраняется; уже seen надо пересверить один раз.
    with worker.adapter._connect() as db:
        db.execute("DROP TABLE published_bridge_seen")
        db.execute("CREATE TABLE published_bridge_seen(destination_message INTEGER PRIMARY KEY)")
        db.execute("INSERT INTO published_bridge_seen VALUES(1)")
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["sent"] == 1
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET phones=? WHERE id=1", ('["+77770000002"]',))
    assert worker.run_once()["sent"] == 1
    assert calls[-1]["contacts"] == ["+77770000002"]
    assert worker.run_once()["scanned"] == 0


@pytest.mark.parametrize("invalid_first", [False, True])
def test_colliding_destination_numbers_do_not_starve_later_batches(bridge, invalid_first):
    worker, calls = bridge
    # Разные исходные каналы могут иметь одинаковые номера публикаций.
    for ident in range(1, 62):
        add(worker, ident, destination=1,
            text="x" * 31000 if invalid_first and ident == 1 else None)
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET source_id='source-' || id, source_message=1")
    before = hashlib.sha256(worker.source_path.read_bytes()).hexdigest()
    assert worker.run_once()["scanned"] == 50
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["scanned"] == 11
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["scanned"] == 0
    assert len(calls) == 61 - int(invalid_first)
    assert len({r["source_id"] for r in calls}) == len(calls)
    assert hashlib.sha256(worker.source_path.read_bytes()).hexdigest() == before


def test_edit_of_one_colliding_row_does_not_replay_its_neighbour(bridge):
    worker, calls = bridge
    add(worker, 1, destination=7)
    add(worker, 2, destination=7)
    assert worker.run_once()["sent"] == 2
    assert worker.run_once()["scanned"] == 0
    with sqlite3.connect(worker.source_path) as db:
        db.execute("UPDATE queue SET text=text || '\nЦена 5800 USD' WHERE id=1")
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    assert worker.run_once()["scanned"] == 1
    assert calls[-1]["source_message_id"] == "1"
    assert calls[-1]["amount"] == 5800
    assert worker.run_once()["scanned"] == 0



def test_v2_upgrade_preserves_legacy_state_and_pending_delivery(bridge):
    worker, calls = bridge
    add(worker, 1, destination=7)
    add(worker, 2, destination=7)
    opener = worker.adapter.opener
    worker.adapter.opener = lambda *a, **kw: (_ for _ in ()).throw(OSError("offline"))
    assert worker.run_once()["status"] == "retry_scheduled"
    assert worker.adapter.pending_count() == 2
    with worker.adapter._connect() as db:
        # Состояние предыдущего моста: одна неоднозначная отметка и durable retry.
        db.execute("DROP TABLE published_bridge_seen_v2")
        db.execute("DROP TABLE published_bridge_rejections_v2")
        db.execute("INSERT OR REPLACE INTO published_bridge_seen VALUES(?,?)", (7, "legacy-revision"))
        db.execute("INSERT OR REPLACE INTO published_bridge_rejections VALUES(?,?)", (7, "legacy-rejection"))
        before = [tuple(r) for r in db.execute("SELECT * FROM selected_outbox ORDER BY source_message_id")]
    worker = PublishedQueueBridge(worker.source_path, worker.adapter)
    with worker.adapter._connect() as db:
        assert [tuple(r) for r in db.execute("SELECT * FROM selected_outbox ORDER BY source_message_id")] == before
        assert tuple(db.execute("SELECT * FROM published_bridge_seen").fetchone()) == (7, "legacy-revision")
        assert tuple(db.execute("SELECT * FROM published_bridge_rejections").fetchone()) == (7, "legacy-rejection")
    worker.adapter.opener = opener
    worker.adapter.clock = lambda: NOW + 61
    result = worker.run_once()
    assert result["scanned"] == result["sent"] == 2
    assert len(calls) == 2
    assert worker.adapter.pending_count() == 0
    assert worker.run_once()["scanned"] == 0
