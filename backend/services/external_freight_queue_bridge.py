"""Отдельная QA2-доставка уже опубликованной очереди агента.

Источник открывается read-only. Telegram worker, его очередь/статусы не меняются.
Запускать oneshot таймером раз в минуту; секрет только в EnvironmentFile.
"""
import fcntl
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from services.external_freight_import_adapter import ExternalFreightFeedAdapter
from services.external_freight_parser import map_selected_message, map_selected_messages
from services.external_freight_classifier import classify_message

ACTIVE_SECONDS = 120 * 3600
MAX_SCAN = 50
PARSER_REVISION = '20261023-promotion-contact-price-v7'


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
            columns = {row["name"] for row in state.execute("PRAGMA table_info(published_bridge_seen)")}
            if "source_revision" not in columns:
                state.execute("ALTER TABLE published_bridge_seen ADD COLUMN source_revision TEXT")
            state.execute("""CREATE TABLE IF NOT EXISTS published_bridge_rejections (
                destination_message INTEGER PRIMARY KEY, reason TEXT NOT NULL)""")
            # Номер Telegram-публикации не уникален для исходной очереди.
            # Старые отметки неоднозначны: оставляем их для отката, а каждую
            # исходную строку пересверяем один раз через идемпотентный outbox.
            state.execute("""CREATE TABLE IF NOT EXISTS published_bridge_seen_v2 (
                source_queue_id INTEGER PRIMARY KEY, source_revision TEXT NOT NULL)""")
            state.execute("""CREATE TABLE IF NOT EXISTS published_bridge_rejections_v2 (
                source_queue_id INTEGER PRIMARY KEY, reason TEXT NOT NULL)""")

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
            # Хеш всех исходных полей замечает правку текста/контактов после ACK.
            source.create_function("bridge_revision", -1, lambda *values: hashlib.sha256(
                json.dumps(values, ensure_ascii=False, default=str).encode("utf-8")).hexdigest())
            columns = [row["name"] for row in source.execute("PRAGMA table_info(queue)")]
            arguments = ",".join('q."' + name.replace('"', '""') + '"' for name in columns)
            revision = f"bridge_revision({arguments})"
            rows = source.execute(f"""SELECT q.*, {revision} AS bridge_source_revision FROM queue q
                WHERE status='published' AND destination_message>0
                AND source_date>=? AND source_date<=?
                AND NOT EXISTS (SELECT 1 FROM bridge_state.published_bridge_seen_v2 s
                                WHERE s.source_queue_id=q.id
                                AND s.source_revision={revision})
                ORDER BY destination_message,id LIMIT ?""",
                (now - ACTIVE_SECONDS, now + 300, MAX_SCAN)).fetchall()
        enqueued = rejected = review = 0
        for row in rows:
            try:
                record = map_selected_message(dict(row))
                # Не показываем пустой маршрут в автоматически принятой карточке.
                if record["status"] == "active" and (not record.get("origin") or not record.get("destination")):
                    record["status"] = "review"
                    record["classification_status"] = "review"
                review += record["status"] == "review"
                enqueued += bool(self.adapter.enqueue(record))
            except (ValueError, TypeError, OverflowError):
                rejected += 1
                with self.adapter._connect() as state:
                    state.execute("INSERT OR REPLACE INTO published_bridge_rejections_v2 VALUES(?,?)",
                                  (row["id"], "invalid_source_record"))
            # Durable enqueue precedes acknowledgement: interrupted runs replay.
            with self.adapter._connect() as state:
                state.execute("""INSERT INTO published_bridge_seen_v2(source_queue_id,source_revision) VALUES(?,?)
                              ON CONFLICT(source_queue_id) DO UPDATE SET source_revision=excluded.source_revision""",
                              (row["id"], row["bridge_source_revision"]))
        delivery = self.adapter.flush_once()
        return {"status": delivery["status"], "scanned": len(rows), "enqueued": enqueued,
                "review": review, "rejected": rejected, "sent": delivery.get("sent", 0),
                "pending": delivery.get("pending", self.adapter.pending_count()),
                "quarantined": delivery.get("quarantined", self.adapter.quarantined_count())}


class IncomingQueueBridge(PublishedQueueBridge):
    """Читает независимый вход той же очереди, не ожидая Telegram publication."""
    def __init__(self, source_path, adapter):
        super().__init__(source_path,adapter)
        with adapter._connect() as state:
            state.execute("""CREATE TABLE IF NOT EXISTS incoming_bridge_seen (
                source_queue_id INTEGER PRIMARY KEY, source_revision TEXT NOT NULL,
                processed_at REAL NOT NULL, reason TEXT NOT NULL)""")
            state.execute("""CREATE TABLE IF NOT EXISTS incoming_bridge_dedup (
                fingerprint TEXT PRIMARY KEY, identity TEXT NOT NULL, published_at REAL NOT NULL)""")

    def _run_locked(self):
        now=self.adapter.clock()
        # Учитываем durable outbox прежнего published-режима при переключении.
        with self.adapter._connect() as state:
            for previous in state.execute("SELECT payload FROM selected_outbox WHERE quarantined_at IS NULL").fetchall():
                previous=json.loads(previous["payload"])
                if previous.get("status")!="active":
                    continue
                try:
                    published=datetime.fromisoformat(previous["source_published_at"].replace("Z","+00:00")).timestamp()
                except (KeyError,TypeError,ValueError):
                    continue
                if published<=now-ACTIVE_SECONDS:
                    continue
                identity="/".join((previous["source_id"],previous["source_message_id"],previous["segment_id"]))
                normalized=" ".join(previous["original_text"].casefold().split())
                fingerprint=hashlib.sha256(normalized.encode()).hexdigest()
                state.execute("INSERT OR IGNORE INTO incoming_bridge_dedup VALUES(?,?,?)",(fingerprint,identity,published))
        with closing(sqlite3.connect(self.source_path.as_uri()+"?mode=ro",uri=True,timeout=2)) as source:
            source.row_factory=sqlite3.Row
            source.execute("ATTACH DATABASE ? AS bridge_state",(Path(self.adapter.db_path).resolve().as_uri()+"?mode=ro",))
            query="""SELECT q.* FROM app_messages q
                WHERE source_date>=? AND source_date<=?
                AND NOT EXISTS(SELECT 1 FROM bridge_state.incoming_bridge_seen s
                  WHERE s.source_queue_id=q.id AND s.source_revision=q.revision || ':' || ?)"""
            # Свежий поток не ждёт первоначальную загрузку, старый хвост тоже продвигается.
            # Историческая загрузка имеет новый updated_at, но не должна вытеснять
            # свежие исходные публикации. Правки/старый хвост обслуживаются ниже.
            newest=source.execute(query+" ORDER BY source_date DESC,updated_at DESC,id DESC LIMIT 10",(now-ACTIVE_SECONDS,now+300,PARSER_REVISION)).fetchall()
            oldest=source.execute(query+" ORDER BY updated_at,id LIMIT ?",(now-ACTIVE_SECONDS,now+300,PARSER_REVISION,MAX_SCAN)).fetchall()
            unique={row["id"]:row for row in newest+oldest}
            rows=list(unique.values())[:MAX_SCAN]
        enqueued=review=rejected=duplicates=0
        reasons={}
        for row in rows:
            raw=dict(row)
            reason="accepted"
            try:
                records=map_selected_messages(raw)
                identities={record["segment_id"] for record in records}
                with self.adapter._connect() as state:
                    old=state.execute("SELECT payload FROM selected_outbox WHERE source_id=? AND source_message_id=?",
                                      (str(row["source_id"]),str(row["source_message"]))).fetchall()
                # При изменении списка устаревшие блоки закрываются; данные не удаляются.
                for previous in old:
                    previous=json.loads(previous["payload"])
                    if previous["segment_id"] not in identities:
                        previous["status"]="closed"
                        enqueued+=bool(self.adapter.enqueue(previous))
                for record in records:
                    identity="/".join((record["source_id"],record["source_message_id"],record["segment_id"]))
                    normalized=" ".join(record["original_text"].casefold().split())
                    fingerprint=hashlib.sha256(normalized.encode()).hexdigest()
                    with self.adapter._connect() as state:
                        duplicate=state.execute("SELECT identity FROM incoming_bridge_dedup WHERE fingerprint=? AND published_at>?",
                                                (fingerprint,now-ACTIVE_SECONDS)).fetchone()
                    if duplicate and duplicate[0]!=identity and record["status"]=="active":
                        # Редактирование в дубль не должно оставлять старую карточку active.
                        for previous in old:
                            previous=json.loads(previous["payload"])
                            if previous["segment_id"]==record["segment_id"] and previous.get("status")=="active":
                                previous["status"]="closed"
                                enqueued+=bool(self.adapter.enqueue(previous))
                        duplicates+=1;reason="exact_content_duplicate";continue
                    if record["status"]=="review":
                        review+=1
                        classification=classify_message(record["original_text"])
                        reason=(classification.get('reason','ambiguous_kind')
                                if classification.get("kind") is None else "unresolved_direction")
                    if record["status"]=="active":
                        with self.adapter._connect() as state:
                            state.execute("INSERT OR REPLACE INTO incoming_bridge_dedup VALUES(?,?,?)",(fingerprint,identity,row["source_date"]))
                    enqueued+=bool(self.adapter.enqueue(record))
            except (ValueError,TypeError,OverflowError):
                rejected+=1;reason="invalid_source_record"
            # ACK разбора только после durable enqueue; HTTP ACK хранится отдельно.
            with self.adapter._connect() as state:
                state.execute("INSERT OR REPLACE INTO incoming_bridge_seen VALUES(?,?,?,?)",(row["id"],row["revision"]+":"+PARSER_REVISION,self.adapter.clock(),reason))
            reasons[reason]=reasons.get(reason,0)+1
        delivery=self.adapter.flush_once()
        return {**delivery,"scanned":len(rows),"enqueued":enqueued,"review":review,
                "rejected":rejected,"duplicates":duplicates,"reasons":reasons,"mode":"incoming"}


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
    worker = IncomingQueueBridge if os.getenv("EXTERNAL_FREIGHT_SOURCE_MODE") == "incoming" else PublishedQueueBridge
    result = worker(source, ExternalFreightFeedAdapter()).run_once()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] in {"delivered", "idle", "busy", "disabled"} else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, sqlite3.Error):
        print(json.dumps({"status": "bridge_configuration_or_source_error"}))
        raise SystemExit(1)
