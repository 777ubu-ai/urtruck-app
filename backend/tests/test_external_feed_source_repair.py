"""Восстановление старого фрагмента не теряет закладки, дату и новые правки."""
import json
from datetime import datetime, timezone

from database import external_freight_dal as dal
from database.external_freight_connection import get_conn
from services.external_freight_source_repair import repair_original, rollback_original


def test_full_original_repair_and_conditional_rollback(tmp_path, monkeypatch):
    monkeypatch.setenv('EXTERNAL_FREIGHT_DB_PATH', str(tmp_path/'feed.sqlite3'))
    dal.init_schema()
    raw = {'source_id':'1','source_message_id':'2','kind':'cargo','original_text':'Алматы → Москва\nНужен тент',
           'classification_status':'approved','source_published_at':datetime.now(timezone.utc).isoformat()}
    ident = dal.import_records([raw])[0]['id']
    dal.set_bookmark('owner', ident, 'cargo', True)
    full = raw['original_text']+'\n+998901234567\n'
    with get_conn() as db, (tmp_path/'journal.jsonl').open('w+') as journal:
        row = dict(db.execute('SELECT * FROM external_freight_items WHERE id=?',(ident,)).fetchone())
        assert repair_original(db, row, full, None) == 'repairable'
        assert repair_original(db, row, full, journal, apply=True) == 'repaired'
        updated = dict(db.execute('SELECT * FROM external_freight_items WHERE id=?',(ident,)).fetchone())
        assert updated['original_text'] == full
        for key in ('status','kind','source_published_at','expires_at','ingested_at','origin','destination','amount','contacts'):
            assert updated[key] == row[key]
        assert repair_original(db, updated, full, journal, apply=True) == 'already_complete'
        assert repair_original(db, row, full, journal, apply=True) == 'concurrent_change'
        journal.seek(0)
        entry = json.loads(journal.readline())
        assert rollback_original(db, entry)
        assert not rollback_original(db, entry)
    assert dal.get_item(ident, owner_id='owner')['saved']


def test_changed_source_and_closed_card_are_not_overwritten():
    row = {'original_text':'Исходный фрагмент','status':'closed'}
    assert repair_original(None,row,'Совсем другое объявление',None) == 'source_changed'
    assert repair_original(None,row,'Исходный фрагмент\n+998901234567',None) == 'not_active'
