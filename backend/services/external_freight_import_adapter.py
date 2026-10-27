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
            for column in ("quarantined_at", "quarantine_reason"):
                if column not in columns:
                    db.execute(f"ALTER TABLE selected_outbox ADD COLUMN {column} TEXT")
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
        """Durable insert/upsert of an agent-selected result.

        Legacy queue rows are mapped conservatively here. Fully structured
        importer records remain backward compatible and explicit values win.
        """
        from services.external_freight_parser import map_selected_message

        source = dict(selected_record)
        record = map_selected_message(source)
        contract_keys = {
            "kind", "source_id", "source_message_id", "segment_id", "source_published_at",
            "original_text", "source_text", "source_revision", "status", "classification_status", "origin", "destination",
            "origin_country", "destination_country", "cargo_name", "body_types", "weight", "volume",
            "vehicle_count", "loading_date", "ready_text", "amount", "currency", "price_state",
            "contacts", "origin_source", "created_by",
        }
        explicit = {key: value for key, value in source.items() if key in contract_keys and value not in (None, "")}
        if explicit.get("status") not in {"active", "review", "closed", "hidden"}:
            explicit.pop("status", None)
        record.update(explicit)
        identity = self._identity(record)
        encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        # Контракт допускает блок и полный пост по 20 000 символов Unicode.
        if len(encoded.encode("utf-8")) > 200000:
            raise ValueError("record_too_large")
        with self._connect() as db:
            existing = db.execute("SELECT payload,delivered_at FROM selected_outbox WHERE source_id=? AND source_message_id=? AND segment_id=?", identity).fetchone()
            if existing and existing["payload"] == encoded:
                return False
            if existing:
                db.execute("UPDATE selected_outbox SET payload=?,generation=generation+1,attempts=0,next_attempt_at=0,delivered_at=NULL,last_http_status=NULL,quarantined_at=NULL,quarantine_reason=NULL WHERE source_id=? AND source_message_id=? AND segment_id=?", (encoded, *identity))
            else:
                db.execute("INSERT INTO selected_outbox(source_id,source_message_id,segment_id,payload) VALUES(?,?,?,?)", (*identity, encoded))
        return True

    def pending_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL").fetchone()[0]

    def quarantined_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE quarantined_at IS NOT NULL").fetchone()[0]

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

    def _send(self, rows):
        payload = json.dumps({"records": [json.loads(row["payload"]) for row in rows]}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{self.api_url}/api/v1/external-freight/import", data=payload, method="POST",
            headers={"Content-Type": "application/json", "X-External-Importer-Key": self.importer_key},
        )
        with self.opener(req, timeout=8) as response:
            status = int(getattr(response, "status", 200))
            if not 200 <= status < 300:
                raise urllib.error.HTTPError(req.full_url, status, "import_rejected", {}, None)
            body = json.loads(response.read().decode("utf-8"))
        results = body.get("results", [])
        if len(results) != len(rows) or not all(
                item.get("id") and item.get("result") in {"created", "updated", "replayed"} for item in results):
            raise ValueError("invalid_import_ack")
        return status

    def _ack(self, rows, now, status):
        with self._connect() as db:
            for row in rows:
                db.execute("""UPDATE selected_outbox SET delivered_at=?,last_http_status=?
                    WHERE source_id=? AND source_message_id=? AND segment_id=?
                    AND delivered_at IS NULL AND generation=?""",
                    (datetime.fromtimestamp(now, timezone.utc).isoformat(), status,
                     row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))

    def _retry(self, rows, now, status):
        delay = 0
        with self._connect() as db:
            for row in rows:
                attempts = row["attempts"] + 1
                delay = max(delay, min(5 * (2 ** min(attempts - 1, 8)), MAX_BACKOFF_SECONDS))
                row_delay = min(5 * (2 ** min(attempts - 1, 8)), MAX_BACKOFF_SECONDS)
                db.execute("""UPDATE selected_outbox SET attempts=?,next_attempt_at=?,last_http_status=?
                    WHERE source_id=? AND source_message_id=? AND segment_id=?
                    AND delivered_at IS NULL AND generation=?""",
                    (attempts, now + row_delay, status, row["source_id"], row["source_message_id"],
                     row["segment_id"], row["generation"]))
        return {"status": "retry_scheduled", "sent": 0, "pending": self.pending_count(),
                "quarantined": self.quarantined_count(), "retry_after_seconds": delay, "http_status": status}

    def _isolate_validation_errors(self, rows, now, deadline):
        sent = 0
        for index, row in enumerate(rows):
            # Ограничиваем время oneshot. Остальные записи не теряются.
            if time.monotonic() >= deadline:
                result = self._retry(rows[index:], now, 422)
                result["sent"] = sent
                return result
            try:
                status = self._send([row])
                self._ack([row], self.clock(), status)
                sent += 1
            except Exception as exc:
                status = getattr(exc, "code", None)
                if status != 422:
                    result = self._retry(rows[index:], now, status)
                    result["sent"] = sent
                    return result
                # Только одиночный 422 доказывает неисправимость этой версии.
                # Полный payload остаётся в outbox для диагностики/исправления.
                with self._connect() as db:
                    db.execute("""UPDATE selected_outbox SET quarantined_at=?,quarantine_reason=?,
                        last_http_status=422 WHERE source_id=? AND source_message_id=? AND segment_id=?
                        AND delivered_at IS NULL AND generation=?""",
                        (datetime.fromtimestamp(now, timezone.utc).isoformat(), "import_validation_422",
                         row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))
        return {"status": "delivered", "sent": sent, "pending": self.pending_count(),
                "quarantined": self.quarantined_count()}

    def _flush_locked(self):
        if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "false").lower() not in {"1", "true", "yes"}:
            return {"status": "disabled", "sent": 0, "pending": self.pending_count()}
        if not self.api_url or not self.importer_key:
            return {"status": "not_configured", "sent": 0, "pending": self.pending_count()}
        now = self.clock()
        deadline = time.monotonic() + 25
        with self._connect() as db:
            rows = db.execute("""SELECT * FROM selected_outbox
                WHERE delivered_at IS NULL AND quarantined_at IS NULL AND next_attempt_at<=?
                ORDER BY attempts,source_id,source_message_id,segment_id LIMIT ?""", (now, MAX_BATCH)).fetchall()
        if not rows:
            return {"status": "idle", "sent": 0, "pending": self.pending_count(),
                    "quarantined": self.quarantined_count()}
        try:
            status = self._send(rows)
            self._ack(rows, self.clock(), status)
            return {"status": "delivered", "sent": len(rows), "pending": self.pending_count(),
                    "quarantined": self.quarantined_count(), "http_status": status}
        except Exception as exc:
            status = getattr(exc, "code", None)
            if status == 422:
                return self._isolate_validation_errors(rows, now, deadline)
            return self._retry(rows, now, status)
