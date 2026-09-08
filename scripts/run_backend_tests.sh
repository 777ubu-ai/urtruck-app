#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

export PYTHONPATH="$ROOT_DIR:$ROOT_DIR/backend${PYTHONPATH:+:$PYTHONPATH}"
export APP_ENV="${APP_ENV:-test}"
export URTRUCK_ENV="${URTRUCK_ENV:-test}"
export ENV="${ENV:-test}"
export CGR_IIN_SALT="${CGR_IIN_SALT:-ci-test-salt-not-a-secret}"
export DB_PATH="${DB_PATH:-${TMPDIR:-/tmp}/urtruck-tests.db}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python || command -v python3)}"
test -n "$PYTHON_BIN"

rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
"$PYTHON_BIN" -m compileall -q .
if [[ "${1:-}" == "--isolated" ]]; then
  shift
  count=0
  while IFS= read -r test_file; do
    count=$((count + 1))
    module_db="${DB_PATH%.db}-${count}.db"
    rm -f "$module_db" "$module_db-wal" "$module_db-shm"
    if rg -q '^def test_' "$test_file"; then
      DB_PATH="$module_db" URTRUCK_DB_PATH="$module_db" \
        "$PYTHON_BIN" -m pytest "$test_file" "$@"
    else
      DB_PATH="$module_db" URTRUCK_DB_PATH="$module_db" \
        "$PYTHON_BIN" "$test_file"
    fi
  done < <(find tests -type f -name 'test_*.py' | sort)
  test "$count" -gt 0
else
  "$PYTHON_BIN" -m pytest tests "$@"
fi
