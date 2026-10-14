#!/usr/bin/env python3
"""Read-only preflight for the narrow production native->dual PM2 mode sync."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


API_PROCESS = "urtruck-security-api"
SCHEDULER_PROCESS = "urtruck-security-scheduler"
EXPECTED_ENV_MODE = "dual"
EXPECTED_PROCESS_MODE = "native"
EXPECTED_SOURCE_SHA256 = {
    # These are the live push files measured during the read-only production
    # inventory. Any code drift stops the operational restart.
    "services/push_gateway.py": "cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56",
    "services/push_sender.py": "9ed81b63c1b288f439c716ec6519eb2899dc653b9178ffff0eae1c3175bc5030",
}


def _read_configured_mode(root: Path) -> str:
    env_path = root / ".env"
    if root.is_symlink() or not root.is_dir() or env_path.is_symlink() or not env_path.is_file():
        raise ValueError("backend root or environment file is missing or unsafe")
    values = []
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("PUSH_PROVIDER_MODE="):
            values.append(line.split("=", 1)[1].strip())
    if values != [EXPECTED_ENV_MODE]:
        raise ValueError("configured push mode is not the reviewed dual setting")
    return values[0]


def _processes(pm2_json: str, root: Path) -> dict[str, dict[str, Any]]:
    try:
        rows = json.loads(pm2_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("PM2 process inventory is unreadable") from exc
    selected: dict[str, dict[str, Any]] = {}
    for name in (API_PROCESS, SCHEDULER_PROCESS):
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            raise ValueError("named production PM2 process is missing or ambiguous")
        row = matches[0]
        env = row.get("pm2_env") or {}
        if env.get("status") != "online" or env.get("PUSH_PROVIDER_MODE") != EXPECTED_PROCESS_MODE:
            raise ValueError("named production process is not online in the expected source mode")
        if Path(str(env.get("pm_cwd") or "")).resolve() != root.resolve():
            raise ValueError("named production process cwd does not match backend root")
        try:
            pid = int(row.get("pid") or 0)
        except (TypeError, ValueError) as exc:
            raise ValueError("named production process PID is invalid") from exc
        if pid <= 0:
            raise ValueError("named production process PID is invalid")
        selected[name] = {"pid": pid, "cwd": str(root.resolve()), "mode": EXPECTED_PROCESS_MODE}
    return selected


def _source_hashes(root: Path, expected_hashes: dict[str, str]) -> dict[str, str]:
    result = {}
    for relative in expected_hashes:
        path = root / relative
        if (path.parent.is_symlink() or path.is_symlink() or not path.is_file()
                or not path.resolve().is_relative_to(root.resolve())):
            raise ValueError("reviewed production push source is missing or unsafe")
        result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    if result != expected_hashes:
        raise ValueError("production push source differs from the reviewed compatibility baseline")
    return result


def _listener_pids(ss_output: str) -> list[int]:
    lines = [line for line in ss_output.splitlines() if line.strip()]
    if len(lines) != 1 or not re.search(r"(?:127\.0\.0\.1|0\.0\.0\.0|\*):8001\s", lines[0]):
        raise ValueError("production API listener on port 8001 is missing or ambiguous")
    pids = [int(value) for value in re.findall(r"pid=(\d+)", lines[0])]
    if len(pids) != 1:
        raise ValueError("production API listener PID is missing or ambiguous")
    return pids


def validate_preflight(
    root: Path,
    pm2_json: str,
    ss_output: str,
    expected_source_hashes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Validate only the scoped no-source/no-data mode transition."""
    if root.is_symlink() or not root.is_dir():
        raise ValueError("backend root is missing or unsafe")
    root = root.resolve(strict=True)
    _read_configured_mode(root)
    processes = _processes(pm2_json, root)
    hashes = _source_hashes(root, expected_source_hashes or EXPECTED_SOURCE_SHA256)
    listener_pids = _listener_pids(ss_output)
    if listener_pids != [processes[API_PROCESS]["pid"]]:
        raise ValueError("port 8001 is not owned by the named API process")
    return {
        "configured_mode": EXPECTED_ENV_MODE,
        "current_process_mode": EXPECTED_PROCESS_MODE,
        "processes": processes,
        "source_sha256": hashes,
        "listener_pid": listener_pids[0],
    }


def _pm2_binary() -> str:
    found = shutil.which("pm2")
    if found:
        return found
    candidates = list(Path.home().glob(".nvm/versions/node/*/bin/pm2")) + [
        Path.home() / ".local/bin/pm2",
        Path("/usr/local/bin/pm2"),
        Path("/usr/bin/pm2"),
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    raise ValueError("PM2 executable is unavailable")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--api", default=API_PROCESS)
    parser.add_argument("--scheduler", default=SCHEDULER_PROCESS)
    args = parser.parse_args()
    if args.api != API_PROCESS or args.scheduler != SCHEDULER_PROCESS:
        raise SystemExit("only the named production API and scheduler are permitted")
    try:
        pm2 = _pm2_binary()
        pm2_json = subprocess.run([pm2, "jlist"], check=True, capture_output=True, text=True).stdout
        ss_output = subprocess.run(
            ["ss", "-H", "-ltnp", "sport = :8001"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        result = validate_preflight(Path(args.root), pm2_json, ss_output)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        # Deliberately avoid printing PM2 JSON, .env values, or command output.
        print(f"PUSH_MODE_PREFLIGHT=blocked reason={exc}")
        return 1
    print("PUSH_MODE_PREFLIGHT=pass")
    print(f"PUSH_MODE_SOURCE=backend_env_dual")
    print(f"PUSH_MODE_RUNTIME_FILES={len(result['source_sha256'])}")
    print(f"PUSH_MODE_LISTENER_PID={result['listener_pid']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
