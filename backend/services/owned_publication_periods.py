"""Изолированный переход на сроки собственных публикаций.

Никаких DDL или включений при импорте. Запуск миграции — отдельное действие
после backup/dry-run; функция получает соединение и не управляет commit.
"""
from datetime import datetime, timedelta, timezone
import sqlite3
import uuid

PERIOD = timedelta(days=30)
EXPIRY_TEXT = {
    'RU': ('Срок публикации истёк', 'Объявление сохранено в личной истории.'),
    'KK': ('Жариялау мерзімі аяқталды', 'Хабарландыру жеке тарихта сақталды.'),
    'ZH': ('发布期限已过', '信息已保存在个人历史记录中。'),
    'EN': ('Publication period expired', 'The listing remains in your history.'),
}


def _utc(now):
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    return now


def _stamp(value):
    return _utc(value).isoformat(timespec='microseconds') + 'Z'


def _parse(value):
    if not value:
        return None
    try:
        return _utc(datetime.fromisoformat(str(value).replace('Z', '+00:00')))
    except (TypeError, ValueError):
        return None


def is_enabled(conn):
    try:
        return bool(conn.execute("SELECT 1 FROM owned_publication_policy WHERE id=1 AND enabled=1").fetchone())
    except sqlite3.OperationalError as exc:
        if 'no such table' in str(exc):
            return False
        raise


def has_periods_table(conn):
    return bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='owned_publication_periods'").fetchone())


def inventory(conn, *, enabled_at):
    """Без записей: определить сроки, занятость и доступность владельца."""
    when = _utc(enabled_at)
    output = []
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for kind, table, owner, occupied in (('cargo','cargos','owner_id','taken_by'), ('trip','trips','driver_id','booked_by')):
        columns = {row[1] for row in conn.execute(f'PRAGMA table_info({table})')}
        occupied_sql = occupied if occupied in columns else 'NULL'
        for row in conn.execute(f"SELECT id,{owner},status,published_at,created_at,{occupied_sql} AS occupied FROM {table} WHERE status='active'"):
            value = dict(row)
            active_deal = _deal_exists(conn,kind,value['id'],include_completed=False) if 'deals' in tables else None
            owner_available = _owner_available(conn,value[owner]) if 'drivers_registration' in tables else None
            output.append({'kind': kind, 'id': value['id'], 'owner_id': value[owner],
                           'published_at': value['published_at'], 'created_at': value['created_at'],
                           'occupied': bool(value['occupied']), 'active_deal': active_deal,
                           'owner_available': owner_available, 'expires_at': _stamp(when + PERIOD)})
    return output


def activate(conn, *, enabled_at):
    """Разовая миграция внутри транзакции вызывающего; повтор не меняет сроки."""
    if is_enabled(conn):
        raise ValueError('publication_policy_already_enabled')
    when = _utc(enabled_at)
    rows = inventory(conn, enabled_at=when)
    conn.execute('''CREATE TABLE IF NOT EXISTS owned_publication_policy (
        id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, enabled_at TEXT NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS owned_publication_periods (
        kind TEXT NOT NULL CHECK(kind IN ('cargo','trip')), listing_id TEXT NOT NULL,
        owner_id TEXT, period_id TEXT NOT NULL, started_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        previous_period_id TEXT, owner_hidden INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(kind, listing_id))''')
    for row in rows:
        conn.execute('''INSERT INTO owned_publication_periods
            (kind,listing_id,owner_id,period_id,started_at,expires_at)
            VALUES(?,?,?,?,?,?)''', (row['kind'], row['id'], row['owner_id'], str(uuid.uuid4()),
                                     _stamp(when), row['expires_at']))
    conn.execute('INSERT INTO owned_publication_policy(id,enabled,enabled_at) VALUES(1,1,?)', (_stamp(when),))
    return rows


BLOCKING_DEALS = ('accepted', 'in_progress', 'at_border', 'awaiting_confirmation', 'delivered', 'received', 'completed')
ACTIVE_DEALS = BLOCKING_DEALS[:-1]


def _owner_available(conn, owner_id):
    if not owner_id:
        return False
    row = conn.execute('SELECT role,status FROM drivers_registration WHERE id=?', (owner_id,)).fetchone()
    if not row:
        return False
    forbidden = {'deleted', 'blocked', 'suspended', 'disabled', 'deactivated'}
    return str(row['role'] or '').lower() not in forbidden and str(row['status'] or '').lower() not in forbidden


def _deal_exists(conn, kind, listing_id, *, include_completed=True):
    column = 'cargo_id' if kind == 'cargo' else 'trip_id'
    states = BLOCKING_DEALS if include_completed else ACTIVE_DEALS
    marks = ','.join('?' for _ in states)
    return bool(conn.execute(f'SELECT 1 FROM deals WHERE {column}=? AND status IN ({marks}) LIMIT 1',
                             (listing_id, *states)).fetchone())


def _expiry_text(conn, owner_id):
    from services.push_i18n import normalize_locale
    exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='push_devices'").fetchone()
    row = conn.execute('''SELECT locale FROM push_devices WHERE user_id=? AND enabled=1
                          ORDER BY last_seen_at DESC,id DESC LIMIT 1''', (owner_id,)).fetchone() if exists else None
    return EXPIRY_TEXT.get(normalize_locale(row[0] if row else None), EXPIRY_TEXT['RU'])


def _ensure_new_periods(conn, now):
    enabled_at = _parse(conn.execute('SELECT enabled_at FROM owned_publication_policy WHERE id=1').fetchone()[0])
    for kind, table, owner in (('cargo', 'cargos', 'owner_id'), ('trip', 'trips', 'driver_id')):
        rows = conn.execute(f'''SELECT l.id,l.{owner} AS owner_id,l.published_at,l.created_at
            FROM {table} l LEFT JOIN owned_publication_periods p ON p.kind=? AND p.listing_id=l.id
            WHERE l.status='active' AND p.listing_id IS NULL''', (kind,)).fetchall()
        for row in rows:
            created = _parse(row['created_at'])
            published = _parse(row['published_at'])
            if not created or created <= enabled_at:
                start = enabled_at
            else:
                start = published if published and enabled_at <= published <= now else min(created, now)
            conn.execute('''INSERT OR IGNORE INTO owned_publication_periods
                (kind,listing_id,owner_id,period_id,started_at,expires_at) VALUES(?,?,?,?,?,?)''',
                (kind,row['id'],row['owner_id'],str(uuid.uuid4()),_stamp(start),_stamp(start + PERIOD)))


def expire_due(conn, *, now):
    """Истечение и inbox атомарны даже при перехвате ошибки вызывающим кодом."""
    started_transaction = not conn.in_transaction
    if started_transaction:
        conn.execute('BEGIN')
    conn.execute('SAVEPOINT owned_publication_expiry')
    try:
        result = _expire_due(conn, now=now)
        conn.execute('RELEASE SAVEPOINT owned_publication_expiry')
        return result
    except Exception:
        conn.execute('ROLLBACK TO SAVEPOINT owned_publication_expiry')
        conn.execute('RELEASE SAVEPOINT owned_publication_expiry')
        if started_transaction:
            conn.rollback()
        raise


def _expire_due(conn, *, now):
    """Истечение и inbox в транзакции вызывающего; push/outbox не создаётся."""
    if not is_enabled(conn):
        return []
    now = _utc(now)
    _ensure_new_periods(conn, now)
    expired = []
    for kind, table, owner, occupied in (('cargo','cargos','owner_id','taken_by'),('trip','trips','driver_id','booked_by')):
        rows = conn.execute(f'''SELECT l.id,l.{owner} AS owner_id,l.{occupied} AS occupied,
            p.period_id,p.expires_at,p.owner_id AS period_owner
            FROM {table} l JOIN owned_publication_periods p ON p.kind=? AND p.listing_id=l.id
            WHERE l.status='active' AND julianday(p.expires_at)<=julianday(?)''', (kind,_stamp(now))).fetchall()
        for row in rows:
            if row['occupied'] or _deal_exists(conn,kind,row['id'],include_completed=False):
                continue
            if row['period_owner'] != row['owner_id']:
                continue
            deal_column = 'cargo_id' if kind == 'cargo' else 'trip_id'
            placeholders = ','.join('?' for _ in ACTIVE_DEALS)
            updated = conn.execute(f'''UPDATE {table} SET status='expired'
                WHERE id=? AND {owner}=? AND status='active' AND COALESCE({occupied},'')=''
                AND NOT EXISTS (SELECT 1 FROM deals WHERE {deal_column}=? AND status IN ({placeholders}))
                AND EXISTS (SELECT 1 FROM owned_publication_periods p WHERE p.kind=? AND p.listing_id=?
                            AND p.owner_id=? AND p.period_id=? AND julianday(p.expires_at)<=julianday(?))''',
                (row['id'], row['owner_id'], row['id'], *ACTIVE_DEALS, kind, row['id'], row['owner_id'], row['period_id'], _stamp(now)))
            if not updated.rowcount:
                continue
            event_key = f"listing-expired:{kind}:{row['id']}:{row['period_id']}"
            if _owner_available(conn,row['owner_id']):
                title, body = _expiry_text(conn, row['owner_id'])
                conn.execute('''INSERT INTO notifications(user_id,type,title,body,icon,url,event_key)
                    VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING''',
                    (row['owner_id'],'listing_lifecycle',title,body,'⌛',
                     f"/{'cargos' if kind == 'cargo' else 'trips'}/{row['id']}?publication_expired=1",event_key))
            expired.append((kind,row['id']))
    return expired


def renew(conn, *, kind, listing_id, owner_id, expected_period_id, now):
    """Одна операция на прежний period_id; caller сериализует BEGIN IMMEDIATE."""
    if not is_enabled(conn) or kind not in ('cargo','trip') or not expected_period_id:
        raise ValueError('publication_policy_unavailable')
    table, owner, occupied = ('cargos','owner_id','taken_by') if kind == 'cargo' else ('trips','driver_id','booked_by')
    row = conn.execute(f'''SELECT l.status,l.{owner} AS owner_id,l.{occupied} AS occupied,
        p.period_id,p.previous_period_id,p.expires_at,p.owner_id AS period_owner,p.owner_hidden
        FROM {table} l JOIN owned_publication_periods p ON p.kind=? AND p.listing_id=l.id WHERE l.id=?''',
        (kind,listing_id)).fetchone()
    if not row:
        raise ValueError('listing_not_found')
    if row['owner_id'] != owner_id or row['period_owner'] != owner_id:
        raise PermissionError('not_owner')
    if row['previous_period_id'] == expected_period_id and row['status'] == 'active':
        return {'ok':True,'period_id':row['period_id'],'expires_at':row['expires_at']}
    if (row['period_id'] != expected_period_id or row['status'] != 'expired' or row['occupied']
            or row['owner_hidden'] or not _owner_available(conn,owner_id) or _deal_exists(conn,kind,listing_id)):
        raise ValueError('renewal_not_allowed')
    start = _utc(now)
    next_id = str(uuid.uuid4())
    expires_at = _stamp(start + PERIOD)
    conn.execute('''UPDATE owned_publication_periods SET previous_period_id=period_id,period_id=?,started_at=?,expires_at=?
                    WHERE kind=? AND listing_id=? AND period_id=?''',
                 (next_id,_stamp(start),expires_at,kind,listing_id,expected_period_id))
    changed = conn.execute(f"UPDATE {table} SET status='active' WHERE id=? AND status='expired'",(listing_id,))
    if changed.rowcount != 1:
        raise ValueError('renewal_conflict')
    return {'ok':True,'period_id':next_id,'expires_at':expires_at}


def disposition(conn, *, kind, listing_id, owner_id, action):
    """Личное скрытие или сохранение в архиве, без изменения связанных строк."""
    if not is_enabled(conn) or kind not in ('cargo', 'trip') or action not in ('archive', 'hide'):
        raise ValueError('publication_policy_unavailable')
    table, owner = ('cargos','owner_id') if kind == 'cargo' else ('trips','driver_id')
    row = conn.execute(f'''SELECT l.status,l.{owner} AS owner_id,p.period_id,p.owner_id AS period_owner
        FROM {table} l JOIN owned_publication_periods p ON p.kind=? AND p.listing_id=l.id WHERE l.id=?''',
        (kind, listing_id)).fetchone()
    if not row:
        raise ValueError('listing_not_found')
    if row['owner_id'] != owner_id or row['period_owner'] != owner_id:
        raise PermissionError('not_owner')
    if row['status'] != 'expired':
        raise ValueError('disposition_not_allowed')
    if action == 'hide':
        conn.execute('UPDATE owned_publication_periods SET owner_hidden=1 WHERE kind=? AND listing_id=?', (kind,listing_id))
    return {'ok': True, 'status': 'expired', 'hidden': action == 'hide'}


def is_due(conn, *, kind, listing_id, now):
    if not is_enabled(conn):
        return False
    row = conn.execute('SELECT expires_at FROM owned_publication_periods WHERE kind=? AND listing_id=?', (kind,listing_id)).fetchone()
    deadline = _parse(row[0]) if row else None
    return bool(deadline and deadline <= _utc(now))
