#!/usr/bin/env python3
"""Backup, restore, and atomically overlay only the external-feed DAL module."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


FILE = "database/external_freight_dal.py"
TARGET_SHA256 = "60e23800626256f4329a33d591c2c00eda588d2b746e55c398a7ed5612395c5a"
BASELINE_SHA256 = "c9f0244f291b89ab31ba50a6fef328677fab4bda7ad69f8b6e837f7a205000df"
SERVICE = "urtruck-security-api"
HEALTH = "http://127.0.0.1:8001/health"
PM2 = Path("/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2")
BACKUP_ROOT = Path.home() / "urtruck-backups" / "external-feed-dal"
BACKUP_ID_RE = re.compile(r"\A\d{8}T\d{6}Z-[0-9a-f]{7}\Z")


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def root_dir(raw: str) -> Path:
    root = Path(raw)
    if not root.is_absolute() or root.is_symlink():
        raise RuntimeError("production_root_must_be_absolute_real_directory")
    root = root.resolve(strict=True)
    if not (root / "main.py").is_file():
        raise RuntimeError("production_backend_root_not_verified")
    return root


def target_file(root: Path) -> Path:
    target = root / FILE
    if target.is_symlink() or not target.resolve().is_relative_to(root) or not target.is_file():
        raise RuntimeError("overlay_target_path_invalid")
    return target


def pm2_command() -> list[str]:
    candidate = PM2 if PM2.is_file() else shutil.which("pm2")
    if not candidate or not os.access(candidate, os.X_OK):
        raise RuntimeError("production_pm2_cli_not_found")
    return [str(candidate)]


def verify_service(root: Path) -> int:
    result = subprocess.run(["ss", "-ltnpH", "sport = :8001"], check=True,
                            capture_output=True, text=True, timeout=10)
    pids = set(re.findall(r"pid=(\d+)", result.stdout))
    if len(pids) != 1:
        raise RuntimeError("production_api_listener_not_unique")
    pid = int(next(iter(pids)))
    if Path(f"/proc/{pid}/cwd").resolve(strict=True) != root:
        raise RuntimeError("production_listener_root_mismatch")
    result = subprocess.run(pm2_command() + ["jlist"], check=True,
                            capture_output=True, text=True, timeout=15)
    matches = [entry for entry in json.loads(result.stdout)
               if entry.get("name") == SERVICE and str(entry.get("pid")) == str(pid)
               and Path(entry.get("pm2_env", {}).get("pm_cwd", "/")).resolve() == root]
    if len(matches) != 1:
        raise RuntimeError("production_pm2_identity_mismatch")
    return pid


def health_ok(seconds: int = 40) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with urlopen(HEALTH, timeout=3) as response:
                body = json.loads(response.read(100_000))
                if response.status == 200 and body.get("status") in {"ok", "healthy"}:
                    print(f"HEALTH=PASS code={response.status} status={body.get('status')} db={body.get('db')}")
                    return True
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            pass
        time.sleep(2)
    print("HEALTH=FAIL")
    return False


def restart() -> None:
    subprocess.run(pm2_command() + ["restart", SERVICE], check=True,
                   capture_output=True, text=True, timeout=75)


def backup(root: Path, pid: int) -> str:
    if BACKUP_ROOT.is_symlink() or BACKUP_ROOT.parent.is_symlink():
        raise RuntimeError("backup_directory_symlink_forbidden")
    BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(BACKUP_ROOT, 0o700)
    backup_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + TARGET_SHA256[:7]
    directory = BACKUP_ROOT / backup_id
    directory.mkdir(mode=0o700)
    live = target_file(root)
    info = live.stat()
    saved = directory / Path(FILE).name
    shutil.copy2(live, saved)
    os.chmod(saved, 0o600)
    before = digest(live)
    if digest(saved) != before:
        raise RuntimeError("backup_checksum_mismatch")
    probe = directory / ".restore-probe"
    probe.mkdir(mode=0o700)
    restored = probe / Path(FILE).name
    shutil.copy2(saved, restored)
    if digest(restored) != before:
        raise RuntimeError("backup_restore_probe_failed")
    shutil.rmtree(probe)
    manifest = {
        "source_sha256": TARGET_SHA256,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "production_root": str(root), "listener_pid": pid,
        "scope": [FILE], "before_sha256": before,
        "after_sha256": TARGET_SHA256,
        "mode": info.st_mode & 0o777, "uid": info.st_uid, "gid": info.st_gid,
    }
    manifest_path = directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    os.chmod(manifest_path, 0o600)
    print(f"BACKUP_ID={backup_id} BACKUP=PASS FILES=1 RESTORE_PROBE=PASS BEFORE_SHA256={before}")
    return backup_id


def atomic_write(target: Path, data: bytes, mode: int, uid: int, gid: int) -> None:
    if uid != os.geteuid() or gid not in {os.getegid(), *os.getgroups()}:
        raise RuntimeError("overlay_file_ownership_not_preservable")
    fd, temp_name = tempfile.mkstemp(prefix=f".{target.name}.feed-overlay-", dir=target.parent)
    try:
        os.fchmod(fd, mode)
        os.fchown(fd, uid, gid)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, target)
        dir_fd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def load_backup(root: Path, backup_id: str) -> tuple[Path, dict]:
    if not BACKUP_ID_RE.fullmatch(backup_id) or BACKUP_ROOT.is_symlink() or BACKUP_ROOT.parent.is_symlink():
        raise RuntimeError("invalid_backup_id_or_root")
    directory = (BACKUP_ROOT / backup_id).resolve(strict=True)
    if not directory.is_relative_to(BACKUP_ROOT.resolve(strict=True)):
        raise RuntimeError("backup_path_invalid")
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("scope") != [FILE] or manifest.get("production_root") != str(root):
        raise RuntimeError("backup_scope_or_root_mismatch")
    saved = directory / Path(FILE).name
    if saved.is_symlink() or not saved.is_file() or digest(saved) != manifest.get("before_sha256"):
        raise RuntimeError("backup_checksum_mismatch")
    return saved, manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("preflight", "deploy", "rollback"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--candidate")
    parser.add_argument("--backup-id")
    args = parser.parse_args()
    root = root_dir(args.root)
    lock_path = Path(tempfile.gettempdir()) / "urtruck-external-feed-dal-overlay.lock"
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        pid = verify_service(root)
        live = target_file(root)
        current = digest(live)
        print(f"LISTENER=PASS PID={pid} FILE={FILE} CURRENT_SHA256={current}")
        if args.operation == "preflight":
            return 0
        if args.operation == "deploy":
            if not args.candidate:
                raise RuntimeError("candidate_required")
            candidate = Path(args.candidate)
            if candidate.is_symlink() or not candidate.is_file() or digest(candidate) != TARGET_SHA256:
                raise RuntimeError("candidate_checksum_mismatch")
            if current == TARGET_SHA256:
                print("OVERLAY=ALREADY_PRESENT")
                return 0
            if current != BASELINE_SHA256:
                raise RuntimeError("production_file_drift_requires_review")
            backup_id = backup(root, pid)
            details = live.stat()
            atomic_write(live, candidate.read_bytes(), details.st_mode & 0o777, details.st_uid, details.st_gid)
            try:
                if digest(live) != TARGET_SHA256:
                    raise RuntimeError("installed_checksum_mismatch")
                restart()
                if not health_ok():
                    raise RuntimeError("production_health_failed_after_overlay")
            except Exception:
                atomic_write(live, (BACKUP_ROOT / backup_id / Path(FILE).name).read_bytes(),
                             details.st_mode & 0o777, details.st_uid, details.st_gid)
                restart()
                restored = digest(live) == BASELINE_SHA256 and health_ok()
                print(f"AUTO_ROLLBACK={'PASS' if restored else 'FAIL'}")
                raise
            print(f"OVERLAY=PASS FILE={FILE} BACKUP_ID={backup_id} DB_CHANGED=no ENV_CHANGED=no")
            return 0
        if not args.backup_id:
            raise RuntimeError("backup_id_required")
        saved, manifest = load_backup(root, args.backup_id)
        if current != manifest.get("after_sha256"):
            raise RuntimeError("rollback_live_file_drift_requires_review")
        atomic_write(live, saved.read_bytes(), manifest["mode"], manifest["uid"], manifest["gid"])
        restart()
        if digest(live) != manifest["before_sha256"] or not health_ok():
            raise RuntimeError("rollback_verification_failed")
        print(f"ROLLBACK=PASS BACKUP_ID={args.backup_id} DB_CHANGED=no ENV_CHANGED=no")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"OVERLAY=FAIL reason={type(exc).__name__}:{str(exc)[:180]}")
        raise SystemExit(1)
