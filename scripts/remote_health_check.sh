#!/usr/bin/env bash
# Controlled restart + fail-closed health + PM2 online proof + crash-loop check.
# Секреты НЕ печатаются. Аргумент: $1 = имя процесса (default urtruck-security-api).
set -euo pipefail
PROC="${1:-urtruck-security-api}"
URL="http://127.0.0.1:8001/api/v1/system/info"
source ~/.nvm/nvm.sh 2>/dev/null || true

pm2 restart "$PROC"

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
pm2 jlist | python3 -c "
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
pm2 jlist | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [p for p in d if p.get('name') == '$PROC']
assert m, 'process $PROC not found in pm2'
st = m[0].get('pm2_env', {}).get('status')
assert st == 'online', 'pm2 status=%r after health check' % st
print('PM2_STATUS=stable')
"

echo "HEALTH=pass"
