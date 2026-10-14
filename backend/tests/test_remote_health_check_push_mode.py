import json
import hashlib
import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
HEALTH_CHECK = REPO_ROOT / "scripts" / "remote_health_check.sh"
PROCESS_NAMES = ("urtruck-security-api", "urtruck-security-scheduler")


def _run_health_helper(
    tmp_path: Path, *, fail_scheduler_restart: bool = False,
    fail_stable_health: bool = False, fail_api_rollback: bool = False,
    fail_pm2_save: bool = False,
    legacy_call: bool = False,
    fail_listener_once: bool = False,
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
    fail_pm2_save_path = tmp_path / "fail-pm2-save"
    if fail_pm2_save:
        fail_pm2_save_path.write_text("fail", encoding="utf-8")
    fail_listener_path = tmp_path / "fail-listener-once"
    if fail_listener_once:
        fail_listener_path.write_text("fail", encoding="utf-8")

    home = tmp_path / "home"
    pm2_home = home / ".pm2"
    backup = home / "urtruck" / "backups" / "push-mode-sync-999"
    pm2_home.mkdir(parents=True)
    backup.mkdir(parents=True)
    saved_rows = [
        {"name": name, "pm_cwd": str(backend), "pm_exec_path": f"/opt/{name}.py",
         "exec_mode": "fork_mode", "args": [], "env": {"PUSH_PROVIDER_MODE": "native", "OTHER": "same"}}
        for name in PROCESS_NAMES
    ] + [{"name": "other-service", "pm_cwd": "/opt/other", "pm_exec_path": "/opt/other/app.py",
          "exec_mode": "fork_mode", "args": [], "env": {"SECRET": "must-not-be-printed"}}]
    dump = pm2_home / "dump.pm2"
    dump.write_text(json.dumps(saved_rows), encoding="utf-8")
    before_dump = backup / "pm2.dump.before.json"
    before_dump.write_bytes(dump.read_bytes())
    database_snapshot = backup / "security.db.before.sqlite"
    database_snapshot.write_bytes(b"fixture database snapshot")
    record = {"workflow_run_id": "999", "configured_mode": "dual",
              "pm2_dump_sha256": hashlib.sha256(before_dump.read_bytes()).hexdigest(),
              "database_quick_check": "ok",
              "database_snapshot_sha256": hashlib.sha256(database_snapshot.read_bytes()).hexdigest()}
    (backup / "record.json").write_text(json.dumps(record), encoding="utf-8")
    backup.chmod(0o700)
    before_dump.chmod(0o600)
    database_snapshot.chmod(0o600)
    (backup / "record.json").chmod(0o600)
    backup_helper = REPO_ROOT / "scripts" / "ops" / "production_push_mode_backup.py"

    pm2 = bin_dir / "pm2"
    pm2.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
state_path = pathlib.Path(os.environ["PM2_TEST_STATE"])
state = json.loads(state_path.read_text())
if sys.argv[1] == "jlist":
    root = os.environ["PM2_TEST_CWD"]
    print(json.dumps([{"name": name, "pid": 1001 if name.endswith("api") else 1002, "pm2_env": {
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
elif sys.argv[1] == "save":
    if pathlib.Path(os.environ["PM2_TEST_FAIL_SAVE"]).exists():
        raise SystemExit(19)
    dump = pathlib.Path(os.environ["PM2_TEST_DUMP"])
    rows = json.loads(dump.read_text())
    for row in rows:
        if row["name"] in state:
            row["env"]["PUSH_PROVIDER_MODE"] = state[row["name"]]["mode"]
    dump.write_text(json.dumps(rows))
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
    ss = bin_dir / "ss"
    ss.write_text('''#!/bin/sh
if [ -f "$PM2_TEST_FAIL_LISTENER" ]; then
  rm -f "$PM2_TEST_FAIL_LISTENER"
  printf '%s\\n' 'LISTEN 0 2048 0.0.0.0:8001 0.0.0.0:* users:(("other",pid=9999,fd=14))'
else
  printf '%s\\n' 'LISTEN 0 2048 0.0.0.0:8001 0.0.0.0:* users:(("python",pid=1001,fd=14))'
fi
''', encoding="utf-8")
    ss.chmod(0o755)
    for executable in ("sleep",):
        path = bin_dir / executable
        path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        path.chmod(0o755)
    pm2.chmod(0o755)

    env = os.environ.copy()
    env.update({
        "PATH": f"{bin_dir}:{env.get('PATH', '')}",
        "HOME": str(home),
        "PM2_TEST_STATE": str(state),
        "PM2_TEST_CWD": str(backend),
        "PM2_TEST_FAIL_ONCE": str(fail_once),
        "PM2_TEST_FAIL_API_ONCE": str(fail_api_once),
        "CURL_TEST_COUNT": str(tmp_path / "curl-count"),
        "CURL_TEST_FAIL_ONCE": str(fail_health_once),
        "PM2_TEST_DUMP": str(dump),
        "PM2_TEST_FAIL_SAVE": str(fail_pm2_save_path),
        "PM2_TEST_FAIL_LISTENER": str(fail_listener_path),
    })
    env["PYTHONPATH"] = str(REPO_ROOT)
    args = [PROCESS_NAMES[0]] if legacy_call else [*PROCESS_NAMES, "999", str(backup_helper)]
    result = subprocess.run(
        ["bash", str(HEALTH_CHECK), *args], cwd=REPO_ROOT, env=env,
        capture_output=True, text=True, timeout=30,
    )
    return result, json.loads(state.read_text(encoding="utf-8"))


def test_remote_health_helper_switches_both_named_processes_without_logging_env(tmp_path):
    result, state = _run_health_helper(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert all(row == {"mode": "dual", "status": "online"} for row in state.values())
    assert "PUSH_MODE_READBACK=dual" in result.stdout
    assert "PUSH_MODE_PERSISTED=dual" in result.stdout
    restored = json.loads((tmp_path / "home" / ".pm2" / "dump.pm2").read_text())
    assert all(row["env"]["PUSH_PROVIDER_MODE"] == "dual" for row in restored[:2])
    assert restored[2]["env"]["SECRET"] == "must-not-be-printed"
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


def test_remote_health_helper_restores_persisted_dump_when_pm2_save_fails(tmp_path):
    result, state = _run_health_helper(tmp_path, fail_pm2_save=True)

    assert result.returncode != 0
    assert all(row == {"mode": "native", "status": "online"} for row in state.values())
    assert "PUSH_MODE_ROLLBACK=verified" in result.stdout
    assert "must-not-be-printed" not in result.stdout + result.stderr


def test_remote_health_helper_preserves_legacy_single_argument_callers(tmp_path):
    result, state = _run_health_helper(tmp_path, legacy_call=True)

    assert result.returncode == 0, result.stdout + result.stderr
    assert all(row == {"mode": "dual", "status": "online"} for row in state.values())
    saved = json.loads((tmp_path / "home" / ".pm2" / "dump.pm2").read_text())
    assert all(row["env"]["PUSH_PROVIDER_MODE"] == "native" for row in saved[:2])
    assert "PUSH_MODE_PERSISTED" not in result.stdout


def test_remote_health_helper_rolls_back_on_foreign_listener(tmp_path):
    result, state = _run_health_helper(tmp_path, fail_listener_once=True)

    assert result.returncode != 0
    assert all(row == {"mode": "native", "status": "online"} for row in state.values())
    assert "Target API listener identity failed" in result.stderr
    assert "PUSH_MODE_ROLLBACK=verified" in result.stdout
