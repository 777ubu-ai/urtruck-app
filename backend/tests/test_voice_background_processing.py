"""Behavioral coverage for hidden background STT queue (SQLite, no provider)."""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_voice_background.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database.db import get_conn

ddb.init_db()
import api.chat as chat  # noqa: E402,F401 - initializes additive chat schema
from services import voice_processing as jobs  # noqa: E402
from services.speech_to_text_service import SpeechToTextError  # noqa: E402

chat._ensure_translation_schema()


def setup_function(_):
    chat._ensure_translation_schema()
    with get_conn() as c:
        c.execute("DELETE FROM voice_processing_jobs")
        c.execute("DELETE FROM chat_translations")
        c.execute("DELETE FROM chat_messages")
        c.execute("DELETE FROM chat_rooms")


def _voice_message(message_id=1, room_id="voice-room"):
    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_rooms(id,participant_1,participant_2,deal_key) VALUES(?,?,?,?)",
            (room_id, "voice-a", "voice-b", f"p:{room_id}"),
        )
        c.execute(
            """INSERT INTO chat_messages(id,room_id,sender_id,text,photo_url,is_voice)
               VALUES(?,?,?,?,?,1)""",
            (message_id, room_id, "voice-a", "🎤", f"chat_voice/{message_id}.m4a"),
        )
    return message_id


def _job(message_id):
    with get_conn() as c:
        row = c.execute("SELECT * FROM voice_processing_jobs WHERE message_id=?", (message_id,)).fetchone()
    return dict(row) if row else None


def test_new_voice_creates_one_durable_job_and_never_backfills_old_messages():
    _voice_message(1)
    _voice_message(2, "voice-room-2")  # historic row: deliberately no enqueue
    assert jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="ru", target_lang="zh") is True
    assert jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="ru", target_lang="zh") is False
    assert _job(1)["status"] == "queued"
    assert _job(2) is None
    assert _job(2) is None


def test_two_workers_cannot_claim_one_stt_job():
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    with get_conn() as c:
        job_id = c.execute("SELECT id FROM voice_processing_jobs WHERE message_id=1").fetchone()["id"]
    assert jobs._claim(job_id) is not None
    assert jobs._claim(job_id) is None


def test_expired_worker_cannot_overwrite_the_new_lease_result(monkeypatch):
    """A slow old worker must become stale after another worker reclaimed it."""
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    with get_conn() as c:
        job_id = c.execute("SELECT id FROM voice_processing_jobs WHERE message_id=1").fetchone()["id"]

    old_job = jobs._claim(job_id)
    assert old_job is not None
    with get_conn() as c:
        c.execute("UPDATE voice_processing_jobs SET locked_at=datetime('now','-3 minutes') WHERE id=?", (job_id,))
        jobs._reclaim_and_expire(c)
        c.execute("UPDATE voice_processing_jobs SET next_retry_at=CURRENT_TIMESTAMP WHERE id=?", (job_id,))
    fresh_job = jobs._claim(job_id)
    assert fresh_job is not None
    assert fresh_job["lease_id"] != old_job["lease_id"]

    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *_args, **_kwargs: {"transcript_text": "fresh owner result", "source_lang": "ru", "provider": "test-stt"},
    )
    assert jobs._process(old_job) == "stale"
    assert jobs._process(fresh_job) == "ready"
    with get_conn() as c:
        assert c.execute("SELECT voice_transcript FROM chat_messages WHERE id=1").fetchone()[0] == "fresh owner result"
        assert c.execute("SELECT status FROM voice_processing_jobs WHERE id=?", (job_id,)).fetchone()[0] == "ready"


def test_success_prepares_hidden_transcript_and_translation_once(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="ru", target_lang="zh")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: {"transcript_text": "Груз 10 тонн", "source_lang": "ru", "provider": "test-stt"},
    )
    monkeypatch.setattr(
        "services.translate_service.translate_text",
        lambda *a, **k: {"translated_text": "货物10吨", "provider": "test-translate"},
    )
    assert jobs.process_pending_once()["ready"] == 1
    assert _job(1)["status"] == "ready"
    with get_conn() as c:
        transcript = c.execute("SELECT voice_transcript FROM chat_messages WHERE id=1").fetchone()[0]
        translation = c.execute("SELECT translated_text FROM chat_translations WHERE message_id=1 AND target_lang='zh'").fetchone()[0]
    assert transcript == "Груз 10 тонн"
    assert translation == "货物10吨"


def test_transient_failure_retries_with_lease_recovery_and_permanent_stops(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: (_ for _ in ()).throw(SpeechToTextError("temporary", retryable=True, code="TRANSCRIPTION_TIMEOUT")),
    )
    assert jobs.process_pending_once()["failed_retryable"] == 1
    assert _job(1)["status"] == "failed_retryable"
    with get_conn() as c:
        c.execute("UPDATE voice_processing_jobs SET status='processing', locked_at=datetime('now','-3 minutes') WHERE message_id=1")
    jobs.process_pending_once()
    assert _job(1)["status"] == "failed_retryable"
    # A permanent provider error does not schedule another retry.
    with get_conn() as c:
        c.execute("UPDATE voice_processing_jobs SET status='queued', next_retry_at=CURRENT_TIMESTAMP WHERE message_id=1")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: (_ for _ in ()).throw(SpeechToTextError("permanent", retryable=False, code="TRANSCRIPTION_FAILED")),
    )
    assert jobs.process_pending_once()["failed_permanent"] == 1
    assert _job(1)["status"] == "failed_permanent"


def test_ready_cache_expires_without_touching_original_audio_or_historic_job():
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    with get_conn() as c:
        c.execute("UPDATE voice_processing_jobs SET status='ready', expires_at=datetime('now','-1 second') WHERE message_id=1")
    jobs.process_pending_once()
    assert _job(1)["status"] == "expired"
    with get_conn() as c:
        assert c.execute("SELECT photo_url FROM chat_messages WHERE id=1").fetchone()[0] == "chat_voice/1.m4a"
