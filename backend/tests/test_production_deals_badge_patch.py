"""Регрессии двух реальных production counters, без импорта startup/DB migrations."""
import contextlib
import importlib.util
import json
import os
import sqlite3
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("production_badge_patch", ROOT / "scripts/ops/production_deals_badge_patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
FIXTURE = json.loads((ROOT / "tests/fixtures/production_badge_functions_20261014.json").read_text())

@pytest.fixture
def counters():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id TEXT,type TEXT,is_read INT);
    CREATE TABLE chat_messages(id INTEGER PRIMARY KEY,room_id TEXT,sender_id TEXT,is_read INT);
    CREATE TABLE chat_rooms(id TEXT,participant_1 TEXT,participant_2 TEXT,cargo_id TEXT,trip_id TEXT);
    CREATE TABLE deals(id TEXT,chat_room_id TEXT,cargo_id TEXT,trip_id TEXT,status TEXT);
    """)
    types = patch.notification_types(FIXTURE["types"])
    namespace = {"get_conn": lambda: contextlib.nullcontext(c), "Depends": lambda _: None, "require_level": lambda _: None}
    for name in patch.EXPECTED_SHA256:
        source = FIXTURE[name]
        if not os.environ.get("URTRUCK_BADGE_PATCH_BEFORE"):
            source = patch.transform(source, types)
        exec(compile(source, name, "exec"), namespace)
    yield c, namespace["unread_count"], namespace["_compute_recipient_badge"]
    c.close()

def counts(ctx):
    _, unread, badge = ctx
    return unread(user={"id": "owner"})["unread"], badge("owner")

@pytest.mark.parametrize("kind", ["no_bids","reminder","review","expired","info"])
def test_non_deal_reminders_do_not_count_or_get_deleted(counters, kind):
    c,_,_ = counters
    c.execute("INSERT INTO notifications VALUES(1,'owner',?,0)", (kind,))
    changes = c.total_changes
    assert counts(counters) == (0,0)
    assert c.total_changes == changes
    assert c.execute("SELECT is_read FROM notifications WHERE id=1").fetchone()[0] == 0

@pytest.mark.parametrize("kind", ["bid","bid_created","bid_accepted","bid_cancelled","bid_rejected","bid_countered","deal_created","deal_status","trip_status","tracking"])
def test_real_deal_events_count_and_clear_only_when_read(counters, kind):
    c,_,_ = counters
    c.execute("INSERT INTO notifications VALUES(1,'owner',?,0)", (kind,))
    c.execute("INSERT INTO notifications VALUES(2,'other',?,0)", (kind,))
    assert counts(counters) == (1,1)
    c.execute("UPDATE notifications SET is_read=1 WHERE id=1")
    assert counts(counters) == (0,0)
    assert c.execute("SELECT is_read FROM notifications WHERE id=2").fetchone()[0] == 0

def test_chat_counts_once_then_read_returns_zero_with_reminder_preserved(counters):
    c,_,_ = counters
    c.execute("INSERT INTO chat_rooms VALUES('r','owner','other','cargo',NULL)")
    c.execute("INSERT INTO deals VALUES('d','r','cargo',NULL,'accepted')")
    c.execute("INSERT INTO chat_messages VALUES(1,'r','other',0)")
    c.execute("INSERT INTO notifications VALUES(1,'owner','chat_message',0)")
    c.execute("INSERT INTO notifications VALUES(2,'owner','no_bids',0)")
    assert counts(counters) == (0,1)
    c.execute("UPDATE chat_messages SET is_read=1 WHERE id=1")
    assert counts(counters) == (0,0)
    assert c.execute("SELECT COUNT(*) FROM notifications WHERE is_read=0").fetchone()[0] == 2

def test_own_system_foreign_and_terminal_chats_are_still_excluded(counters):
    c,_,_ = counters
    c.executescript("""
    INSERT INTO chat_rooms VALUES('r','owner','other','cargo',NULL),('foreign','a','b','c2',NULL);
    INSERT INTO deals VALUES('d','r','cargo',NULL,'completed'),('d2','foreign','c2',NULL,'accepted');
    INSERT INTO chat_messages VALUES(1,'r','other',0),(2,'r','owner',0),(3,'r','system',0),(4,'foreign','a',0);
    """)
    assert counts(counters) == (0,0)

def test_standalone_chat_compatibility(counters):
    c,_,_ = counters
    c.execute("INSERT INTO chat_rooms VALUES('r','owner','other',NULL,NULL)")
    c.execute("INSERT INTO chat_messages VALUES(1,'r','other',0)")
    assert counts(counters) == (0,1)

def test_two_filters_are_changed_and_shape_drift_fails_closed():
    types = patch.notification_types(FIXTURE["types"])
    for name in patch.EXPECTED_SHA256:
        source = FIXTURE[name]
        out = patch.transform(source, types)
        assert source.count(patch.OLD_FILTER) == 1
        assert patch.OLD_FILTER not in out
        with pytest.raises(ValueError):
            patch.transform(out, types)
        with pytest.raises(ValueError):
            patch.transform(source + source, types)

def test_changed_baseline_does_not_create_output(tmp_path):
    source = tmp_path / "source"
    for name in patch.EXPECTED_SHA256:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(FIXTURE[name])
    out = tmp_path / "output"
    with pytest.raises(ValueError, match="baseline changed"):
        patch.prepare(source, out)
    assert not out.exists()

@pytest.mark.parametrize("types", [(), ("bid');DROP_TABLE--",)])
def test_unsafe_types_are_rejected(types):
    with pytest.raises(ValueError):
        patch.transform(FIXTURE["api/notifications.py"], types)
