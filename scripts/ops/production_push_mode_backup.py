#!/usr/bin/env python3
"""Create a private, fresh backup before the reviewed PM2 push-mode change.

The SQLite snapshot is made on the production host through SQLite's backup
API from a read-only/query-only connection. Nothing is copied off-host.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

API_PROCESS = "urtruck-security-api"
SCHEDULER_PROCESS = "urtruck-security-scheduler"
PROJECT_ROOT = Path.home() / "urtruck"
BACKEND_ROOT = PROJECT_ROOT / "backend"
EXPECTED_RUNTIME_FILE_COUNT = 141
EXPECTED_RUNTIME_INVENTORY_SHA256 = "e2c9ef0562e19509016bce855f3ee1366f1d0caab4ffb1238b3a2e8c03889cf4"
EXPECTED_SOURCE_SHA256 = {
    "services/push_gateway.py": "cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56",
    "services/push_sender.py": "9ed81b63c1b288f439c716ec6519eb2899dc653b9178ffff0eae1c3175bc5030",
}
EXCLUDED_DIRECTORIES = {
    "tests", "test", "venv", ".venv", "__pycache__", "backups", "storage",
    "models", ".pytest_cache", ".git", "node_modules",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _source_state(root: Path) -> dict[str, Any]:
    source_hashes = {}
    for relative, expected in EXPECTED_SOURCE_SHA256.items():
        path = root / relative
        if path.is_symlink() or not path.is_file() or _sha256(path) != expected:
            raise ValueError("reviewed production push source changed after preflight")
        source_hashes[relative] = expected

    files: dict[str, str] = {}
    def fail_scan(error: OSError) -> None:
        raise error
    for directory, dirs, names in os.walk(root, followlinks=False, onerror=fail_scan):
        parent = Path(directory)
        dirs[:] = sorted(name for name in dirs if name not in EXCLUDED_DIRECTORIES)
        if any((parent / name).is_symlink() for name in dirs):
            raise ValueError("production runtime contains a source directory symlink")
        for name in names:
            path = parent / name
            if not (name.endswith((".py", ".sql")) or name in {"requirements.txt", "requirements-test.txt"}):
                continue
            if path.is_symlink() or not path.is_file():
                raise ValueError("production runtime contains an unsafe source file")
            files[path.relative_to(root).as_posix()] = _sha256(path)
    canonical = "\n".join(f"{name} {digest}" for name, digest in sorted(files.items()))
    inventory_sha = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if len(files) != EXPECTED_RUNTIME_FILE_COUNT or inventory_sha != EXPECTED_RUNTIME_INVENTORY_SHA256:
        raise ValueError("production runtime changed after its reviewed read-only preflight")
    return {"source_sha256": source_hashes, "runtime_file_count": len(files),
            "runtime_inventory_sha256": inventory_sha}


def _pm2_binary() -> str:
    for candidate in (
        shutil.which("pm2"),
        str(Path.home() / ".nvm/versions/node/v22.15.0/lib/node_modules/pm2/bin/pm2"),
        str(Path.home() / ".local/bin/pm2"),
        "/usr/local/bin/pm2",
        "/usr/bin/pm2",
    ):
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise ValueError("PM2 executable is unavailable")


def _read_mode(env_file: Path) -> str:
    modes = [line.split("=", 1)[1].strip() for line in env_file.read_text().splitlines()
             if line.strip().startswith("PUSH_PROVIDER_MODE=")]
    if modes != ["dual"]:
        raise ValueError("configured push mode is not the reviewed dual setting")
    return modes[0]


def _database_path(env_file: Path) -> Path:
    values = [line.split("=", 1)[1].strip().strip("\"'") for line in env_file.read_text().splitlines()
              if line.strip().startswith("DB_PATH=")]
    if len(values) > 1:
        raise ValueError("database path is ambiguous")
    raw = values[0] if values else str(BACKEND_ROOT / "database/security.db")
    path = Path(raw)
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    if path.is_symlink() or not path.is_file():
        raise ValueError("configured production database is missing or unsafe")
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(PROJECT_ROOT.resolve(strict=True)):
        raise ValueError("configured database is outside the production project root")
    return resolved


def _validate_processes(pm2_json: str, root: Path, expected_mode: str) -> dict[str, dict[str, Any]]:
    try:
        rows = json.loads(pm2_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("PM2 process inventory is unreadable") from exc
    selected: dict[str, dict[str, Any]] = {}
    for name in (API_PROCESS, SCHEDULER_PROCESS):
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            raise ValueError("named production PM2 process is missing or ambiguous")
        row, env = matches[0], matches[0].get("pm2_env") or {}
        if (env.get("status") != "online" or env.get("PUSH_PROVIDER_MODE") != expected_mode
                or Path(str(env.get("pm_cwd") or "")).resolve() != root.resolve()):
            raise ValueError("named production process does not match the expected live mode/cwd")
        pid = int(row.get("pid") or 0)
        if pid <= 0:
            raise ValueError("named production process PID is invalid")
        selected[name] = {"pid": pid, "status": "online", "mode": expected_mode, "cwd": str(root)}
    return selected


def _validate_saved_dump(dump: Path, expected_mode: str) -> list[str]:
    try:
        rows = json.loads(dump.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("saved PM2 process list is missing or unreadable") from exc
    if not isinstance(rows, list):
        raise ValueError("saved PM2 process list has an unsupported shape")
    names = [row.get("name", "") for row in rows]
    if len(set(names)) != len(names):
        raise ValueError("saved PM2 process list has duplicate names")
    selected = {}
    for name in (API_PROCESS, SCHEDULER_PROCESS):
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            raise ValueError("saved PM2 process list is missing or ambiguous")
        selected[name] = matches[0]
    if any((row.get("env") or {}).get("PUSH_PROVIDER_MODE") != expected_mode for row in selected.values()):
        raise ValueError("saved PM2 process mode differs from the live before-state")
    return sorted(row.get("name", "") for row in rows)


def verify_persisted_dump(before_path: Path, after_path: Path, expected_mode: str) -> None:
    """Check the saved target mode and that other PM2 entries were preserved."""
    before, after = json.loads(before_path.read_text()), json.loads(after_path.read_text())
    if not isinstance(before, list) or not isinstance(after, list):
        raise ValueError("saved PM2 process list has an unsupported shape")
    key = lambda row: str(row.get("name") or "")
    before_by_name, after_by_name = {key(row): row for row in before}, {key(row): row for row in after}
    if len(before_by_name) != len(before) or len(after_by_name) != len(after):
        raise ValueError("saved PM2 process list has duplicate names")
    if set(before_by_name) != set(after_by_name):
        raise ValueError("saved PM2 process inventory changed during mode synchronization")

    volatile = {"pid", "pm_uptime", "restart_time", "unstable_restarts", "exit_code", "status", "created_at"}
    targets = {API_PROCESS, SCHEDULER_PROCESS}
    for name in sorted(before_by_name):
        old, new = before_by_name[name], after_by_name[name]
        if name in targets:
            new_mode = (new.get("env") or {}).get("PUSH_PROVIDER_MODE", new.get("PUSH_PROVIDER_MODE"))
            if new_mode != expected_mode:
                raise ValueError("saved PM2 target mode does not match the requested mode")
            old = dict(old)
            new = dict(new)
            old_env, new_env = dict(old.get("env") or {}), dict(new.get("env") or {})
            old_env["PUSH_PROVIDER_MODE"] = new_env["PUSH_PROVIDER_MODE"] = "<mode-transition>"
            old["env"], new["env"] = old_env, new_env
            old["PUSH_PROVIDER_MODE"] = new["PUSH_PROVIDER_MODE"] = "<mode-transition>"
        old_stable = {k: v for k, v in old.items() if k not in volatile and k not in {"pm2_env"}}
        new_stable = {k: v for k, v in new.items() if k not in volatile and k not in {"pm2_env"}}
        if old_stable != new_stable:
            raise ValueError("saved PM2 application configuration changed outside the reviewed mode")


def _snapshot_database(source: Path, destination: Path) -> str:
    source_uri = source.as_uri() + "?mode=ro"
    src = sqlite3.connect(source_uri, uri=True, timeout=15)
    dst = sqlite3.connect(destination, timeout=15)
    try:
        src.execute("PRAGMA query_only=ON")
        if src.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("production database quick_check failed before backup")
        src.backup(dst, pages=256, sleep=0.05)
        dst.commit()
        if dst.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("consistent production database snapshot failed quick_check")
    finally:
        dst.close()
        src.close()
    destination.chmod(0o600)
    return _sha256(destination)


def create_backup(root: Path, run_id: str, pm2_json: str) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9]{1,20}", run_id):
        raise ValueError("workflow run identifier is invalid")
    if root.is_symlink() or root.resolve(strict=True) != BACKEND_ROOT.resolve(strict=True):
        raise ValueError("backend root is not the reviewed production directory")
    env_file = root / ".env"
    dump = Path.home() / ".pm2/dump.pm2"
    if env_file.is_symlink() or not env_file.is_file() or dump.is_symlink() or not dump.is_file():
        raise ValueError("production settings or PM2 recovery dump is missing/unsafe")
    env_mode = _read_mode(env_file)
    source_state = _source_state(root)
    processes = _validate_processes(pm2_json, root, "native")
    saved_names = _validate_saved_dump(dump, "native")
    database = _database_path(env_file)

    backup_root = PROJECT_ROOT / "backups"
    if backup_root.is_symlink() or not backup_root.is_dir():
        raise ValueError("private production backup directory is missing or unsafe")
    target = backup_root / f"push-mode-sync-{run_id}"
    if target.exists() or target.is_symlink():
        raise ValueError("backup path already exists; refusing to overwrite")
    estimated = database.stat().st_size + dump.stat().st_size + 16 * 1024 * 1024
    if shutil.disk_usage(backup_root).free < estimated:
        raise ValueError("insufficient free space for a complete mode-sync backup")

    target.mkdir(mode=0o700)
    os.chmod(target, 0o700)
    try:
        dump_copy = target / "pm2.dump.before.json"
        shutil.copy2(dump, dump_copy)
        dump_copy.chmod(0o600)
        snapshot = target / "security.db.before.sqlite"
        snapshot_sha = _snapshot_database(database, snapshot)
        record = {
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "operation": "production_push_mode_sync",
            "workflow_run_id": run_id,
            "backup_scope": "PM2 saved process state and consistent on-host production SQLite snapshot; no source/.env/storage writes",
            "backend_root": str(root.resolve()),
            "configured_mode": env_mode,
            "live_before_processes": processes,
            "saved_pm2_names": saved_names,
            "env_sha256": _sha256(env_file),
            "pm2_dump_sha256": _sha256(dump_copy),
            "database_path": str(database),
            "database_snapshot_sha256": snapshot_sha,
            "database_quick_check": "ok",
            **source_state,
        }
        record_path = target / "record.json"
        record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        record_path.chmod(0o600)
        return {"directory": str(target), **record}
    except Exception:
        shutil.rmtree(target)
        raise


def restore_saved_dump(backup_dir: Path, run_id: str) -> None:
    if not re.fullmatch(r"[0-9]{1,20}", run_id):
        raise ValueError("workflow run identifier is invalid")
    expected_dir = PROJECT_ROOT / "backups" / f"push-mode-sync-{run_id}"
    if backup_dir.is_symlink() or backup_dir.resolve(strict=True) != expected_dir.resolve(strict=True):
        raise ValueError("PM2 backup directory does not match this workflow run")
    verify_backup_before(backup_dir, run_id)
    record = json.loads((backup_dir / "record.json").read_text(encoding="utf-8"))
    source = backup_dir / "pm2.dump.before.json"
    if record.get("workflow_run_id") != run_id or _sha256(source) != record.get("pm2_dump_sha256"):
        raise ValueError("saved PM2 backup checksum does not match its record")
    pm2_home = Path.home() / ".pm2"
    target = pm2_home / "dump.pm2"
    if pm2_home.is_symlink() or not pm2_home.is_dir() or target.is_symlink():
        raise ValueError("PM2 recovery path is missing or unsafe")
    temporary = pm2_home / f"dump.pm2.restore-{run_id}.tmp"
    if temporary.exists() or temporary.is_symlink():
        raise ValueError("PM2 restore temporary path already exists")
    shutil.copyfile(source, temporary)
    temporary.chmod(0o600)
    os.replace(temporary, target)
    if _sha256(target) != record["pm2_dump_sha256"]:
        raise ValueError("restored PM2 dump checksum mismatch")


def verify_backup_before(backup_dir: Path, run_id: str, expected_before_mode: str = "native") -> None:
    expected_dir = PROJECT_ROOT / "backups" / f"push-mode-sync-{run_id}"
    if backup_dir.is_symlink() or backup_dir.resolve(strict=True) != expected_dir.resolve(strict=True):
        raise ValueError("PM2 backup directory does not match this workflow run")
    dump = backup_dir / "pm2.dump.before.json"
    database = backup_dir / "security.db.before.sqlite"
    record_path = backup_dir / "record.json"
    if any(path.is_symlink() or not path.is_file() for path in (record_path, dump, database)):
        raise ValueError("fresh PM2/database backup evidence is missing or unsafe")
    record = json.loads(record_path.read_text(encoding="utf-8"))
    if (record.get("workflow_run_id") != run_id or record.get("configured_mode") != "dual"
            or record.get("database_quick_check") != "ok"
            or backup_dir.stat().st_mode & 0o777 != 0o700
            or any(path.stat().st_mode & 0o777 != 0o600 for path in (record_path, dump, database))
            or _sha256(dump) != record.get("pm2_dump_sha256")
            or _sha256(database) != record.get("database_snapshot_sha256")):
        raise ValueError("fresh PM2/database backup evidence is incomplete")
    _validate_saved_dump(dump, expected_before_mode)


def verify_after_backup(backup_dir: Path, run_id: str, current_dump: Path, expected_mode: str) -> None:
    verify_backup_before(backup_dir, run_id)
    record = json.loads((backup_dir / "record.json").read_text(encoding="utf-8"))
    if expected_mode == "native" and _sha256(current_dump) != record.get("pm2_dump_sha256"):
        raise ValueError("live PM2 saved state changed after its fresh backup")
    verify_persisted_dump(backup_dir / "pm2.dump.before.json", current_dump, expected_mode)


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="action", required=True)
    create = subparsers.add_parser("create")
    create.add_argument("--root", required=True, type=Path)
    create.add_argument("--run-id", required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--backup-dir", required=True, type=Path)
    verify.add_argument("--run-id", required=True)
    verify.add_argument("--current-dump", required=True, type=Path)
    verify.add_argument("--mode", required=True, choices=("native", "dual"))
    restore = subparsers.add_parser("restore")
    restore.add_argument("--backup-dir", required=True, type=Path)
    restore.add_argument("--run-id", required=True)
    args = parser.parse_args()
    try:
        if args.action == "create":
            pm2_json = subprocess.run([_pm2_binary(), "jlist"], check=True, capture_output=True, text=True).stdout
            result = create_backup(args.root, args.run_id, pm2_json)
        elif args.action == "verify":
            verify_after_backup(args.backup_dir, args.run_id, args.current_dump, args.mode)
            print(f"PUSH_MODE_SAVED_DUMP_VERIFIED_MODE={args.mode}")
            return 0
        else:
            restore_saved_dump(args.backup_dir, args.run_id)
            print("PUSH_MODE_SAVED_STATE=restored")
            return 0
    except (OSError, subprocess.CalledProcessError, ValueError, sqlite3.Error, KeyError) as exc:
        print(f"PUSH_MODE_BACKUP=blocked reason={exc}")
        return 1
    print("PUSH_MODE_BACKUP=ready")
    print(f"PUSH_MODE_BACKUP_DIR={result['directory']}")
    print(f"PUSH_MODE_BACKUP_DB_SHA256={result['database_snapshot_sha256']}")
    print(f"PUSH_MODE_BACKUP_PM2_SHA256={result['pm2_dump_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
