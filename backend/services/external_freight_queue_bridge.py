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
from services.external_freight_parser import map_selected_messages
from services.external_freight_classifier import classify_message
from services.owned_telegram_feed import OWNED_SOURCE, map_owned_messages

ACTIVE_SECONDS = 168 * 3600
MAX_SCAN = 50
PARSER_REVISION = '20261025-owned-contact-recall-v8'


def validate_qa_target(api_url, *, state_path=None):
    # Старые вызовы и окружения остаются строго QA2. Боевой адрес требует
    # явного выбора и отдельного durable state; очередь QA2 не перенаправляется.
    target = os.getenv("EXTERNAL_FREIGHT_DEPLOYMENT_TARGET", "qa2").strip().lower()
    if target not in {"qa2", "production"}:
        raise ValueError("external_feed_target_required")
    parsed = urlparse(api_url)
    host = "urtruck.kz" if target == "production" else "qa2.urtruck.kz"
    if (parsed.scheme != "https" or parsed.hostname != host
            or parsed.port is not None or parsed.username or parsed.password
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
        raise ValueError("production_target_required" if target == "production" else "qa2_target_required")
    if target == "production":
        declared_root = Path("/home/ubuntu/urtruck/runtime/external-feed")
        root = Path("/home").resolve() / "ubuntu/urtruck/runtime/external-feed"
        state = Path(state_path).expanduser() if state_path else None
        if (declared_root.resolve() != root or state is None or not state.is_absolute() or state.resolve() == root
                or not state.resolve().is_relative_to(root)):
            raise ValueError("separate_production_state_required")


class PublishedQueueBridge:
    parser_revision = '20261026-broad-cargo-visible-contact-v3'
    parse = staticmethod(map_selected_messages)

    def __init__(self, source_path, adapter):
        self.source_path = Path(source_path).resolve()
        self.adapter = adapter
        if self.source_path == Path(adapter.db_path).resolve():
            raise ValueError("separate_state_required")
        validate_qa_target(adapter.api_url, state_path=adapter.db_path)
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
            source.create_function("bridge_kind", 1, lambda text: classify_message(
                text if isinstance(text, str) else "").get("kind") or "")
            columns = [row["name"] for row in source.execute("PRAGMA table_info(queue)")]
            arguments = ",".join('q."' + name.replace('"', '""') + '"' for name in columns)
            revision = f"bridge_revision({arguments})"
            revision_key = f"({revision} || ':{self.parser_revision}')"
            rows = source.execute(f"""SELECT q.*, {revision_key} AS bridge_source_revision FROM queue q
                WHERE status='published' AND destination_message>0
                AND source_date>=? AND source_date<=?
                AND NOT EXISTS (SELECT 1 FROM bridge_state.published_bridge_seen_v2 s
                                WHERE s.source_queue_id=q.id
                                AND s.source_revision={revision_key})
                ORDER BY CASE WHEN bridge_kind(q.text)='vehicle' THEN 0 ELSE 1 END,
                         q.source_date DESC,q.destination_message DESC,q.id DESC LIMIT ?""",
                (now - ACTIVE_SECONDS, now + 300, MAX_SCAN)).fetchall()
        enqueued = rejected = review = 0
        for row in rows:
            try:
                records = self.parse(dict(row))
                segment_ids = {record["segment_id"] for record in records}
                with self.adapter._connect() as state:
                    old = state.execute(
                        "SELECT payload FROM selected_outbox WHERE source_id=? AND source_message_id=?",
                        (str(row["source_id"]), str(row["source_message"]))).fetchall()
                # При редактировании/закрытии многосоставного поста закрываем
                # сегменты, которых больше нет в текущей версии публикации.
                for previous in old:
                    previous = json.loads(previous["payload"])
                    if previous["segment_id"] not in segment_ids and previous.get("status") == "active":
                        previous["status"] = "closed"
                        enqueued += bool(self.adapter.enqueue(previous))
                for record in records:
                    # Подтверждённые публикации не прячем из-за неполных
                    # структурных полей: исходный текст остаётся доступен в карточке.
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
    source_name = None
    mode = 'incoming'
    parser_revision = PARSER_REVISION
    parse = staticmethod(map_selected_messages)
    def __init__(self, source_path, adapter):
        super().__init__(source_path,adapter)
        with adapter._connect() as state:
            state.execute("""CREATE TABLE IF NOT EXISTS incoming_bridge_seen (
                source_queue_id INTEGER PRIMARY KEY, source_revision TEXT NOT NULL,
                processed_at REAL NOT NULL, reason TEXT NOT NULL)""")
            state.execute("""CREATE TABLE IF NOT EXISTS incoming_bridge_dedup (
                fingerprint TEXT PRIMARY KEY, identity TEXT NOT NULL, published_at REAL NOT NULL)""")

    @staticmethod
    def fingerprint(record):
        normalized = " ".join(record["original_text"].casefold().split())
        return hashlib.sha256(normalized.encode()).hexdigest()

    def find_duplicate(self, fingerprint, now):
        with self.adapter._connect() as state:
            return state.execute("SELECT identity FROM incoming_bridge_dedup WHERE fingerprint=? AND published_at>?",
                                 (fingerprint, now-ACTIVE_SECONDS)).fetchone()

    def seed_dedup(self, now):
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
                fingerprint=self.fingerprint(previous)
                state.execute("INSERT OR IGNORE INTO incoming_bridge_dedup VALUES(?,?,?)",(fingerprint,identity,published))

    def _run_locked(self):
        now=self.adapter.clock()
        self.seed_dedup(now)
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
            arguments = (now-ACTIVE_SECONDS,now+300,self.parser_revision)
            if self.source_name:
                query += ' AND lower(q.source)=?'
                arguments += (self.source_name.lower(),)
            else:
                # Подготовленный собственный поток включается отдельным режимом.
                # Его сбор до переключения не создаёт параллельные карточки.
                query += ' AND lower(q.source)<>?'
                arguments += (OWNED_SOURCE.lower(),)
            newest=source.execute(query+" ORDER BY source_date DESC,updated_at DESC,id DESC LIMIT 10",arguments).fetchall()
            oldest=source.execute(query+" ORDER BY updated_at,id LIMIT ?",(*arguments,MAX_SCAN)).fetchall()
            unique={row["id"]:row for row in newest+oldest}
            rows=list(unique.values())[:MAX_SCAN]
        enqueued=review=rejected=duplicates=0
        reasons={}
        for row in rows:
            raw=dict(row)
            deleted_source = self.mode == "owned" and str(raw.get("text", "")).strip().casefold() == "заявка закрыта"
            reason="accepted"
            try:
                # A deletion tombstone is control data, not an incomplete listing.
                # Process it by closing the previous segments below instead of
                # trying to parse it as a new listing with missing route fields.
                records=[] if deleted_source else self.parse(raw)
                identities={record["segment_id"] for record in records}
                with self.adapter._connect() as state:
                    old=state.execute("SELECT payload FROM selected_outbox WHERE source_id=? AND source_message_id=?",
                                      (str(row["source_id"]),str(row["source_message"]))).fetchall()
                # При изменении списка устаревшие блоки закрываются; данные не удаляются.
                for previous in old:
                    previous=json.loads(previous["payload"])
                    if previous["segment_id"] not in identities:
                        previous["status"]="closed"
                        if deleted_source:
                            # Tombstone means the source author removed the entire
                            # post. Do not keep the old segment payload (which may
                            # contain a phone number and the full original text).
                            previous["original_text"] = "Исходное объявление удалено"
                            previous["contacts"] = []
                        enqueued+=bool(self.adapter.enqueue(previous))
                for record in records:
                    identity="/".join((record["source_id"],record["source_message_id"],record["segment_id"]))
                    fingerprint=self.fingerprint(record)
                    duplicate=self.find_duplicate(fingerprint, now)
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
                state.execute("INSERT OR REPLACE INTO incoming_bridge_seen VALUES(?,?,?,?)",(row["id"],row["revision"]+":"+self.parser_revision,self.adapter.clock(),reason))
            reasons[reason]=reasons.get(reason,0)+1
        delivery=self.adapter.flush_once()
        return {**delivery,"scanned":len(rows),"enqueued":enqueued,"review":review,
                "rejected":rejected,"duplicates":duplicates,"reasons":reasons,"mode":self.mode}


class OwnedTelegramQueueBridge(IncomingQueueBridge):
    """Только посты собственного чата, включая сообщения его участников."""
    source_name = OWNED_SOURCE
    mode = 'owned'
    parser_revision = '20261025-owned-contact-recall-v9'
    parse = staticmethod(map_owned_messages)

    @staticmethod
    def fingerprint(record):
        # A selection's shared footer is absent from earlier original_text blocks.
        # Effective contacts therefore participate in owned-only deduplication.
        value = [" ".join(record["original_text"].casefold().split()),
                 sorted(set(record.get("contacts") or []))]
        return hashlib.sha256(json.dumps(value, ensure_ascii=False).encode()).hexdigest()

    def find_duplicate(self, fingerprint, now):
        duplicate = super().find_duplicate(fingerprint, now)
        if not duplicate:
            return None
        source_id, message_id, segment_id = duplicate[0].rsplit("/", 2)
        # Collector may commit an edit after seed_dedup's read snapshot. Verify
        # the owner's actual current content before permanently ACKing a duplicate.
        with closing(sqlite3.connect(self.source_path.as_uri()+"?mode=ro",uri=True,timeout=2)) as source:
            source.row_factory = sqlite3.Row
            raw = source.execute("SELECT * FROM app_messages WHERE source_id=? AND source_message=? "
                                 "AND lower(source)=? AND source_date>=? AND source_date<=?",
                                 (source_id, message_id, self.source_name.lower(), now-ACTIVE_SECONDS, now+300)).fetchone()
        if raw:
            try:
                records = self.parse(dict(raw))
            except (ValueError, TypeError, OverflowError):
                records = []
            if any(record["segment_id"] == segment_id and record["status"] == "active"
                   and self.fingerprint(record) == fingerprint for record in records):
                return duplicate
        with self.adapter._connect() as state:
            state.execute("DELETE FROM incoming_bridge_dedup WHERE fingerprint=? AND identity=?",
                          (fingerprint, duplicate[0]))
        return None

    def seed_dedup(self, now):
        # Rebuild only a derived index, never business rows/outbox. An edited but
        # not-yet-processed source must not reserve its obsolete route, even when
        # a newer post is processed before that edit in the same bounded batch.
        with closing(sqlite3.connect(self.source_path.as_uri()+"?mode=ro",uri=True,timeout=2)) as source:
            current = {(str(row[1]), str(row[2])): (row[0], row[3]+":"+self.parser_revision)
                       for row in source.execute(
                           "SELECT id,source_id,source_message,revision FROM app_messages "
                           "WHERE lower(source)=? AND source_date>=? AND source_date<=?",
                           (self.source_name.lower(), now-ACTIVE_SECONDS, now+300))}
        with self.adapter._connect() as state:
            seen = dict(state.execute("SELECT source_queue_id,source_revision FROM incoming_bridge_seen"))
            state.execute("DELETE FROM incoming_bridge_dedup")
            for row in state.execute("SELECT payload FROM selected_outbox WHERE quarantined_at IS NULL").fetchall():
                record = json.loads(row["payload"])
                version = current.get((record["source_id"], record["source_message_id"]))
                if record.get("status") != "active" or not version or seen.get(version[0]) != version[1]:
                    continue
                published = datetime.fromisoformat(record["source_published_at"].replace("Z", "+00:00")).timestamp()
                identity = "/".join((record["source_id"], record["source_message_id"], record["segment_id"]))
                state.execute("INSERT OR IGNORE INTO incoming_bridge_dedup VALUES(?,?,?)",
                              (self.fingerprint(record), identity, published))

    def __init__(self, source_path, adapter):
        # Старый outbox может ещё содержать недоставленные чужие посты.
        # Не отправлять их под видом собственного потока и не удалять при переходе.
        with adapter._connect() as state:
            for row in state.execute('SELECT payload FROM selected_outbox'):
                if str(json.loads(row['payload']).get('origin_source', '')).lower() != OWNED_SOURCE.lower():
                    raise ValueError('owned_source_requires_separate_adapter_state')
        super().__init__(source_path, adapter)


def main():
    if os.getenv("EXTERNAL_FREIGHT_IMPORT_ENABLED", "").lower() not in {"1", "true", "yes"}:
        print(json.dumps({"status": "disabled"}))
        return 0
    source = os.getenv("EXTERNAL_FREIGHT_SOURCE_DB", "")
    state = os.getenv("EXTERNAL_FREIGHT_ADAPTER_DB", "")
    if not source or not state:
        raise ValueError("explicit_source_and_state_required")
    # Отклоняем ошибочный target/state до открытия SQLite адаптером.
    validate_qa_target(os.getenv("EXTERNAL_FREIGHT_API_URL", ""), state_path=state)
    os.umask(0o077)
    # Никаких ключей/контактов/текстов в аргументах процесса или stdout.
    mode = os.getenv("EXTERNAL_FREIGHT_SOURCE_MODE", 'published')
    workers = {'incoming': IncomingQueueBridge, 'published': PublishedQueueBridge, 'owned': OwnedTelegramQueueBridge}
    if mode not in workers:
        raise ValueError('invalid_source_mode')
    worker = workers[mode]
    result = worker(source, ExternalFreightFeedAdapter()).run_once()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] in {"delivered", "idle", "busy", "disabled"} else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, sqlite3.Error):
        print(json.dumps({"status": "bridge_configuration_or_source_error"}))
        raise SystemExit(1)
