"""Push/Outbox/Localization repair (2026-09-11), item 1 — read-only outbox
forensics.

Run against the REAL production/staging DB_PATH to answer exactly the
questions the task asked for, without ever deleting or resetting a row:

    DB_PATH=/path/to/security.db python backend/scripts/push_outbox_forensics.py

Every query here is a plain SELECT / aggregate — nothing here writes to
push_outbox, push_devices, or push_delivery_log. Safe to run repeatedly
against a live database.
"""
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn  # noqa: E402


def _fetchone_scalar(c, sql, params=()):
    row = c.execute(sql, params).fetchone()
    return row[0] if row else None


def main():
    print(f"DB_PATH = {os.environ.get('DB_PATH', '(default)')}")
    with get_conn() as c:
        # ── 1. total pending / dead ─────────────────────────────────────
        total_pending = _fetchone_scalar(c, "SELECT COUNT(*) FROM push_outbox WHERE status='pending'")
        total_processing = _fetchone_scalar(c, "SELECT COUNT(*) FROM push_outbox WHERE status='processing'")
        total_dead = _fetchone_scalar(c, "SELECT COUNT(*) FROM push_outbox WHERE status='dead'")
        total_sent = _fetchone_scalar(c, "SELECT COUNT(*) FROM push_outbox WHERE status='sent'")
        print("\n=== 1. Row counts ===")
        print(f"pending={total_pending} processing={total_processing} dead={total_dead} sent={total_sent}")

        # ── oldest / newest pending age ─────────────────────────────────
        oldest = c.execute(
            "SELECT id, event_type, created_at, attempt_count, next_attempt_at, last_error "
            "FROM push_outbox WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        newest = c.execute(
            "SELECT id, event_type, created_at, attempt_count, next_attempt_at, last_error "
            "FROM push_outbox WHERE status='pending' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        print("\n=== 2. Oldest / newest pending row ===")
        print("oldest:", dict(oldest) if oldest else None)
        print("newest:", dict(newest) if newest else None)

        # ── event_type distribution ─────────────────────────────────────
        print("\n=== 3. event_type distribution (pending) ===")
        for row in c.execute(
            "SELECT event_type, COUNT(*) n FROM push_outbox WHERE status='pending' "
            "GROUP BY event_type ORDER BY n DESC"
        ).fetchall():
            print(f"  {row['event_type']:<24} {row['n']}")

        # ── attempt_count distribution ───────────────────────────────────
        print("\n=== 4. attempt_count distribution (pending) ===")
        for row in c.execute(
            "SELECT attempt_count, COUNT(*) n FROM push_outbox WHERE status='pending' "
            "GROUP BY attempt_count ORDER BY attempt_count"
        ).fetchall():
            print(f"  attempt_count={row['attempt_count']:<3} {row['n']}")

        # ── next_attempt_at horizon (how far out is the backlog waiting) ──
        print("\n=== 5. next_attempt_at horizon (pending) ===")
        for row in c.execute(
            """
            SELECT
              CASE
                WHEN next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP THEN 'due now'
                WHEN next_attempt_at <= datetime(CURRENT_TIMESTAMP, '+1 minute') THEN '<1 min'
                WHEN next_attempt_at <= datetime(CURRENT_TIMESTAMP, '+5 minute') THEN '1-5 min'
                ELSE '>5 min'
              END AS bucket,
              COUNT(*) n
            FROM push_outbox WHERE status='pending' GROUP BY bucket
            """
        ).fetchall():
            print(f"  {row['bucket']:<10} {row['n']}")

        # ── last_error distribution ─────────────────────────────────────
        print("\n=== 6. last_error distribution (pending, non-null) ===")
        for row in c.execute(
            "SELECT last_error, COUNT(*) n FROM push_outbox WHERE status='pending' AND last_error IS NOT NULL "
            "GROUP BY last_error ORDER BY n DESC LIMIT 20"
        ).fetchall():
            print(f"  n={row['n']:<4} {row['last_error']}")

        # ── lease/lock state (stale 'processing') ───────────────────────
        print("\n=== 7. processing/claimed_at (worker lease state) ===")
        for row in c.execute(
            "SELECT id, event_type, claimed_at FROM push_outbox WHERE status='processing' ORDER BY claimed_at"
        ).fetchall():
            print(f"  id={row['id']} event_type={row['event_type']} claimed_at={row['claimed_at']}")
        stale = _fetchone_scalar(
            c,
            "SELECT COUNT(*) FROM push_outbox WHERE status='processing' AND claimed_at IS NOT NULL "
            "AND claimed_at <= datetime(CURRENT_TIMESTAMP, '-5 minutes')",
        )
        print(f"  stale (>5min, would be reclaimed on next drain tick): {stale}")

        # ── retry-state summary ─────────────────────────────────────────
        print("\n=== 8. dead rows: last_error distribution ===")
        for row in c.execute(
            "SELECT last_error, COUNT(*) n FROM push_outbox WHERE status='dead' "
            "GROUP BY last_error ORDER BY n DESC LIMIT 20"
        ).fetchall():
            print(f"  n={row['n']:<4} {row['last_error']}")

        # ── provider/path distribution behind the pending recipients ────
        print("\n=== 9. provider distribution of ACTIVE devices behind pending recipients ===")
        rows = c.execute(
            """
            SELECT d.push_provider, d.enabled, COUNT(*) n
            FROM push_outbox o
            JOIN push_devices d ON d.user_id = o.recipient_user_id
            WHERE o.status = 'pending'
            GROUP BY d.push_provider, d.enabled
            ORDER BY n DESC
            """
        ).fetchall()
        for row in rows:
            print(f"  provider={row['push_provider']:<6} enabled={row['enabled']} n={row['n']}")
        if not rows:
            print("  (no push_devices rows found for any pending recipient — see legacy-table check below)")

        legacy_only = _fetchone_scalar(
            c,
            """
            SELECT COUNT(DISTINCT o.recipient_user_id)
            FROM push_outbox o
            WHERE o.status = 'pending'
              AND o.recipient_user_id NOT IN (SELECT user_id FROM push_devices WHERE enabled = 1)
              AND o.recipient_user_id IN (SELECT user_id FROM push_tokens_native)
            """,
        )
        print(f"  recipients with a pending row whose ONLY token is in the legacy push_tokens_native table: {legacy_only}")

        no_device_at_all = _fetchone_scalar(
            c,
            """
            SELECT COUNT(DISTINCT o.recipient_user_id)
            FROM push_outbox o
            WHERE o.status = 'pending'
              AND o.recipient_user_id NOT IN (SELECT user_id FROM push_devices WHERE enabled = 1)
              AND o.recipient_user_id NOT IN (SELECT user_id FROM push_tokens_native)
            """,
        )
        print(f"  recipients with a pending row and NO active device anywhere (will never deliver, needs re-registration): {no_device_at_all}")

        # ── worker/scheduler health signal ──────────────────────────────
        print("\n=== 10. Worker health signal ===")
        recent_activity = c.execute(
            "SELECT MAX(sent_at) FROM push_outbox WHERE status='sent'"
        ).fetchone()[0]
        print(f"  most recent successful drain (push_outbox.sent_at MAX): {recent_activity}")
        recent_dead = c.execute(
            "SELECT MAX(failed_at) FROM push_outbox WHERE status='dead'"
        ).fetchone()[0]
        print(f"  most recent row reaching 'dead' (failed_at MAX): {recent_dead}")
        print(
            "  If both are NULL/very old while pending keeps growing: the drain worker/scheduler is "
            "not running in this process (check URTRUCK_ENABLE_SCHEDULER and the scheduler singleton "
            "lock — scheduler/jobs.py's _acquire_singleton_lock()/URTRUCK_SCHEDULER_LOCK — and the "
            "startup log for a '[scheduler] disabled' or lock-skip line)."
        )

        # ── gateway/provider config snapshot ────────────────────────────
        print("\n=== 11. Gateway/provider config snapshot ===")
        from services import push_gateway
        print(json.dumps(push_gateway.info(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
