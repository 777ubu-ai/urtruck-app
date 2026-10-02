"""Migration contracts for the additive hidden-voice processing queue.

These subprocess tests deliberately start with isolated SQLite files.  They
prove both a clean install and an already-populated chat schema can adopt the
queue without enqueueing historic voice messages.  The production QA2 database
is never opened by this suite.
"""
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run(db_path: Path, code: str) -> None:
    env = {
        **os.environ,
        "DB_PATH": str(db_path),
        "ENV": "test",
        "URTRUCK_ENV": "test",
        "BETA_MODE": "true",
    }
    completed = subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, env=env,
        text=True, capture_output=True, timeout=30,
    )
    assert completed.returncode == 0, completed.stderr + completed.stdout


def test_clean_database_creates_hidden_voice_queue_idempotently(tmp_path):
    _run(tmp_path / "clean.db", """
from database.db import init_db, get_conn
from database.registration_dal import init_registration_schema
init_db(); init_registration_schema()
from api import chat
chat._init(); chat._init()
with get_conn() as c:
    columns = {r['name'] for r in c.execute('PRAGMA table_info(voice_processing_jobs)')}
    assert {'message_id','audio_version','model_version','status','locked_at','locked_by',
            'next_retry_at','expires_at','force_reprocess','last_error'} <= columns
    assert c.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_voice_processing_ready'").fetchone()
    assert "stage" in {r['name'] for r in c.execute('PRAGMA table_info(voice_processing_metrics)')}
    assert c.execute('SELECT COUNT(*) FROM voice_processing_jobs').fetchone()[0] == 0
""")


def test_populated_legacy_chat_schema_is_additive_and_rerunnable(tmp_path):
    _run(tmp_path / "legacy.db", """
from database.db import init_db, get_conn
from database.registration_dal import init_registration_schema
init_db(); init_registration_schema()
from api import chat
chat._init()
with get_conn() as c:
    c.execute("INSERT INTO chat_rooms(id,participant_1,participant_2,last_message) VALUES('r1','u1','u2','old')")
    c.execute("INSERT INTO chat_messages(room_id,sender_id,text,photo_url,is_voice) VALUES('r1','u1','', 'private/old-audio.m4a', 1)")
    # Simulate an earlier queue deployment before force_reprocess existed.
    c.execute('DROP TABLE voice_processing_jobs')
    c.execute('''CREATE TABLE voice_processing_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL,
        audio_version TEXT NOT NULL, model_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id,audio_version,model_version))''')
from api import chat as chat_again
chat_again._init(); chat_again._init()
with get_conn() as c:
    old = c.execute("SELECT photo_url,is_voice FROM chat_messages WHERE room_id='r1'").fetchone()
    assert tuple(old) == ('private/old-audio.m4a', 1)
    columns = {r['name'] for r in c.execute('PRAGMA table_info(voice_processing_jobs)')}
    assert 'force_reprocess' in columns
    # No migration may backfill an historic voice into a background job.
    assert c.execute('SELECT COUNT(*) FROM voice_processing_jobs').fetchone()[0] == 0
    # An older binary's chat read remains valid: the queue is additive.
    assert c.execute("SELECT id,room_id,sender_id,photo_url,is_voice FROM chat_messages WHERE room_id='r1'").fetchone()
""")
