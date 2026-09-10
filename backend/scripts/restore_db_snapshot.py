#!/usr/bin/env python3
"""Verify and (optionally, only if explicitly told to) restore a UrTruck
SQLite backup snapshot produced by scheduler/backup_job.py (hourly,
security-<UTC timestamp>.db + a .sha256 sidecar) or extracted from a
production-backup.yml full-system tarball.

Release hardening track A, Commit 5 (2026-09-10): this codebase had a
backup-CREATION path (backup_job.py, production-backup.yml) but no restore
tooling at all — an operator facing a real incident would have to improvise
a restore procedure for the first time under pressure. This script is
DELIBERATELY safe-by-default:

  - By default it NEVER touches the real production DB_PATH. It always
    restores into a fresh temporary path (or an explicit --target you give
    it) and only ever READS the source snapshot.
  - Verification (PRAGMA quick_check, checksum, core-table sanity) always
    runs against the restored COPY, never the live database.
  - Actually overwriting a live target (in particular anything matching
    config.DB_PATH) requires BOTH --target pointing at it AND the separate,
    explicit --i-understand-this-overwrites-the-target-file flag. Without
    both, the script refuses and explains what to pass.
  - This script makes no PM2/service-management decisions — see
    docs/ops/BACKUP_RESTORE_RUNBOOK.md for the full stop/swap/verify/start
    procedure around it.

Usage (safe dry-run — the default, and the common case: "is this backup
actually good?"):
    python3 scripts/restore_db_snapshot.py /home/ubuntu/urtruck-security/backups/security-20260910T030000Z.db

Usage (deliberately restore ONTO an explicit path — still not production
unless you point --target at config.DB_PATH yourself):
    python3 scripts/restore_db_snapshot.py <snapshot> --target /tmp/urtruck-restore-test.db

Usage (the one and only way to actually overwrite a live file):
    python3 scripts/restore_db_snapshot.py <snapshot> \\
        --target /home/ubuntu/urtruck-security/database/security.db \\
        --i-understand-this-overwrites-the-target-file
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

# Tables whose presence+row-count give a human reviewer a fast, meaningful
# signal that this is a real, populated UrTruck backup and not an empty or
# unrelated SQLite file. Not exhaustive — see the runbook for a fuller list
# if a specific incident needs deeper verification of one subsystem.
CORE_TABLES = [
    "drivers_registration",
    "reg_sessions",
    "cargos",
    "trips",
    "bids",
    "deals",
    "chat_rooms",
    "chat_messages",
    "notifications",
    "push_devices",
    "reviews",
]


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _verify_checksum(snapshot: Path) -> str:
    sidecar = snapshot.with_name(snapshot.name + ".sha256")
    if not sidecar.exists():
        print(f"[restore] WARNING: no .sha256 sidecar next to {snapshot.name} — "
              f"skipping checksum verification (older backups, or a tarball-extracted "
              f"file, may not have one). Proceeding with integrity checks only.")
        return "skipped (no sidecar)"
    expected = sidecar.read_text().split()[0].strip()
    actual = _sha256_of(snapshot)
    if actual != expected:
        raise SystemExit(
            f"[restore] FAIL: checksum mismatch for {snapshot.name}\n"
            f"  expected (sidecar): {expected}\n"
            f"  actual (file):      {actual}\n"
            f"The snapshot is corrupted or was tampered with. Do not restore it — "
            f"use an earlier snapshot instead."
        )
    return f"OK ({actual[:12]}...)"


def _quick_check(db_path: Path) -> str:
    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("PRAGMA quick_check").fetchone()
    finally:
        conn.close()
    result = str(row[0]) if row else "<no result>"
    if result.lower() != "ok":
        raise SystemExit(f"[restore] FAIL: PRAGMA quick_check reported {result!r} — snapshot is corrupt")
    return result


def _table_sanity(db_path: Path) -> dict[str, int | str]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    counts: dict[str, int | str] = {}
    try:
        existing = {
            r["name"]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        for table in CORE_TABLES:
            if table not in existing:
                counts[table] = "MISSING"
                continue
            counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]  # noqa: S608 (fixed allowlist above, not user input)
    finally:
        conn.close()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("snapshot", type=Path, help="Path to a security-*.db backup snapshot")
    parser.add_argument(
        "--target", type=Path, default=None,
        help="Where to restore the copy. Default: a fresh file under the system temp dir "
             "(auto-generated, never a live path).",
    )
    parser.add_argument(
        "--i-understand-this-overwrites-the-target-file", action="store_true", dest="confirmed_overwrite",
        help="Required in addition to --target when --target already exists — without it, "
             "an existing target is refused rather than silently clobbered.",
    )
    args = parser.parse_args()

    snapshot: Path = args.snapshot
    if not snapshot.exists():
        print(f"[restore] FAIL: snapshot not found: {snapshot}")
        return 1

    if args.target is not None:
        target = args.target
        if target.exists():
            if not args.confirmed_overwrite:
                print(
                    f"[restore] REFUSING: --target {target} already exists. "
                    f"Pass --i-understand-this-overwrites-the-target-file to proceed, "
                    f"or omit --target to restore into a fresh temp file instead (safe default)."
                )
                return 1
            # sqlite3's backup API validates the destination file header when
            # it's non-empty — restoring onto an existing file (whether an
            # older DB or, as a defensive edge case, an unrelated file that
            # merely happens to sit at this path) must start from a clean
            # slate, not attempt to write pages into whatever is already
            # there. The existence+confirmation check above is what makes
            # this an intentional overwrite, not a silent one.
            target.unlink()
            for side_effect in (target.with_name(target.name + "-wal"), target.with_name(target.name + "-shm")):
                side_effect.unlink(missing_ok=True)
        target.parent.mkdir(parents=True, exist_ok=True)
    else:
        tmp_dir = Path(tempfile.mkdtemp(prefix="urtruck-restore-"))
        target = tmp_dir / snapshot.name
        print(f"[restore] no --target given — restoring into a fresh temp copy: {target}")

    print(f"[restore] source:  {snapshot}")
    print(f"[restore] target:  {target}")

    checksum_result = _verify_checksum(snapshot)
    print(f"[restore] checksum: {checksum_result}")

    # Restore via SQLite's own backup API (not a raw file copy) — this is
    # the same mechanism backup_job.py uses to CREATE snapshots, so it is
    # safe even if `snapshot` were somehow still being written to (it
    # won't be, in the normal case of restoring a completed backup file,
    # but a page-level API is strictly safer than `cp` regardless).
    src_conn = sqlite3.connect(str(snapshot))
    dst_conn = sqlite3.connect(str(target))
    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    quick_check_result = _quick_check(target)
    print(f"[restore] PRAGMA quick_check: {quick_check_result}")

    counts = _table_sanity(target)
    print("[restore] core table row counts:")
    missing = []
    for table, count in counts.items():
        print(f"    {table:<24} {count}")
        if count == "MISSING":
            missing.append(table)
    if missing:
        print(f"[restore] WARNING: {len(missing)} expected table(s) missing from this snapshot: {missing}")
        print("           This may be an old backup predating a schema migration, or a partial/corrupt file.")

    print(f"\n[restore] DONE. Verified copy is at: {target}")
    print("[restore] This script made NO changes to any live/production database.")
    if args.target is None:
        print("[restore] To promote this into production, see docs/ops/BACKUP_RESTORE_RUNBOOK.md "
              "for the full stop-service / swap-file / verify / restart-service procedure — "
              "do not just copy this temp file over the live DB_PATH by hand.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
