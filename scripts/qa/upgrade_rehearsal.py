#!/usr/bin/env python3
"""Rehearse a backend upgrade only on an explicitly authorized protected copy.

The command intentionally refuses to run without an authorization manifest,
an isolated owner-only workspace, three existing QA bearer sessions, and a
local attachment fixture. It never reads or prints source .env values and
never changes the supplied source database or storage tree.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import sqlite3
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
PRODUCTION_MARKERS = ("/home/ubuntu/urtruck", "/home/ubuntu/urtruck-security")
REQUIRED_TABLES = ("deals", "chat_messages", "message_attachments")
ENV_SECRET_MARKERS = (
    "TOKEN", "SECRET", "PASSWORD", "PRIVATE", "SERVICE_KEY", "API_KEY",
    "SMTP", "FCM", "APNS", "VAPID", "SUPABASE", "S3_", "SENTRY_DSN",
    "TELEGRAM", "WHATSAPP", "MOBIZON", "QA_AGENT", "QA_CLEANUP",
)


class RehearsalError(RuntimeError):
    def __init__(self, stage: str, code: str):
        super().__init__(f"{stage}:{code}")
        self.stage = stage
        self.code = code


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _storage_manifest(root: Path) -> tuple[str, int, int]:
    digest = hashlib.sha256()
    count = total = 0
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        if any((current_path / name).is_symlink() for name in dirs + files):
            raise RehearsalError("preflight", "storage_symlink_refused")
        dirs.sort()
        for name in sorted(files):
            path = current_path / name
            rel = path.relative_to(root).as_posix()
            info = path.stat(follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                raise RehearsalError("preflight", "storage_nonregular_file_refused")
            file_hash = _sha256_file(path)
            digest.update(rel.encode("utf-8", "surrogateescape"))
            digest.update(b"\0")
            digest.update(str(info.st_size).encode("ascii"))
            digest.update(b"\0")
            digest.update(file_hash.encode("ascii"))
            digest.update(b"\n")
            count += 1
            total += info.st_size
    return digest.hexdigest(), count, total


def _load_private_json(path: Path, label: str) -> dict[str, Any]:
    try:
        resolved = path.expanduser().resolve(strict=True)
        if REPO_ROOT == resolved or REPO_ROOT in resolved.parents:
            raise RehearsalError("preflight", f"{label}_inside_repository_refused")
        path = resolved
        info = path.stat()
        mode = stat.S_IMODE(info.st_mode)
        if info.st_uid != os.getuid() or mode & 0o077:
            raise RehearsalError("preflight", f"{label}_permissions_not_private")
        raw = json.loads(path.read_text(encoding="utf-8"))
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("preflight", f"{label}_unreadable") from None
    if not isinstance(raw, dict):
        raise RehearsalError("preflight", f"{label}_invalid_format")
    return raw


def _safe_source(path: Path, kind: str) -> Path:
    try:
        resolved = path.expanduser().resolve(strict=True)
    except Exception:
        raise RehearsalError("preflight", f"{kind}_not_found") from None
    normalized = str(resolved).lower()
    if any(marker in normalized for marker in PRODUCTION_MARKERS):
        raise RehearsalError("preflight", f"{kind}_production_path_refused")
    if REPO_ROOT == resolved or REPO_ROOT in resolved.parents:
        raise RehearsalError("preflight", f"{kind}_inside_repository_refused")
    return resolved


def _require_private_source(path: Path, kind: str) -> None:
    try:
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise RehearsalError("preflight", f"{kind}_not_owner_only")
        if path.is_dir():
            for current, dirs, files in os.walk(path, followlinks=False):
                current_path = Path(current)
                if stat.S_IMODE(current_path.stat().st_mode) & 0o077:
                    raise RehearsalError("preflight", f"{kind}_not_owner_only")
                if current_path.stat().st_uid != os.getuid():
                    raise RehearsalError("preflight", f"{kind}_not_owner_only")
                for name in files:
                    child = current_path / name
                    child_info = child.stat(follow_symlinks=False)
                    if child_info.st_uid != os.getuid() or stat.S_IMODE(child_info.st_mode) & 0o077:
                        raise RehearsalError("preflight", f"{kind}_not_owner_only")
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("preflight", f"{kind}_permissions_unreadable") from None


def _validate_inputs(args: argparse.Namespace) -> tuple[Path, Path, Path, dict[str, Any], dict[str, Any]]:
    db_source = _safe_source(args.source_db, "database")
    storage_source = _safe_source(args.source_storage, "storage")
    protected_root = args.protected_root.expanduser().resolve(strict=True)
    if not protected_root.is_dir() or protected_root.is_symlink():
        raise RehearsalError("preflight", "protected_root_invalid")
    root_stat = protected_root.stat()
    if root_stat.st_uid != os.getuid() or stat.S_IMODE(root_stat.st_mode) & 0o077:
        raise RehearsalError("preflight", "protected_root_owner_or_mode_invalid")
    if protected_root == REPO_ROOT or REPO_ROOT in protected_root.parents:
        raise RehearsalError("preflight", "protected_root_inside_repository_refused")
    if any(marker in str(protected_root).lower() for marker in PRODUCTION_MARKERS):
        raise RehearsalError("preflight", "protected_root_production_path_refused")
    if db_source == protected_root or protected_root in db_source.parents:
        raise RehearsalError("preflight", "source_database_inside_work_root_refused")
    if storage_source == protected_root or protected_root in storage_source.parents:
        raise RehearsalError("preflight", "source_storage_inside_work_root_refused")
    if not db_source.is_file() or not storage_source.is_dir():
        raise RehearsalError("preflight", "source_material_type_invalid")
    _require_private_source(db_source, "source_database")
    _require_private_source(storage_source, "source_storage")
    if any(Path(str(db_source) + suffix).exists() for suffix in ("-wal", "-shm", "-journal")):
        raise RehearsalError("preflight", "source_database_not_quiescent_single_file")

    auth = _load_private_json(args.authorization, "authorization_record")
    access = _load_private_json(args.access_probes, "access_probe_file")
    db_hash = _sha256_file(db_source)
    storage_hash, storage_files, _ = _storage_manifest(storage_source)
    if (auth.get("format") != "urtruck-upgrade-authorization-v1"
            or auth.get("authorized_for_upgrade_rehearsal") is not True
            or auth.get("source_kind") not in {"sanitized_qa_copy", "protected_backup_copy"}
            or not isinstance(auth.get("copy_id"), str) or not auth["copy_id"].strip()
            or auth.get("database_sha256") != db_hash
            or auth.get("storage_manifest_sha256") != storage_hash):
        raise RehearsalError("preflight", "authorization_or_source_fingerprint_mismatch")
    for key in ("participant_a_bearer", "participant_b_bearer", "outsider_bearer",
                "conversation_id", "attachment_id"):
        if not isinstance(access.get(key), str) or not access[key].strip():
            raise RehearsalError("preflight", "access_probe_material_incomplete")
    if len(access["participant_a_bearer"]) < 16 or len(access["participant_b_bearer"]) < 16 or len(access["outsider_bearer"]) < 16:
        raise RehearsalError("preflight", "access_probe_session_invalid")
    if len({access["participant_a_bearer"], access["participant_b_bearer"], access["outsider_bearer"]}) != 3:
        raise RehearsalError("preflight", "access_probe_sessions_not_distinct")
    if storage_files == 0:
        raise RehearsalError("preflight", "storage_copy_empty")
    return db_source, storage_source, protected_root, auth, access


def _open_readonly_db(path: Path) -> sqlite3.Connection:
    uri = "file:" + urllib.parse.quote(str(path), safe="/") + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


def _table_names(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _table_snapshot(conn: sqlite3.Connection) -> dict[str, Any]:
    integrity = conn.execute("PRAGMA quick_check").fetchone()
    if not integrity or integrity[0] != "ok":
        raise RehearsalError("snapshot", "database_integrity_check_failed")
    names = _table_names(conn)
    missing = [table for table in REQUIRED_TABLES if table not in names]
    if missing:
        raise RehearsalError("preflight", "required_business_tables_missing")
    result: dict[str, Any] = {}
    for table in sorted(names):
        if table.startswith("sqlite_"):
            continue
        quoted = '"' + table.replace('"', '""') + '"'
        columns = conn.execute(f"PRAGMA table_info({quoted})").fetchall()
        if not columns:
            continue
        col_names = [row["name"] for row in columns]
        pk_names = [row["name"] for row in sorted(columns, key=lambda row: row["pk"]) if row["pk"]]
        order_cols = pk_names or col_names
        order = ",".join('"' + c.replace('"', '""') + '"' for c in order_cols)
        cursor = conn.execute(f"SELECT * FROM {quoted} ORDER BY {order}")
        digest = hashlib.sha256()
        count = 0
        for row in cursor:
            encoded = json.dumps([row[column] for column in col_names], ensure_ascii=False, default=str, separators=(",", ":"))
            digest.update(encoded.encode("utf-8"))
            digest.update(b"\n")
            count += 1
        result[table] = {
            "columns": col_names,
            "primary_key": pk_names,
            "rows": count,
            "fingerprint": digest.hexdigest(),
        }
    for table in REQUIRED_TABLES:
        if result[table]["rows"] == 0:
            raise RehearsalError("preflight", "required_business_fixture_empty")
    return result


def _compatible_snapshot(before_path: Path, after_path: Path) -> dict[str, Any]:
    changed_tables: set[str] = set()
    removed_rows = changed_rows = added_rows = unkeyed_mismatch_tables = 0
    try:
        with _open_readonly_db(before_path) as before:
            after_uri = "file:" + urllib.parse.quote(str(after_path), safe="/") + "?mode=ro"
            before.execute("ATTACH DATABASE ? AS newer", (after_uri,))
            after_names = {
                row[0] for row in before.execute("SELECT name FROM newer.sqlite_master WHERE type='table'")
            }
            before_names = _table_names(before)
            for table in sorted(_table_names(before)):
                if table.startswith("sqlite_"):
                    continue
                quoted = '"' + table.replace('"', '""') + '"'
                old_cols_info = before.execute(f"PRAGMA table_info({quoted})").fetchall()
                if not old_cols_info:
                    continue
                old_cols = [row["name"] for row in old_cols_info]
                old_pk = [row["name"] for row in sorted(old_cols_info, key=lambda row: row["pk"]) if row["pk"]]
                if table not in after_names:
                    removed_rows += before.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
                    changed_tables.add(table)
                    continue
                new_info = before.execute(f"PRAGMA newer.table_info('{table.replace(chr(39), chr(39) * 2)}')").fetchall()
                new_cols = {row["name"] for row in new_info}
                new_pk = [row["name"] for row in sorted(new_info, key=lambda row: row["pk"]) if row["pk"]]
                old_count = before.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
                new_count = before.execute(f"SELECT COUNT(*) FROM newer.{quoted}").fetchone()[0]
                if not set(old_cols).issubset(new_cols) or old_pk != new_pk:
                    removed_rows += old_count
                    changed_tables.add(table)
                    continue
                if old_pk:
                    def qcol(alias: str, col: str) -> str:
                        return f'{alias}."{col.replace(chr(34), chr(34) * 2)}"'
                    join = " AND ".join(
                        f"{qcol('o', key)} IS {qcol('n', key)}" for key in old_pk
                    )
                    any_key = f"{qcol('n', old_pk[0])} IS NOT NULL"
                    matched = before.execute(
                        f"SELECT COUNT(*) FROM main.{quoted} o JOIN newer.{quoted} n ON {join}"
                    ).fetchone()[0]
                    lost = before.execute(
                        f"SELECT COUNT(*) FROM main.{quoted} o LEFT JOIN newer.{quoted} n ON {join} WHERE NOT ({any_key})"
                    ).fetchone()[0]
                    different = " OR ".join(
                        f"{qcol('o', col)} IS NOT {qcol('n', col)}" for col in old_cols
                    )
                    changed = before.execute(
                        f"SELECT COUNT(*) FROM main.{quoted} o JOIN newer.{quoted} n ON {join} WHERE {different}"
                    ).fetchone()[0]
                    removed_rows += lost
                    added_rows += max(0, new_count - matched)
                    changed_rows += changed
                    if lost or changed:
                        changed_tables.add(table)
                else:
                    added_rows += max(0, new_count - old_count)
                    projection = ",".join('"' + col.replace('"', '""') + '"' for col in old_cols)
                    sort_projection = ",".join(
                        '"' + col.replace('"', '""') + '"' for col in old_cols
                    )
                    digest_pair = []
                    for schema in ("main", "newer"):
                        digest = hashlib.sha256()
                        cursor = before.execute(
                            f"SELECT {projection} FROM {schema}.{quoted} ORDER BY {sort_projection}"
                        )
                        for row in cursor:
                            encoded = json.dumps(list(row), ensure_ascii=False, default=str, separators=(",", ":"))
                            digest.update(encoded.encode("utf-8"))
                            digest.update(b"\n")
                        digest_pair.append(digest.hexdigest())
                    if digest_pair[0] != digest_pair[1]:
                        unkeyed_mismatch_tables += 1
                        changed_tables.add(table)
            for table in sorted(after_names - before_names):
                if table.startswith("sqlite_"):
                    continue
                quoted = '"' + table.replace('"', '""') + '"'
                added_rows += before.execute(f"SELECT COUNT(*) FROM newer.{quoted}").fetchone()[0]
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("compare", "database_row_comparison_failed") from None
    return {
        "baseline_tables": len(before_names),
        "after_tables": len(after_names),
        "removed_or_changed_rows": removed_rows,
        "added_rows": added_rows,
        "changed_rows": changed_rows,
        "unkeyed_mismatch_tables": unkeyed_mismatch_tables,
        "changed_table_count": len(changed_tables),
        "preserved": removed_rows == 0 and changed_rows == 0 and unkeyed_mismatch_tables == 0,
    }


def _all_rows_equal(left: dict[str, Any], right: dict[str, Any]) -> bool:
    for table, old in left.items():
        new = right.get(table)
        if new is None or old["columns"] != new["columns"] or old["rows"] != new["rows"] or old["fingerprint"] != new["fingerprint"]:
            return False
    return set(left) == set(right)


def _copy_consistent_database(source: Path, destination: Path) -> None:
    try:
        with _open_readonly_db(source) as src:
            src.execute("PRAGMA query_only=ON")
            if src.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RehearsalError("preflight", "source_database_integrity_failed")
        # The source is a sealed, checkpointed single-file snapshot (sidecars
        # were rejected during preflight), so byte-copying it avoids opening a
        # writable SQLite connection or touching the supplied source.
        shutil.copyfile(source, destination)
        os.chmod(destination, 0o600)
        with sqlite3.connect(destination) as copied:
            if copied.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RehearsalError("copy", "database_copy_integrity_failed")
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("copy", "consistent_sqlite_backup_failed") from None


def _copy_storage(source: Path, destination: Path) -> None:
    try:
        shutil.copytree(source, destination, symlinks=False)
        for current, dirs, files in os.walk(destination):
            os.chmod(current, 0o700)
            for name in files:
                os.chmod(Path(current) / name, 0o600)
    except Exception:
        raise RehearsalError("copy", "storage_copy_failed") from None


def _lock_down_tree(root: Path) -> None:
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        if any((current_path / name).is_symlink() for name in dirs + files):
            raise RehearsalError("security", "lab_symlink_detected")
        os.chmod(current_path, 0o700)
        for name in files:
            os.chmod(current_path / name, 0o600)


def _verify_attachment_in_source(db_path: Path, storage_root: Path, access: dict[str, Any]) -> None:
    try:
        with _open_readonly_db(db_path) as conn:
            row = conn.execute(
                "SELECT id, conversation_id, url FROM message_attachments WHERE id = ?",
                (access["attachment_id"],),
            ).fetchone()
        if not row or row["conversation_id"] != access["conversation_id"] or not row["url"]:
            raise RehearsalError("preflight", "attachment_fixture_not_linked")
        path = urllib.parse.urlparse(str(row["url"])).path
        prefixes = ("/security/storage/", "/storage/")
        prefix = next((value for value in prefixes if path.startswith(value)), None)
        if not prefix:
            # Remote objects need an independently authorized local mirror;
            # this rehearsal never calls an external storage provider.
            raise RehearsalError("preflight", "attachment_not_in_local_storage_copy")
        key = urllib.parse.unquote(path[len(prefix):])
        candidate = (storage_root / key).resolve(strict=True)
        candidate.relative_to(storage_root.resolve())
        if not candidate.is_file():
            raise RehearsalError("preflight", "attachment_file_missing")
        expected = access.get("attachment_sha256")
        if not isinstance(expected, str) or len(expected) != 64 or _sha256_file(candidate) != expected:
            raise RehearsalError("preflight", "attachment_source_hash_mismatch")
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("preflight", "attachment_source_validation_failed") from None


def _verify_all_attachment_files(db_path: Path, storage_root: Path) -> tuple[int, int]:
    files: set[Path] = set()
    try:
        with _open_readonly_db(db_path) as conn:
            rows = conn.execute("SELECT url FROM message_attachments WHERE url IS NOT NULL AND trim(url) != ''").fetchall()
        for row in rows:
            path = urllib.parse.urlparse(str(row["url"])).path
            prefix = next((value for value in ("/security/storage/", "/storage/") if path.startswith(value)), None)
            if not prefix:
                raise RehearsalError("preflight", "remote_or_unrecognized_attachment_storage_refused")
            key = urllib.parse.unquote(path[len(prefix):])
            target = (storage_root / key).resolve(strict=True)
            target.relative_to(storage_root.resolve())
            if not target.is_file():
                raise RehearsalError("preflight", "linked_attachment_file_missing")
            files.add(target)
        total = sum(path.stat().st_size for path in files)
        return len(files), total
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("preflight", "attachment_storage_link_validation_failed") from None


def _clean_child_env(db_path: Path, storage_path: Path, file_key: str) -> dict[str, str]:
    keep_names = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR")
    env = {key: os.environ[key] for key in keep_names if os.environ.get(key)}
    env.update({
        "PYTHONPATH": str(BACKEND_ROOT),
        "ENV": "qa",
        "URTRUCK_ENV": "qa",
        "DB_PATH": str(db_path),
        "BETA_MODE": "false",
        "BETA_OTP_CODE": "",
        "REVIEWER_DEMO_EMAIL": "",
        "REVIEWER_DEMO_CODE": "",
        "STORAGE_PROVIDER": "local",
        "STORAGE_LOCAL_ROOT": str(storage_path),
        "STORAGE_LOCAL_PUBLIC_BASE": "/security/storage",
        "FILE_SIGNING_KEY": file_key,
        "SENTRY_DSN": "",
        "TELEGRAM_BOT_TOKEN": "",
        "TG_BOT_TOKEN": "",
        "TG_API_ID": "",
        "TG_API_HASH": "",
        "CGR_FEATURE_ENABLED": "false",
        "CGR_IIN_SALT": "",
        "URTRUCK_ENABLE_SCHEDULER": "0",
        "SCHEDULER_ENABLED": "false",
        "PUSH_PROVIDER_MODE": "native",
        "PUSH_MOCK_WEB": "false",
        "ENABLE_DEMO_CHAT": "false",
        "QA_AGENT_TOKEN": "",
        "QA_CLEANUP_TOKEN": "",
    })
    # The backend imports .env with setdefault. Blank every key name from it
    # before explicit safe settings so no provider credential can reappear.
    env_file = BACKEND_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                env.setdefault(line.split("=", 1)[0].strip(), "")
    # Restore the deliberate values that may have been pre-filled as blank.
    env.update({
        "ENV": "qa", "URTRUCK_ENV": "qa", "DB_PATH": str(db_path),
        "STORAGE_PROVIDER": "local", "STORAGE_LOCAL_ROOT": str(storage_path),
        "STORAGE_LOCAL_PUBLIC_BASE": "/security/storage", "FILE_SIGNING_KEY": file_key,
        "BETA_MODE": "false", "URTRUCK_ENABLE_SCHEDULER": "0",
        "CGR_FEATURE_ENABLED": "false", "CGR_IIN_SALT": "", "SENTRY_DSN": "",
    })
    return env


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _http_status(url: str, token: str | None = None, timeout: float = 8.0) -> tuple[int, bytes, dict[str, str]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(url, headers=headers, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return exc.code, body, dict(exc.headers)
    except Exception:
        raise RehearsalError("access", "local_api_request_failed") from None


def _download_sha256(url: str, timeout: float = 20.0) -> tuple[int, str, int]:
    request = urllib.request.Request(url, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    digest = hashlib.sha256()
    total = 0
    try:
        with opener.open(request, timeout=timeout) as response:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                total += len(chunk)
            return response.status, digest.hexdigest(), total
    except urllib.error.HTTPError as exc:
        return exc.code, "", 0
    except Exception:
        raise RehearsalError("access", "local_file_download_failed") from None


def _start_backend(db_path: Path, storage_path: Path, file_key: str, logs_path: Path) -> tuple[subprocess.Popen[bytes], str]:
    port = _free_port()
    log_stream = logs_path.open("ab")
    os.chmod(logs_path, 0o600)
    try:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1",
             "--port", str(port), "--log-level", "warning"],
            cwd=BACKEND_ROOT,
            env=_clean_child_env(db_path, storage_path, file_key),
            stdin=subprocess.DEVNULL,
            stdout=log_stream,
            stderr=subprocess.STDOUT,
            close_fds=True,
        )
    finally:
        log_stream.close()
    origin = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RehearsalError("startup", "backend_process_exited")
        try:
            status, _, _ = _http_status(origin + "/health", timeout=1.5)
            if status == 200:
                try:
                    _wait_startup_migrations(db_path)
                except Exception:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                    raise
                return process, origin
        except RehearsalError:
            pass
        time.sleep(0.25)
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    raise RehearsalError("startup", "backend_health_timeout")


def _wait_startup_migrations(db_path: Path) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            with _open_readonly_db(db_path) as conn:
                table = conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='push_delivery_log'"
                ).fetchone()
                if table:
                    indexes = {
                        row["name"] for row in conn.execute("PRAGMA index_list(push_delivery_log)").fetchall()
                    }
                    if "idx_push_delivery_receipt_pending" in indexes:
                        return
        except Exception:
            pass
        time.sleep(0.25)
    raise RehearsalError("startup", "deferred_schema_migration_timeout")


def _stop_backend(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if process.returncode != 0:
        raise RehearsalError("shutdown", "backend_did_not_stop_cleanly")


def _check_access(origin: str, access: dict[str, Any]) -> dict[str, Any]:
    conversation = urllib.parse.quote(access["conversation_id"], safe="")
    endpoint = f"{origin}/api/v1/chat/conversations/{conversation}/attachments"
    results: dict[str, Any] = {
        "participant_statuses": [], "outsider_status": None,
        "participant_file_sha_matches": [], "downloaded_bytes": 0,
    }
    attachment_id = access["attachment_id"]
    download_urls: list[str] = []
    for key in ("participant_a_bearer", "participant_b_bearer"):
        status, body, _ = _http_status(endpoint, access[key])
        results["participant_statuses"].append(status)
        if status == 401:
            raise RehearsalError("access", "participant_session_invalid_or_expired")
        if status != 200:
            raise RehearsalError("access", "authorized_participant_denied")
        try:
            items = json.loads(body).get("attachments", [])
        except Exception:
            raise RehearsalError("access", "attachment_list_invalid") from None
        match = next((item for item in items if str(item.get("id")) == attachment_id), None)
        if not match:
            raise RehearsalError("access", "fixture_attachment_missing_from_api")
        candidate = match.get("download_url") or match.get("url")
        if isinstance(candidate, str) and candidate:
            download_urls.append(urllib.parse.urljoin(origin, candidate))
    status, _, _ = _http_status(endpoint, access["outsider_bearer"])
    results["outsider_status"] = status
    if status == 401:
        raise RehearsalError("access", "outsider_session_invalid_or_expired")
    if status != 403:
        raise RehearsalError("access", "outsider_not_denied")
    if len(download_urls) != 2:
        raise RehearsalError("access", "fixture_file_url_missing")
    parsed_origin = urllib.parse.urlparse(origin)
    expected = access.get("attachment_sha256")
    if not isinstance(expected, str) or len(expected) != 64:
        raise RehearsalError("preflight", "attachment_hash_missing")
    for download_url in download_urls:
        parsed_download = urllib.parse.urlparse(download_url)
        if (parsed_download.scheme != "http" or parsed_download.hostname != "127.0.0.1"
                or parsed_download.port != parsed_origin.port):
            raise RehearsalError("access", "nonlocal_file_url_refused")
        file_status, downloaded_hash, downloaded_bytes = _download_sha256(download_url, timeout=20)
        if file_status != 200:
            raise RehearsalError("access", "authorized_file_download_failed")
        results["downloaded_bytes"] += downloaded_bytes
        matches = downloaded_hash == expected
        results["participant_file_sha_matches"].append(matches)
        if not matches:
            raise RehearsalError("access", "downloaded_file_hash_mismatch")
    return results


def _resolve_session_identities(db_path: Path, access: dict[str, Any]) -> tuple[list[str], str]:
    ids: list[str] = []
    roles: list[str] = []
    try:
        with _open_readonly_db(db_path) as conn:
            for key in ("participant_a_bearer", "participant_b_bearer", "outsider_bearer"):
                row = conn.execute(
                    "SELECT d.id, d.role FROM reg_sessions s "
                    "JOIN drivers_registration d ON d.id=s.driver_id "
                    "WHERE s.token=? AND s.expires_at >= ?",
                    (access[key], time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())),
                ).fetchone()
                if not row:
                    raise RehearsalError("access", "qa_session_invalid_or_expired")
                ids.append(str(row["id"]))
                roles.append(str(row["role"] or ""))
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("access", "qa_session_lookup_failed") from None
    if len(set(ids)) != 3:
        raise RehearsalError("access", "qa_session_identities_not_distinct")
    if set(roles[:2]) != {"client", "driver"}:
        raise RehearsalError("access", "participants_not_driver_and_client")
    return ids[:2], ids[2]


def _verify_fixture_relations(db_path: Path, access: dict[str, Any], participant_ids: list[str], outsider_id: str) -> None:
    if len(set(participant_ids)) != 2 or outsider_id in participant_ids:
        raise RehearsalError("access", "qa_session_identities_not_distinct")
    try:
        with _open_readonly_db(db_path) as conn:
            room = conn.execute(
                "SELECT participant_1, participant_2 FROM chat_rooms WHERE id = ?",
                (access["conversation_id"],),
            ).fetchone()
            if not room or set((room["participant_1"], room["participant_2"])) != set(participant_ids):
                raise RehearsalError("access", "qa_sessions_do_not_match_room_owners")
            deal_columns = {row["name"] for row in conn.execute("PRAGMA table_info(deals)").fetchall()}
            if "chat_room_id" not in deal_columns:
                raise RehearsalError("access", "deal_room_relation_column_missing")
            deal = conn.execute(
                "SELECT driver_id, shipper_id FROM deals WHERE chat_room_id = ? LIMIT 1",
                (access["conversation_id"],),
            ).fetchone()
            if not deal or {deal["driver_id"], deal["shipper_id"]} != set(participant_ids):
                raise RehearsalError("access", "qa_sessions_do_not_match_deal_owners")
            attachment = conn.execute(
                "SELECT message_id, conversation_id, uploader_id FROM message_attachments WHERE id = ?",
                (access["attachment_id"],),
            ).fetchone()
            if (not attachment or attachment["conversation_id"] != access["conversation_id"]
                    or attachment["uploader_id"] not in participant_ids or not attachment["message_id"]):
                raise RehearsalError("access", "attachment_owner_or_room_link_invalid")
            message = conn.execute(
                "SELECT room_id, sender_id FROM chat_messages WHERE id = ?",
                (attachment["message_id"],),
            ).fetchone()
            if (not message or message["room_id"] != access["conversation_id"]
                    or message["sender_id"] != attachment["uploader_id"]):
                raise RehearsalError("access", "attachment_message_link_invalid")
    except RehearsalError:
        raise
    except Exception:
        raise RehearsalError("access", "fixture_relation_validation_failed") from None


def _run(args: argparse.Namespace) -> dict[str, Any]:
    try:
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
        tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
        dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=REPO_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        raise RehearsalError("preflight", "source_git_identity_unavailable") from None
    if dirty:
        raise RehearsalError("preflight", "source_worktree_dirty")
    db_source, storage_source, protected_root, auth, access = _validate_inputs(args)
    file_key_path = args.file_signing_key_file.expanduser().resolve(strict=True)
    if REPO_ROOT == file_key_path or REPO_ROOT in file_key_path.parents:
        raise RehearsalError("preflight", "file_signing_key_inside_repository_refused")
    file_key_info = file_key_path.stat()
    if file_key_info.st_uid != os.getuid() or stat.S_IMODE(file_key_info.st_mode) & 0o077:
        raise RehearsalError("preflight", "file_signing_key_permissions_not_private")
    file_key = file_key_path.read_text(encoding="utf-8").strip()
    if len(file_key.encode("utf-8")) < 32:
        raise RehearsalError("preflight", "qa_file_signing_key_invalid")

    source_db_hash = _sha256_file(db_source)
    source_storage_hash, source_file_count, source_bytes = _storage_manifest(storage_source)
    with _open_readonly_db(db_source) as source:
        before = _table_snapshot(source)
    linked_files, linked_file_bytes = _verify_all_attachment_files(db_source, storage_source)
    _verify_attachment_in_source(db_source, storage_source, access)
    run_root = protected_root / ("upgrade-rehearsal-" + uuid.uuid4().hex)
    run_root.mkdir(mode=0o700)
    db_copy = run_root / "database.sqlite"
    storage_copy = run_root / "storage"
    _copy_consistent_database(db_source, db_copy)
    _copy_storage(storage_source, storage_copy)
    if _sha256_file(db_source) != source_db_hash:
        raise RehearsalError("copy", "source_database_changed_during_copy")
    current_storage_hash, _, _ = _storage_manifest(storage_source)
    if current_storage_hash != source_storage_hash:
        raise RehearsalError("copy", "source_storage_changed_during_copy")
    copied_storage_hash, copied_files, copied_bytes = _storage_manifest(storage_copy)
    if copied_storage_hash != source_storage_hash:
        raise RehearsalError("copy", "storage_copy_hash_mismatch")
    with _open_readonly_db(db_copy) as copy_db:
        copied_before = _table_snapshot(copy_db)
    if not _all_rows_equal(before, copied_before):
        raise RehearsalError("copy", "database_copy_mismatch")

    startup_reports = []
    logs_path = run_root / "backend-startup.log"
    first_process, origin = _start_backend(db_copy, storage_copy, file_key, logs_path)
    _stop_backend(first_process)
    _lock_down_tree(run_root)
    with _open_readonly_db(db_copy) as conn:
        after_first = _table_snapshot(conn)
    first_compare = _compatible_snapshot(db_source, db_copy)
    if not first_compare["preserved"]:
        raise RehearsalError("first_start", "baseline_rows_changed_or_lost")
    startup_reports.append(first_compare)

    second_process, origin = _start_backend(db_copy, storage_copy, file_key, logs_path)
    try:
        with _open_readonly_db(db_copy) as conn:
            before_probe = _table_snapshot(conn)
        second_compare = _compatible_snapshot(db_source, db_copy)
        if not second_compare["preserved"]:
            raise RehearsalError("repeat_start", "baseline_rows_changed_or_lost")
        if not _all_rows_equal(after_first, before_probe):
            raise RehearsalError("repeat_start", "startup_not_idempotent")
        startup_reports.append(second_compare)
        participant_ids, outsider_id = _resolve_session_identities(db_copy, access)
        _verify_fixture_relations(db_copy, access, participant_ids, outsider_id)
        final = before_probe
        access_report = _check_access(origin, access)
    finally:
        _stop_backend(second_process)
        _lock_down_tree(run_root)

    final_compare = _compatible_snapshot(db_source, db_copy)
    if not final_compare["preserved"]:
        raise RehearsalError("final_compare", "baseline_rows_changed_or_lost")
    final_storage_hash, final_files, final_bytes = _storage_manifest(storage_copy)
    if final_storage_hash != source_storage_hash:
        raise RehearsalError("final_compare", "storage_files_changed")
    if _sha256_file(db_source) != source_db_hash or _storage_manifest(storage_source)[0] != source_storage_hash:
        raise RehearsalError("final_compare", "source_material_changed_during_rehearsal")
    baseline_hash = hashlib.sha256(json.dumps({
        table: {"rows": data["rows"], "fingerprint": data["fingerprint"]}
        for table, data in sorted(before.items())
    }, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return {
        "status": "PASS",
        "backend_source_sha": head,
        "backend_source_tree": tree,
        "run_id": run_root.name,
        "database_source_sha256": source_db_hash,
        "database_rows_fingerprint_sha256": baseline_hash,
        "storage_manifest_sha256": source_storage_hash,
        "business_table_row_counts": {table: before[table]["rows"] for table in REQUIRED_TABLES},
        "storage_file_count": source_file_count,
        "storage_total_bytes": source_bytes,
        "linked_attachment_file_count": linked_files,
        "linked_attachment_total_bytes": linked_file_bytes,
        "copy_verified": True,
        "normal_backend_startups": 2,
        "scheduler_and_external_credentials": "disabled",
        "upgrade_rows_preserved": final_compare["preserved"],
        "new_rows_from_startup": startup_reports[-1]["added_rows"],
        "repeat_start_idempotent": True,
        "storage_files_unchanged": True,
        "participant_http_statuses": access_report["participant_statuses"],
        "outsider_http_status": access_report["outsider_status"],
        "participant_attachment_download_hash_matches": access_report["participant_file_sha_matches"],
        "attachment_downloaded_bytes": access_report["downloaded_bytes"],
        "lab_artifact_retained": True,
        "copy_storage_file_count": copied_files,
        "copy_storage_total_bytes": copied_bytes,
        "final_storage_file_count": final_files,
        "final_storage_total_bytes": final_bytes,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, required=True, help="Путь к уже разрешённой защищённой копии SQLite")
    parser.add_argument("--source-storage", type=Path, required=True, help="Соответствующая private storage-копия")
    parser.add_argument("--protected-root", type=Path, required=True, help="Существующий ACL 0700 каталог на защищённом диске")
    parser.add_argument("--authorization", type=Path, required=True, help="JSON 0600 с attestation и ожидаемыми SHA-256 источника")
    parser.add_argument("--access-probes", type=Path, required=True, help="JSON 0600 с тремя QA bearer-сессиями и fixture IDs")
    parser.add_argument("--file-signing-key-file", type=Path, required=True, help="Файл 0600 с QA FILE_SIGNING_KEY (не production)")
    parser.add_argument("--report", type=Path, help="Необязательный файл агрегированного отчёта вне репозитория")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.report:
        report_path = args.report.expanduser().resolve()
        try:
            protected_root = args.protected_root.expanduser().resolve(strict=True)
        except Exception:
            protected_root = None
        if (REPO_ROOT == report_path or REPO_ROOT in report_path.parents
                or protected_root is None or report_path.parent != protected_root):
            print(json.dumps({"status": "BLOCKED", "stage": "preflight", "reason": "report_must_be_in_protected_root"}, sort_keys=True))
            return 2
        if report_path.is_symlink():
            print(json.dumps({"status": "BLOCKED", "stage": "preflight", "reason": "report_symlink_refused"}, sort_keys=True))
            return 2
    try:
        report = _run(args)
    except RehearsalError as exc:
        # Emit only a stable stage/code pair. Never echo paths, SQL values,
        # HTTP bodies, bearer tokens, provider output, or subprocess logs.
        print(json.dumps({"status": "BLOCKED", "stage": exc.stage, "reason": exc.code}, sort_keys=True))
        return 2
    except Exception:
        print(json.dumps({"status": "BLOCKED", "stage": "internal", "reason": "unexpected_error_redacted"}, sort_keys=True))
        return 3
    rendered = json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2)
    print(rendered)
    if args.report:
        report_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(report_path, flags, 0o600)
        os.chmod(report_path, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(rendered + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
