"""Запрос первой страницы не должен ждать служебный подсчёт валют."""
from contextlib import contextmanager

from database import external_freight_dal as dal


def _records():
    return [
        {
            "id": "feed-query-a",
            "kind": "cargo",
            "source_id": "feed-query-test",
            "source_message_id": "a",
            "source_revision": "1",
            "classification_status": "approved",
            "original_text": "Груз Алматы — Астана",
            "source_published_at": "2026-11-27T00:00:00+00:00",
            "status": "active",
            "amount": 1000,
            "currency": "KZT",
            "price_state": "known",
        },
        {
            "id": "feed-query-b",
            "kind": "cargo",
            "source_id": "feed-query-test",
            "source_message_id": "b",
            "source_revision": "1",
            "classification_status": "approved",
            "original_text": "Груз Шымкент — Алматы",
            "source_published_at": "2026-11-27T00:01:00+00:00",
            "status": "active",
            "amount": 2000,
            "currency": "KZT",
            "price_state": "known",
        },
    ]


def _track_queries(monkeypatch):
    original_get_conn = dal.get_conn
    statements = []

    class ConnectionProxy:
        def __init__(self, connection):
            self._connection = connection

        def execute(self, sql, params=()):
            statements.append(sql)
            return self._connection.execute(sql, params)

        def __getattr__(self, name):
            return getattr(self._connection, name)

    @contextmanager
    def tracked_get_conn():
        with original_get_conn() as connection:
            yield ConnectionProxy(connection)

    monkeypatch.setattr(dal, "get_conn", tracked_get_conn)
    return statements


def test_newest_first_page_uses_publication_index_and_skips_currency_scan(monkeypatch, tmp_path):
    monkeypatch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(tmp_path / "external.sqlite3"))
    dal.init_schema()
    dal.import_records(_records())
    statements = _track_queries(monkeypatch)

    result = dal.list_items(kind="cargo", limit=1)

    page_queries = [sql for sql in statements if sql.startswith("SELECT * FROM external_freight_items")]
    assert len(page_queries) == 1
    assert "INDEXED BY ix_external_freight_publication" in page_queries[0]
    assert not any("SELECT DISTINCT currency" in sql for sql in statements)
    assert [item["id"] for item in result["items"]] == ["feed-query-b"]
    assert result["has_more"] is True
    assert result["price_currencies"] == []


def test_price_sort_still_checks_currency_and_keeps_price_order(monkeypatch, tmp_path):
    monkeypatch.setenv("EXTERNAL_FREIGHT_DB_PATH", str(tmp_path / "external.sqlite3"))
    dal.init_schema()
    dal.import_records(_records())
    statements = _track_queries(monkeypatch)

    result = dal.list_items(kind="cargo", sort="price_asc", limit=2)

    assert any("SELECT DISTINCT currency" in sql for sql in statements)
    assert [item["id"] for item in result["items"]] == ["feed-query-a", "feed-query-b"]
    assert result["price_currencies"] == ["KZT"]
    assert result["price_sort_available"] is True
