"""Независимый durable-адаптер отобранной очереди Telegram-агента.

Этот модуль не импортирует Telegram и не меняет его публикацию. Агент может
передать только уже отобранные записи через enqueue(); worker запускается
отдельно и выключен, пока EXTERNAL_FREIGHT_IMPORT_ENABLED не включён.
"""
import json
import hashlib
import hmac
import os
import sqlite3
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MAX_BATCH = 50
MAX_BACKOFF_SECONDS = 900
RETENTION_SECONDS = 10 * 24 * 3600


class ImportAckError(ValueError):
    """Успешный HTTP-ответ не содержит полного ACK требуемого формата."""
    def __init__(self, http_status, code):
        super().__init__(code)
        self.code = code
        self.http_status = http_status


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
            for column in ("terminal_at", "terminal_reason"):
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

    def _prepare_enqueue(self, selected_record):
        """Normalize one selected source record into a durable outbox row."""
        from services.external_freight_parser import map_selected_message

        source = dict(selected_record)
        record = map_selected_message(source)
        contract_keys = {
            "kind", "source_id", "source_message_id", "segment_id", "source_published_at",
            "original_text", "source_text", "source_revision", "status", "classification_status", "origin", "destination",
            "origin_country", "destination_country", "cargo_name", "body_types", "weight", "volume",
            "vehicle_count", "loading_date", "ready_text", "amount", "currency", "price_state",
            "contacts", "source_contacts", "origin_source", "created_by",
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
        return identity, encoded

    def enqueue_many_with_outcomes(self, selected_records):
        """Persist a bridge batch atomically, avoiding one fsync per segment."""
        prepared = [self._prepare_enqueue(record) for record in selected_records]
        outcomes = []
        with self._connect() as db:
            for identity, encoded in prepared:
                existing = db.execute("SELECT payload FROM selected_outbox WHERE source_id=? AND source_message_id=? AND segment_id=?", identity).fetchone()
                if existing and existing["payload"] == encoded:
                    outcomes.append("unchanged")
                    continue
                if existing:
                    db.execute("UPDATE selected_outbox SET payload=?,generation=generation+1,attempts=0,next_attempt_at=0,delivered_at=NULL,last_http_status=NULL,quarantined_at=NULL,quarantine_reason=NULL,terminal_at=NULL,terminal_reason=NULL WHERE source_id=? AND source_message_id=? AND segment_id=?", (encoded, *identity))
                    outcomes.append("updated")
                else:
                    db.execute("INSERT INTO selected_outbox(source_id,source_message_id,segment_id,payload) VALUES(?,?,?,?)", (*identity, encoded))
                    outcomes.append("created")
        return outcomes

    def enqueue_with_outcome(self, selected_record):
        return self.enqueue_many_with_outcomes([selected_record])[0]

    def enqueue(self, selected_record):
        """Backward-compatible change flag; use enqueue_with_outcome for metrics."""
        return self.enqueue_with_outcome(selected_record) != "unchanged"

    def pending_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE delivered_at IS NULL AND quarantined_at IS NULL AND terminal_at IS NULL").fetchone()[0]

    def ready_pending_count(self, now=None):
        now = self.clock() if now is None else now
        cutoff = datetime.fromtimestamp(now - RETENTION_SECONDS, timezone.utc).isoformat()
        with self._connect() as db:
            return db.execute("""SELECT COUNT(*) FROM selected_outbox
                WHERE delivered_at IS NULL AND quarantined_at IS NULL AND terminal_at IS NULL
                AND next_attempt_at<=?
                AND (json_extract(payload,'$.source_published_at') IS NULL
                    OR julianday(json_extract(payload,'$.source_published_at')) >= julianday(?))""", (now, cutoff)).fetchone()[0]

    def quarantined_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE quarantined_at IS NOT NULL").fetchone()[0]

    def expired_pending_count(self, now=None):
        cutoff = datetime.fromtimestamp((now or self.clock()) - RETENTION_SECONDS, timezone.utc).isoformat()
        with self._connect() as db:
            return db.execute("""SELECT COUNT(*) FROM selected_outbox
                WHERE delivered_at IS NULL AND quarantined_at IS NULL AND terminal_at IS NULL
                AND json_extract(payload,'$.source_published_at') IS NOT NULL
                AND julianday(json_extract(payload,'$.source_published_at')) < julianday(?)""",
                (cutoff,)).fetchone()[0]

    def terminal_expired_count(self):
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM selected_outbox WHERE terminal_reason IN ('source_retention_expired','api_expired')").fetchone()[0]

    def _terminalize_source_expired(self, now):
        cutoff = datetime.fromtimestamp(now - RETENTION_SECONDS, timezone.utc).isoformat()
        stamp = datetime.fromtimestamp(now, timezone.utc).isoformat()
        with self._connect() as db:
            cur = db.execute("""UPDATE selected_outbox SET terminal_at=?,terminal_reason='source_retention_expired'
                WHERE delivered_at IS NULL AND quarantined_at IS NULL AND terminal_at IS NULL
                AND json_extract(payload,'$.source_published_at') IS NOT NULL
                AND julianday(json_extract(payload,'$.source_published_at')) < julianday(?)""", (stamp, cutoff))
            return cur.rowcount

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
            try:
                body = json.loads(response.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise ImportAckError(status, "invalid_json_ack") from None
        results = body.get("results", []) if isinstance(body, dict) else []
        if len(results) != len(rows) or not all(
                isinstance(item, dict) and isinstance(item.get("id"), str) and item.get("id")
                and item.get("result") in {"created", "updated", "replayed", "expired"}
                for item in results):
            raise ImportAckError(status, "invalid_import_ack")
        return status, results

    def _ack(self, rows, results, now, status):
        counts = {"created": 0, "updated": 0, "replayed": 0, "expired": 0, "stale_ack": 0}
        stamp = datetime.fromtimestamp(now, timezone.utc).isoformat()
        with self._connect() as db:
            for row, result in zip(rows, results):
                outcome = result["result"]
                if outcome == "expired":
                    cur = db.execute("""UPDATE selected_outbox SET terminal_at=?,terminal_reason='api_expired',last_http_status=?
                        WHERE source_id=? AND source_message_id=? AND segment_id=?
                        AND delivered_at IS NULL AND terminal_at IS NULL AND generation=?""",
                        (stamp, status, row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))
                else:
                    cur = db.execute("""UPDATE selected_outbox SET delivered_at=?,last_http_status=?
                    WHERE source_id=? AND source_message_id=? AND segment_id=?
                    AND delivered_at IS NULL AND generation=?""",
                    (stamp, status,
                     row["source_id"], row["source_message_id"], row["segment_id"], row["generation"]))
                counts[outcome if cur.rowcount else "stale_ack"] += 1
        return counts

    def _retry(self, rows, now, status, error_type=None, duration_ms=None):
        delay = 0
        retry_rows = []
        with self._connect() as db:
            for row in rows:
                attempts = row["attempts"] + 1
                delay = max(delay, min(5 * (2 ** min(attempts - 1, 8)), MAX_BACKOFF_SECONDS))
                row_delay = min(5 * (2 ** min(attempts - 1, 8)), MAX_BACKOFF_SECONDS)
                db.execute("""UPDATE selected_outbox SET attempts=?,next_attempt_at=?,last_http_status=?
                    WHERE source_id=? AND source_message_id=? AND segment_id=?
                    AND delivered_at IS NULL AND terminal_at IS NULL AND generation=?""",
                    (attempts, now + row_delay, status, row["source_id"], row["source_message_id"],
                     row["segment_id"], row["generation"]))
                opaque_id = hmac.new(self.importer_key.encode(), "\0".join((row["source_id"], row["source_message_id"], row["segment_id"])).encode(), hashlib.sha256).hexdigest()[:12]
                retry_rows.append({"id": opaque_id, "attempt": attempts, "delay_seconds": row_delay})
        result = {"status": "retry_scheduled", "retry_id": uuid.uuid4().hex[:12], "sent": 0,
                  "confirmed_deliveries": 0, "attempted_records": len(rows), "pending": self.pending_count(),
                  "ready_pending": self.ready_pending_count(now), "retry_rows": retry_rows,
                  "quarantined": self.quarantined_count(), "expired_pending": self.expired_pending_count(now),
                  "retry_after_seconds": delay, "http_status": status}
        if duration_ms is not None:
            result["duration_ms"] = duration_ms
        if error_type:
            # Log only the exception class; never include payload, contact, or
            # exception text in the service journal.
            result["error_type"] = error_type
        return result

    def _isolate_validation_errors(self, rows, now, deadline):
        sent = 0
        for index, row in enumerate(rows):
            # Ограничиваем время oneshot. Остальные записи не теряются.
            if time.monotonic() >= deadline:
                result = self._retry(rows[index:], now, 422)
                result["sent"] = sent
                return result
            try:
                started = time.monotonic()
                status, outcomes = self._send([row])
                counts = self._ack([row], outcomes, self.clock(), status)
                sent += sum(counts[key] for key in ("created", "updated", "replayed"))
            except Exception as exc:
                status = getattr(exc, "http_status", getattr(exc, "code", None))
                if status != 422:
                    result = self._retry(rows[index:], now, status, type(exc).__name__, round((time.monotonic()-started)*1000))
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
                "ready_pending": self.ready_pending_count(now), "quarantined": self.quarantined_count(),
                "expired_pending": self.expired_pending_count(now), "terminal_expired": self.terminal_expired_count()}

    def _flush_locked(self):
        if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "false").lower() not in {"1", "true", "yes"}:
            return {"status": "disabled", "sent": 0, "pending": self.pending_count()}
        if not self.api_url or not self.importer_key:
            return {"status": "not_configured", "sent": 0, "pending": self.pending_count()}
        now = self.clock()
        terminalized = self._terminalize_source_expired(now)
        deadline = time.monotonic() + 25
        cutoff = datetime.fromtimestamp(now - RETENTION_SECONDS, timezone.utc).isoformat()
        with self._connect() as db:
            rows = db.execute("""SELECT * FROM selected_outbox
                WHERE delivered_at IS NULL AND quarantined_at IS NULL AND next_attempt_at<=?
                AND terminal_at IS NULL
                AND (json_extract(payload,'$.source_published_at') IS NULL
                    OR julianday(json_extract(payload,'$.source_published_at')) >= julianday(?))
                ORDER BY attempts,source_id,source_message_id,segment_id LIMIT ?""", (now, cutoff, MAX_BATCH+1)).fetchall()
            if len(rows) > MAX_BATCH:
                due = '''delivered_at IS NULL AND quarantined_at IS NULL AND next_attempt_at<=?
                    AND terminal_at IS NULL
                    AND (json_extract(payload,'$.source_published_at') IS NULL
                        OR julianday(json_extract(payload,'$.source_published_at')) >= julianday(?))'''
                newest = "json_extract(payload,'$.source_published_at') DESC,source_id,source_message_id,segment_id"
                controls = db.execute(f"SELECT * FROM selected_outbox WHERE {due} AND json_extract(payload,'$.status')='closed' ORDER BY {newest} LIMIT 10", (now, cutoff)).fetchall()
                vehicles = db.execute(f"SELECT * FROM selected_outbox WHERE {due} AND json_extract(payload,'$.kind')='vehicle' AND json_extract(payload,'$.status')='active' ORDER BY {newest} LIMIT 10", (now, cutoff)).fetchall()
                fresh = db.execute(f'SELECT * FROM selected_outbox WHERE {due} ORDER BY {newest} LIMIT 10', (now, cutoff)).fetchall()
                retries = db.execute(f'SELECT * FROM selected_outbox WHERE {due} AND attempts>0 ORDER BY next_attempt_at,attempts,source_id,source_message_id,segment_id LIMIT 10', (now, cutoff)).fetchall()
                # Квоты не вытесняют весь хвост: оставшиеся места берут старую
                # выдачу. Пакет по-прежнему не больше 50, ACK привязан к generation.
                selected = {}
                for row in (*controls, *vehicles, *fresh, *retries, *rows):
                    identity = (row['source_id'], row['source_message_id'], row['segment_id'])
                    selected.setdefault(identity, row)
                rows = list(selected.values())[:MAX_BATCH]
        if not rows:
            return {"status": "idle", "sent": 0, "confirmed_deliveries": 0, "attempted_records": 0,
                    "pending": self.pending_count(),
                    "ready_pending": self.ready_pending_count(now), "terminalized_expired": terminalized,
                    "quarantined": self.quarantined_count(),
                    "expired_pending": self.expired_pending_count(now), "terminal_expired": self.terminal_expired_count()}
        try:
            started = time.monotonic()
            status, outcomes = self._send(rows)
            counts = self._ack(rows, outcomes, self.clock(), status)
            sent = sum(counts[key] for key in ("created", "updated", "replayed"))
            return {"status": "delivered" if sent else "terminalized", "sent": sent,
                    "confirmed_deliveries": sent, "attempted_records": len(rows), "outcomes": counts,
                    "pending": self.pending_count(), "ready_pending": self.ready_pending_count(now),
                    "terminalized_expired": terminalized, "quarantined": self.quarantined_count(),
                    "expired_pending": self.expired_pending_count(now), "terminal_expired": self.terminal_expired_count(),
                    "http_status": status, "duration_ms": round((time.monotonic()-started)*1000)}
        except Exception as exc:
            status = getattr(exc, "http_status", getattr(exc, "code", None))
            if status == 422:
                return self._isolate_validation_errors(rows, now, deadline)
            return self._retry(rows, now, status, type(exc).__name__, round((time.monotonic()-started)*1000))
