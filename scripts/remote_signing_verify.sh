#!/usr/bin/env bash
# Verify FILE_SIGNING_KEY present + signing smoke НА СЕРВЕРЕ. Секрет не печатается.
# $1 = BACKEND_DIR. scripts/signing_smoke.py должен быть уже scp'шнут в /tmp.
set -euo pipefail
BACKEND_DIR="${1:?BACKEND_DIR required}"
SMOKE=/tmp/urtruck_signing_smoke.py
trap 'rm -f "$SMOKE"' EXIT
ENVF="$BACKEND_DIR/.env"

if grep -qE '^FILE_SIGNING_KEY=.+' "$ENVF"; then
  echo "FILE_SIGNING_KEY_PRESENT=yes"
else
  echo "FILE_SIGNING_KEY_PRESENT=no"; exit 1
fi
export FILE_SIGNING_KEY="$(grep -E '^FILE_SIGNING_KEY=' "$ENVF" | head -1 | cut -d= -f2-)"

# The backend can be managed by PM2 with a venv/interpreter different from the
# login shell's /usr/bin/python3. Running the smoke with system python caused a
# false release failure (`ModuleNotFoundError: httpx`) even while the deployed
# API was healthy. Resolve the interpreter of the ACTUAL PM2 process first.
source ~/.nvm/nvm.sh 2>/dev/null || true

PM2_PROC="${PM2_PROC:-urtruck-security-api}"
PM2_PID="$(pm2 jlist | python3 -c "
import json, sys
rows=json.load(sys.stdin)
row=next((p for p in rows if p.get('name') == '$PM2_PROC'), None)
print((row or {}).get('pid') or '')
")"
PM2_INTERPRETER="$(pm2 jlist | python3 -c "
import json, sys
rows=json.load(sys.stdin)
row=next((p for p in rows if p.get('name') == '$PM2_PROC'), None)
print(((row or {}).get('pm2_env') or {}).get('exec_interpreter') or '')
")"

resolve_candidate() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  if [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  command -v "$candidate" 2>/dev/null || return 1
}

PYTHON_RUNTIME=""
CANDIDATES=()
if [ -n "$PM2_PID" ] && [ -e "/proc/$PM2_PID/exe" ]; then
  CANDIDATES+=("$(readlink -f "/proc/$PM2_PID/exe" || true)")
fi
CANDIDATES+=("$PM2_INTERPRETER")
CANDIDATES+=("$BACKEND_DIR/.venv/bin/python" "$BACKEND_DIR/venv/bin/python" "python3")

for candidate in "${CANDIDATES[@]}"; do
  resolved="$(resolve_candidate "$candidate" || true)"
  [ -n "$resolved" ] || continue
  if "$resolved" -c 'import httpx' >/dev/null 2>&1; then
    PYTHON_RUNTIME="$resolved"
    break
  fi
done

if [ -z "$PYTHON_RUNTIME" ]; then
  echo "::error::Could not resolve the backend Python runtime with required dependencies" >&2
  exit 1
fi

echo "SIGNING_RUNTIME=backend-python"
cd "$BACKEND_DIR"
"$PYTHON_RUNTIME" "$SMOKE"
