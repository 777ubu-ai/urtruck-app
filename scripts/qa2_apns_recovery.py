#!/usr/bin/env python3
"""Atomic QA2 APNs environment apply/rollback helper.

This is deliberately operational code, not application startup code.  It
keeps the known-good environment and recovery state until either the new
configuration or a rollback has passed both systemd restart and health check.
No credential values are printed.
"""
from __future__ import annotations

import argparse
import base64
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable
from urllib.request import urlopen


REQUIRED = {
    "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_AUTH_KEY_P8_BASE64",
    "APNS_BUNDLE_ID", "APNS_USE_SANDBOX",
}


def _atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(content, encoding="utf-8")
    temp.chmod(mode)
    temp.replace(path)


def _read_state(state_path: Path, env_path: Path) -> dict[str, str]:
    values = {}
    for line in state_path.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    backup = values.get("BACKUP", "")
    backup_path = Path(backup)
    expected_prefix = env_path.name + ".apns-backup."
    if backup_path.parent != env_path.parent or not backup_path.name.startswith(expected_prefix):
        raise RuntimeError("QA2_APNS_BACKUP_PATH_INVALID")
    return values


def _write_state(state_path: Path, backup: Path, phase: str) -> None:
    _atomic_write(state_path, f"BACKUP={backup}\nPHASE={phase}\n")


def parse_payload(payload_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in payload_path.read_text(encoding="utf-8").splitlines():
        if "=" not in line:
            raise RuntimeError("QA2_APNS_PAYLOAD_MALFORMED")
        name, value = line.split("=", 1)
        if name in values or name not in REQUIRED:
            raise RuntimeError("QA2_APNS_PAYLOAD_KEYS_INVALID")
        values[name] = value
    if set(values) != REQUIRED or values["APNS_USE_SANDBOX"] != "false":
        raise RuntimeError("QA2_APNS_PAYLOAD_CONTRACT_INVALID")
    if values["APNS_BUNDLE_ID"] != "com.urtruck.app":
        raise RuntimeError("QA2_APNS_PAYLOAD_BUNDLE_MISMATCH")
    if not re.fullmatch(r"[A-Z0-9]{10}", values["APNS_KEY_ID"]):
        raise RuntimeError("QA2_APNS_PAYLOAD_KEY_ID_INVALID")
    if not re.fullmatch(r"[A-Z0-9]{10}", values["APNS_TEAM_ID"]):
        raise RuntimeError("QA2_APNS_PAYLOAD_TEAM_ID_INVALID")
    try:
        base64.b64decode(values["APNS_AUTH_KEY_P8_BASE64"], validate=True)
    except Exception as exc:
        raise RuntimeError("QA2_APNS_PAYLOAD_BASE64_INVALID") from exc
    return values


def apply_environment(env_path: Path, payload_path: Path, state_path: Path, backup_path: Path) -> None:
    """Back up and atomically write APNs fields; leave recovery material intact."""
    values = parse_payload(payload_path)
    if state_path.exists():
        raise RuntimeError("QA2_APNS_RECOVERY_STATE_EXISTS")
    shutil.copy2(env_path, backup_path)
    backup_path.chmod(0o600)
    _write_state(state_path, backup_path, "BACKUP_CREATED")
    remove = REQUIRED | {"APNS_AUTH_KEY_P8"}
    kept = [
        line for line in env_path.read_text(encoding="utf-8").splitlines()
        if "=" not in line or line.split("=", 1)[0].strip() not in remove
    ]
    kept.extend(f"{name}={values[name]}" for name in sorted(REQUIRED))
    _atomic_write(env_path, "\n".join(kept) + "\n")
    _write_state(state_path, backup_path, "APPLIED_PENDING_HEALTH")


def restart_and_health(service: str, health_url: str, attempts: int = 30) -> None:
    subprocess.run(["sudo", "-n", "systemctl", "restart", service], check=True)
    for _ in range(attempts):
        active = subprocess.run(
            ["systemctl", "is-active", "--quiet", service], check=False
        ).returncode == 0
        if active:
            try:
                with urlopen(health_url, timeout=5) as response:
                    if 200 <= response.status < 300:
                        return
            except Exception:
                pass
        time.sleep(2)
    raise RuntimeError("QA2_APNS_SERVICE_OR_HEALTH_FAILED")


def apply_and_confirm(
    env_path: Path, payload_path: Path, state_path: Path, backup_path: Path,
    restart: Callable[[], None],
) -> None:
    apply_environment(env_path, payload_path, state_path, backup_path)
    restart()
    _write_state(state_path, backup_path, "PRIMARY_HEALTHY")


def rollback_and_confirm(
    env_path: Path, state_path: Path, restart: Callable[[], None],
) -> None:
    state = _read_state(state_path, env_path)
    backup_path = Path(state["BACKUP"])
    shutil.copy2(backup_path, env_path)
    env_path.chmod(0o600)
    _write_state(state_path, backup_path, "ROLLBACK_PENDING_HEALTH")
    restart()
    _write_state(state_path, backup_path, "ROLLBACK_HEALTHY")
    backup_path.unlink()
    state_path.unlink()


def cleanup_after_primary_success(env_path: Path, state_path: Path) -> None:
    state = _read_state(state_path, env_path)
    if state.get("PHASE") != "PRIMARY_HEALTHY":
        raise RuntimeError("QA2_APNS_PRIMARY_HEALTH_NOT_CONFIRMED")
    Path(state["BACKUP"]).unlink()
    state_path.unlink()


def _backup_path(env_path: Path) -> Path:
    return env_path.with_name(f"{env_path.name}.apns-backup.{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("apply", "rollback", "cleanup-primary"))
    parser.add_argument("--env", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--payload", type=Path)
    parser.add_argument("--service", default="urtruck-qa2.service")
    parser.add_argument("--health-url", default="http://127.0.0.1:8002/health")
    args = parser.parse_args()
    restart = lambda: restart_and_health(args.service, args.health_url)
    if args.action == "apply":
        if args.payload is None:
            raise SystemExit("QA2_APNS_PAYLOAD_REQUIRED")
        apply_and_confirm(args.env, args.payload, args.state, _backup_path(args.env), restart)
    elif args.action == "rollback":
        rollback_and_confirm(args.env, args.state, restart)
    else:
        cleanup_after_primary_success(args.env, args.state)
    print(f"QA2_APNS_RECOVERY_ACTION={args.action}:confirmed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
