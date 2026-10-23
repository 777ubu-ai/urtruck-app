"""Постоянные контакты перевозчиков; не являются объявлениями свободных машин."""
import json
import os
import re
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from contextlib import closing

FIELDS = ('id', 'record_type', 'name', 'phones', 'emails', 'city', 'country', 'transport_type', 'notes')
PHONE = re.compile(r'^\+[1-9][0-9]{9,14}$')


def database_path():
    value = os.getenv('EXTERNAL_CARRIER_DIRECTORY_DB', '').strip()
    if value:
        return Path(value).expanduser().resolve()
    from database.external_freight_connection import database_path as freight_path
    return freight_path().with_name('carrier-directory.sqlite3')


def publish_contacts(records, path):
    """Импорт только подготовленных записей. Повтор не меняет дату добавления."""
    selected = []
    seen = set()
    for raw in records:
        if raw.get('publication_status') != 'ready_for_directory_import':
            continue
        value = {k: raw.get(k) for k in FIELDS}
        if not isinstance(value['id'], str) or not re.fullmatch(r'carrier_[a-f0-9]{20}', value['id']):
            raise ValueError('invalid_directory_id')
        if value['id'] in seen:
            raise ValueError('duplicate_directory_id')
        seen.add(value['id'])
        if raw.get('availability') != 'unknown' or raw.get('phone_review') or raw.get('shared_phone_with_other_contacts'):
            raise ValueError('unreviewed_directory_contact')
        if value['record_type'] not in ('carrier', 'driver_contact'):
            raise ValueError('invalid_directory_type')
        if not isinstance(value['phones'], list) or not 1 <= len(value['phones']) <= 20 or any(not isinstance(p, str) or not PHONE.fullmatch(p) for p in value['phones']):
            raise ValueError('invalid_directory_phone')
        if not isinstance(value['emails'], list) or len(value['emails']) > 20 or any(not isinstance(e, str) or len(e) > 254 for e in value['emails']):
            raise ValueError('invalid_directory_email')
        for field in ('name', 'city', 'country', 'transport_type', 'notes'):
            if value[field] is None:
                value[field] = ''
            if not isinstance(value[field], str) or len(value[field]) > (2000 if field == 'notes' else 500):
                raise ValueError('invalid_directory_text')
        value['availability'] = 'unknown'
        value['contact_verification'] = 'not_checked'
        value['sources'] = list(dict.fromkeys(str(p.get('source') or '')[:240] for p in raw.get('provenance', []) if p.get('source')))
        selected.append(value)
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise ValueError('directory_database_requires_absolute_regular_path')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    oldmask = os.umask(0o077)
    try:
        fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        os.close(fd)
        with closing(sqlite3.connect(str(path), timeout=5)) as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if tables - {'carrier_directory', 'sqlite_sequence'}:
                raise ValueError('directory_database_contains_unrelated_tables')
            os.chmod(path, 0o600)
            db.execute('''CREATE TABLE IF NOT EXISTS carrier_directory(
              sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL, search_text TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden')),
              imported_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
            now = datetime.now(timezone.utc).isoformat()
            with db:
                for value in selected:
                    search = ' '.join(str(value[k]) for k in ('name', 'city', 'country', 'transport_type')).casefold()
                    db.execute('''INSERT INTO carrier_directory(id,payload,search_text,imported_at,updated_at)
                      VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                      payload=excluded.payload,search_text=excluded.search_text,updated_at=excluded.updated_at''',
                      (value['id'], json.dumps(value, ensure_ascii=False), search, now, now))
            return {'active': db.execute("SELECT count(*) FROM carrier_directory WHERE status='active'").fetchone()[0],
                    'integrity': db.execute('PRAGMA integrity_check').fetchone()[0]}
    finally:
        os.umask(oldmask)


def list_contacts(*, query='', cursor=0, limit=30):
    path = database_path()
    if not path.is_file():
        return {'items': [], 'total': 0, 'next_cursor': None, 'kind': 'carrier_contact'}
    if not isinstance(query, str) or len(query) > 120 or not isinstance(cursor, int) or cursor < 0 or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError('invalid_directory_query')
    escaped = query.strip().casefold().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    where = "status='active' AND search_text LIKE ? ESCAPE '\\'"
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=5)) as db:
        db.row_factory = sqlite3.Row
        total = db.execute('SELECT count(*) FROM carrier_directory WHERE ' + where, ('%' + escaped + '%',)).fetchone()[0]
        rows = db.execute('SELECT sequence,payload,imported_at FROM carrier_directory WHERE ' + where + ' AND sequence>? ORDER BY sequence LIMIT ?',
                          ('%' + escaped + '%', cursor, limit + 1)).fetchall()
        items = []
        for row in rows[:limit]:
            value = json.loads(row['payload'])
            items.append({**value, 'kind': 'carrier_contact', 'imported_at': row['imported_at'],
                          'directory_sequence': row['sequence'], 'status': 'active', 'expires_at': None,
                          'source_published_at': None})
        return {'items': items, 'total': total, 'next_cursor': rows[limit - 1]['sequence'] if len(rows) > limit else None, 'kind': 'carrier_contact'}


def append_contacts(result, *, limit):
    """Продолжение той же ленты после актуальных объявлений, без фиктивной даты."""
    if result.get('next_cursor'):
        return result
    space = limit - len(result['items'])
    if space <= 0:
        if list_contacts(limit=1)['total']:
            return {**result, 'next_cursor': 'carrier:0'}
        return result
    page = list_contacts(limit=space)
    return {**result, 'items': result['items'] + page['items'],
            'next_cursor': 'carrier:' + str(page['next_cursor']) if page['next_cursor'] is not None else None}
