import json
import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
HEALTH_CHECK = REPO_ROOT / "scripts" / "remote_health_check.sh"
PROCESS_NAMES = ("urtruck-security-api", "urtruck-security-scheduler")


def _run_health_helper(
    tmp_path: Path, *, fail_scheduler_restart: bool = False,
    fail_stable_health: bool = False, fail_api_rollback: bool = False,
):
    backend = tmp_path / "backend"
    bin_dir = tmp_path / "bin"
    backend.mkdir()
    bin_dir.mkdir()
    (backend / ".env").write_text(
        "PUSH_PROVIDER_MODE=dual\nPRIVATE_TEST_SECRET=must-not-be-printed\n",
        encoding="utf-8",
    )
    state = tmp_path / "pm2.json"
    state.write_text(json.dumps({
        name: {"mode": "native", "status": "online"} for name in PROCESS_NAMES
    }), encoding="utf-8")
    fail_once = tmp_path / "fail-scheduler-once"
    if fail_scheduler_restart:
        fail_once.write_text("fail", encoding="utf-8")
    fail_api_once = tmp_path / "fail-api-rollback-once"
    if fail_api_rollback:
        fail_api_once.write_text("fail", encoding="utf-8")
    fail_health_once = tmp_path / "fail-health-once"
    if fail_stable_health:
        fail_health_once.write_text("fail", encoding="utf-8")

    pm2 = bin_dir / "pm2"
    pm2.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
state_path = pathlib.Path(os.environ["PM2_TEST_STATE"])
state = json.loads(state_path.read_text())
if sys.argv[1] == "jlist":
    root = os.environ["PM2_TEST_CWD"]
    print(json.dumps([{"name": name, "pm2_env": {
        "pm_cwd": root, "status": row["status"],
        "PUSH_PROVIDER_MODE": row["mode"]
    }} for name, row in state.items()]))
elif sys.argv[1] == "stop":
    state[sys.argv[2]]["status"] = "stopped"
    state_path.write_text(json.dumps(state))
elif sys.argv[1] == "restart":
    name = sys.argv[2]
    assert "--update-env" in sys.argv
    fail_once = pathlib.Path(os.environ["PM2_TEST_FAIL_ONCE"])
    if name.endswith("scheduler") and os.environ["PUSH_PROVIDER_MODE"] == "dual" and fail_once.exists():
        fail_once.unlink()
        raise SystemExit(17)
    fail_api_once = pathlib.Path(os.environ["PM2_TEST_FAIL_API_ONCE"])
    if name.endswith("api") and os.environ["PUSH_PROVIDER_MODE"] == "native" and fail_api_once.exists():
        fail_api_once.unlink()
        raise SystemExit(18)
    state[name]["mode"] = os.environ["PUSH_PROVIDER_MODE"]
    state[name]["status"] = "online"
    state_path.write_text(json.dumps(state))
else:
    raise SystemExit(2)
''', encoding="utf-8")
    curl = bin_dir / "curl"
    curl.write_text('''#!/usr/bin/env python3
import os, pathlib, sys
counter = pathlib.Path(os.environ["CURL_TEST_COUNT"])
count = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(count))
fail_once = pathlib.Path(os.environ["CURL_TEST_FAIL_ONCE"])
if count == 2 and fail_once.exists():
    fail_once.unlink()
    raise SystemExit(22)
raise SystemExit(0)
''', encoding="utf-8")
    curl.chmod(0o755)
    for executable in ("sleep",):
        path = bin_dir / executable
        path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        path.chmod(0o755)
    pm2.chmod(0o755)

    env = os.environ.copy()
    env.update({
        "PATH": f"{bin_dir}:{env.get('PATH', '')}",
        "PM2_TEST_STATE": str(state),
        "PM2_TEST_CWD": str(backend),
        "PM2_TEST_FAIL_ONCE": str(fail_once),
        "PM2_TEST_FAIL_API_ONCE": str(fail_api_once),
        "CURL_TEST_COUNT": str(tmp_path / "curl-count"),
        "CURL_TEST_FAIL_ONCE": str(fail_health_once),
    })
    result = subprocess.run(
        ["bash", str(HEALTH_CHECK)], cwd=REPO_ROOT, env=env,
        capture_output=True, text=True, timeout=30,
    )
    return result, json.loads(state.read_text(encoding="utf-8"))


def test_remote_health_helper_switches_both_named_processes_without_logging_env(tmp_path):
    result, state = _run_health_helper(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert all(row == {"mode": "dual", "status": "online"} for row in state.values())
    assert "PUSH_MODE_READBACK=dual" in result.stdout
    assert "must-not-be-printed" not in result.stdout + result.stderr


def test_remote_health_helper_restores_both_modes_after_scheduler_restart_failure(tmp_path):
    result, state = _run_health_helper(tmp_path, fail_scheduler_restart=True)

    assert result.returncode != 0
    assert all(row == {"mode": "native", "status": "online"} for row in state.values())
    assert "PUSH_MODE_ROLLBACK=verified" in result.stdout
    assert "must-not-be-printed" not in result.stdout + result.stderr


def test_remote_health_helper_restores_modes_after_stable_health_probe_failure(tmp_path):
    result, state = _run_health_helper(tmp_path, fail_stable_health=True)

    assert result.returncode != 0
    assert all(row == {"mode": "native", "status": "online"} for row in state.values())
    assert "PUSH_MODE_ROLLBACK=verified" in result.stdout


def test_remote_health_helper_keeps_scheduler_stopped_when_api_rollback_fails(tmp_path):
    result, state = _run_health_helper(
        tmp_path, fail_scheduler_restart=True, fail_api_rollback=True,
    )

    assert result.returncode != 0
    assert state[PROCESS_NAMES[0]] == {"mode": "dual", "status": "online"}
    assert state[PROCESS_NAMES[1]] == {"mode": "native", "status": "stopped"}
    assert "PUSH_MODE_ROLLBACK_API_FAILED" in result.stderr
    assert "scheduler remains stopped" in result.stderr
    assert "PUSH_MODE_ROLLBACK=verified" not in result.stdout
    assert "must-not-be-printed" not in result.stdout + result.stderr
