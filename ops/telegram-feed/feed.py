#!/usr/bin/env python3
"""UrTruck: allowlisted Telegram freight feed. No DMs or source-group posts."""
import argparse
import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import secrets
import sqlite3
import stat
import time
import unicodedata
import urllib.error
import urllib.request
from urllib.parse import parse_qs, unquote, urlparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("Asia/Almaty")
DESTINATION = -1003711161303
DESTINATION_NAME = "@UrTruck_UT"
OWNED_FEED_SOURCE = 'UrTruck_obyavleniya'
ACTIVE_HOURS = 240
DOWNLOAD_TEXT = 'Скачать UrTruck — грузы и машины в приложении'
DOWNLOAD_BUTTONS = {'inline_keyboard': [[
    {'text': 'Android — Google Play', 'url': 'https://play.google.com/store/apps/details?id=com.urtruck.app'},
    {'text': 'iPhone — App Store', 'url': 'https://apps.apple.com/kz/app/urtruck/id6764504167'},
]]}
SOURCES= ("gruz_china", "alashankougruz", "gruzbaktyshankou", "cargo_china_gruz", "Cargo75", "K7777KZ", "nurzholychat", "nurzholy23", "zzzzz777777zzzz777", "kaljatchat")
# Дополнительные согласованные источники обслуживают оба независимых выхода.
def app_sources():
    path=ROOT / "app-sources.json"
    extra=json.loads(path.read_text()) if path.exists() else []
    if not isinstance(extra,list) or any(not isinstance(x,str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}",x) for x in extra):
        raise ValueError("invalid_app_sources")
    own = {OWNED_FEED_SOURCE.lower(), DESTINATION_NAME.lstrip('@').lower()}
    return tuple(name for name in dict.fromkeys((*SOURCES,*extra)) if name.lower() not in own)


LOG = logging.getLogger("urtruck_feed")
PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d \t().-]{8,24}\d)(?!\d)")
CARGO = re.compile(r"груз|погруз|загруз|выгруз|тент|реф|фур[аыуе]|тонн|куб|юк\s*бор|yuk\s*bor|tent|cargo|货|装车", re.I)
ROUTE = re.compile(r"[→➡➜↔]|(?:[а-яёa-z\u4e00-\u9fff]{3,})\s*[-–—]\s*(?:[а-яёa-z\u4e00-\u9fff]{3,})|из\s+\S+.{0,80}\s+(?:в|до|на)\s+\S+|(?:хоргос|алашанькоу|алаш|бахты|достык|калжат|китай|khorgos|china|中国)", re.I | re.S)
UNRELATED = re.compile(r"казино|casino|крипт|crypto|арбитраж\s+трафика|пассивн\w*\s+доход|быстр\w*\s+заработ|ставки\s+на\s+спорт", re.I)
CLOSED = re.compile(r"груз\s+(?:закрыт|снят|уехал)|заявка\s+(?:закрыта|снята)|машина\s+найдена|уже\s+загрузили", re.I)


def utcnow():
    return datetime.now(timezone.utc)


def phones(text):
    result = set()
    for match in PHONE.finditer(text):
        raw = match.group()
        digits = re.sub(r"\D", "", raw)
        if len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]
        if 11 <= len(digits) <= 15 and (raw.startswith("+") or digits.startswith(("7", "86", "998", "996", "992", "993", "994", "995", "375", "380"))):
            result.add(digits)
    return sorted(result)


def canonical(text):
    value = unicodedata.normalize("NFKC", text).lower().replace("ё", "е")
    value = re.sub(r"https?://\S+|@\w+", " ", value)
    for match in list(PHONE.finditer(value))[::-1]:
        value = value[:match.start()] + " " + value[match.end():]
    return " ".join(re.findall(r"[\w]+", value, re.UNICODE))


def fingerprint(text):
    return hashlib.sha256(("|".join(phones(text)) + ":" + canonical(text)).encode()).hexdigest()


def similar(left, right):
    """Suppress only a normalized exact copy with at least one shared contact."""
    return bool(set(phones(left)).intersection(phones(right))) and canonical(left) == canonical(right)


def eligible(text, source_date, protected=False, now=None):
    now = now or utcnow()
    if protected or not text:
        return False
    if not source_date or source_date < now - timedelta(hours=24):
        return False
    if source_date > now + timedelta(minutes=5):
        return False
    # Price, cargo wording and post length are optional. Long selections pass
    # intact; application parsing splits their individual routes downstream.
    return bool(phones(text) and ROUTE.search(text)
                and not UNRELATED.search(text) and not CLOSED.search(text))


def message_entity_phones(msg):
    """Только явные телефонные ссылки; обычные URL/приглашения не телефоны."""
    result = []
    for entity in getattr(msg, 'entities', None) or ():
        url = getattr(entity, 'url', '') or ''
        try:
            parsed = urlparse(url)
            host = (parsed.hostname or '').lower()
            candidate = ''
            if parsed.scheme.lower() == 'tel':
                candidate = unquote(parsed.path).split(';', 1)[0]
            elif parsed.scheme.lower() in {'https', 'http'} and host in {'wa.me', 'api.whatsapp.com'}:
                candidate = unquote(parsed.path.strip('/')) if host == 'wa.me' else parse_qs(parsed.query).get('phone', [''])[0]
            elif parsed.scheme.lower() == 'whatsapp' and parsed.netloc == 'send':
                candidate = parse_qs(parsed.query).get('phone', [''])[0]
            candidate = candidate.strip()
            if candidate and re.fullmatch(r'\+?[\d ().-]+', candidate):
                digits = re.sub(r'\D', '', candidate)
                if 6 <= len(digits) <= 15 and candidate not in result:
                    result.append(candidate)
        except ValueError:
            continue
    return result[:20]


def capture_message_for_app(db, source, source_id, msg, source_date=None, protected=False):
    date = source_date or msg.date
    if protected or getattr(msg, 'noforwards', False) or not date or not utcnow()-timedelta(hours=ACTIVE_HOURS) <= date <= utcnow()+timedelta(minutes=5):
        return False
    hints = message_entity_phones(msg)
    media = getattr(msg, 'media', None)
    with db:
        db.execute('INSERT OR REPLACE INTO app_message_metadata VALUES(?,?,?,?,?,?,?)',
                   (str(source_id), msg.id, int(bool(media)), type(media).__name__ if media else None,
                    json.dumps(hints, ensure_ascii=False), date.timestamp(), time.time()))
    return capture_for_app(db, source, source_id, msg.id, msg.raw_text or '', date, protected, hints)


def capture_for_app(db, source, source_id, message_id, text, source_date, protected=False, contact_hints=None):
    """Независимый durable-вход; Telegram-публикация не является условием."""
    if protected or not text or not source_date:
        return False
    if source_date < utcnow() - timedelta(hours=ACTIVE_HOURS) or source_date > utcnow() + timedelta(minutes=5):
        return False
    revision = hashlib.sha256(text.encode()).hexdigest()
    hints = list(contact_hints or [])[:20]
    if hints:
        revision = hashlib.sha256((text+'\0'+json.dumps(sorted(hints), ensure_ascii=False)).encode()).hexdigest()
    contacts = list(dict.fromkeys([*hints, *phones(text)]))[:20]
    now = time.time()
    with db:
        previous = db.execute("SELECT revision FROM app_messages WHERE source_id=? AND source_message=?",
                              (source_id,message_id)).fetchone()
        if previous and previous[0] == revision:
            return False
        db.execute("""INSERT INTO app_messages(source,source_id,source_message,source_date,text,phones,revision,received_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,source_message) DO UPDATE SET
          text=excluded.text,phones=excluded.phones,revision=excluded.revision,updated_at=excluded.updated_at""",
          (source,source_id,message_id,source_date.timestamp(),text,json.dumps(contacts),revision,now,now))
    LOG.info("app_received source=%s message=%s received_at=%.3f",source,message_id,now)
    return True


def settings():
    cfg = {}
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                cfg[key.strip()] = value.strip()
    for key in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_BOT_TOKEN", "PUBLISH_ENABLED", "TELEGRAM_PUBLISH_INTERVAL_SECONDS", "OWNED_FEED_ENABLED", "OWNED_TELEGRAM_CTA_ENABLED"):
        if key in os.environ:
            cfg[key] = os.environ[key]
    return cfg


def capture_owned_message(db, entity, msg):
    """Свой чат — только вход приложения; никогда не очередь публикации Telegram."""
    if not msg or getattr(entity, 'noforwards', False) or getattr(msg, 'noforwards', False):
        return False
    if str(getattr(entity, 'username', '')).lower() != OWNED_FEED_SOURCE.lower():
        return False
    text = msg.raw_text or ''
    if text == DOWNLOAD_TEXT:
        return False
    date = getattr(getattr(msg, 'fwd_from', None), 'date', None) or msg.date
    changed = capture_message_for_app(db, OWNED_FEED_SOURCE, entity.id, msg, date)
    # Кнопки — ответ бота на новую подходящую публикацию, не изменение чужого поста.
    # Исторический backfill не запускает массовые ответы.
    if changed and date and date >= utcnow()-timedelta(minutes=10) and phones(text) and (
            ROUTE.search(text) or (re.search(r'(?i)погрузка\s*:', text) and re.search(r'(?i)выгрузка\s*:', text))):
        from telethon.utils import get_peer_id
        key = f'owned_cta:{get_peer_id(entity)}:{msg.id}'
        with db:
            db.execute('INSERT OR IGNORE INTO metadata VALUES(?,?)', (key, json.dumps({
                'status': 'pending', 'chat_id': get_peer_id(entity), 'message_id': msg.id,
                'created_at': time.time(),
            })))
    return changed


def capture_owned_deletion(db, entity, message_id, chat_id):
    """Сохраняет tombstone удалённого поста, не продлевая его исходный TTL."""
    from telethon.utils import get_peer_id
    if not entity or chat_id != get_peer_id(entity):
        return False
    row = db.execute(
        "SELECT source_date FROM app_messages WHERE lower(source)=? AND source_id=? AND source_message=?",
        (OWNED_FEED_SOURCE.lower(), entity.id, message_id),
    ).fetchone()
    if row is None:
        return False
    published_at = datetime.fromtimestamp(row[0], timezone.utc)
    # capture_for_app сохраняет source_date при UPDATE, поэтому удаление
    # немедленно закрывает карточку, не продлевая срок жизни от исходной даты.
    changed = capture_for_app(db, OWNED_FEED_SOURCE, entity.id, message_id,
                              'Заявка закрыта', published_at)
    with db:
        db.execute("UPDATE app_message_metadata SET has_media=0,media_type=NULL,entity_contacts='[]',updated_at=? WHERE source_id=? AND source_message=?", (time.time(), str(entity.id), message_id))
    cta_key = f'owned_cta:{chat_id}:{message_id}'
    cta_row = db.execute('SELECT value FROM metadata WHERE key=?', (cta_key,)).fetchone()
    if cta_row:
        cta = json.loads(cta_row[0])
        if cta.get('status') == 'pending':
            cta['status'] = 'cancelled_source_deleted'
            with db:
                db.execute('UPDATE metadata SET value=? WHERE key=?', (json.dumps(cta), cta_key))
    return changed


def capture_owned_deletion_event(db, entity, chat_id, message_ids, expected_chat_id):
    """Принимает только события удаления из подтверждённой supergroup-ленты."""
    if chat_id != expected_chat_id:
        return 0
    return sum(capture_owned_deletion(db, entity, message_id, chat_id)
               for message_id in message_ids)


async def collect_owned(reader, db):
    if settings().get('OWNED_FEED_ENABLED', 'false').lower() != 'true':
        return
    try:
        entity = await reader.get_entity(OWNED_FEED_SOURCE)
        if str(getattr(entity, 'username', '')).lower() != OWNED_FEED_SOURCE.lower():
            raise RuntimeError('OWNED_SOURCE_IDENTITY_MISMATCH')
        row = db.execute('SELECT message_id FROM app_cursors WHERE source=?', (OWNED_FEED_SOURCE,)).fetchone()
        high = row[0] if row else 0
        async for msg in reader.iter_messages(entity, limit=25):
            capture_owned_message(db, entity, msg)
        kwargs = {'min_id': high, 'reverse': True, 'limit': 200} if high else {
            'offset_date': utcnow()-timedelta(hours=ACTIVE_HOURS), 'reverse': True, 'limit': 200}
        async for msg in reader.iter_messages(entity, **kwargs):
            capture_owned_message(db, entity, msg)
            with db:
                db.execute('INSERT INTO app_cursors VALUES(?,?) ON CONFLICT(source) DO UPDATE SET message_id=max(message_id,excluded.message_id)',
                           (OWNED_FEED_SOURCE, msg.id))
        # Revisit known posts throughout the active window, not just latest25.
        # The durable rotating cursor survives restart; each scan is bounded.
        key = 'owned_reconcile_cursor'
        cursor = int((db.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone() or [0])[0])
        query = ('SELECT id,source_message FROM app_messages WHERE lower(source)=? '
                 'AND source_id=? AND source_date>=? AND id>? ORDER BY id LIMIT 50')
        args = (OWNED_FEED_SOURCE.lower(), entity.id, time.time()-ACTIVE_HOURS*3600)
        known = db.execute(query, (*args, cursor)).fetchall()
        if not known:
            known = db.execute(query, (*args, 0)).fetchall()
        if known:
            ids = [row[1] for row in known]
            messages = await reader.get_messages(entity, ids=ids)
            if len(messages) != len(ids) or any(msg is not None and msg.id != ident
                                               for msg, ident in zip(messages, ids)):
                raise RuntimeError('OWNED_RECONCILE_RESPONSE_MISMATCH')
            for msg in messages:
                # An absent/inaccessible message is not proof of deletion.
                if msg is not None:
                    capture_owned_message(db, entity, msg)
            with db:
                db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', (key, str(known[-1][0])))
        with db:
            db.execute('INSERT OR REPLACE INTO source_health VALUES(?,?,NULL)', (OWNED_FEED_SOURCE, time.time()))
    except Exception as exc:
        with db:
            db.execute('INSERT OR REPLACE INTO source_health VALUES(?,?,?)', (OWNED_FEED_SOURCE, time.time(), type(exc).__name__))
            if type(exc).__name__ == 'FloodWaitError':
                pause = str(time.time() + max(1, int(getattr(exc, 'seconds', 60))) + 1)
                for key in ('scan_after', 'owned_scan_after'):
                    db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', (key, pause))
        LOG.warning('owned_source_unavailable type=%s', type(exc).__name__)


class BotReplyRejected(Exception):
    def __init__(self, code, retry_after=0):
        self.code = code
        self.retry_after = retry_after
        super().__init__('bot_reply_rejected')


def _send_download_reply(token, payload):
    request = urllib.request.Request('https://api.telegram.org/bot'+token+'/sendMessage',
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read(10000))
            delay = max(1, int(body.get('parameters', {}).get('retry_after', 60)))
        except (ValueError, TypeError):
            delay = 60
        raise BotReplyRejected(exc.code, delay) from None
    if not body.get('ok'):
        raise BotReplyRejected(body.get('error_code', 400), body.get('parameters', {}).get('retry_after', 60))
    if not body.get('ok') or not body.get('result', {}).get('message_id'):
        raise ValueError('invalid_bot_ack')
    return body['result']['message_id']


async def owned_download_tick(db, cfg, sender=None):
    if (cfg.get('OWNED_FEED_ENABLED', 'false').lower() != 'true'
            or cfg.get('OWNED_TELEGRAM_CTA_ENABLED', 'false').lower() != 'true'
            or not cfg.get('TELEGRAM_BOT_TOKEN')):
        return
    pause = db.execute("SELECT value FROM metadata WHERE key='owned_cta_pause_until'").fetchone()
    if pause and time.time() < float(pause[0]):
        return
    # Один bot request за цикл. Не повторять неизвестный исход отправки вслепую.
    row = db.execute("""SELECT key,value FROM metadata WHERE key LIKE 'owned_cta:%'
        AND json_extract(value,'$.status')='pending'
        ORDER BY json_extract(value,'$.created_at'),key LIMIT 1""").fetchone()
    if row is None:
        return
    state = json.loads(row['value'])
    if state['created_at'] < time.time()-24*3600:
        state['status'] = 'expired'
    else:
        state['status'] = 'sending'
    with db:
        db.execute('UPDATE metadata SET value=? WHERE key=?', (json.dumps(state), row['key']))
    if state['status'] == 'expired':
        return
    payload = {'chat_id': state['chat_id'], 'text': DOWNLOAD_TEXT, 'disable_notification': True,
               'reply_parameters': {'message_id': state['message_id'], 'allow_sending_without_reply': False},
               'reply_markup': DOWNLOAD_BUTTONS}
    try:
        state['reply_message_id'] = await asyncio.to_thread(sender or _send_download_reply, cfg['TELEGRAM_BOT_TOKEN'], payload)
        state['status'] = 'sent'
    except BotReplyRejected as exc:
        state['status'] = 'pending' if exc.code == 429 else 'rejected'
        state['reason'] = f'http_{exc.code}'
        with db:
            db.execute("INSERT OR REPLACE INTO metadata VALUES('owned_cta_pause_until',?)",
                       (str(time.time()+max(1, exc.retry_after)),))
    except Exception as exc:
        # Ошибка не останавливает приём. Секрет/текст исключения не логируются.
        state['status'] = 'uncertain'
        state['reason'] = type(exc).__name__
        LOG.warning('owned_download_reply_unconfirmed type=%s', type(exc).__name__)
    with db:
        db.execute('UPDATE metadata SET value=? WHERE key=?', (json.dumps(state), row['key']))


def _secure_database_files(path):
    nofollow = getattr(os, "O_NOFOLLOW", 0)

    def secure_file(file_path, create=False):
        flags = os.O_RDWR | nofollow
        if create:
            flags |= os.O_CREAT
        try:
            fd = os.open(file_path, flags, 0o600)
        except FileNotFoundError:
            return
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise RuntimeError("feed_database_file_not_regular")
            os.fchmod(fd, 0o600)
        finally:
            os.close(fd)

    secure_file(path, create=True)
    for suffix in ("-wal", "-shm", "-journal"):
        # SQLite creates sidecars after connect(), under the service umask.
        # Pre-create each file so a permissive umask cannot expose feed data.
        secure_file(Path(f"{path}{suffix}"), create=True)


def database(path=None):
    default_path = path is None
    path = Path(path or ROOT / "state/feed.sqlite3")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if default_path:
        os.chmod(path.parent, 0o700)
    _secure_database_files(path)
    db = sqlite3.connect(str(path))
    db.row_factory = sqlite3.Row
    db.executescript("""
        PRAGMA journal_mode=WAL;
        PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS queue (
          id INTEGER PRIMARY KEY, source TEXT NOT NULL, source_id INTEGER NOT NULL,
          source_message INTEGER NOT NULL, source_date REAL NOT NULL,
          text TEXT NOT NULL, phones TEXT NOT NULL, fingerprint TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued', random_id INTEGER,
          destination_message INTEGER, published_date TEXT, published_at REAL,
          reason TEXT, UNIQUE(source_id,source_message));
        CREATE INDEX IF NOT EXISTS queue_status ON queue(status, source_date);
        CREATE INDEX IF NOT EXISTS queue_fingerprint ON queue(fingerprint);
        CREATE TABLE IF NOT EXISTS app_messages (
          id INTEGER PRIMARY KEY, source TEXT NOT NULL, source_id INTEGER NOT NULL,
          source_message INTEGER NOT NULL, source_date REAL NOT NULL, text TEXT NOT NULL,
          phones TEXT NOT NULL DEFAULT '[]', revision TEXT NOT NULL,
          received_at REAL NOT NULL, updated_at REAL NOT NULL,
          UNIQUE(source_id,source_message));
        CREATE INDEX IF NOT EXISTS app_messages_updated ON app_messages(updated_at,id);
        CREATE INDEX IF NOT EXISTS app_messages_published ON app_messages(source_date DESC,updated_at DESC,id DESC);
        CREATE TABLE IF NOT EXISTS app_cursors (source TEXT PRIMARY KEY, message_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS app_message_metadata (
          source_id TEXT NOT NULL, source_message INTEGER NOT NULL,
          has_media INTEGER NOT NULL DEFAULT 0, media_type TEXT,
          entity_contacts TEXT NOT NULL DEFAULT '[]', source_date REAL NOT NULL, updated_at REAL NOT NULL,
          PRIMARY KEY(source_id,source_message));
        CREATE TABLE IF NOT EXISTS source_health (source TEXT PRIMARY KEY, checked_at REAL, error TEXT);
        CREATE TABLE IF NOT EXISTS app_history (
          source TEXT PRIMARY KEY, oldest_id INTEGER NOT NULL DEFAULT 0,
          started_at REAL NOT NULL, checked_at REAL NOT NULL,
          completed_at REAL, last_error TEXT);
        CREATE TABLE IF NOT EXISTS cursors (source TEXT PRIMARY KEY, message_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS prior (message_id INTEGER PRIMARY KEY,text TEXT NOT NULL,published_date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    """)
    # Keep prior Telegram output history, but scope the active deduplication
    # window and counters to the configured destination. The first migration
    # archives the old group queue/history and replays only still-fresh items.
    destination = db.execute("SELECT value FROM metadata WHERE key='destination_name'").fetchone()
    if destination is None:
        prior_count = db.execute("SELECT count(*) FROM prior").fetchone()[0]
        queue_count = db.execute("SELECT count(*) FROM queue").fetchone()[0]
        with db:
            if prior_count:
                db.execute("ALTER TABLE prior RENAME TO prior_group_archive_20261025")
                db.execute("CREATE TABLE prior (message_id INTEGER PRIMARY KEY,text TEXT NOT NULL,published_date TEXT NOT NULL)")
            if queue_count:
                db.execute("CREATE TABLE IF NOT EXISTS queue_group_archive_20261025 AS SELECT * FROM queue")
                cutoff = time.time() - 24 * 60 * 60
                db.execute("""UPDATE queue SET status='queued',random_id=NULL,destination_message=NULL,
                  published_date=NULL,published_at=NULL,reason=NULL
                  WHERE status IN ('published','sending','uncertain') AND source_date>=?""", (cutoff,))
                db.execute("""UPDATE queue SET status='expired',reason='older_than_24_hours'
                  WHERE status IN ('sending','uncertain') AND source_date<?""", (cutoff,))
            db.execute("INSERT OR REPLACE INTO metadata VALUES('destination_name',?)", (DESTINATION_NAME,))
            db.execute("INSERT OR REPLACE INTO metadata VALUES('destination_started_at',?)", (str(time.time()),))
    elif destination[0] != DESTINATION_NAME:
        raise RuntimeError("DESTINATION_CHANGE_REQUIRES_MANUAL_MIGRATION")
    with contextlib.suppress(OSError):
        os.chmod(path, 0o600)
    return db


def enqueue(db, source, source_id, message_id, text, source_date, now=None):
    if db.execute("SELECT 1 FROM queue WHERE source_id=? AND source_message=?", (source_id, message_id)).fetchone():
        return False
    contact = phones(text)
    # Compare exact copies only against the active destination and its queue.
    started = destination_started_at(db)
    previous = db.execute("SELECT text FROM prior UNION ALL SELECT text FROM queue WHERE status NOT IN ('expired','rejected') AND (published_at IS NULL OR published_at>=?)", (started,)).fetchall()
    if any(similar(text, row[0]) for row in previous):
        return False
    with db:
        db.execute("INSERT INTO queue(source,source_id,source_message,source_date,text,phones,fingerprint) VALUES(?,?,?,?,?,?,?)",
                   (source, source_id, message_id, source_date.timestamp(), text, json.dumps(contact), fingerprint(text)))
    return True


def destination_started_at(db):
    row = db.execute("SELECT value FROM metadata WHERE key='destination_started_at'").fetchone()
    return float(row[0]) if row else 0.0


def day_count(db, date):
    started = destination_started_at(db)
    n = db.execute("SELECT count(*) FROM queue WHERE status IN ('published','sending','uncertain') AND published_date=? AND published_at>=?", (date,started)).fetchone()[0]
    n += db.execute("SELECT count(*) FROM prior WHERE published_date=?", (date,)).fetchone()[0]
    return n


def publish_interval_seconds():
    try:
        return max(1.0, float(settings().get("TELEGRAM_PUBLISH_INTERVAL_SECONDS", "15")))
    except (TypeError, ValueError):
        return 15.0


def due(db, now=None):
    now = (now or utcnow()).astimezone(TZ)
    started = destination_started_at(db)
    last = db.execute("SELECT max(published_at) FROM queue WHERE status IN ('published','sending','uncertain') AND published_at>=?", (started,)).fetchone()[0]
    pause = float((db.execute("SELECT value FROM metadata WHERE key='publish_after'").fetchone() or [0])[0])
    interval = publish_interval_seconds()
    return now.timestamp() >= pause and (last is None or now.timestamp() - last >= interval)


def reserve(db, now=None):
    now = now or utcnow()
    db.execute("BEGIN IMMEDIATE")
    try:
        started = destination_started_at(db)
        if not due(db, now):
            db.rollback()
            return None
        db.execute("UPDATE queue SET status='expired',reason='older_than_24_hours' WHERE status='queued' AND source_date<?", ((now - timedelta(hours=24)).timestamp(),))
        # Неопределённый результат изолирует только ту же публикацию.
        row = db.execute("""SELECT q.* FROM queue q WHERE q.status='queued'
          AND NOT EXISTS(SELECT 1 FROM queue pending WHERE pending.status IN ('sending','uncertain')
                         AND pending.fingerprint=q.fingerprint)
          ORDER BY q.source_date DESC,q.id DESC LIMIT 1""").fetchone()
        if row is None:
            db.commit()
            return None
        rid = row["random_id"] or secrets.randbits(63)
        db.execute("UPDATE queue SET status='sending',random_id=?,published_date=?,published_at=? WHERE id=?",
                   (rid, now.astimezone(TZ).date().isoformat(), now.timestamp(), row['id']))
        db.commit()
        return db.execute("SELECT * FROM queue WHERE id=?", (row['id'],)).fetchone()
    except BaseException:
        db.rollback()
        raise


async def make_reader(cfg):
    from telethon import TelegramClient
    if not cfg.get("TELEGRAM_API_ID") or not cfg.get("TELEGRAM_API_HASH"):
        raise RuntimeError("CONFIG_REQUIRED")
    reader = TelegramClient(str(ROOT / "state/reader"), int(cfg["TELEGRAM_API_ID"]), cfg["TELEGRAM_API_HASH"],
                            request_retries=0, connection_retries=3, flood_sleep_threshold=0,
                            device_model="UrTruck freight feed", app_version="1.0")
    await reader.connect()
    if not await reader.is_user_authorized():
        await reader.disconnect()
        raise RuntimeError("TELEGRAM_LOGIN_REQUIRED")
    return reader


async def sync_prior(reader, db, target):
    # History before publishing is mandatory: it also catches manual posts.
    cursor_key = f"destination_cursor:{DESTINATION_NAME}"
    last = db.execute("SELECT value FROM metadata WHERE key=?", (cursor_key,)).fetchone()
    kwargs = {"min_id": int(last[0])} if last else {"limit": 300}
    messages = [m async for m in reader.iter_messages(target, **kwargs)]
    started = destination_started_at(db)
    own = {row[0] for row in db.execute("SELECT destination_message FROM queue WHERE status='published' AND published_at>=?", (started,))}
    with db:
        for msg in messages:
            text = msg.raw_text or ""
            if phones(text) and msg.id not in own:
                db.execute("INSERT OR IGNORE INTO prior VALUES(?,?,?)", (msg.id,text,msg.date.astimezone(TZ).date().isoformat()))
        high = max([m.id for m in messages] + [int(last[0]) if last else 0])
        db.execute("INSERT OR REPLACE INTO metadata VALUES(?,?)", (cursor_key,str(high)))


APP_HISTORY_PAGE = 200
APP_HISTORY_SOURCES_PER_SCAN = 2
APP_HISTORY_RECONCILE_SECONDS = 6 * 3600


async def collect_app_history(reader, db, source, entity):
    """Ограниченный семидневный обход той же сессией; очередь Telegram не затрагивается."""
    now = time.time()
    state = db.execute('SELECT * FROM app_history WHERE source=?', (source,)).fetchone()
    if state and state['completed_at'] and now-state['completed_at'] < APP_HISTORY_RECONCILE_SECONDS:
        return {'status': 'complete', 'seen': 0, 'app_received': 0}
    oldest = state['oldest_id'] if state and not state['completed_at'] else 0
    with db:
        db.execute('''INSERT INTO app_history(source,oldest_id,started_at,checked_at)
          VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET
          oldest_id=excluded.oldest_id, checked_at=excluded.checked_at,
          completed_at=NULL, last_error=NULL''', (source,oldest,now,now))
    kwargs = {'limit': APP_HISTORY_PAGE}
    if oldest:
        kwargs['offset_id'] = oldest
    seen = captured = 0
    complete = False
    cutoff = utcnow()-timedelta(hours=ACTIVE_HOURS)
    async for msg in reader.iter_messages(entity, **kwargs):
        seen += 1
        if msg.date and msg.date < cutoff:
            complete = True
            break
        captured += capture_message_for_app(db,source,entity.id,msg,protected=bool(getattr(msg,'noforwards',False)))
        # Только после durable capture; исключение не перескакивает запись.
        with db:
            db.execute('UPDATE app_history SET oldest_id=? WHERE source=?', (msg.id,source))
    complete = complete or seen < APP_HISTORY_PAGE
    if complete:
        with db:
            db.execute('UPDATE app_history SET completed_at=? WHERE source=?', (time.time(),source))
    return {'status': 'complete' if complete else 'catching_up',
            'seen': seen, 'app_received': captured}


async def collect(reader, db):
    from telethon.errors import FloodWaitError
    report = {}
    pause = float((db.execute("SELECT value FROM metadata WHERE key='scan_after'").fetchone() or [0])[0])
    if time.time() < pause:
        return {"status": "flood_wait"}
    history_candidates = []
    for source in app_sources():
        try:
            entity = await reader.get_entity(source)
            if getattr(entity, "noforwards", False):
                report[source] = {"blocked": "protected_content"}
                continue
            legacy = db.execute("SELECT message_id FROM cursors WHERE source=?", (source,)).fetchone()
            app = db.execute("SELECT message_id FROM app_cursors WHERE source=?", (source,)).fetchone()
            high = min(legacy[0] if legacy else 0, app[0] if app else 0)
            added = seen = captured = 0
            legacy_high = legacy[0] if legacy else 0
            # Свежая голова доступна приложению до исторического catch-up.
            # Курсор здесь не двигаем: оставшийся диапазон не должен пропасть.
            async for msg in reader.iter_messages(entity,limit=25):
                if msg.date and msg.date>=utcnow()-timedelta(hours=24):
                    captured += capture_message_for_app(db,source,entity.id,msg,protected=bool(getattr(msg,'noforwards',False)))
            kwargs = {"min_id": high, "reverse": True, "limit": 200} if high else {
                "offset_date": utcnow()-timedelta(hours=24), "reverse": True, "limit": 200}
            async for msg in reader.iter_messages(entity, **kwargs):
                seen += 1
                high = max(high,msg.id)
                text = msg.raw_text or ""
                protected = bool(getattr(msg, "noforwards", False))
                captured += capture_message_for_app(db,source,entity.id,msg,protected=protected)
                if msg.id>legacy_high and eligible(text,msg.date,protected):
                    added += enqueue(db,source,entity.id,msg.id,text,msg.date)
                # Обе записи durable до продвижения курсора; хронологические страницы.
                with db:
                    for table in ("cursors", "app_cursors"):
                        db.execute(f"INSERT INTO {table} VALUES(?,?) ON CONFLICT(source) DO UPDATE SET message_id=max(message_id,excluded.message_id)",(source,msg.id))
            with db:
                db.execute("INSERT OR IGNORE INTO app_cursors VALUES(?,?)",(source,high))
                db.execute("INSERT OR REPLACE INTO source_health VALUES(?,?,NULL)",(source,time.time()))
            history_candidates.append((source,entity))
            report[source] = {"seen":seen,"accepted":added,"app_received":captured}
        except FloodWaitError as exc:
            with db:
                db.execute("INSERT OR REPLACE INTO metadata VALUES('scan_after',?)",(str(time.time()+exc.seconds+1),))
            report[source] = {"blocked":"flood_wait","retry_after":exc.seconds}
            break
        except Exception as exc:
            with db:
                db.execute("INSERT OR REPLACE INTO source_health VALUES(?,?,?)",(source,time.time(),type(exc).__name__))
            report[source] = {"blocked":type(exc).__name__}
        await asyncio.sleep(1)
    # Свежий обход и события имеют приоритет; история равномерно движется по
    # двум источникам за цикл, не использует high-water cursors публикаций.
    pause = float((db.execute("SELECT value FROM metadata WHERE key='scan_after'").fetchone() or [0])[0])
    if time.time() >= pause:
        history_state = {row['source']: row for row in db.execute('SELECT * FROM app_history')}
        history_candidates = [(source,entity) for source,entity in history_candidates
                              if source not in history_state or not history_state[source]['completed_at']
                              or time.time()-history_state[source]['completed_at'] >= APP_HISTORY_RECONCILE_SECONDS]
        history_checked = {source: row['checked_at'] for source,row in history_state.items()}
        history_candidates.sort(key=lambda entry: history_checked.get(entry[0],0))
        for source,entity in history_candidates[:APP_HISTORY_SOURCES_PER_SCAN]:
            try:
                report[source]['history'] = await collect_app_history(reader,db,source,entity)
            except FloodWaitError as exc:
                with db:
                    db.execute("INSERT OR REPLACE INTO metadata VALUES('scan_after',?)",(str(time.time()+exc.seconds+1),))
                    db.execute('UPDATE app_history SET last_error=? WHERE source=?', ('FloodWaitError',source))
                report[source]['history'] = {'blocked':'flood_wait','retry_after':exc.seconds}
                break
            except Exception as exc:
                with db:
                    db.execute('UPDATE app_history SET last_error=? WHERE source=?',(type(exc).__name__,source))
                report[source]['history'] = {'blocked':type(exc).__name__}
    LOG.info("source_scan %s",json.dumps(report,ensure_ascii=False))
    return report


def forward_message_id(result, random_id):
    for update in getattr(result, "updates", []):
        if getattr(update, "random_id", None) == random_id and getattr(update, "id", None):
            return update.id
    for update in getattr(result, "updates", []):
        msg = getattr(update, "message", None)
        if msg is not None and getattr(msg, "id", None):
            return msg.id
    return None


async def publish(reader, db, target):
    from telethon import functions
    from telethon.errors import FloodWaitError, RPCError
    if not due(db):
        return
    await sync_prior(reader, db, target)
    row = reserve(db)
    if row is None:
        return
    try:
        source = await reader.get_input_entity(row["source"])
        current = await reader.get_messages(source, ids=row["source_message"])
        entity = await reader.get_entity(source)
        if not current or not eligible(current.raw_text, current.date, bool(getattr(entity,"noforwards",False) or getattr(current,"noforwards",False))):
            with db:
                db.execute("UPDATE queue SET status='rejected',reason='deleted_closed_or_expired' WHERE id=?", (row['id'],))
            return
        # Edits are rechecked for duplicates before the exact current original is forwarded.
        if any(similar(current.raw_text,p[0]) for p in db.execute("SELECT text FROM prior")):
            with db:
                db.execute("UPDATE queue SET status='rejected',reason='already_in_destination' WHERE id=?", (row['id'],))
            return
        with db:
            db.execute("UPDATE queue SET text=?,fingerprint=?,phones=? WHERE id=?", (current.raw_text,fingerprint(current.raw_text),json.dumps(phones(current.raw_text)),row['id']))
        result = await reader(functions.messages.ForwardMessagesRequest(
            from_peer=source, id=[row['source_message']], random_id=[row['random_id']],
            to_peer=target, silent=True, drop_author=False))
        message_id = forward_message_id(result, row['random_id'])
        with db:
            db.execute("UPDATE queue SET status=?,destination_message=?,reason=? WHERE id=?",
                       ("published" if message_id else "uncertain",message_id,None if message_id else "missing_delivery_receipt",row['id']))
        LOG.info("publication %s",json.dumps({"id":row['id'],"message_id":message_id,"source":row['source'],"source_message":row['source_message']}))
    except FloodWaitError as exc:
        with db:
            db.execute("UPDATE queue SET status='queued',published_date=NULL,published_at=NULL WHERE id=?",(row['id'],))
            db.execute("INSERT OR REPLACE INTO metadata VALUES('publish_after',?)",(str(time.time()+exc.seconds+1),))
        LOG.warning("publish_flood_wait retry_after=%d",exc.seconds)
    except RPCError as exc:
        # An explicit RPC rejection is definite, unlike a disconnected/timeout response.
        with db:
            db.execute("UPDATE queue SET status='rejected',reason=? WHERE id=?",(type(exc).__name__,row['id']))
        LOG.warning("publish_rejected type=%s",type(exc).__name__)
    except Exception as exc:
        with db:
            db.execute("UPDATE queue SET status='uncertain',reason=? WHERE id=?",(type(exc).__name__,row['id']))
        LOG.error("publication_uncertain id=%s type=%s; reconciliation_required",row['id'],type(exc).__name__)


STALE_SEND_RECOVERY_SECONDS = 180


async def reconcile(reader, db, target):
    rows = db.execute("SELECT * FROM queue WHERE status IN ('sending','uncertain')").fetchall()
    if not rows:
        return
    stale = any(row['published_at'] and time.time()-row['published_at'] >= STALE_SEND_RECOVERY_SECONDS
                for row in rows)
    history_limit = 1500 if stale else 300
    messages = [m async for m in reader.iter_messages(target, limit=history_limit)]
    for row in rows:
        candidates = []
        for msg in messages:
            if not msg.date or msg.date.timestamp() < row['published_at'] - 30:
                continue
            if similar(msg.raw_text or "", row['text']):
                candidates.append(msg)
        if len(candidates) == 1:
            msg = candidates[0]
            with db:
                db.execute("UPDATE queue SET status='published',destination_message=?,reason=NULL WHERE id=?",(msg.id,row['id']))
                db.execute("DELETE FROM prior WHERE message_id=?",(msg.id,))
            LOG.info("delivery_reconciled queue=%d message=%d",row['id'],msg.id)
        elif candidates:
            # A matching Telegram message proves delivery. Resolve the queue lock
            # to the candidate nearest the original attempt and never forward it again.
            msg = min(candidates, key=lambda candidate: abs(candidate.date.timestamp()-row['published_at']))
            with db:
                db.execute("UPDATE queue SET status='published',destination_message=?,reason=NULL WHERE id=?",
                           (msg.id,row['id']))
                db.execute("DELETE FROM prior WHERE message_id=?",(msg.id,))
            LOG.warning("delivery_reconciled_multiple queue=%d matches=%d selected=%d",
                        row['id'],len(candidates),msg.id)
        elif row['published_at'] and time.time()-row['published_at'] >= STALE_SEND_RECOVERY_SECONDS:
            # Retry only after the fetched destination history covers the attempt.
            # Keep the same MTProto random_id to deduplicate a lost acknowledgement.
            oldest = min((msg.date.timestamp() for msg in messages if msg.date), default=None)
            history_covers_attempt = len(messages) < history_limit or (
                oldest is not None and oldest <= row['published_at']-30)
            if history_covers_attempt:
                with db:
                    db.execute("""UPDATE queue SET status='queued',destination_message=NULL,
                      published_date=NULL,published_at=NULL,reason='recovered_absent_from_destination'
                      WHERE id=? AND status IN ('sending','uncertain') AND published_at=?""",
                      (row['id'],row['published_at']))
                LOG.warning("delivery_retry_recovered queue=%d random_id_preserved=true",row['id'])
            else:
                LOG.error("delivery_requires_review queue=%d matches=0 history_coverage=insufficient",row['id'])
        else:
            LOG.error("delivery_requires_review queue=%d matches=%d; no resend",row['id'],len(candidates))


def status(db):
    local_now = datetime.now(TZ)
    today = local_now.date().isoformat()
    started = destination_started_at(db)
    day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    confirmed = db.execute("SELECT count(*) FROM queue WHERE status='published' AND published_date=? AND published_at>=?", (today,started)).fetchone()[0]
    confirmed += db.execute("SELECT count(*) FROM prior WHERE published_date=?", (today,)).fetchone()[0]
    queue = dict(db.execute("""SELECT status,count(*) FROM queue WHERE
      status='queued' OR (status IN ('published','sending','uncertain','rejected') AND published_at>=?)
      OR (status='expired' AND source_date>=?) GROUP BY status""", (started,started-24*60*60)))
    app_by_source = dict(db.execute("SELECT source,count(*) FROM app_messages WHERE received_at>=? GROUP BY source", (day_start,)))
    source_health = {row[0]: {"checked_at":row[1],"error":row[2]} for row in db.execute("SELECT source,checked_at,error FROM source_health")}
    app_received = sum(app_by_source.values())
    app_updated = db.execute("SELECT count(*) FROM app_messages WHERE updated_at>=? AND received_at<?", (day_start,day_start)).fetchone()[0]
    return {"destination":DESTINATION_NAME,"sources":list(app_sources()),"source_health":source_health,"timezone":"Asia/Almaty",
            "today":today,"published_today":confirmed,"budget_used_today":day_count(db,today),
            "app_messages_received_today":app_received,"app_messages_updated_today":app_updated,"app_by_source_today":app_by_source,
            "publish_interval_seconds":publish_interval_seconds(),"daily_limit":None,"queue":queue,
            "last_tick":(db.execute("SELECT value FROM metadata WHERE key='last_tick'").fetchone() or [None])[0]}


async def telegram_tick(reader, db, state):
    """Ошибка destination не останавливает независимый приём в приложение."""
    from telethon.errors import FloodWaitError
    if time.time()<state.get("retry_after",0):
        return
    try:
        if not state.get("target"):
            target=await asyncio.wait_for(reader.get_input_entity(DESTINATION),30)
            permission=await asyncio.wait_for(reader.get_permissions(target,"me"),30)
            if not (permission.is_creator or permission.is_admin):
                raise RuntimeError("DESTINATION_ADMIN_REQUIRED")
            await asyncio.wait_for(sync_prior(reader,db,target),30)
            state["target"]=target
        if time.monotonic()-state.get("last_reconcile",0)>=60:
            await asyncio.wait_for(reconcile(reader,db,state["target"]),30)
            state["last_reconcile"]=time.monotonic()
        await asyncio.wait_for(publish(reader,db,state["target"]),45)
    except Exception as exc:
        state.pop("target",None)
        delay=exc.seconds+1 if isinstance(exc,FloodWaitError) else 60
        state["retry_after"]=time.time()+delay
        if isinstance(exc, FloodWaitError):
            with db:
                db.execute("INSERT OR REPLACE INTO metadata VALUES('publish_after',?)",
                           (str(state["retry_after"]),))
        LOG.warning("telegram_destination_paused type=%s retry_after=%s; app_intake_continues",
                    type(exc).__name__,delay)


async def run(once=False, check=False):
    cfg = settings()
    db = database()
    reader = await make_reader(cfg)
    from telethon import events
    # Единственная Telegram-сессия и существующий публикатор.
    allowed = {}
    for source in app_sources():
        try:
            entity = await reader.get_entity(source)
            if not getattr(entity,"noforwards",False):
                allowed[entity.id] = source
        except Exception as exc:
            LOG.warning("source_unavailable source=%s type=%s",source,type(exc).__name__)
    owned_entity = None
    if cfg.get('OWNED_FEED_ENABLED', 'false').lower() == 'true':
        try:
            candidate = await reader.get_entity(OWNED_FEED_SOURCE)
            if str(getattr(candidate, 'username', '')).lower() == OWNED_FEED_SOURCE.lower():
                owned_entity = candidate
        except Exception as exc:
            LOG.warning('owned_source_unavailable type=%s', type(exc).__name__)
    if owned_entity is not None:
        from telethon.utils import get_peer_id
    async def incoming(event):
        msg = event.message
        ident = getattr(event,"chat_id",None)
        # Telethon использует marked channel id: -100 + исходный id.
        raw_id = int(str(ident)[4:]) if str(ident).startswith("-100") else abs(ident or 0)
        if owned_entity is not None:
            if ident == get_peer_id(owned_entity):
                capture_owned_message(db, owned_entity, msg)
                return
        source = allowed.get(raw_id)
        if source:
            capture_message_for_app(db,source,raw_id,msg,protected=bool(getattr(msg,'noforwards',False)))
    reader.add_event_handler(incoming, events.NewMessage())
    reader.add_event_handler(incoming, events.MessageEdited())
    if owned_entity is not None:
        async def deleted(event):
            capture_owned_deletion_event(
                db, owned_entity, getattr(event, 'chat_id', None),
                getattr(event, 'deleted_ids', ()), get_peer_id(owned_entity),
            )
        reader.add_event_handler(deleted, events.MessageDeleted(chats=owned_entity))
    try:
        if check:
            target=await reader.get_input_entity(DESTINATION)
            permission=await reader.get_permissions(target,"me")
            if not (permission.is_creator or permission.is_admin):
                raise RuntimeError("DESTINATION_ADMIN_REQUIRED")
            print(json.dumps({"authorized":True,"destination_admin":True,"destination":DESTINATION_NAME}))
            return
        await run_cycles(reader, db, cfg, once=once)
    finally:
        await reader.disconnect()
        db.close()


async def run_cycles(reader, db, cfg, once=False):
    """Не более одного обхода; долгое collect не блокирует публикатор и heartbeat."""
    scan_task = None
    owned_task = None
    last_scan = float('-inf')
    last_owned_scan = float('-inf')
    telegram_state = {}
    try:
        while True:
            if owned_task is not None and owned_task.done():
                try:
                    owned_task.result()
                except Exception as exc:
                    LOG.warning('owned_scan_failed type=%s', type(exc).__name__)
                owned_task = None
            if scan_task is not None and scan_task.done():
                try:
                    scan_task.result()
                except Exception as exc:
                    LOG.warning('source_scan_failed type=%s', type(exc).__name__)
                scan_task = None
            if scan_task is None and time.monotonic()-last_scan >= 60:
                last_scan = time.monotonic()
                scan_task = asyncio.create_task(collect(reader, db))
            if cfg.get('OWNED_FEED_ENABLED', 'false').lower() == 'true' and owned_task is None and time.monotonic()-last_owned_scan >= 15:
                pause = max(float((db.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone() or [0])[0])
                            for key in ('scan_after', 'owned_scan_after'))
                if time.time() >= pause:
                    last_owned_scan = time.monotonic()
                    owned_task = asyncio.create_task(collect_owned(reader, db))
            if cfg.get('PUBLISH_ENABLED', 'false').lower() == 'true':
                await telegram_tick(reader, db, telegram_state)
            await owned_download_tick(db, cfg)
            with db:
                db.execute("INSERT OR REPLACE INTO metadata VALUES('last_tick',?)", (utcnow().isoformat(),))
            if once:
                await scan_task
                if owned_task is not None:
                    await owned_task
                print(json.dumps(status(db), ensure_ascii=False))
                return
            await asyncio.sleep(5)
    finally:
        for task in (scan_task, owned_task):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("command",choices=["run","collect","check","status"])
    args=parser.parse_args()
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("telethon").setLevel(logging.ERROR)
    os.umask(0o077)
    if args.command=="status":
        db=database()
        print(json.dumps(status(db),ensure_ascii=False,indent=2))
        db.close()
        return
    # A lock prevents a second manual invocation competing with the service.
    import fcntl
    (ROOT/'state').mkdir(mode=0o700,exist_ok=True)
    with (ROOT/'state/worker.lock').open('w') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("WORKER_ALREADY_RUNNING")
        try:
            asyncio.run(run(once=args.command=="collect",check=args.command=="check"))
        except Exception as exc:
            # Never print exception payloads: they can include authentication data.
            code=str(exc) if str(exc) in {"CONFIG_REQUIRED","TELEGRAM_LOGIN_REQUIRED","DESTINATION_ADMIN_REQUIRED"} else type(exc).__name__
            LOG.error("worker_stopped code=%s",code)
            raise SystemExit(78 if code in {"CONFIG_REQUIRED","TELEGRAM_LOGIN_REQUIRED","DESTINATION_ADMIN_REQUIRED"} else 1)


if __name__=="__main__":
    main()
