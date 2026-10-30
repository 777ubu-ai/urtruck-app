"""Восстановление полного поста без изменения маршрута, статуса и срока карточки."""
import hashlib
import json
import os
from datetime import datetime, timezone

from services.external_freight_parser import block_contacts


def repair_original(db, row, full, journal, *, apply=False):
    """Только доказанный фрагмент того же поста; обновление защищено ревизией."""
    if not isinstance(full, str) or len(full) > 20000:
        return 'invalid_source'
    if row['original_text'] == full:
        return 'already_complete'
    if not row['original_text'] or row['original_text'] not in full:
        return 'source_changed'
    if row['status'] != 'active':
        return 'not_active'
    now = datetime.now(timezone.utc).isoformat()
    if not row['expires_at'] or row['expires_at'] <= now:
        return 'expired'
    contacts = list(dict.fromkeys([*json.loads(row['source_contacts'] or '[]'), *block_contacts(full)]))[:20]
    revision = hashlib.sha256((row['source_revision']+'\0full-source-repair-v1\0'+full).encode()).hexdigest()
    after = {'original_text': full, 'source_contacts': json.dumps(contacts, ensure_ascii=False),
             'source_revision': revision, 'updated_at': now}
    if not apply:
        return 'repairable'
    if journal is None:
        raise ValueError('durable_journal_required')
    before = {key: row[key] for key in after}
    journal.write(json.dumps({'id': row['id'], 'before': before, 'after': after}, ensure_ascii=False)+'\n')
    journal.flush()
    os.fsync(journal.fileno())
    with db:
        result = db.execute("""UPDATE external_freight_items
            SET original_text=?,source_contacts=?,source_revision=?,updated_at=?
            WHERE id=? AND original_text=? AND source_revision=? AND status='active' AND expires_at>?""",
            (*after.values(), row['id'], row['original_text'], row['source_revision'], now))
    return 'repaired' if result.rowcount == 1 else 'concurrent_change'


def rollback_original(db, entry):
    """Не откатывает последующие правки и не меняет текущий статус/TTL/закладки."""
    before, after = entry['before'], entry['after']
    with db:
        result = db.execute("""UPDATE external_freight_items
            SET original_text=?,source_contacts=?,source_revision=?,updated_at=?
            WHERE id=? AND source_revision=? AND original_text=? AND source_contacts=? AND updated_at=?""",
            (before['original_text'], before['source_contacts'], before['source_revision'], before['updated_at'],
             entry['id'], after['source_revision'], after['original_text'], after['source_contacts'], after['updated_at']))
    return result.rowcount == 1
