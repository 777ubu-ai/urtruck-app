"""Отдельная QA2-доставка уже опубликованной очереди агента.

Источник открывается read-only. Telegram worker, его очередь/статусы не меняются.
Запускать oneshot таймером раз в минуту; секрет только в EnvironmentFile.
"""
import fcntl
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse

from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from services.external_freight_parser import map_selected_message

ACTIVE_SECONDS = 120 * 3600
MAX_SCAN = 50


def validate_qa_target(api_url):
    parsed = urlparse(api_url)
    if (parsed.scheme != "https" or parsed.hostname != "qa2.urtruck.kz"
            or parsed.port is not None or parsed.username or parsed.password
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
        raise ValueError("qa2_target_required")


class PublishedQueueBridge:
    def __init__(self, source_path, adapter):
        self.source_path = Path(source_path).resolve()
        self.adapter = adapter
        if self.source_path == Path(adapter.db_path).resolve():
            raise ValueError("separate_state_required")
        validate_qa_target(adapter.api_url)
        with adapter._connect() as state:
            state.execute("""CREATE TABLE IF NOT EXISTS published_bridge_seen (
                destination_message INTEGER PRIMARY KEY)""")
            state.execute("""CREATE TABLE IF NOT EXISTS published_bridge_rejections (
                destination_message INTEGER PRIMARY KEY, reason TEXT NOT NULL)""")

    def run_once(self):
        if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "").lower() not in {"1", "true", "yes"}:
            return {"status": "disabled", "scanned": 0}
        if not self.adapter.importer_key:
            return {"status": "not_configured", "scanned": 0}
        with open(self.adapter.db_path + ".bridge.lock", "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return {"status": "busy", "scanned": 0}
            try:
                return self._run_locked()
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def _run_locked(self):
        now = self.adapter.clock()
        # Seen identities rather than a high-water cursor also cover delayed
        # reconciliation of a previously uncertain Telegram publication.
        with closing(sqlite3.connect(self.source_path.as_uri() + "?mode=ro", uri=True, timeout=2)) as source:
            source.row_factory = sqlite3.Row
            source.execute("ATTACH DATABASE ? AS bridge_state",
                           (Path(self.adapter.db_path).resolve().as_uri() + "?mode=ro",))
            rows = source.execute("""SELECT q.* FROM queue q
                WHERE status='published' AND destination_message>0
                AND source_date>=? AND source_date<=?
                AND NOT EXISTS (SELECT 1 FROM bridge_state.published_bridge_seen s
                                WHERE s.destination_message=q.destination_message)
                ORDER BY destination_message,id LIMIT ?""",
                (now - ACTIVE_SECONDS, now + 300, MAX_SCAN)).fetchall()
        enqueued = rejected = review = 0
        for row in rows:
            try:
                record = map_selected_message(dict(row))
                # Не показываем пустой маршрут в автоматически принятой карточке.
                if not record.get("origin") or not record.get("destination"):
                    record["status"] = "review"
                    record["classification_status"] = "review"
                review += record["status"] == "review"
                enqueued += bool(self.adapter.enqueue(record))
            except (ValueError, TypeError, OverflowError):
                rejected += 1
                with self.adapter._connect() as state:
                    state.execute("INSERT OR REPLACE INTO published_bridge_rejections VALUES(?,?)",
                                  (row["destination_message"], "invalid_source_record"))
            # Durable enqueue precedes acknowledgement: interrupted runs replay.
            with self.adapter._connect() as state:
                state.execute("INSERT OR IGNORE INTO published_bridge_seen VALUES(?)",
                              (row["destination_message"],))
        delivery = self.adapter.flush_once()
        return {"status": delivery["status"], "scanned": len(rows), "enqueued": enqueued,
                "review": review, "rejected": rejected, "sent": delivery.get("sent", 0),
                "pending": delivery.get("pending", self.adapter.pending_count())}


def main():
    if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "").lower() not in {"1", "true", "yes"}:
        print(json.dumps({"status": "disabled"}))
        return 0
    source = os.getenv("EXTERNAL_FREIGHT_SOURCE_DB", "")
    state = os.getenv("EXTERNAL_FREIGHT_ADAPTER_DB", "")
    if not source or not state:
        raise ValueError("explicit_source_and_state_required")
    os.umask(0o077)
    # Никаких ключей/контактов/текстов в аргументах процесса или stdout.
    result = PublishedQueueBridge(source, ExternalFreightFeedAdapter()).run_once()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] in {"delivered", "idle", "busy", "disabled"} else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, sqlite3.Error):
        print(json.dumps({"status": "bridge_configuration_or_source_error"}))
        raise SystemExit(1)
