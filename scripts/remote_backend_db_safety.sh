#!/usr/bin/env bash
# Remote-only helper for deploy-backend-safe.sh.
#
# Keeps the live SQLite database outside the replaceable backend release tree
# and verifies that deploy does not lose runtime rows.
set -euo pipefail

PHASE="${1:?phase required: pre|post}"
REMOTE_BACKEND="${2:?remote backend path required}"
RUNTIME_DIR="${3:?runtime dir required}"
SNAPSHOT_FILE="${4:?snapshot file required}"
DB_OVERRIDE="${5:-}"

TABLES=(drivers_registration cargos deals push_tokens_native push_devices)

fail() {
  echo "DB_SAFETY_FAIL: $*" >&2
  exit 1
}

read_env_db_path() {
  if [[ -f "${REMOTE_BACKEND}/.env" ]]; then
    python3 - "$REMOTE_BACKEND/.env" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    key, value = stripped.split("=", 1)
    if key.strip() == "DB_PATH":
        print(value.strip().strip('"').strip("'"))
        break
PY
  fi
}

sqlite_scalar() {
  local db_path="$1"
  local sql="$2"
  python3 - "$db_path" "$sql" <<'PY'
import sqlite3
import sys

db_path, sql = sys.argv[1], sys.argv[2]
with sqlite3.connect(db_path, timeout=10.0) as conn:
    row = conn.execute(sql).fetchone()
print("" if row is None else row[0])
PY
}

backup_db() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  python3 - "$src" "$dst" <<'PY'
import sqlite3
import sys

src, dst = sys.argv[1], sys.argv[2]
with sqlite3.connect(src, timeout=10.0) as source:
    with sqlite3.connect(dst, timeout=10.0) as target:
        source.backup(target)
PY
  chmod 600 "$dst"
}

write_env_db_path() {
  local value="$1"
  python3 - "$REMOTE_BACKEND/.env" "$value" <<'PY'
import sys
from pathlib import Path

env = Path(sys.argv[1])
db_path = sys.argv[2]
lines = []
found = False
if env.exists():
    lines = env.read_text(encoding="utf-8", errors="ignore").splitlines()
out = []
for line in lines:
    if line.strip().startswith("DB_PATH="):
        out.append(f"DB_PATH={db_path}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"DB_PATH={db_path}")
env.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
PY
  chmod 600 "$REMOTE_BACKEND/.env"
}

is_under_backend() {
  local path="$1"
  python3 - "$REMOTE_BACKEND" "$path" <<'PY'
import sys
from pathlib import Path

backend = Path(sys.argv[1]).resolve()
path = Path(sys.argv[2]).resolve()
try:
    path.relative_to(backend)
    print("yes")
except ValueError:
    print("no")
PY
}

resolve_db_path() {
  local env_path
  env_path="$(read_env_db_path || true)"
  if [[ -n "$DB_OVERRIDE" ]]; then
    echo "$DB_OVERRIDE"
  elif [[ -n "$env_path" ]]; then
    echo "$env_path"
  else
    echo "${RUNTIME_DIR}/security.db"
  fi
}

ensure_runtime_db() {
  mkdir -p "$RUNTIME_DIR"
  local db_path
  db_path="$(resolve_db_path)"
  local old_path="${REMOTE_BACKEND}/database/security.db"

  if [[ "$(is_under_backend "$db_path")" == "yes" ]]; then
    echo "DB_SAFETY: configured DB_PATH is inside release tree; migrating to runtime dir" >&2
    db_path="${RUNTIME_DIR}/security.db"
  fi

  if [[ ! -f "$db_path" && -f "$old_path" ]]; then
    echo "DB_SAFETY: copying existing release-tree DB to runtime dir" >&2
    backup_db "$old_path" "$db_path"
  fi

  if [[ ! -f "$db_path" ]]; then
    fail "runtime DB not found: $db_path"
  fi

  write_env_db_path "$db_path"
  echo "$db_path"
}

integrity_check() {
  local db_path="$1"
  local result
  result="$(sqlite_scalar "$db_path" "PRAGMA integrity_check;")"
  [[ "$result" == "ok" ]] || fail "sqlite integrity_check failed: $result"
}

snapshot_counts() {
  local db_path="$1"
  local out="$2"
  : > "$out"
  for table in "${TABLES[@]}"; do
    local exists count
    exists="$(sqlite_scalar "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}';")"
    if [[ "$exists" == "1" ]]; then
      count="$(sqlite_scalar "$db_path" "SELECT COUNT(*) FROM ${table};")"
    else
      count="MISSING"
    fi
    printf '%s=%s\n' "$table" "$count" >> "$out"
  done
}

compare_counts() {
  local before="$1"
  local after="$2"
  if ! cmp -s "$before" "$after"; then
    echo "DB_SAFETY: before counts"
    cat "$before"
    echo "DB_SAFETY: after counts"
    cat "$after"
    fail "runtime table counts changed during deploy"
  fi
}

case "$PHASE" in
  pre)
    db_path="$(ensure_runtime_db)"
    integrity_check "$db_path"
    mkdir -p "$(dirname "$SNAPSHOT_FILE")"
    snapshot_counts "$db_path" "$SNAPSHOT_FILE"
    backup_dir="${REMOTE_BACKEND}/backups/db-safety-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    backup_db "$db_path" "${backup_dir}/security.db"
    integrity_check "${backup_dir}/security.db"
    cp "$SNAPSHOT_FILE" "${backup_dir}/counts.before"
    echo "DB_SAFETY_PRE=ok"
    echo "DB_SAFETY_DB_PATH=$db_path"
    echo "DB_SAFETY_COUNTS_SNAPSHOT=$SNAPSHOT_FILE"
    echo "DB_SAFETY_BACKUP=${backup_dir}/security.db"
    ;;
  post)
    db_path="$(resolve_db_path)"
    [[ -f "$db_path" ]] || fail "runtime DB not found after deploy: $db_path"
    [[ "$(is_under_backend "$db_path")" == "no" ]] || fail "runtime DB is inside release tree after deploy: $db_path"
    integrity_check "$db_path"
    after_file="${SNAPSHOT_FILE}.after"
    snapshot_counts "$db_path" "$after_file"
    compare_counts "$SNAPSHOT_FILE" "$after_file"
    echo "DB_SAFETY_POST=ok"
    ;;
  *)
    fail "unknown phase: $PHASE"
    ;;
esac
