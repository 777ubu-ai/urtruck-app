"""Behavioral coverage for hidden background STT queue (SQLite, no provider)."""
import os
import sys
import threading
import time
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
        # Metrics are append-only operational evidence.  The test database is
        # shared across examples, so isolate assertions from an earlier job
        # with the same synthetic message id.
        c.execute("DELETE FROM voice_processing_metrics")
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


def test_long_transcription_renews_lease_so_a_second_worker_cannot_start(monkeypatch):
    """A slow provider call owns one job until it returns; a crash still has TTL recovery."""
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    started = threading.Event()
    release = threading.Event()
    calls = []

    def slow_transcribe(*_args, **_kwargs):
        calls.append("stt")
        started.set()
        assert release.wait(8)
        return {"transcript_text": "only one provider call", "source_lang": "ru", "provider": "test-stt"}

    monkeypatch.setattr(jobs, "LEASE_SECONDS", 2)
    monkeypatch.setattr("services.speech_to_text_service.transcribe_audio_ref", slow_transcribe)
    worker = threading.Thread(target=lambda: jobs.process_pending_once(), daemon=True)
    worker.start()
    assert started.wait(3)
    # Cross the original TTL; heartbeat must keep the job out of the retry
    # scan, so a second worker cannot run the provider concurrently.
    time.sleep(2.4)
    assert jobs.process_pending_once()["picked"] == 0
    assert calls == ["stt"]
    release.set()
    worker.join(5)
    assert not worker.is_alive()
    assert _job(1)["status"] == "ready"


def test_success_prepares_hidden_transcript_and_translation_once(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="ru", target_lang="zh")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: {"transcript_text": "Груз 10 тонн", "source_lang": "ru", "provider": "test-stt", "model": "test-stt-model"},
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
        metric = c.execute(
            "SELECT provider,model,stage,outcome,latency_ms,usage_total_tokens FROM voice_processing_metrics WHERE message_id=1 AND stage='stt'"
        ).fetchone()
        metric_columns = {row["name"] for row in c.execute("PRAGMA table_info(voice_processing_metrics)")}
    assert transcript == "Груз 10 тонн"
    assert translation == "货物10吨"
    assert metric["provider"] == "test-stt"
    assert metric["model"] == "test-stt-model"
    assert metric["stage"] == "stt"
    assert metric["outcome"] == "transcribed"
    assert metric["latency_ms"] is not None
    assert not {"audio", "transcript", "translation", "raw_response", "api_key"} & metric_columns


def test_failed_openai_then_local_fallback_is_not_recorded_as_openai(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: (_ for _ in ()).throw(SpeechToTextError(
            "fallback failed", provider="openai_then_local_ai", retryable=True,
            code="TRANSCRIPTION_UNAVAILABLE",
        )),
    )
    assert jobs.process_pending_once()["failed_retryable"] == 1
    with get_conn() as c:
        metric = c.execute(
            "SELECT provider,stage,outcome,fallback,error_category FROM voice_processing_metrics WHERE message_id=1"
        ).fetchone()
    assert tuple(metric) == (
        "openai_then_local_ai", "stt", "failed_retryable", 1, "TRANSCRIPTION_UNAVAILABLE"
    )


def test_translation_outcome_is_recorded_as_a_separate_safe_stage(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="ru", target_lang="zh")
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: {"transcript_text": "controlled", "source_lang": "ru", "provider": "openai", "model": "gpt-4o-mini-transcribe"},
    )
    monkeypatch.setattr(
        "services.translate_service.translate_text",
        lambda *a, **k: {"translated_text": "controlled", "provider": "local_nllb_1_3b"},
    )
    assert jobs.process_pending_once()["ready"] == 1
    with get_conn() as c:
        metric = c.execute(
            "SELECT provider,stage,outcome,error_category FROM voice_processing_metrics WHERE message_id=1 AND stage='translation'"
        ).fetchone()
    assert tuple(metric) == ("test-translate", "translation", "translated", None)


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


def test_ready_result_persists_after_eight_days_and_never_becomes_a_retry_job():
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a")
    with get_conn() as c:
        c.execute(
            "UPDATE voice_processing_jobs SET status='ready', ready_at=datetime('now','-8 days'), "
            "expires_at=datetime('now','-1 second') WHERE message_id=1"
        )
    with get_conn() as c:
        chat._ensure_columns(c)
    jobs.process_pending_once()
    ready = _job(1)
    assert ready["status"] == "ready"
    with get_conn() as c:
        assert c.execute("SELECT photo_url FROM chat_messages WHERE id=1").fetchone()[0] == "chat_voice/1.m4a"
        # The additive migration replaces a legacy expiry marker with the
        # permanent compatibility sentinel but never rewrites message/audio.
        assert c.execute("SELECT expires_at FROM voice_processing_jobs WHERE message_id=1").fetchone()[0] == "9999-12-31 23:59:59"


def test_auto_source_language_is_not_sent_to_nllb(monkeypatch):
    _voice_message()
    jobs.enqueue_new_voice(1, "chat_voice/1.m4a", source_lang="auto", target_lang="zh")
    observed = {}
    monkeypatch.setattr(
        "services.speech_to_text_service.transcribe_audio_ref",
        lambda *a, **k: {"transcript_text": "controlled", "source_lang": "auto", "provider": "openai"},
    )

    def fake_translate(_text, _target, *, source_lang=None):
        observed["source_lang"] = source_lang
        return {"translated_text": "controlled translation", "provider": "local_nllb_1_3b"}

    monkeypatch.setattr("services.translate_service.translate_text", fake_translate)
    assert jobs.process_pending_once()["ready"] == 1
    assert observed["source_lang"] is None
