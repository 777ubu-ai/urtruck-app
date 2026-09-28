#!/usr/bin/env bash
# Controlled restart + fail-closed health + PM2 online proof + crash-loop check.
# Секреты НЕ печатаются. Аргумент: $1 = имя процесса (default urtruck-security-api).
set -euo pipefail
PROC="${1:-urtruck-security-api}"
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

"$PM2_BIN" restart "$PROC"

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
"$PM2_BIN" jlist | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [p for p in d if p.get('name') == '$PROC']
assert m, 'process $PROC not found in pm2'
st = m[0].get('pm2_env', {}).get('status')
assert st == 'online', 'pm2 status=%r (expected online)' % st
print('PM2_STATUS=online')
"

# A second probe after a delay catches an immediate crash-loop after the first
# successful bind/import cycle.
sleep 6
curl --fail --silent --show-error --connect-timeout 3 --max-time 10 -o /dev/null "$URL"
echo "HEALTH_HTTP=stable"

# Final PM2 state must still be online after the second HTTP proof.
"$PM2_BIN" jlist | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [p for p in d if p.get('name') == '$PROC']
assert m, 'process $PROC not found in pm2'
st = m[0].get('pm2_env', {}).get('status')
assert st == 'online', 'pm2 status=%r after health check' % st
print('PM2_STATUS=stable')
"

echo "HEALTH=pass"
