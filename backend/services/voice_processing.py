"""Durable background STT for newly uploaded chat voice messages.

The queue is deliberately SQLite-native: an atomic conditional UPDATE claims
one row, so it is safe for several backend processes without PostgreSQL-only
``SKIP LOCKED``. It never scans chat_messages to backfill old voices; a job is
created only by the successful new-voice send path.
"""
from __future__ import annotations

import hashlib
import os
import random
import time
from pathlib import Path
from typing import Any, Optional

from database.db import get_conn

MAX_ATTEMPTS = 5
LEASE_SECONDS = 120
CACHE_SECONDS = 7 * 24 * 60 * 60
DEFAULT_LIMIT = 1
WORKER_ID = f"voice_stt:{os.getpid()}"


def model_version() -> str:
    """A stable non-secret identity used in the idempotency key."""
    provider = (os.getenv("TRANSCRIBE_PROVIDER") or "auto").strip().lower() or "auto"
    model = (os.getenv("TRANSCRIBE_MODEL") or "gpt-transcribe").strip() or "gpt-transcribe"
    return f"{provider}:{model}"[:180]


def audio_version(audio_ref: str) -> str:
    # Ref may be sensitive infrastructure detail; only its one-way digest is
    # stored in the job key and never emitted by this module.
    return hashlib.sha256(str(audio_ref or "").encode("utf-8")).hexdigest()


def _retry_delay(attempt: int) -> int:
    base = min(300, max(10, (2 ** max(1, int(attempt))) * 5))
    spread = min(60, max(1, base // 5))
    return random.SystemRandom().randint(max(10, base - spread), min(300, base + spread))


def enqueue_new_voice(
    message_id: int,
    audio_ref: str,
    *,
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
) -> bool:
    """Create exactly one job for a new voice/audio/model tuple.

    Existing messages are intentionally not discovered or enqueued here.
    """
    if not message_id or not audio_ref:
        return False
    with get_conn() as c:
        row = c.execute(
            """
            INSERT INTO voice_processing_jobs
              (message_id, audio_version, model_version, source_lang, target_lang, status, expires_at)
            VALUES (?, ?, ?, ?, ?, 'queued', datetime(CURRENT_TIMESTAMP, '+7 days'))
            ON CONFLICT(message_id, audio_version, model_version) DO NOTHING
            """,
            (int(message_id), audio_version(audio_ref), model_version(), source_lang, target_lang),
        )
        return row.rowcount == 1


def _reclaim_and_expire(c) -> None:
    c.execute(
        """
        UPDATE voice_processing_jobs
        SET status='failed_retryable', attempt_count=attempt_count+1,
            next_retry_at=datetime(CURRENT_TIMESTAMP, '+10 seconds'),
            locked_at=NULL, locked_by=NULL, last_error='worker_lease_expired'
        WHERE status='processing' AND locked_at <= datetime(CURRENT_TIMESTAMP, ?)
          AND expires_at > CURRENT_TIMESTAMP
        """,
        (f"-{LEASE_SECONDS} seconds",),
    )
    c.execute(
        """
        UPDATE voice_processing_jobs
        SET status='expired', locked_at=NULL, locked_by=NULL, last_error='cache_expired'
        WHERE status IN ('queued','processing','ready','failed_retryable')
          AND expires_at <= CURRENT_TIMESTAMP
        """
    )


def _claim(job_id: int) -> Optional[dict[str, Any]]:
    with get_conn() as c:
        rowcount = c.execute(
            """
            UPDATE voice_processing_jobs SET status='processing', locked_at=CURRENT_TIMESTAMP, locked_by=?
            WHERE id=? AND status IN ('queued','failed_retryable')
              AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
              AND expires_at > CURRENT_TIMESTAMP
            """,
            (WORKER_ID, job_id),
        ).rowcount
        if rowcount != 1:
            return None
        row = c.execute("SELECT * FROM voice_processing_jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None


def _participant_language(user_id: str) -> Optional[str]:
    from services.push_gateway import get_recipient_locale
    value = get_recipient_locale(user_id)
    return str(value or "").lower() or None


def _finish_failure(job: dict[str, Any], *, retryable: bool, error: str) -> str:
    attempt = int(job.get("attempt_count") or 0) + 1
    with get_conn() as c:
        if retryable and attempt < MAX_ATTEMPTS:
            c.execute(
                """UPDATE voice_processing_jobs SET status='failed_retryable', attempt_count=?,
                   next_retry_at=datetime(CURRENT_TIMESTAMP, ?), locked_at=NULL, locked_by=NULL,
                   last_error=? WHERE id=?""",
                (attempt, f"+{_retry_delay(attempt)} seconds", error[:120], job["id"]),
            )
            return "failed_retryable"
        c.execute(
            """UPDATE voice_processing_jobs SET status='failed_permanent', attempt_count=?,
               locked_at=NULL, locked_by=NULL, last_error=? WHERE id=?""",
            (attempt, error[:120], job["id"]),
        )
    return "failed_permanent"


def _process(job: dict[str, Any]) -> str:
    from services.speech_to_text_service import SpeechToTextError, transcribe_audio_ref
    from services.translate_service import TranslationError, translate_text

    with get_conn() as c:
        message = c.execute(
            "SELECT id,sender_id,photo_url,voice_transcript,voice_transcript_lang,voice_transcript_provider "
            "FROM chat_messages WHERE id=? AND is_voice=1",
            (job["message_id"],),
        ).fetchone()
    if not message or not message["photo_url"]:
        return _finish_failure(job, retryable=False, error="audio_unavailable")

    # A legacy/manual request may have won the race. Reuse its saved result;
    # never invoke the model a second time.
    force_reprocess = bool(job.get("force_reprocess"))
    transcript_text = "" if force_reprocess else str(message["voice_transcript"] or "").strip()
    transcript_lang = str(message["voice_transcript_lang"] or "").strip().lower() or None
    transcript_provider = message["voice_transcript_provider"] or None
    if not transcript_text:
        try:
            guessed_name = Path(str(message["photo_url"])).name or f"voice-{job['message_id']}.m4a"
            transcript = transcribe_audio_ref(
                message["photo_url"], filename=guessed_name,
                language=job.get("source_lang") or _participant_language(message["sender_id"]),
            )
        except SpeechToTextError as exc:
            return _finish_failure(job, retryable=bool(exc.retryable), error=exc.code)
        transcript_text = str(transcript.get("transcript_text") or "").strip()
        if not transcript_text:
            return _finish_failure(job, retryable=False, error="TRANSCRIPTION_FAILED")
        transcript_lang = str(transcript.get("source_lang") or "auto").strip().lower()
        transcript_provider = str(transcript.get("provider") or "unknown")[:120]
        with get_conn() as c:
            c.execute(
                """UPDATE chat_messages SET voice_transcript=?, voice_transcript_lang=?,
                   voice_transcript_provider=?, voice_transcribed_at=CURRENT_TIMESTAMP,
                   voice_transcribe_claimed_at=NULL WHERE id=?""",
                (transcript_text, transcript_lang, transcript_provider, job["message_id"]),
            )

    # Translation is a hidden cache attachment. Its failure must not discard a
    # ready transcript or make a working audio message appear failed.
    target_lang = str(job.get("target_lang") or "").strip().lower()
    if target_lang and target_lang != transcript_lang:
        # Existing translation schema is additive too; ensure a clean DB has
        # it before the background worker attempts its hidden cache write.
        from api.chat import _ensure_translation_schema
        _ensure_translation_schema()
        with get_conn() as c:
            cached = c.execute(
                "SELECT 1 FROM chat_translations WHERE message_id=? AND target_lang=?",
                (job["message_id"], target_lang),
            ).fetchone()
        if not cached:
            try:
                translated = translate_text(transcript_text, target_lang, source_lang=transcript_lang)
                with get_conn() as c:
                    c.execute(
                        "INSERT OR REPLACE INTO chat_translations(message_id,target_lang,translated_text,provider) VALUES(?,?,?,?)",
                        (job["message_id"], target_lang, translated["translated_text"], translated["provider"]),
                    )
            except TranslationError:
                # User can request translation later through the established,
                # separately cached translation endpoint.
                pass

    with get_conn() as c:
        c.execute(
            """UPDATE voice_processing_jobs SET status='ready', ready_at=CURRENT_TIMESTAMP,
               locked_at=NULL, locked_by=NULL, force_reprocess=0, last_error=NULL WHERE id=?""",
            (job["id"],),
        )
    return "ready"


def process_pending_once(limit: int = DEFAULT_LIMIT) -> dict[str, int]:
    """Process a bounded sequential batch; safe under concurrent workers."""
    bounded = max(1, min(int(limit or DEFAULT_LIMIT), 4))
    with get_conn() as c:
        _reclaim_and_expire(c)
        ids = [r["id"] for r in c.execute(
            """SELECT id FROM voice_processing_jobs
               WHERE status IN ('queued','failed_retryable')
                 AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
                 AND expires_at > CURRENT_TIMESTAMP
               ORDER BY created_at,id LIMIT ?""",
            (bounded,),
        ).fetchall()]
    stats = {"picked": 0, "ready": 0, "failed_retryable": 0, "failed_permanent": 0}
    for job_id in ids:
        job = _claim(job_id)
        if not job:
            continue
        stats["picked"] += 1
        try:
            outcome = _process(job)
        except Exception:
            # A storage/database/provider implementation error must release
            # the lease too.  Keep diagnostics categorical: neither audio
            # references nor recognized text may enter runtime logs.
            outcome = _finish_failure(job, retryable=True, error="worker_exception")
        if outcome in stats:
            stats[outcome] += 1
    return stats


def request_recognition(message_id: int, user_id: str) -> dict[str, Any]:
    """Requeue only the caller's authorized, expired/failed voice result."""
    from api.chat import _ensure_translation_schema
    _ensure_translation_schema()
    with get_conn() as c:
        row = c.execute(
            """SELECT j.*,m.photo_url FROM voice_processing_jobs j
               JOIN chat_messages m ON m.id=j.message_id
               JOIN chat_rooms r ON r.id=m.room_id
               WHERE j.message_id=? AND ? IN (r.participant_1,r.participant_2)
               ORDER BY j.id DESC LIMIT 1""",
            (message_id, user_id),
        ).fetchone()
        if not row:
            return {"found": False}
        job = dict(row)
        if job["status"] not in ("expired", "failed_retryable", "failed_permanent"):
            return {"found": True, "status": job["status"]}
        c.execute(
            """UPDATE voice_processing_jobs SET status='queued', attempt_count=0, force_reprocess=1,
               next_retry_at=CURRENT_TIMESTAMP, expires_at=datetime(CURRENT_TIMESTAMP, '+7 days'),
               locked_at=NULL, locked_by=NULL, last_error=NULL WHERE id=?""",
            (job["id"],),
        )
        # Translation is a derived cache bound to the old transcript/model;
        # remove it, while keeping original audio and the historic transcript
        # record intact until the successful fresh result atomically replaces it.
        c.execute("DELETE FROM chat_translations WHERE message_id=?", (message_id,))
    return {"found": True, "status": "queued"}
