#!/usr/bin/env bash
# Controlled restart + fail-closed health + PM2 online proof + crash-loop check.
# Секреты НЕ печатаются. Аргумент: $1 = имя процесса (default urtruck-security-api).
set -euo pipefail
PROC="${1:-urtruck-security-api}"
SCHEDULER_PROC="${2:-urtruck-security-scheduler}"
URL="http://127.0.0.1:8001/api/v1/system/info"

# Non-interactive SSH does not load the user's shell profile, so globally
# installed npm binaries (including PM2) may be absent from PATH. Resolve the
# executable explicitly and fail before mutating the process if it is missing.
resolve_pm2() {
  local candidate
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return 0
  fi

  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/pm2 \
    "$HOME"/.local/bin/pm2 \
    "$HOME"/.local/share/pnpm/pm2 \
    /usr/local/bin/pm2 \
    /usr/bin/pm2
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "::error::PM2 executable not found for production user" >&2
  return 1
}

PM2_BIN="$(resolve_pm2)"
echo "PM2_RUNTIME=resolved"

# Resolve the one non-secret push mode from the backend .env in the exact
# shared cwd used by both named production PM2 processes. main.py intentionally
# uses setdefault, so an old PM2 environment would otherwise override .env.
runtime_json="$("$PM2_BIN" jlist)"
PUSH_MODE="$(python3 -c '
import json, pathlib, sys
items = json.load(sys.stdin)
names = sys.argv[1:3]
selected = {}
for name in names:
    matches = [p for p in items if p.get("name") == name]
    if len(matches) != 1:
        raise SystemExit("Named production PM2 process missing or ambiguous")
    selected[name] = matches[0].get("pm2_env", {})
roots = {entry.get("pm_cwd") for entry in selected.values()}
if len(roots) != 1 or not next(iter(roots)):
    raise SystemExit("API and scheduler PM2 roots differ")
env_file = pathlib.Path(next(iter(roots))) / ".env"
if env_file.is_symlink() or not env_file.is_file():
    raise SystemExit("Backend environment file missing or unsafe")
values = []
for raw in env_file.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if line.startswith("PUSH_PROVIDER_MODE="):
        values.append(line.split("=", 1)[1].strip())
if len(values) != 1 or values[0] not in {"native", "dual"}:
    raise SystemExit("PUSH_PROVIDER_MODE must occur once and be native or dual")
print(values[0])
' "$PROC" "$SCHEDULER_PROC" <<<"$runtime_json")"
unset runtime_json
echo "PUSH_MODE_SOURCE=backend_env_file"
for process in "$PROC" "$SCHEDULER_PROC"; do
  PUSH_PROVIDER_MODE="$PUSH_MODE" "$PM2_BIN" restart "$process" --update-env
done

# Backend imports (face_recognition/dlib/opencv and DB init) can take well over
# 4 seconds on the current production host. PM2 may already report "online"
# while uvicorn has not bound :8001 yet. Retry the real HTTP health endpoint
# instead of producing a false deployment failure during normal warm-up.
# Fail closed after ~2 minutes: a real crash / bind failure still blocks release.
wait_for_health() {
  local attempt
  for attempt in $(seq 1 24); do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 10 -o /dev/null "$URL"; then
      echo "HEALTH_HTTP=ready attempt=$attempt"
      return 0
    fi
    echo "HEALTH_HTTP=warming attempt=$attempt/24"
    sleep 5
  done
  echo "::error::Backend did not become healthy at $URL within warm-up window" >&2
  return 1
}

wait_for_health

# PM2 online proof after the server is actually listening — fail-closed.
runtime_json="$("$PM2_BIN" jlist)"
python3 -c '
import json, sys
items = json.load(sys.stdin)
expected_mode = sys.argv[1]
for name in sys.argv[2:4]:
    matches = [p for p in items if p.get("name") == name]
    assert len(matches) == 1, "named PM2 process missing or ambiguous"
    env = matches[0].get("pm2_env", {})
    assert env.get("status") == "online", "named PM2 process is not online"
    assert env.get("PUSH_PROVIDER_MODE") == expected_mode, "PM2 push mode readback mismatch"
print("PM2_PROCESSES=online")
print("PUSH_MODE_READBACK=" + expected_mode)
' "$PUSH_MODE" "$PROC" "$SCHEDULER_PROC" <<<"$runtime_json"
unset runtime_json

# A second probe after a delay catches an immediate crash-loop after the first
# successful bind/import cycle.
sleep 6
curl --fail --silent --show-error --connect-timeout 3 --max-time 10 -o /dev/null "$URL"
echo "HEALTH_HTTP=stable"

# Final PM2 state must still be online after the second HTTP proof.
runtime_json="$("$PM2_BIN" jlist)"
python3 -c '
import json, sys
items = json.load(sys.stdin)
for name in sys.argv[1:3]:
    matches = [p for p in items if p.get("name") == name]
    assert len(matches) == 1, "named PM2 process missing or ambiguous"
    assert matches[0].get("pm2_env", {}).get("status") == "online", "PM2 process not stable"
    assert matches[0].get("pm2_env", {}).get("PUSH_PROVIDER_MODE") == sys.argv[3], "push mode changed"
print("PM2_STATUS=stable")
' "$PROC" "$SCHEDULER_PROC" "$PUSH_MODE" <<<"$runtime_json"
unset runtime_json

echo "HEALTH=pass"
