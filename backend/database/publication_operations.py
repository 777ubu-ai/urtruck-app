"""Результат публикации хранится атомарно с объявлением и только для его владельца."""
import hashlib
import json

from fastapi import HTTPException


def init_schema(c):
    c.execute('''CREATE TABLE IF NOT EXISTS marketplace_publication_operations (
      owner_user_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      listing_kind TEXT NOT NULL CHECK(listing_kind IN ('cargo','trip')),
      request_fingerprint TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(owner_user_id, client_id)
    )''')


def fingerprint(body):
    try:
        encoded = json.dumps(body.model_dump(mode='json', exclude={'client_id'}),
                             sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (ValueError, TypeError, UnicodeError):
        raise HTTPException(status_code=422, detail={'error': 'PUBLICATION_INVALID_BODY'}) from None
    return hashlib.sha256(encoded).hexdigest()


def replay(c, owner, kind, body):
    if body.client_id is None:
        return None
    incoming_fingerprint = fingerprint(body)
    # Один writer lock охватывает поиск, создание объявления и запись результата.
    c.execute('BEGIN IMMEDIATE')
    previous = c.execute(
        'SELECT listing_kind,request_fingerprint,result_json FROM marketplace_publication_operations '
        'WHERE owner_user_id=? AND client_id=?', (owner, body.client_id),
    ).fetchone()
    if previous is None:
        return None
    result = json.loads(previous['result_json'])
    if previous['listing_kind'] != kind or previous['request_fingerprint'] != incoming_fingerprint:
        raise HTTPException(status_code=409, detail={
            'error': 'PUBLICATION_IDEMPOTENCY_CONFLICT', 'original_result': result,
        })
    return result


def record(c, owner, kind, body, result):
    if body.client_id is None:
        return
    c.execute(
        'INSERT INTO marketplace_publication_operations '
        '(owner_user_id,client_id,listing_kind,request_fingerprint,result_json) VALUES(?,?,?,?,?)',
        (owner, body.client_id, kind, fingerprint(body), json.dumps(result, sort_keys=True)),
    )
