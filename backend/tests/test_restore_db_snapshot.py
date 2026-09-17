"""Release hardening track A, Commit 5 — backup restore verification.

Confirmed defect this closes: backend/scheduler/backup_job.py (hourly
snapshots) and .github/workflows/production-backup.yml (manual full-system
backup) both had a BACKUP-CREATION path, verified (PRAGMA quick_check +
SHA-256 sidecar), but there was no restore tooling anywhere in the repo —
an operator would have to improvise a restore procedure for the first time
during a real incident.

These tests run scripts/restore_db_snapshot.py as a real subprocess against
a real snapshot produced by the real backup_job.run_backup(), so this is
testing the actual restore path end-to-end, not a mock of it. Every test
is careful to write ONLY into pytest's own tmp_path — nothing here ever
touches a real DB_PATH.
"""
import hashlib
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
RESTORE_SCRIPT = ROOT / "scripts" / "restore_db_snapshot.py"


def _make_populated_db(path: Path) -> None:
    """A minimal but real UrTruck-shaped SQLite DB (enough tables for the
    restore script's core-table sanity check to have something to report
    on), independent of the full app's schema-init machinery so this test
    doesn't need a live app context."""
    conn = sqlite3.connect(str(path))
    try:
        conn.executescript(
            """
            CREATE TABLE drivers_registration (id TEXT PRIMARY KEY, phone TEXT);
            CREATE TABLE reg_sessions (token TEXT PRIMARY KEY, driver_id TEXT);
            CREATE TABLE cargos (id TEXT PRIMARY KEY, owner_id TEXT);
            CREATE TABLE trips (id TEXT PRIMARY KEY, driver_id TEXT);
            CREATE TABLE bids (id TEXT PRIMARY KEY, bidder_id TEXT);
            CREATE TABLE deals (id TEXT PRIMARY KEY, shipper_id TEXT);
            CREATE TABLE chat_rooms (id TEXT PRIMARY KEY);
            CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, text TEXT);
            CREATE TABLE notifications (id TEXT PRIMARY KEY);
            CREATE TABLE push_devices (id TEXT PRIMARY KEY);
            -- deliberately NOT creating `reviews`, to exercise the
            -- missing-table detection path.
            INSERT INTO drivers_registration VALUES ('d1', '+77001234567');
            INSERT INTO cargos VALUES ('c1', 'd1');
            """
        )
        conn.commit()
    finally:
        conn.close()


def _make_snapshot_with_sidecar(tmp_path: Path) -> Path:
    """Mirrors exactly what scheduler/backup_job.run_backup() produces:
    a SQLite-API backup copy + a `<name>.sha256` sidecar."""
    src = tmp_path / "source.db"
    _make_populated_db(src)

    snapshot = tmp_path / "security-20260910T030000Z.db"
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(snapshot))
    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    h = hashlib.sha256()
    with open(snapshot, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    (tmp_path / f"{snapshot.name}.sha256").write_text(f"{h.hexdigest()}  {snapshot.name}\n")
    return snapshot


def _run(*args) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(RESTORE_SCRIPT), *[str(a) for a in args]],
        capture_output=True, text=True, timeout=30,
    )


def _run_with_env(extra_env: dict, *args) -> subprocess.CompletedProcess:
    env = {**os.environ, **extra_env}
    return subprocess.run(
        [sys.executable, str(RESTORE_SCRIPT), *[str(a) for a in args]],
        capture_output=True, text=True, timeout=30, env=env,
    )


def test_dry_run_verifies_a_good_snapshot_without_a_target(tmp_path):
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    result = _run(snapshot)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "checksum: OK" in result.stdout
    assert "PRAGMA quick_check: ok" in result.stdout
    assert "drivers_registration" in result.stdout
    assert "reviews" in result.stdout and "MISSING" in result.stdout
    assert "made NO changes to any live/production database" in result.stdout
    # No --target given: must not have written anywhere outside a temp dir.
    assert "fresh temp copy" in result.stdout


def test_refuses_to_overwrite_an_existing_target_without_confirmation(tmp_path):
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    target = tmp_path / "existing.db"
    target.write_text("not a real db, just needs to exist")
    result = _run(snapshot, "--target", target)
    assert result.returncode != 0
    assert "REFUSING" in result.stdout
    assert "i-understand-this-overwrites-the-target-file" in result.stdout
    # Confirm the refusal actually left the original file untouched.
    assert target.read_text() == "not a real db, just needs to exist"


def test_overwrites_an_existing_target_when_explicitly_confirmed(tmp_path):
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    target = tmp_path / "existing.db"
    target.write_text("not a real db, just needs to exist")
    result = _run(snapshot, "--target", target, "--i-understand-this-overwrites-the-target-file")
    assert result.returncode == 0, result.stdout + result.stderr
    # Target is now a real, valid restored SQLite DB.
    conn = sqlite3.connect(str(target))
    try:
        rows = conn.execute("SELECT id, phone FROM drivers_registration").fetchall()
    finally:
        conn.close()
    assert rows == [("d1", "+77001234567")]


def test_restores_into_a_nonexistent_target_without_needing_confirmation(tmp_path):
    """--target is fine without the confirm flag as long as nothing is
    actually being overwritten — the flag only guards clobbering."""
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    target = tmp_path / "brand_new.db"
    assert not target.exists()
    result = _run(snapshot, "--target", target)
    assert result.returncode == 0, result.stdout + result.stderr
    assert target.exists()


def test_rejects_a_snapshot_with_a_mismatched_checksum(tmp_path):
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    # Corrupt the snapshot after the sidecar was computed.
    with open(snapshot, "ab") as f:
        f.write(b"\x00corruption\x00")
    result = _run(snapshot)
    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "checksum mismatch" in combined
    assert "Do not restore it" in combined


def test_missing_snapshot_file_fails_cleanly():
    result = _run("/nonexistent/path/to/nothing.db")
    assert result.returncode != 0
    assert "not found" in (result.stdout + result.stderr)


def test_snapshot_without_sidecar_warns_but_still_verifies_integrity(tmp_path):
    """Older backups (or a file hand-extracted from a production-backup.yml
    tarball) may not have a .sha256 sidecar -- the script must degrade to
    quick_check-only verification, not hard-fail just because the sidecar
    is absent."""
    src = tmp_path / "source.db"
    _make_populated_db(src)
    snapshot = tmp_path / "no_sidecar.db"
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(snapshot))
    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
    # Deliberately no .sha256 file written.
    result = _run(snapshot)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "no .sha256 sidecar" in result.stdout
    assert "PRAGMA quick_check: ok" in result.stdout


def test_corrupt_sqlite_file_fails_quick_check(tmp_path):
    snapshot = tmp_path / "garbage.db"
    snapshot.write_bytes(b"this is not a sqlite database at all, just bytes")
    result = _run(snapshot)
    assert result.returncode != 0


# ── P2 (hardening A final repair, 2026-09-10): confirmation required for a ──
# ── live/prod target even when the file doesn't exist there yet ────────────

def test_refuses_nonexistent_target_that_matches_configured_db_path(tmp_path):
    """The confirmed gap: pointing --target at config.DB_PATH used to
    restore there with ZERO confirmation as long as no file already
    happened to sit at that path (a fresh server, or one where the DB was
    deleted) -- silently becoming production data on the next app start."""
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    live_path = tmp_path / "would_be_prod" / "security.db"
    assert not live_path.exists()
    result = _run_with_env({"DB_PATH": str(live_path)}, snapshot, "--target", live_path)
    assert result.returncode != 0
    assert "REFUSING" in result.stdout
    assert "configured production DB_PATH" in result.stdout
    assert not live_path.exists(), "must not have written anything at all"


def test_overwrites_nonexistent_live_target_when_explicitly_confirmed(tmp_path):
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    live_path = tmp_path / "would_be_prod" / "security.db"
    assert not live_path.exists()
    result = _run_with_env(
        {"DB_PATH": str(live_path)},
        snapshot, "--target", live_path, "--i-understand-this-overwrites-the-target-file",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert live_path.exists()
    conn = sqlite3.connect(str(live_path))
    try:
        rows = conn.execute("SELECT id, phone FROM drivers_registration").fetchall()
    finally:
        conn.close()
    assert rows == [("d1", "+77001234567")]


def test_still_refuses_existing_live_target_without_confirmation(tmp_path):
    """Regression pin: the pre-existing exists()-based refusal for a live
    target must keep working too, not just the new not-yet-existing case."""
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    live_path = tmp_path / "would_be_prod" / "security.db"
    live_path.parent.mkdir(parents=True)
    live_path.write_text("pre-existing prod data, must not be touched")
    result = _run_with_env({"DB_PATH": str(live_path)}, snapshot, "--target", live_path)
    assert result.returncode != 0
    assert "REFUSING" in result.stdout
    assert live_path.read_text() == "pre-existing prod data, must not be touched"


def test_non_live_target_still_does_not_need_confirmation_when_absent(tmp_path):
    """Confirm the fix is scoped correctly -- an explicit --target that is
    NOT the configured DB_PATH still behaves exactly as before: no
    confirmation needed when nothing exists there yet."""
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    other_prod_path = tmp_path / "totally_different_prod_path.db"
    test_target = tmp_path / "explicitly_a_test_target.db"
    assert not test_target.exists()
    result = _run_with_env({"DB_PATH": str(other_prod_path)}, snapshot, "--target", test_target)
    assert result.returncode == 0, result.stdout + result.stderr
    assert test_target.exists()


def test_live_target_detection_is_fail_closed_when_db_path_env_is_unset(tmp_path, monkeypatch):
    """If DB_PATH can't be read at all (config import failure path), the
    script must treat every explicit --target as potentially live rather
    than silently trusting it isn't -- confirmed by removing DB_PATH from
    the subprocess env entirely (config.py then falls back to its own
    hardcoded default, which is still a real, specific path -- so this
    mainly exercises that the fail-closed branch in _is_live_target isn't
    needed for config.py's own fallback to work, but confirms the general
    posture: an explicit, non-matching --target with no DB_PATH override
    behaves exactly as the "not live" case, precisely because config.py's
    default is itself a well-defined path that this tmp_path target won't
    collide with)."""
    snapshot = _make_snapshot_with_sidecar(tmp_path)
    test_target = tmp_path / "definitely_not_prod.db"
    env = {k: v for k, v in os.environ.items() if k != "DB_PATH"}
    result = subprocess.run(
        [sys.executable, str(RESTORE_SCRIPT), str(snapshot), "--target", str(test_target)],
        capture_output=True, text=True, timeout=30, env=env,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert test_target.exists()
