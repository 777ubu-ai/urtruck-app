#!/usr/bin/env bash
# P0 2026-09-02 (Phase 2) — per-file backend test runner.
#
# Backend suite имеет cross-file DB pollution (shared conftest DB перезаписывается
# отдельными тестами). Per-file прогон изолирует каждый тест-модуль в свою DB —
# 60/60 files, 421/421 tests PASS в этом режиме.
#
# Usage: bash backend/tests/run_all_per_file.sh
#        (или из backend/: bash tests/run_all_per_file.sh)
set -eu
cd "$(dirname "$0")/.."
pass_files=0
fail_files=0
total_pass=0
total_fail=0
failed_list=()
for f in tests/test_*.py; do
    name=$(basename "$f" .py)
    out=$(DB_PATH="/tmp/urtruck_iso_${name}.db" timeout 60 python -m pytest "$f" -q --tb=line 2>&1 | tail -3)
    passed=$(echo "$out" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+' || echo 0)
    failed=$(echo "$out" | grep -oE '[0-9]+ failed' | head -1 | grep -oE '[0-9]+' || echo 0)
    total_pass=$((total_pass + passed))
    total_fail=$((total_fail + failed))
    if [ "$failed" -eq 0 ] && [ "$passed" -gt 0 ]; then
        pass_files=$((pass_files + 1))
    else
        fail_files=$((fail_files + 1))
        failed_list+=("$name")
        echo "FAIL: $name — $out" >&2
    fi
done
echo
echo "Files: total=$((pass_files + fail_files)) pass=$pass_files fail=$fail_files"
echo "Tests: pass=$total_pass fail=$total_fail"
if [ "$fail_files" -gt 0 ]; then
    echo "Failed files:" "${failed_list[@]}"
    exit 1
fi
