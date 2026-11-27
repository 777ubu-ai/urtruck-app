#!/usr/bin/env python3
"""Narrow, recoverable production overlay for the merged CGR online-board fix.

This writer can only install/restore the two PR #732 modules.  It does not
open, migrate, or replace application databases, environment files, storage,
or any other source file.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import statistics
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


SOURCE_SHA = "65c7370810593fbaadff5cf39a0eb9a9878ed9a8"
FILES = {
    "api/borders.py": "174b5af783ad6411268d67f10917598df3f166e89f21c3ef79194d72dcf8270c",
    "cgr/scoreboard_service.py": "4cc7e94388858e10449eede9e02526145d10f93f79b106582620bb01db9d46af",
}
BEFORE_FILES = {
    "api/borders.py": "d102969da1b980ac8a850271ca4966fea73722e67b5b4bd287be3b5fe624e05f",
    "cgr/scoreboard_service.py": "498c6ea5bb33d3f12b64ef9a525e770714cd9c9cc6a87e8cf13aaf94600062a3",
}
CHECKPOINTS = (
    "nur_zholy_horgos",
    "bahty_pokitu",
    "dostyk_alashankou",
    "kalzhat_dulaty",
    "karasu_ak_tilek",
)
BASE = "http://127.0.0.1:8001/api/v1/borders/online-board"
HEALTH = "http://127.0.0.1:8001/health"
SERVICE = "urtruck-security-api"
PM2 = Path("/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2")
BACKUP_ROOT = Path.home() / "urtruck-backups" / "cgr-online-board"
BACKUP_ID_RE = re.compile(r"\A\d{8}T\d{6}Z-[0-9a-f]{7}\Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_root(raw: str) -> Path:
    root = Path(raw)
    if not root.is_absolute() or root.is_symlink():
        raise RuntimeError("production_root_must_be_absolute_real_directory")
    root = root.resolve(strict=True)
    if not (root / "main.py").is_file():
        raise RuntimeError("production_backend_root_not_verified")
    return root


def pm2_command() -> list[str]:
    candidate = PM2 if PM2.is_file() else shutil.which("pm2")
    if not candidate or not os.access(candidate, os.X_OK):
        raise RuntimeError("production_pm2_cli_not_found")
    return [str(candidate)]


def verify_active_service(root: Path) -> int:
    """Bind the overlay to the one listener managed by the expected PM2 app."""
    result = subprocess.run(
        ["ss", "-ltnpH", "sport = :8001"], check=True, text=True,
        capture_output=True, timeout=10,
    )
    pids = set(re.findall(r"pid=(\d+)", result.stdout))
    if len(pids) != 1:
        raise RuntimeError("production_api_listener_not_unique")
    pid = int(next(iter(pids)))
    process_cwd = Path(f"/proc/{pid}/cwd").resolve(strict=True)
    if process_cwd != root:
        raise RuntimeError("production_listener_root_mismatch")

    pm2 = subprocess.run(pm2_command() + ["jlist"], check=True, text=True,
                         capture_output=True, timeout=15)
    entries = json.loads(pm2.stdout)
    matches = [entry for entry in entries
               if entry.get("name") == SERVICE
               and str(entry.get("pid")) == str(pid)
               and Path(entry.get("pm2_env", {}).get("pm_cwd", "/")).resolve() == root]
    if len(matches) != 1:
        raise RuntimeError("production_pm2_identity_mismatch")
    return pid


def file_path(root: Path, relative: str) -> Path:
    root = root.resolve(strict=True)
    target = root / relative
    if target.is_symlink() or not target.resolve().is_relative_to(root):
        raise RuntimeError("overlay_target_path_invalid")
    if not target.is_file():
        raise RuntimeError("overlay_target_file_missing")
    return target


def atomic_install(target: Path, data: bytes, mode: int, uid: int, gid: int) -> None:
    if uid != os.geteuid() or gid not in {os.getegid(), *os.getgroups()}:
        raise RuntimeError("overlay_file_ownership_not_preservable")
    fd, temp_name = tempfile.mkstemp(prefix=f".{target.name}.cgr-overlay-", dir=target.parent)
    try:
        os.fchmod(fd, mode)
        os.fchown(fd, uid, gid)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, target)
        dirfd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(dirfd)
        finally:
            os.close(dirfd)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def read_json(url: str, timeout: float = 6) -> tuple[int, dict | None, str]:
    def safe_preview(body: dict | None) -> str:
        if isinstance(body, dict):
            if isinstance(body.get("error"), str):
                return "error=" + body["error"][:100]
            if isinstance(body.get("detail"), str):
                return "detail=" + body["detail"][:100]
            return "json_keys=" + ",".join(sorted(str(key) for key in body.keys())[:12])
        return "non_json_response"

    try:
        with urlopen(url, timeout=timeout) as response:
            raw = response.read(2_000_000).decode("utf-8", "replace")
            try:
                body = json.loads(raw)
            except ValueError:
                body = None
            return response.status, body, safe_preview(body)
    except HTTPError as exc:
        raw = exc.read(2_000_000).decode("utf-8", "replace")
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
        return exc.code, body, safe_preview(body)
    except (URLError, TimeoutError, OSError) as exc:
        return 0, None, type(exc).__name__


def wait_health(seconds: int = 40) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        code, body, _ = read_json(HEALTH, timeout=3)
        if code == 200 and isinstance(body, dict) and body.get("status") in ("ok", "healthy"):
            return True
        time.sleep(2)
    return False


def restart() -> None:
    subprocess.run(pm2_command() + ["restart", SERVICE], check=True,
                   text=True, capture_output=True, timeout=75)


def backup_id_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + SOURCE_SHA[:7]


def make_backup(root: Path, pid: int, candidate_dir: Path) -> tuple[str, dict]:
    if BACKUP_ROOT.is_symlink() or BACKUP_ROOT.parent.is_symlink():
        raise RuntimeError("backup_directory_symlink_forbidden")
    BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(BACKUP_ROOT, 0o700)
    backup_id = backup_id_now()
    backup_dir = BACKUP_ROOT / backup_id
    backup_dir.mkdir(mode=0o700)
    manifest = {
        "source_sha": SOURCE_SHA,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "production_root": str(root),
        "listener_pid": pid,
        "scope": sorted(FILES),
        "files": {},
    }
    try:
        for rel, expected_after in FILES.items():
            live = file_path(root, rel)
            candidate = candidate_dir / rel
            if sha256(candidate) != expected_after:
                raise RuntimeError("candidate_checksum_mismatch")
            info = live.stat()
            backup = backup_dir / rel
            backup.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(live, backup)
            os.chmod(backup, 0o600)
            if sha256(backup) != sha256(live):
                raise RuntimeError("backup_checksum_mismatch")
            manifest["files"][rel] = {
                "before_sha256": sha256(live),
                "after_sha256": expected_after,
                "mode": info.st_mode & 0o777,
                "uid": info.st_uid,
                "gid": info.st_gid,
            }
        # Verify restoration into an isolated directory; production files are
        # never overwritten during this probe.
        probe = backup_dir / ".restore-probe"
        probe.mkdir(mode=0o700)
        for rel, details in manifest["files"].items():
            restored = probe / rel
            restored.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(backup_dir / rel, restored)
            if sha256(restored) != details["before_sha256"]:
                raise RuntimeError("backup_restore_probe_failed")
        shutil.rmtree(probe)
        manifest_path = backup_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        os.chmod(manifest_path, 0o600)
        return backup_id, manifest
    except Exception:
        # Keep any partial backup as evidence; never rotate or delete backups.
        raise


def load_backup(root: Path, backup_id: str) -> tuple[Path, dict]:
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise RuntimeError("invalid_backup_id")
    if BACKUP_ROOT.is_symlink() or BACKUP_ROOT.parent.is_symlink():
        raise RuntimeError("backup_directory_symlink_forbidden")
    backup_dir = (BACKUP_ROOT / backup_id).resolve(strict=True)
    if not backup_dir.is_relative_to(BACKUP_ROOT.resolve(strict=True)):
        raise RuntimeError("backup_path_invalid")
    manifest = json.loads((backup_dir / "manifest.json").read_text())
    if manifest.get("scope") != sorted(FILES) or manifest.get("production_root") != str(root):
        raise RuntimeError("backup_scope_or_root_mismatch")
    if set(manifest.get("files", {})) != set(FILES):
        raise RuntimeError("backup_file_allowlist_mismatch")
    for rel in FILES:
        file = backup_dir / rel
        if file.is_symlink() or not file.is_file():
            raise RuntimeError("backup_file_missing")
        if sha256(file) != manifest["files"][rel]["before_sha256"]:
            raise RuntimeError("backup_checksum_mismatch")
        live = file_path(root, rel)
        live_sha = sha256(live)
        if live_sha not in {manifest["files"][rel]["before_sha256"],
                            manifest["files"][rel]["after_sha256"]}:
            raise RuntimeError("rollback_refused_live_file_changed_since_backup")
    return backup_dir, manifest


def restore(root: Path, backup_id: str, restart_service: bool = True) -> None:
    backup_dir, manifest = load_backup(root, backup_id)
    for rel, details in manifest["files"].items():
        target = file_path(root, rel)
        atomic_install(target, (backup_dir / rel).read_bytes(), details["mode"],
                       details["uid"], details["gid"])
        if sha256(target) != details["before_sha256"]:
            raise RuntimeError("rollback_checksum_mismatch")
    if restart_service:
        restart()
        if not wait_health():
            raise RuntimeError("rollback_health_failed")
    print(f"ROLLBACK=PASS BACKUP_ID={backup_id} FILES={len(FILES)}")


def request(checkpoint: str, *, page: int = 1, statuses: list[str] | None = None,
            plate: str = "") -> tuple[int, dict | None, float, str]:
    params: list[tuple[str, str]] = [("checkpoint", checkpoint), ("page", str(page))]
    params.extend(("statuses", status) for status in (statuses or []))
    if plate:
        params.append(("plate", plate))
    started = time.perf_counter()
    code, body, preview = read_json(BASE + "?" + urlencode(params), timeout=16)
    return code, body, (time.perf_counter() - started) * 1000, preview


def validate_board(checkpoint: str, page: int = 1, statuses: list[str] | None = None,
                   plate: str = "", expected_plates: set[str] | None = None) -> tuple[bool, str, dict | None, float]:
    code, body, elapsed_ms, preview = request(checkpoint, page=page, statuses=statuses, plate=plate)
    if code != 200 or not isinstance(body, dict):
        return False, f"http={code} {preview}", None, elapsed_ms
    if body.get("error") == "Погранпереход не найден":
        return False, "old_dynamic_route_still_active", body, elapsed_ms
    if "detail" in body:
        return False, f"api_detail={str(body.get('detail'))[:100]}", body, elapsed_ms
    rows, options = body.get("rows"), body.get("statuses")
    if not isinstance(rows, list) or not isinstance(options, list) or not isinstance(body.get("total"), int):
        return False, "invalid_board_shape", body, elapsed_ms
    if len(options) != 13:
        return False, f"status_count={len(options)}_expected=13", body, elapsed_ms
    if body.get("page") != page or not isinstance(body.get("has_next"), bool):
        return False, "page_metadata_mismatch", body, elapsed_ms
    if body.get("total", -1) < len(rows):
        return False, "total_less_than_page_rows", body, elapsed_ms
    if page == 1 and body.get("total", 0) > 0 and not rows:
        return False, "positive_total_with_empty_page", body, elapsed_ms
    for row in rows:
        if not isinstance(row, dict) or any(not row.get(key) for key in ("plate", "checkpoint", "date", "slot", "status")):
            return False, "incomplete_board_record", body, elapsed_ms
    if expected_plates is not None:
        actual = {"".join(ch for ch in str(row.get("plate", "")).upper() if ch.isalnum()) for row in rows}
        if not actual.intersection(expected_plates):
            return False, "searched_plate_not_returned", body, elapsed_ms
    if body.get("total", 0) == 0 and not body.get("updated_at"):
        return False, "zero_without_source_update_marker", body, elapsed_ms
    if not body.get("updated_at"):
        return False, "source_update_marker_missing", body, elapsed_ms
    if rows:
        start, end = body.get("range_start"), body.get("range_end")
        if not isinstance(start, int) or not isinstance(end, int) or end - start + 1 != len(rows):
            return False, "range_metadata_mismatch", body, elapsed_ms
        if page == 1 and start != 1:
            return False, "first_page_range_start_mismatch", body, elapsed_ms
        if page > 1 and start <= (page - 1) * 15:
            return False, "page_range_did_not_advance", body, elapsed_ms
    return True, "ok", body, elapsed_ms


def board_acceptance() -> list[str]:
    failures: list[str] = []
    first_pages: dict[str, dict] = {}
    for checkpoint in CHECKPOINTS:
        ok, detail, body, elapsed = validate_board(checkpoint)
        if not ok:
            failures.append(f"BOARD {checkpoint} FAIL {detail}")
            continue
        assert body is not None
        first_pages[checkpoint] = body
        if body["total"] <= 0:
            failures.append(f"BOARD {checkpoint} FAIL no_official_records")
        state = "PASS" if body["total"] > 0 else "FAIL"
        print(f"BOARD {checkpoint} {state} total={body['total']} rows={len(body['rows'])} page=1 "
              f"has_next={body['has_next']} elapsed_ms={elapsed:.0f} "
              f"updated_at={body.get('updated_at')}")
        if not body["has_next"]:
            failures.append(f"PAGINATION {checkpoint} BLOCKED no_next_page_from_source")

    # Exercise single, multiple, and all-status filters at one live checkpoint.
    base = first_pages.get(CHECKPOINTS[0])
    if base:
        codes = [str(item.get("code") or "") for item in base["statuses"]]
        if len(codes) != 13 or any(not code for code in codes):
            failures.append("FILTERS FAIL invalid_status_codes")
        else:
            for label, selected in (("one", codes[:1]), ("multiple", codes[:2]), ("all", codes)):
                ok, detail, body, elapsed = validate_board(CHECKPOINTS[0], statuses=selected)
                if not ok:
                    failures.append(f"FILTERS {label} FAIL {detail}")
                else:
                    print(f"FILTERS {label} PASS total={body['total']} rows={len(body['rows'])} elapsed_ms={elapsed:.0f}")

        # Search with a plate seen in the source response; logs contain no plate.
        if base["rows"]:
            plate = str(base["rows"][0]["plate"])
            normalized = "".join(ch for ch in plate.upper() if ch.isalnum())
            ok, detail, body, elapsed = validate_board(
                CHECKPOINTS[0], plate=plate, expected_plates={normalized})
            if not ok:
                failures.append(f"PLATE_SEARCH FAIL {detail}")
            else:
                print(f"PLATE_SEARCH PASS total={body['total']} rows={len(body['rows'])} elapsed_ms={elapsed:.0f}")
        else:
            failures.append("PLATE_SEARCH BLOCKED no_source_plate")

    # Verify page two for each live checkpoint, including page metadata.
    for checkpoint in CHECKPOINTS:
        ok, detail, body, elapsed = validate_board(checkpoint, page=2)
        if not ok:
            failures.append(f"PAGINATION {checkpoint} FAIL {detail}")
        else:
            print(f"PAGINATION {checkpoint} PASS page=2 rows={len(body['rows'])} elapsed_ms={elapsed:.0f}")

    # An unlikely plate is read-only and verifies a real, source-confirmed zero.
    ok, detail, body, elapsed = validate_board(CHECKPOINTS[0], plate="ZZZ999999999999")
    if not ok or body is None or body.get("total") != 0 or body.get("rows"):
        failures.append(f"EMPTY_SEARCH FAIL {detail}")
    else:
        print(f"EMPTY_SEARCH PASS total=0 rows=0 elapsed_ms={elapsed:.0f}")
    return failures


def production_feed_diagnostics(root: Path, pid: int) -> None:
    """Aggregate-only live diagnostics; SQLite is opened read-only."""
    proc_env: dict[str, str] = {}
    try:
        for item in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
            if b"=" in item:
                key, value = item.split(b"=", 1)
                if key.decode(errors="ignore") in {"DB_PATH", "URTRUCK_DB_PATH", "EXTERNAL_FREIGHT_DB_PATH"}:
                    proc_env[key.decode(errors="ignore")] = value.decode(errors="ignore")
    except (OSError, PermissionError):
        print("FEED_DIAG=BLOCKED_PROCESS_ENV_UNREADABLE")
        return

    def db_path_from(raw: str) -> Path:
        raw = raw.strip()
        if raw.startswith("sqlite:///"):
            raw = raw.removeprefix("sqlite:///")
            if not raw.startswith("/"):
                raw = "/" + raw
        path = Path(raw).expanduser()
        return path if path.is_absolute() else root / path

    ext = proc_env.get("EXTERNAL_FREIGHT_DB_PATH")
    primary = proc_env.get("URTRUCK_DB_PATH") or proc_env.get("DB_PATH")
    candidates = [db_path_from(ext)] if ext else []
    if primary:
        candidates.append(db_path_from(primary).with_name("external-freight.sqlite3"))
    candidates.extend((
        Path("/home/ubuntu/urtruck/backend/database/external-freight.sqlite3"),
        root / "database" / "external-freight.sqlite3",
        root / "external-freight.sqlite3",
    ))
    db = next((p.resolve() for p in candidates if p.is_file()), None)
    if db is None:
        print("FEED_DIAG=BLOCKED_DATABASE_NOT_FOUND")
        return
    try:
        conn = sqlite3.connect(db.as_uri() + "?mode=ro", uri=True, timeout=1)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
        journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
        pages = conn.execute("PRAGMA page_count").fetchone()[0]
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
        names = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='external_freight_items'")}
        expected_index = "ix_external_freight_publication"
        if expected_index not in names:
            print("FEED_INDEX=FAIL publication_index_missing")
        else:
            print("FEED_INDEX=PASS ix_external_freight_publication")

        now = datetime.now(timezone.utc).isoformat()
        page_sql = ("SELECT * FROM external_freight_items WHERE kind=? AND ingested_at<=? "
                    "AND status='active' AND expires_at>? "
                    "ORDER BY source_published_at DESC,id DESC LIMIT 31")
        count_sql = ("SELECT COUNT(*) FROM external_freight_items "
                     "INDEXED BY ix_external_freight_publication "
                     "WHERE kind=? AND status='active' AND expires_at>?")
        try:
            plan = [str(row[3]) for row in conn.execute(
                "EXPLAIN QUERY PLAN " + page_sql, ("cargo", now, now))]
            print("FEED_PAGE_PLAN=" + " | ".join(plan)[:600])
            count_plan = [str(row[3]) for row in conn.execute(
                "EXPLAIN QUERY PLAN " + count_sql, ("cargo", now))]
            print("FEED_COUNT_PLAN=" + " | ".join(count_plan)[:600])
            vehicle_cutoff = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
            for kind in ("cargo", "vehicle"):
                if kind == "vehicle":
                    total = conn.execute(count_sql + " AND source_published_at>?", (kind, now, vehicle_cutoff)).fetchone()[0]
                else:
                    total = conn.execute(count_sql, (kind, now)).fetchone()[0]
                print(f"FEED_DB_COUNT {kind}={total}")
            page_ms = []
            count_ms = []
            for _ in range(3):
                started = time.perf_counter()
                conn.execute(page_sql, ("cargo", now, now)).fetchall()
                page_ms.append((time.perf_counter() - started) * 1000)
                started = time.perf_counter()
                conn.execute(count_sql, ("cargo", now)).fetchone()
                count_ms.append((time.perf_counter() - started) * 1000)
            print(f"FEED_SQL_PAGE_MS median={statistics.median(page_ms):.1f} max={max(page_ms):.1f} n=3")
            print(f"FEED_SQL_COUNT_MS median={statistics.median(count_ms):.1f} max={max(count_ms):.1f} n=3")
            print(f"FEED_SQLITE journal={journal} page_count={pages} page_size={page_size} "
                  f"wal_bytes={Path(str(db)+'-wal').stat().st_size if Path(str(db)+'-wal').exists() else 0}")
        except sqlite3.OperationalError as exc:
            message = str(exc).lower()
            error_class = "locked" if "locked" in message else "busy" if "busy" in message else type(exc).__name__
            print(f"FEED_SQL=FAIL error_class={error_class}")
        finally:
            conn.close()
    except sqlite3.Error as exc:
        print(f"FEED_DB=FAIL error={type(exc).__name__}")

    ps = subprocess.run(["ps", "-p", str(pid), "-o", "%cpu=,%mem=,rss=,etime="],
                        text=True, capture_output=True, timeout=5)
    samples = []
    for index in range(3):
        sample = subprocess.run(["ps", "-p", str(pid), "-o", "%cpu=,%mem=,rss=,etime="],
                                text=True, capture_output=True, timeout=5)
        if sample.returncode == 0 and sample.stdout.strip():
            samples.append(sample.stdout.strip())
        if index < 2:
            time.sleep(1)
    print("BACKEND_PROCESS=" + (ps.stdout.strip() if ps.returncode == 0 else "unavailable"))
    print("BACKEND_PROCESS_SAMPLES=" + json.dumps(samples))
    try:
        print("HOST_LOAD_AVERAGE=" + ",".join(f"{value:.2f}" for value in os.getloadavg()))
    except (AttributeError, OSError):
        print("HOST_LOAD_AVERAGE=unavailable")
    free = subprocess.run(["free", "-b"], text=True, capture_output=True, timeout=5)
    mem_line = next((line.strip() for line in free.stdout.splitlines() if line.startswith("Mem:")), "unavailable")
    print("HOST_MEMORY=" + mem_line)
    try:
        logs = subprocess.run(pm2_command() + ["logs", SERVICE, "--nostream", "--lines", "3000"],
                              text=True, capture_output=True, timeout=12)
        combined = logs.stdout + logs.stderr
        patterns = {
            "sqlite_locked": re.compile(r"database is locked|database table is locked", re.I),
            "sqlite_busy": re.compile(r"database is busy|sqlite_busy", re.I),
            "timeout": re.compile(r"TimeoutError|timed out|timeout", re.I),
            "external_freight_error": re.compile(r"external.freight.*(error|failed)|external_freight.*(error|failed)", re.I),
        }
        print("BACKEND_LOG_COUNTS=" + json.dumps({key: len(pattern.findall(combined)) for key, pattern in patterns.items()}, sort_keys=True))
    except (subprocess.SubprocessError, OSError):
        print("BACKEND_LOG_COUNTS=unavailable")


def deploy(root: Path, candidate_dir: Path) -> None:
    for rel, expected in FILES.items():
        candidate = candidate_dir / rel
        if not candidate.is_file() or sha256(candidate) != expected:
            raise RuntimeError("candidate_checksum_mismatch")
        compile(candidate.read_bytes(), rel, "exec")

    with (Path.home() / ".urtruck-cgr-overlay.lock").open("a") as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        pid = verify_active_service(root)
        backup_id, manifest = make_backup(root, pid, candidate_dir)
        print(f"BACKUP=PASS BACKUP_ID={backup_id} FILES=2 RESTORE_PROBE=PASS")
        unexpected = {
            rel: details["before_sha256"]
            for rel, details in manifest["files"].items()
            if details["before_sha256"] not in {BEFORE_FILES[rel], FILES[rel]}
        }
        if unexpected:
            for rel, live_sha in unexpected.items():
                print(f"PRODUCTION_BASELINE=BLOCKED file={rel} sha256={live_sha}")
            print(f"BACKUP_RETAINED=YES BACKUP_ID={backup_id} DEPLOYMENT=NOT_STARTED")
            raise RuntimeError("production_file_baseline_not_in_allowlist")
        written: list[str] = []
        try:
            for rel, details in manifest["files"].items():
                target = file_path(root, rel)
                current = target.stat()
                atomic_install(target, (candidate_dir / rel).read_bytes(), current.st_mode & 0o777,
                               current.st_uid, current.st_gid)
                written.append(rel)
                if sha256(target) != details["after_sha256"]:
                    raise RuntimeError("installed_checksum_mismatch")
            restart()
            if not wait_health():
                raise RuntimeError("production_health_failed_after_overlay")
            # Only revert automatically when the new route is not registered
            # and the old dynamic-route response remains active.
            status, body, _, preview = request(CHECKPOINTS[0])
            if status == 200 and isinstance(body, dict) and body.get("error") == "Погранпереход не найден":
                raise RuntimeError("old_dynamic_route_still_active")
        except Exception:
            # Exact two-file rollback only; preserve backup for independent recovery.
            restore(root, backup_id, restart_service=False)
            try:
                restart()
                wait_health()
            finally:
                print(f"AUTO_ROLLBACK=PASS BACKUP_ID={backup_id} FILES=2")
            raise

        print(f"OVERLAY=PASS SOURCE_SHA={SOURCE_SHA} FILES=2 BACKUP_ID={backup_id} DB_CHANGED=no ENV_CHANGED=no")
        production_feed_diagnostics(root, pid)
        failures = board_acceptance()
        if failures:
            for failure in failures:
                print(failure)
            print(f"BOARD_ACCEPTANCE=FAIL BACKUP_ID={backup_id} DEPLOYMENT_RETAINED=yes")
            raise SystemExit(3)
        print("BOARD_ACCEPTANCE=PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("preflight", "deploy", "rollback", "diagnose"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--candidate-dir", default="")
    parser.add_argument("--backup-id", default="")
    args = parser.parse_args()
    root = safe_root(args.root)

    if args.operation == "preflight":
        pid = verify_active_service(root)
        print(f"PRODUCTION_PREFLIGHT=PASS SOURCE_SHA={SOURCE_SHA} LISTENER_PID={pid}")
        for rel in FILES:
            live_sha = sha256(file_path(root, rel))
            state = "target" if live_sha == FILES[rel] else "parent" if live_sha == BEFORE_FILES[rel] else "unknown"
            print(f"PRODUCTION_FILE file={rel} sha256={live_sha} state={state}")
        production_feed_diagnostics(root, pid)
        return 0
    if args.operation == "rollback":
        verify_active_service(root)
        restore(root, args.backup_id)
        return 0
    if args.operation == "diagnose":
        pid = verify_active_service(root)
        production_feed_diagnostics(root, pid)
        failures = board_acceptance()
        if failures:
            for failure in failures:
                print(failure)
            return 3
        print("BOARD_ACCEPTANCE=PASS")
        return 0
    if not args.candidate_dir:
        raise RuntimeError("candidate_dir_required")
    deploy(root, Path(args.candidate_dir).resolve(strict=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:  # no raw exception text beyond controlled codes
        print(f"OVERLAY=FAIL ERROR={type(exc).__name__}:{str(exc).replace(' ', '_')[:160]}")
        raise SystemExit(1)
