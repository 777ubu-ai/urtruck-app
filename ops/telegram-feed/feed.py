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
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("Asia/Almaty")
DESTINATION = -1004325478296
DESTINATION_NAME = "@UrTruck_obyavleniya"
SOURCES= ("gruz_china", "alashankougruz", "gruzbaktyshankou", "cargo_china_gruz", "Cargo75", "K7777KZ", "nurzholychat", "nurzholy23", "zzzzz777777zzzz777", "kaljatchat")
# Дополнительные источники обслуживают только приложение; старый Telegram allowlist сохранён.
def app_sources():
    path=ROOT / "app-sources.json"
    extra=json.loads(path.read_text()) if path.exists() else []
    if not isinstance(extra,list) or any(not isinstance(x,str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}",x) for x in extra):
        raise ValueError("invalid_app_sources")
    return tuple(dict.fromkeys((*SOURCES,*extra)))


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
    """Ignore cosmetic edits; retain distinct routes, quantities and loading dates."""
    if not set(phones(left)).intersection(phones(right)):
        return False
    a, b = canonical(left), canonical(right)
    if a == b:
        return True
    # Changing a rate, weight, quantity or date deserves a fresh evaluation.
    if re.findall(r"\d+(?:[.,]\d+)?", a) != re.findall(r"\d+(?:[.,]\d+)?", b):
        return False
    aa, bb = set(a.split()), set(b.split())
    return len(aa & bb) / max(1, len(aa | bb)) >= 0.90


def eligible(text, source_date, protected=False, now=None):
    now = now or utcnow()
    if protected or not text or len(text) > 3600:
        return False
    if not source_date or source_date < now - timedelta(hours=24):
        return False
    if source_date > now + timedelta(minutes=5):
        return False
    return bool(phones(text) and CARGO.search(text) and ROUTE.search(text)
                and not UNRELATED.search(text) and not CLOSED.search(text))


def capture_for_app(db, source, source_id, message_id, text, source_date, protected=False):
    """Независимый durable-вход; Telegram-публикация не является условием."""
    if protected or not text or not source_date:
        return False
    if source_date < utcnow() - timedelta(hours=120) or source_date > utcnow() + timedelta(minutes=5):
        return False
    revision = hashlib.sha256(text.encode()).hexdigest()
    now = time.time()
    with db:
        previous = db.execute("SELECT revision FROM app_messages WHERE source_id=? AND source_message=?",
                              (source_id,message_id)).fetchone()
        if previous and previous[0] == revision:
            return False
        db.execute("""INSERT INTO app_messages(source,source_id,source_message,source_date,text,phones,revision,received_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,source_message) DO UPDATE SET
          text=excluded.text,phones=excluded.phones,revision=excluded.revision,updated_at=excluded.updated_at""",
          (source,source_id,message_id,source_date.timestamp(),text,json.dumps(phones(text)),revision,now,now))
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
    for key in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_BOT_TOKEN", "PUBLISH_ENABLED"):
        if key in os.environ:
            cfg[key] = os.environ[key]
    return cfg


def database(path=None):
    path = path or ROOT / "state/feed.sqlite3"
    Path(path).parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(path)
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
        CREATE TABLE IF NOT EXISTS app_cursors (source TEXT PRIMARY KEY, message_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS source_health (source TEXT PRIMARY KEY, checked_at REAL, error TEXT);
        CREATE TABLE IF NOT EXISTS cursors (source TEXT PRIMARY KEY, message_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS prior (message_id INTEGER PRIMARY KEY,text TEXT NOT NULL,published_date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    """)
    with contextlib.suppress(OSError):
        os.chmod(path, 0o600)
    return db


def enqueue(db, source, source_id, message_id, text, source_date, now=None):
    if db.execute("SELECT 1 FROM queue WHERE source_id=? AND source_message=?", (source_id, message_id)).fetchone():
        return False
    contact = phones(text)
    # Include historical channel text and all previously accepted candidates.
    previous = db.execute("SELECT text FROM prior UNION ALL SELECT text FROM queue WHERE status NOT IN ('expired','rejected')").fetchall()
    if any(similar(text, row[0]) for row in previous):
        return False
    with db:
        db.execute("INSERT INTO queue(source,source_id,source_message,source_date,text,phones,fingerprint) VALUES(?,?,?,?,?,?,?)",
                   (source, source_id, message_id, source_date.timestamp(), text, json.dumps(contact), fingerprint(text)))
    return True


def day_count(db, date):
    n = db.execute("SELECT count(*) FROM queue WHERE status IN ('published','sending','uncertain') AND published_date=?", (date,)).fetchone()[0]
    n += db.execute("SELECT count(*) FROM prior WHERE published_date=?", (date,)).fetchone()[0]
    return n


def due(db, now=None):
    now = (now or utcnow()).astimezone(TZ)
    last = db.execute("SELECT max(published_at) FROM queue WHERE status IN ('published','sending','uncertain')").fetchone()[0]
    pause = float((db.execute("SELECT value FROM metadata WHERE key='publish_after'").fetchone() or [0])[0])
    return now.timestamp() >= pause and (last is None or now.timestamp() - last >= 60)


def reserve(db, now=None):
    now = now or utcnow()
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("SELECT 1 FROM queue WHERE status IN ('sending','uncertain')").fetchone() or not due(db, now):
            db.rollback()
            return None
        db.execute("UPDATE queue SET status='expired',reason='older_than_24_hours' WHERE status='queued' AND source_date<?", ((now - timedelta(hours=24)).timestamp(),))
        row = db.execute("SELECT * FROM queue WHERE status='queued' ORDER BY source_date DESC,id DESC LIMIT 1").fetchone()
        if row is None:
            db.commit()
            return None
        rid = secrets.randbits(63)
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
    last = db.execute("SELECT value FROM metadata WHERE key='destination_cursor'").fetchone()
    kwargs = {"min_id": int(last[0])} if last else {"limit": 300}
    messages = [m async for m in reader.iter_messages(target, **kwargs)]
    own = {row[0] for row in db.execute("SELECT destination_message FROM queue WHERE status='published'")}
    with db:
        for msg in messages:
            text = msg.raw_text or ""
            if phones(text) and msg.id not in own:
                db.execute("INSERT OR IGNORE INTO prior VALUES(?,?,?)", (msg.id,text,msg.date.astimezone(TZ).date().isoformat()))
        high = max([m.id for m in messages] + [int(last[0]) if last else 0])
        db.execute("INSERT OR REPLACE INTO metadata VALUES('destination_cursor',?)", (str(high),))


async def collect(reader, db):
    from telethon.errors import FloodWaitError
    report = {}
    pause = float((db.execute("SELECT value FROM metadata WHERE key='scan_after'").fetchone() or [0])[0])
    if time.time() < pause:
        return {"status": "flood_wait"}
    for source in app_sources():
        try:
            entity = await reader.get_entity(source)
            if getattr(entity, "noforwards", False):
                report[source] = {"blocked": "protected_content"}
                continue
            legacy = db.execute("SELECT message_id FROM cursors WHERE source=?", (source,)).fetchone()
            app = db.execute("SELECT message_id FROM app_cursors WHERE source=?", (source,)).fetchone()
            high = (min(legacy[0] if legacy else 0, app[0] if app else 0)
                    if source in SOURCES else (app[0] if app else 0))
            added = seen = captured = 0
            kwargs = {"min_id": high, "reverse": True} if high else {
                "offset_date": utcnow()-timedelta(hours=24), "reverse": True}
            async for msg in reader.iter_messages(entity, **kwargs):
                seen += 1
                high = max(high,msg.id)
                text = msg.raw_text or ""
                protected = bool(getattr(msg, "noforwards", False))
                captured += capture_for_app(db,source,entity.id,msg.id,text,msg.date,protected)
                if source in SOURCES and eligible(text,msg.date,protected):
                    added += enqueue(db,source,entity.id,msg.id,text,msg.date)
                # Обе записи durable до продвижения курсора; хронологические страницы.
                with db:
                    for table in (("cursors", "app_cursors") if source in SOURCES else ("app_cursors",)):
                        db.execute(f"INSERT INTO {table} VALUES(?,?) ON CONFLICT(source) DO UPDATE SET message_id=max(message_id,excluded.message_id)",(source,msg.id))
            with db:
                db.execute("INSERT OR IGNORE INTO app_cursors VALUES(?,?)",(source,high))
                db.execute("INSERT OR REPLACE INTO source_health VALUES(?,?,NULL)",(source,time.time()))
            report[source] = {"seen":seen,"accepted":added,"app_received":captured}
        except FloodWaitError as exc:
            with db:
                db.execute("INSERT OR REPLACE INTO metadata VALUES('scan_after',?)",(str(time.time()+exc.seconds+1),))
            report[source] = {"blocked":"flood_wait","retry_after":exc.seconds}
            break
        except Exception as exc:
            with db:
                db.execute("INSERT OR IGNORE INTO app_cursors VALUES(?,?)",(source,high))
                db.execute("INSERT OR REPLACE INTO source_health VALUES(?,?,?)",(source,time.time(),type(exc).__name__))
            report[source] = {"blocked":type(exc).__name__}
        await asyncio.sleep(1)
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
        LOG.error("publication_uncertain id=%s type=%s; automatic publication halted",row['id'],type(exc).__name__)


async def reconcile(reader, db, target):
    rows = db.execute("SELECT * FROM queue WHERE status IN ('sending','uncertain')").fetchall()
    if not rows:
        return
    messages = [m async for m in reader.iter_messages(target, limit=300)]
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
        else:
            LOG.error("delivery_requires_review queue=%d matches=%d; no resend",row['id'],len(candidates))


def status(db):
    today=datetime.now(TZ).date().isoformat()
    confirmed=db.execute("SELECT count(*) FROM queue WHERE status='published' AND published_date=?",(today,)).fetchone()[0]
    confirmed+=db.execute("SELECT count(*) FROM prior WHERE published_date=?",(today,)).fetchone()[0]
    return {"destination":DESTINATION_NAME,"sources":list(SOURCES),"timezone":"Asia/Almaty",
            "today":today,"published_today":confirmed,"budget_used_today":day_count(db,today),
            "publish_interval_seconds":60,"daily_limit":None,
            "queue":dict(db.execute("SELECT status,count(*) FROM queue GROUP BY status")),
            "last_tick":(db.execute("SELECT value FROM metadata WHERE key='last_tick'").fetchone() or [None])[0]}


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
    async def incoming(event):
        msg = event.message
        ident = getattr(event,"chat_id",None)
        # Telethon использует marked channel id: -100 + исходный id.
        raw_id = int(str(ident)[4:]) if str(ident).startswith("-100") else abs(ident or 0)
        source = allowed.get(raw_id)
        if source:
            capture_for_app(db,source,raw_id,msg.id,msg.raw_text or "",msg.date,bool(getattr(msg,"noforwards",False)))
    reader.add_event_handler(incoming, events.NewMessage())
    reader.add_event_handler(incoming, events.MessageEdited())
    try:
        target = await reader.get_input_entity(DESTINATION)
        permission = await reader.get_permissions(target,"me")
        if not (permission.is_creator or permission.is_admin):
            raise RuntimeError("DESTINATION_ADMIN_REQUIRED")
        if check:
            print(json.dumps({"authorized":True,"destination_admin":True,"destination":DESTINATION_NAME}))
            return
        await reconcile(reader,db,target)
        await sync_prior(reader,db,target)
        last_scan = 0
        while True:
            if time.monotonic()-last_scan >= 60:
                last_scan=time.monotonic()
                await collect(reader,db)
                await reconcile(reader,db,target)
            if cfg.get("PUBLISH_ENABLED","false").lower()=="true":
                await publish(reader,db,target)
            with db:
                db.execute("INSERT OR REPLACE INTO metadata VALUES('last_tick',?)",(utcnow().isoformat(),))
            if once:
                print(json.dumps(status(db),ensure_ascii=False))
                return
            await asyncio.sleep(15)
    finally:
        await reader.disconnect()
        db.close()


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
