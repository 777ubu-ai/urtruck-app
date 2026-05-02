#!/usr/bin/env bash
# UrTruck backend safe deploy
# ─────────────────────────────────────────────────────────────────────────────
# WHAT IT DOES
#   1. Local preflight (repo layout, py_compile of marketplace.py & main.py)
#   2. Verifies SSH connectivity
#   3. Snapshots remote backend code into a timestamped backup folder
#   4. rsync's local backend/ → remote, excluding venv/ __pycache__ *.db etc.
#   5. Remote py_compile of main.py + api/marketplace.py
#   6. Stops every existing uvicorn ":8001" process gracefully (SIGTERM, then
#      SIGKILL on stragglers), starts EXACTLY ONE new one, then verifies that
#      exactly one process is listening on :8001
#   7. curl /api/version and /api/v1/register/info to confirm liveness
#   8. greps marketplace.py for the expected endpoints (warning, not fatal)
#
# WHAT IT DOES NOT TOUCH
#   - frontend (dist/, src/, env.js)
#   - nginx, certbot, systemd
#   - PostgreSQL/SQLite database files (*.db)
#   - .env (server's secrets)
#   - any cron / scheduler / systemd unit definitions
#
# USAGE
#   ./scripts/deploy-backend-safe.sh --dry-run     # safe inspect-only mode
#   ./scripts/deploy-backend-safe.sh               # real deploy
#
# ENV OVERRIDES (all optional)
#   SSH_USER=ubuntu
#   SSH_HOST=185.22.65.11
#   SSH_KEY=$HOME/.ssh/urtruck
#   REMOTE_BACKEND=/home/ubuntu/urtruck/backend
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SSH_USER=${SSH_USER:-ubuntu}
SSH_HOST=${SSH_HOST:-185.22.65.11}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/urtruck}
REMOTE_BACKEND=${REMOTE_BACKEND:-/home/ubuntu/urtruck/backend}
PORT=${PORT:-8001}
TS="$(date +%Y%m%d_%H%M%S)"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; fi

REMOTE="${SSH_USER}@${SSH_HOST}"
SSH_OPTS=(-i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

c_blue() { printf '\033[1;34m%s\033[0m\n' "$*"; }
c_green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_red() { printf '\033[1;31m%s\033[0m\n' "$*"; }
c_yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

c_blue "=========================================="
c_blue " UrTruck BACKEND deploy ${TS} (dry-run=${DRY_RUN})"
c_blue " remote: ${REMOTE}:${REMOTE_BACKEND}"
c_blue "=========================================="

# ── 1. local preflight ─────────────────────────────────────────────────────
c_blue "[1/8] local preflight"
if [[ ! -d backend ]]; then
  c_red "must be run from repo root (no ./backend found)"
  exit 1
fi
if [[ ! -f "${SSH_KEY}" ]]; then
  c_red "SSH key not found: ${SSH_KEY}"
  exit 1
fi

if [[ -f backend/main.py ]]; then
  python3 -m py_compile backend/main.py
  c_green "  ✓ backend/main.py syntax OK"
fi
if [[ -f backend/api/marketplace.py ]]; then
  python3 -m py_compile backend/api/marketplace.py
  c_green "  ✓ backend/api/marketplace.py syntax OK"
fi
# Best-effort: compile rest of api/ and services/ if present.
for f in backend/api/*.py backend/services/*.py; do
  [[ -f "$f" ]] || continue
  python3 -m py_compile "$f" || { c_red "syntax error in $f"; exit 1; }
done
c_green "  ✓ all .py files in backend/api and backend/services compile"

# ── 2. SSH reachability ────────────────────────────────────────────────────
c_blue "[2/8] SSH reachability"
ssh "${SSH_OPTS[@]}" "${REMOTE}" 'echo "pong from $(hostname)"' \
  || { c_red "SSH failed"; exit 1; }

# ── 3. Decide rsync excludes ───────────────────────────────────────────────
RSYNC_EXCLUDES=(
  --exclude='venv/'
  --exclude='__pycache__/'
  --exclude='*.pyc'
  --exclude='*.db'
  --exclude='*.sqlite'
  --exclude='*.sqlite3'
  --exclude='*.db-journal'
  --exclude='*.db-wal'
  --exclude='*.db-shm'
  --exclude='backups/'
  --exclude='uvicorn.log'
  --exclude='*.log'
  --exclude='.env'
  --exclude='.pytest_cache/'
  --exclude='tests/__pycache__/'
)

# ── 4. dry-run branch ──────────────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  c_blue "[3/8] dry-run rsync (no files copied)"
  rsync -avzn "${RSYNC_EXCLUDES[@]}" \
    -e "ssh ${SSH_OPTS[*]}" \
    backend/ "${REMOTE}:${REMOTE_BACKEND}/" | tail -50
  c_blue "[4/8] dry-run remote checks (read-only)"
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "
    set -e
    cd '${REMOTE_BACKEND}'
    echo '  pwd      :' \$(pwd)
    echo '  python   :' \$(venv/bin/python --version 2>&1 || echo 'venv missing')
    echo '  uvicorn  :' \$(pgrep -af 'uvicorn.*--port ${PORT}' | wc -l) ' process(es)'
    ss -ltn 'sport = :${PORT}' || true
  "
  c_yellow "DRY-RUN COMPLETE. No files copied, no service restarted."
  exit 0
fi

# ── 5. real backup on remote ───────────────────────────────────────────────
c_blue "[3/8] remote backup → backups/deploy-backend-${TS}"
ssh "${SSH_OPTS[@]}" "${REMOTE}" "
  set -e
  cd '${REMOTE_BACKEND}'
  mkdir -p backups
  BK='backups/deploy-backend-${TS}'
  mkdir -p \"\$BK\"
  for d in api database services main.py; do
    [[ -e \"\$d\" ]] && cp -a \"\$d\" \"\$BK/\" || true
  done
  echo '  backup path:' \"\$(pwd)/\$BK\"
  ls -la \"\$BK\"
"

# ── 6. rsync ───────────────────────────────────────────────────────────────
c_blue "[4/8] rsync backend/ → ${REMOTE}:${REMOTE_BACKEND}/"
rsync -avz "${RSYNC_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  backend/ "${REMOTE}:${REMOTE_BACKEND}/"

# ── 7. remote syntax check ─────────────────────────────────────────────────
c_blue "[5/8] remote py_compile"
ssh "${SSH_OPTS[@]}" "${REMOTE}" "
  set -e
  cd '${REMOTE_BACKEND}'
  PY=venv/bin/python
  if [[ ! -x \"\$PY\" ]]; then
    echo '  ⚠️  venv/bin/python not found; falling back to system python3'
    PY=python3
  fi
  [[ -f main.py ]] && \"\$PY\" -m py_compile main.py
  [[ -f api/marketplace.py ]] && \"\$PY\" -m py_compile api/marketplace.py
  for f in api/*.py services/*.py; do
    [[ -f \"\$f\" ]] && \"\$PY\" -m py_compile \"\$f\"
  done
  echo '  ✓ remote syntax OK'
"

# ── 8. uvicorn safe restart ────────────────────────────────────────────────
c_blue "[6/8] uvicorn restart (kill duplicates → start one)"
ssh "${SSH_OPTS[@]}" "${REMOTE}" "
  set -e
  cd '${REMOTE_BACKEND}'

  # Find every uvicorn watching :${PORT}.
  PIDS=\$(pgrep -af 'uvicorn.*main:app.*--port ${PORT}' | awk '{print \$1}' || true)
  if [[ -n \"\$PIDS\" ]]; then
    echo '  stopping existing uvicorn pids:' \$PIDS
    kill -TERM \$PIDS || true
    sleep 3
    # Anything still alive — force.
    PIDS_LEFT=\$(pgrep -af 'uvicorn.*main:app.*--port ${PORT}' | awk '{print \$1}' || true)
    if [[ -n \"\$PIDS_LEFT\" ]]; then
      echo '  force-killing leftover pids:' \$PIDS_LEFT
      kill -KILL \$PIDS_LEFT || true
      sleep 1
    fi
  fi

  # Start exactly one.
  nohup venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port ${PORT} \\
    > uvicorn.log 2>&1 &
  disown || true

  # Verify exactly one process and one listener.
  sleep 4
  RUNNING=\$(pgrep -af 'uvicorn.*main:app.*--port ${PORT}' | wc -l)
  echo '  uvicorn process count:' \$RUNNING
  if [[ \"\$RUNNING\" -gt 1 ]]; then
    # Keep the one listening on :${PORT}, kill others.
    LISTENER=\$(ss -ltnp 2>/dev/null | awk -v p=':${PORT}' \$0~p'{print \$NF}' | grep -oP 'pid=\K[0-9]+' | head -1)
    echo '  listener pid:' \$LISTENER
    for pid in \$(pgrep -af 'uvicorn.*main:app.*--port ${PORT}' | awk '{print \$1}'); do
      if [[ \"\$pid\" != \"\$LISTENER\" ]]; then
        echo '  killing duplicate' \$pid
        kill -KILL \$pid || true
      fi
    done
  fi
"

# ── 9. API verification ────────────────────────────────────────────────────
c_blue "[7/8] API verification"
ssh "${SSH_OPTS[@]}" "${REMOTE}" "
  set -e
  echo -n '  /api/version       : '
  curl -fsS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:${PORT}/api/version || true
  echo -n '  /api/v1/register/info : '
  curl -fsS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:${PORT}/api/v1/register/info || true
  echo '  listeners on :${PORT}:'
  ss -ltn 'sport = :${PORT}' || true
"
# If anything was wrong, print the tail of uvicorn.log to help debug.
if ! ssh "${SSH_OPTS[@]}" "${REMOTE}" "curl -fsS http://127.0.0.1:${PORT}/api/version >/dev/null"; then
  c_red "API verification failed — printing last 40 lines of uvicorn.log"
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "tail -40 '${REMOTE_BACKEND}/uvicorn.log' || true"
  exit 1
fi

# ── 10. endpoint sanity (warn-only) ────────────────────────────────────────
c_blue "[8/8] endpoint sanity grep (warn-only)"
ssh "${SSH_OPTS[@]}" "${REMOTE}" "
  set +e
  cd '${REMOTE_BACKEND}'
  if [[ -f api/marketplace.py ]]; then
    for needle in 'def update_bid' 'def cancel_bid' 'def reject_bid' 'counter/accept' 'counter/decline' 'bids/{bid_id}/chat'; do
      if grep -q \"\$needle\" api/marketplace.py; then
        echo \"  ✓ found: \$needle\"
      else
        echo \"  ⚠️  missing: \$needle\"
      fi
    done
  else
    echo '  ⚠️  api/marketplace.py not found on server'
  fi
"

c_green "=========================================="
c_green " BACKEND DEPLOY ${TS} OK"
c_green "=========================================="
