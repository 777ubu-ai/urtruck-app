"""Независимый durable-адаптер отобранной очереди Telegram-агента.

Этот модуль не импортирует Telegram и не меняет его публикацию. Агент может
передать только уже отобранные записи через enqueue(); worker запускается
отдельно и выключен, пока EXTERNAL_FREIGHT_IMPORT_ENABLED не включён.
"""
import json
import os
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MAX_BATCH = 50
MAX_BACKOFF_SECONDS = 900


class ExternalFreightFeedAdapter:
    def __init__(self, *, db_path=None, api_url=None, importer_key=None, opener=None, clock=None):
        self.db_path = db_path or os.getenv("EXTERNAL_FREIGHT_ADAPTER_DB", "/var/lib/urtruck/external-freight-adapter.sqlite3")
        self.api_url = (api_url or os.getenv("EXTERNAL_FREIGHT_API_URL", "")).rstrip("/")
        self.importer_key = importer_key if importer_key is not None else os.getenv("EXTERNAL_FREIGHT_IMPORTER_KEY", "")
        self.opener = opener or urllib.request.urlopen
        self.clock = clock or time.time
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS selected_outbox (
              source_id TEXT NOT NULL, source_message_id TEXT NOT NULL, segment_id TEXT NOT NULL,
              payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at REAL NOT NULL DEFAULT 0,
              delivered_at REAL, last_http_status INTEGER, PRIMARY KEY(source_id,source_message_id,segment_id)
            )""")
            columns = {row["name"] for row in db.execute("PRAGMA table_info(selected_outbox)")}
            if "generation" not in columns:
                db.execute("ALTER TABLE selected_outbox ADD COLUMN generation INTEGER NOT NULL DEFAULT 1")
            db.execute("CREATE INDEX IF NOT EXISTS ix_selected_outbox_due ON selected_outbox(delivered_at,next_attempt_at)")

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=5.0)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=5000")
        return db

    @staticmethod
    def _identity(record):
        for key in ("source_id", "source_message_id"):
            if not str(record.get(key) or "").strip():
                raise ValueError("source_identity_required")
        return str(record["source_id"])[:120], str(record["source_message_id"])[:160], str(record.get("segment_id") or "0")[:80]

    def enqueue(self, selected_record):
        """Durable insert/upsert of the agent's already-selected result."""
        record = dict(selected_record)
        identity = self._identity(record)
        encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 30000:
            raise ValueError("record_too_large")
        with self._connect() as db:
            existing = db.execute("SELECT payload,delivered_at FROM selected_outbox WHERE source_id=? AND source_message_id=? AND segment_id=?", identity).fetchone()
            if existing and existing["payload"] == encoded:
                return False
            if existing:
                db.execute("UPDATE selected_outbox SET payload=?,generation=generation+1,attempts=0,next_attempt_at=0,delivered_at=NULL,last_http_status=NULL WHERE source_id=? AND source_message_id=? AND segment_id=?", (encoded, *identity))
            else:
                db.execute("INSERT INTO selected_outbox(source_id,source_message_id,segment_id,payload) VALUES(?,?,?,?)", (*identity, encoded))
        return True

    def pending_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE delivered_at IS NULL").fetchone()[0]

    def flush_once(self):
        # Один отправитель на durable outbox, включая разные процессы.
        # enqueue не блокируется: новая версия останется pending до своего ACK.
        import fcntl
        with open(self.db_path + '.flush.lock', 'a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return {'status': 'busy', 'sent': 0, 'pending': self.pending_count()}
            try:
                return self._flush_locked()
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def _flush_locked(self):
        if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "false").lower() not in {"1", "true", "yes"}:
            return {"status": "disabled", "sent": 0, "pending": self.pending_count()}
        if not self.api_url or not self.importer_key:
            return {"status": "not_configured", "sent": 0, "pending": self.pending_count()}
        now = self.clock()
        with self._connect() as db:
            rows = db.execute("SELECT * FROM selected_outbox WHERE delivered_at IS NULL AND next_attempt_at<=? ORDER BY source_id,source_message_id,segment_id LIMIT ?", (now, MAX_BATCH)).fetchall()
        if not rows:
            return {"status": "idle", "sent": 0, "pending": self.pending_count()}
        payload = json.dumps({"records": [json.loads(row["payload"]) for row in rows]}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{self.api_url}/api/v1/external-freight/import", data=payload, method="POST",
            headers={"Content-Type": "application/json", "X-External-Importer-Key": self.importer_key},
        )
        try:
            with self.opener(req, timeout=8) as response:
                status = int(getattr(response, "status", 200))
                body = json.loads(response.read().decode("utf-8"))
            if not 200 <= status < 300 or len(body.get("results", [])) != len(rows):
                raise urllib.error.HTTPError(req.full_url, status, "unexpected_import_response", {}, None)
            # The import endpoint is idempotent; only ack the exact keys returned
            # after validating that every row has an ID/result.
            if not all(item.get("id") and item.get("result") in {"created", "updated", "replayed"} for item in body["results"]):
                raise ValueError("invalid_import_ack")
            with self._connect() as db:
                for row in rows:
                    db.execute("UPDATE selected_outbox SET delivered_at=?,last_http_status=? WHERE source_id=? AND source_message_id=? AND segment_id=? AND delivered_at IS NULL AND generation=?", (datetime.fromtimestamp(now, timezone.utc).isoformat(), status, row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))
            return {"status": "delivered", "sent": len(rows), "pending": self.pending_count(), "http_status": status}
        except Exception as exc:
            status = getattr(exc, "code", None)
            with self._connect() as db:
                for row in rows:
                    attempts = row["attempts"] + 1
                    delay = min(5 * (2 ** min(attempts - 1, 8)), MAX_BACKOFF_SECONDS)
                    db.execute("UPDATE selected_outbox SET attempts=?,next_attempt_at=?,last_http_status=? WHERE source_id=? AND source_message_id=? AND segment_id=? AND delivered_at IS NULL AND generation=?", (attempts, now + delay, status, row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))
            return {"status": "retry_scheduled", "sent": 0, "pending": self.pending_count(), "retry_after_seconds": min(5 * (2 ** min(max((row["attempts"] for row in rows), default=0), 8)), MAX_BACKOFF_SECONDS), "http_status": status}
