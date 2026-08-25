#!/usr/bin/env bash
# #291: Запуск backend-тестов с изоляцией по файлам.
#
# Воспроизводит поведение CI (pr-quality-gate.yml): каждый test-файл
# запускается с собственной пустой БД, что исключает cross-contamination
# от модульных синглтонов (config.DB_PATH, chat._init() и т.д.).
#
# Использование:
#   cd backend && bash scripts/run_tests_isolated.sh
#   # или: npm run qa:backend (из корня)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

# JUnit XML для CI
RESULTS_DIR="${BACKEND_DIR}/test-results"
mkdir -p "$RESULTS_DIR"

total=0
passed=0
failed=0
errors=0
failed_files=()

# Собираем все test-файлы
mapfile -t test_files < <(find tests/ -name 'test_*.py' -type f | sort)

echo "═══════════════════════════════════════════════════════"
echo "  UrTruck backend test suite (isolated per file)"
echo "  Files: ${#test_files[@]}"
echo "═══════════════════════════════════════════════════════"

for f in "${test_files[@]}"; do
    total=$((total + 1))
    db_path="/tmp/urtruck_test_isolated_$(echo "$f" | tr '/' '_' | sed 's/.py$//')_$$.db"
    rm -f "$db_path"

    # Запускаем pytest для одного файла с изолированной БД
    if DB_PATH="$db_path" \
       FILE_SIGNING_KEY="test-file-signing-key-32-bytes-minimum" \
       CGR_IIN_SALT="pytest-harness-salt-not-a-secret" \
       ENV=test \
       python -m pytest "$f" \
         --tb=short \
         --no-header \
         -q \
         --junitxml="${RESULTS_DIR}/$(echo "$f" | tr '/' '_').xml" \
         2>&1; then
        passed=$((passed + 1))
    else
        exit_code=$?
        if [ $exit_code -eq 5 ]; then
            # pytest exit code 5 = no tests collected (empty file or all skipped)
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
            failed_files+=("$f")
        fi
    fi

    # Убираем за собой
    rm -f "$db_path" "${db_path}-wal" "${db_path}-shm"
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ИТОГО: ${total} файлов, ${passed} ✅, ${failed} ❌"
if [ ${#failed_files[@]} -gt 0 ]; then
    echo ""
    echo "  Упавшие файлы:"
    for ff in "${failed_files[@]}"; do
        echo "    ❌ $ff"
    done
fi
echo "═══════════════════════════════════════════════════════"

# JUnit summary
cat > "${RESULTS_DIR}/summary.json" <<EOF
{
  "total_files": ${total},
  "passed": ${passed},
  "failed": ${failed},
  "failed_files": [$(printf '"%s",' "${failed_files[@]}" | sed 's/,$//')]
}
EOF

exit $failed
