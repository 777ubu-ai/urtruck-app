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
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

from database.db import get_conn

MAX_ATTEMPTS = 5
LEASE_SECONDS = 120
DEFAULT_LIMIT = 1
WORKER_ID = f"voice_stt:{os.getpid()}"


def model_version() -> str:
    """A stable non-secret identity used in the idempotency key."""
    provider = (os.getenv("TRANSCRIBE_PROVIDER") or "auto").strip().lower() or "auto"
    model = (os.getenv("TRANSCRIBE_MODEL") or "gpt-4o-mini-transcribe").strip() or "gpt-4o-mini-transcribe"
    return f"{provider}:{model}"[:180]


def audio_version(audio_ref: str) -> str:
    # Ref may be sensitive infrastructure detail; only its one-way digest is
    # stored in the job key and never emitted by this module.
    return hashlib.sha256(str(audio_ref or "").encode("utf-8")).hexdigest()


def _retry_delay(attempt: int) -> int:
    base = min(300, max(10, (2 ** max(1, int(attempt))) * 5))
    spread = min(60, max(1, base // 5))
    return random.SystemRandom().randint(max(10, base - spread), min(300, base + spread))


def _speech_language(value: Optional[str]) -> Optional[str]:
    """Return an actual language hint, never the sentinel used for detection.

    ``auto`` is an internal marker for "the provider did not report a
    language".  It is not an ISO language and must never be sent to NLLB (or
    used as a substitute for the sender's UI locale).
    """
    normalized = str(value or "").strip().lower()
    return None if normalized in {"", "auto", "null", "none"} else normalized


def enqueue_new_voice_in_transaction(
    connection,
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
    row = connection.execute(
        """
        INSERT INTO voice_processing_jobs
          (message_id, audio_version, model_version, source_lang, target_lang, status, expires_at)
        VALUES (?, ?, ?, ?, ?, 'queued', datetime(CURRENT_TIMESTAMP, '+7 days'))
        ON CONFLICT(message_id, audio_version, model_version) DO NOTHING
        """,
        (int(message_id), audio_version(audio_ref), model_version(), _speech_language(source_lang), target_lang),
    )
    return row.rowcount == 1


def enqueue_new_voice(
    message_id: int,
    audio_ref: str,
    *,
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
) -> bool:
    """Create exactly one job using its own transaction for standalone callers."""
    with get_conn() as c:
        return enqueue_new_voice_in_transaction(
            c, message_id, audio_ref, source_lang=source_lang, target_lang=target_lang,
        )


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
        WHERE status IN ('queued','processing','failed_retryable')
          AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
        """
    )


def _claim(job_id: int) -> Optional[dict[str, Any]]:
    lease_id = f"{WORKER_ID}:{uuid.uuid4().hex}"
    with get_conn() as c:
        rowcount = c.execute(
            """
            UPDATE voice_processing_jobs SET status='processing', locked_at=CURRENT_TIMESTAMP, locked_by=?
            WHERE id=? AND status IN ('queued','failed_retryable')
              AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
              AND expires_at > CURRENT_TIMESTAMP
            """,
            (lease_id, job_id),
        ).rowcount
        if rowcount != 1:
            return None
        row = c.execute("SELECT * FROM voice_processing_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            return None
        claimed = dict(row)
        claimed["lease_id"] = lease_id
        return claimed


def _lease_is_current(connection, job: dict[str, Any]) -> bool:
    lease_id = str(job.get("lease_id") or "")
    if not lease_id:
        return False
    row = connection.execute(
        """SELECT 1 FROM voice_processing_jobs
           WHERE id=? AND status='processing' AND locked_by=?
             AND locked_at > datetime(CURRENT_TIMESTAMP, ?)
        """,
        (job["id"], lease_id, f"-{LEASE_SECONDS} seconds"),
    ).fetchone()
    return bool(row)


def _renew_lease(job: dict[str, Any]) -> bool:
    """Extend only the exact lease held by this worker.

    A provider call may legitimately outlive LEASE_SECONDS.  Without a
    heartbeat another worker could reclaim the row and start a second costly
    transcription while the first call was still in flight.  A dead process
    has no heartbeat, so its lease remains recoverable by _reclaim_and_expire.
    """
    lease_id = str(job.get("lease_id") or "")
    if not lease_id:
        return False
    with get_conn() as c:
        updated = c.execute(
            """UPDATE voice_processing_jobs SET locked_at=CURRENT_TIMESTAMP
               WHERE id=? AND status='processing' AND locked_by=?""",
            (job["id"], lease_id),
        )
    return updated.rowcount == 1


class _LeaseHeartbeat:
    """Keep a synchronous provider call owned without holding a DB transaction."""

    def __init__(self, job: dict[str, Any]):
        self.job = job
        self.lost = False
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        if not _renew_lease(self.job):
            self.lost = True
            return False
        interval = max(1, LEASE_SECONDS // 3)

        def beat() -> None:
            while not self._stop.wait(interval):
                try:
                    if not _renew_lease(self.job):
                        self.lost = True
                        self._stop.set()
                except Exception:
                    # Do not steal/rewrite a lease after a DB failure.  The
                    # current timestamp remains valid until its normal TTL;
                    # a later heartbeat can still renew it.
                    continue

        self._thread = threading.Thread(target=beat, name="voice-stt-lease", daemon=True)
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)


def _participant_language(user_id: str) -> Optional[str]:
    from services.push_gateway import get_recipient_locale
    value = get_recipient_locale(user_id)
    return str(value or "").lower() or None


def _record_metric(
    job: dict[str, Any], *, provider: str, outcome: str, latency_ms: Optional[int] = None,
    audio_duration_seconds: Optional[int] = None, usage: Any = None, fallback: bool = False,
    error_category: Optional[str] = None, model: Optional[str] = None, stage: str = "stt",
) -> None:
    """Persist only numerical/categorical QA evidence, never conversation data."""
    usage = usage if isinstance(usage, dict) else {}

    def integer(name: str) -> Optional[int]:
        try:
            return int(usage[name]) if usage.get(name) is not None else None
        except (TypeError, ValueError):
            return None

    try:
        with get_conn() as c:
            c.execute(
                """INSERT INTO voice_processing_metrics(
                     job_id,message_id,provider,model,latency_ms,audio_duration_seconds,
                     usage_input_tokens,usage_output_tokens,usage_total_tokens,
                     stage,outcome,fallback,error_category
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    job.get("id"), job.get("message_id"), str(provider or "unknown")[:120],
                    str(model if model is not None else job.get("model_version") or "")[:180], latency_ms,
                    audio_duration_seconds, integer("input_tokens"), integer("output_tokens"),
                    integer("total_tokens"), str(stage or "stt")[:32], str(outcome)[:64], int(bool(fallback)),
                    str(error_category)[:120] if error_category else None,
                ),
            )
    except Exception:
        # Observability must never alter the durable job outcome.  Do not log
        # exception text: a provider/storage implementation can reflect data.
        return


def _finish_failure(
    job: dict[str, Any], *, retryable: bool, error: str,
    provider: str = "voice_worker", model: Optional[str] = None, fallback: bool = False,
) -> str:
    attempt = int(job.get("attempt_count") or 0) + 1
    with get_conn() as c:
        if not _lease_is_current(c, job):
            return "stale"
        if retryable and attempt < MAX_ATTEMPTS:
            updated = c.execute(
                """UPDATE voice_processing_jobs SET status='failed_retryable', attempt_count=?,
                   next_retry_at=datetime(CURRENT_TIMESTAMP, ?), locked_at=NULL, locked_by=NULL,
                   last_error=? WHERE id=? AND status='processing' AND locked_by=?""",
                (attempt, f"+{_retry_delay(attempt)} seconds", error[:120], job["id"], job["lease_id"]),
            )
            outcome = "failed_retryable" if updated.rowcount == 1 else "stale"
        else:
            updated = c.execute(
                """UPDATE voice_processing_jobs SET status='failed_permanent', attempt_count=?,
                   locked_at=NULL, locked_by=NULL, last_error=? WHERE id=? AND status='processing' AND locked_by=?""",
                (attempt, error[:120], job["id"], job["lease_id"]),
            )
            outcome = "failed_permanent" if updated.rowcount == 1 else "stale"
    if outcome != "stale":
        _record_metric(
            job, provider=provider, model=model, fallback=fallback,
            outcome=outcome, error_category=error, stage="stt",
        )
    return outcome


def _process(job: dict[str, Any]) -> str:
    from services.speech_to_text_service import SpeechToTextError, transcribe_audio_ref
    from services.translate_service import TranslationError, translate_text

    with get_conn() as c:
        message = c.execute(
            "SELECT id,sender_id,photo_url,voice_duration,voice_transcript,voice_transcript_lang,voice_transcript_provider "
            "FROM chat_messages WHERE id=? AND is_voice=1",
            (job["message_id"],),
        ).fetchone()
    if not message or not message["photo_url"]:
        return _finish_failure(job, retryable=False, error="audio_unavailable", provider="storage")

    # A legacy/manual request may have won the race. Reuse its saved result;
    # never invoke the model a second time.
    force_reprocess = bool(job.get("force_reprocess"))
    transcript_text = "" if force_reprocess else str(message["voice_transcript"] or "").strip()
    transcript_lang = str(message["voice_transcript_lang"] or "").strip().lower() or None
    transcript_provider = message["voice_transcript_provider"] or None
    if not transcript_text:
        heartbeat = _LeaseHeartbeat(job)
        if not heartbeat.start():
            return "stale"
        started = time.monotonic()
        try:
            guessed_name = Path(str(message["photo_url"])).name or f"voice-{job['message_id']}.m4a"
            transcript = transcribe_audio_ref(
                message["photo_url"], filename=guessed_name,
                # A participant locale is UI preference, not evidence of
                # spoken language.  Let the provider detect it when the job
                # has no explicit, verified language.
                language=_speech_language(job.get("source_lang")),
            )
        except SpeechToTextError as exc:
            heartbeat.stop()
            return _finish_failure(
                job, retryable=bool(exc.retryable), error=exc.code,
                provider=exc.provider or "unknown",
                fallback=(exc.provider == "openai_then_local_ai"),
            )
        finally:
            heartbeat.stop()
        if heartbeat.lost:
            return "stale"
        transcript_text = str(transcript.get("transcript_text") or "").strip()
        if not transcript_text:
            return _finish_failure(job, retryable=False, error="TRANSCRIPTION_FAILED", provider=transcript_provider or "unknown")
        transcript_lang = str(transcript.get("source_lang") or "auto").strip().lower()
        transcript_provider = str(transcript.get("provider") or "unknown")[:120]
        _record_metric(
            job, provider=transcript_provider, outcome="transcribed",
            latency_ms=round((time.monotonic() - started) * 1000),
            audio_duration_seconds=message["voice_duration"], usage=transcript.get("usage"),
            fallback=transcript_provider.endswith("_fallback"),
            model=transcript.get("model"), stage="stt",
        )
        persist_started = time.monotonic()
        with get_conn() as c:
            if not _lease_is_current(c, job):
                return "stale"
            c.execute(
                """UPDATE chat_messages SET voice_transcript=?, voice_transcript_lang=?,
                   voice_transcript_provider=?, voice_transcribed_at=CURRENT_TIMESTAMP,
                   voice_transcribe_claimed_at=NULL WHERE id=?""",
                (transcript_text, transcript_lang, transcript_provider, job["message_id"]),
            )
        _record_metric(
            job, provider="voice_worker", model="", stage="persist", outcome="persisted",
            latency_ms=round((time.monotonic() - persist_started) * 1000),
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
            heartbeat = _LeaseHeartbeat(job)
            if not heartbeat.start():
                return "stale"
            translation_started = time.monotonic()
            try:
                translated = translate_text(
                    transcript_text, target_lang,
                    source_lang=_speech_language(transcript_lang),
                )
                with get_conn() as c:
                    if not _lease_is_current(c, job):
                        return "stale"
                    c.execute(
                        "INSERT OR REPLACE INTO chat_translations(message_id,target_lang,translated_text,provider) VALUES(?,?,?,?)",
                        (job["message_id"], target_lang, translated["translated_text"], translated["provider"]),
                    )
                from services.translate_service import get_cache_identity
                _record_metric(
                    job, provider=translated.get("provider") or "unknown",
                    model=get_cache_identity().get("model") or "", stage="translation", outcome="translated",
                    latency_ms=round((time.monotonic() - translation_started) * 1000),
                )
            except TranslationError as exc:
                # User can request translation later through the established,
                # separately cached translation endpoint.
                from services.translate_service import get_cache_identity
                _record_metric(
                    job, provider=exc.provider or "unknown", model=get_cache_identity().get("model") or "",
                    stage="translation", outcome="translation_error",
                    latency_ms=round((time.monotonic() - translation_started) * 1000),
                    error_category=exc.code,
                )
            finally:
                heartbeat.stop()
            if heartbeat.lost:
                return "stale"

    with get_conn() as c:
        if not _lease_is_current(c, job):
            return "stale"
        updated = c.execute(
            """UPDATE voice_processing_jobs SET status='ready', ready_at=CURRENT_TIMESTAMP,
               -- Legacy SQLite schemas made expires_at NOT NULL.  This
               -- sentinel is never consulted for ready rows and keeps those
               -- existing databases compatible without rebuilding them.
               expires_at='9999-12-31 23:59:59', locked_at=NULL, locked_by=NULL,
               force_reprocess=0, last_error=NULL
               WHERE id=? AND status='processing' AND locked_by=?""",
            (job["id"], job["lease_id"]),
        )
    return "ready" if updated.rowcount == 1 else "stale"


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
    stats = {"picked": 0, "ready": 0, "failed_retryable": 0, "failed_permanent": 0, "stale": 0}
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
            outcome = _finish_failure(job, retryable=True, error="worker_exception", provider="voice_worker")
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
