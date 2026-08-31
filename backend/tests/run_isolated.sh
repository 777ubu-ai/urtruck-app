#!/usr/bin/env bash
# release/reconcile-20260901 §7 — воспроизводимый ЗЕЛЁНЫЙ полный backend-
# регресс локально, той же логикой, что .github/workflows/full-qa-audit.yml
# и pr-quality-gate.yml (не дублирование ради дублирования — этот скрипт
# существует, чтобы владелец/CI мог получить ТОТ ЖЕ результат одной командой
# без ручного копирования YAML-цикла).
#
# Первопричина, почему `pytest backend/tests/` ОДНИМ процессом даёт ~93
# ложных провала, хотя КАЖДЫЙ файл по отдельности зелёный: несколько
# self-contained тест-файлов (test_bid_actions.py, test_self_bid_and_
# webhook_guard.py и другие с тем же паттерном) — намеренно написаны как
# standalone-скрипты (`python -m tests.test_X`) и на уровне СВОЕГО МОДУЛЯ
# делают `verification_gate.require_level = fake_...` ДО своего
# `import api.marketplace` — так и задумано автором для одиночного запуска.
# При коллекции ВСЕХ файлов в ОДНОМ процессе первый импорт api.marketplace
# (или chat/push/notifications/favorites) навсегда "запекает" в декораторы
# `Depends(require_level(1))` того, кто патчил ПОСЛЕДНИМ/ПЕРВЫМ — и эта
# гонка ломает либо "настоящую" авторизацию для всех остальных файлов, либо
# сам fake-механизм следующего такого файла. Это НЕ баг изоляции БД — это
# конфликт process-wide глобального состояния. Официальный CI уже решает
# это правильно:
# каждый файл — отдельный `pytest`-процесс с отдельным DB_PATH. Этот скрипт
# — та же архитектура для локального прогона.
#
# Run:
#   bash backend/tests/run_isolated.sh
#
# Exit code: 0 только если ВСЕ файлы зелёные. Логи каждого файла —
# /tmp/urtruck-isolated/<file>.log (для диагностики конкретного провала).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="/tmp/urtruck-isolated"
mkdir -p "$LOG_DIR"

count=0
failed=0
failed_files=()

while IFS= read -r test_file; do
  count=$((count + 1))
  stem="$(basename "$test_file" .py)"
  db_path="$LOG_DIR/db-${count}.db"
  rm -f "$db_path" "$db_path-wal" "$db_path-shm"

  if grep -Eq '^def test_' "$test_file"; then
    if DB_PATH="$db_path" PYTHONPATH="$ROOT:$BACKEND" \
        python3 -m pytest "$test_file" -q --disable-warnings --maxfail=25 \
        > "$LOG_DIR/${stem}.log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
  else
    if DB_PATH="$db_path" PYTHONPATH="$ROOT:$BACKEND" \
        python3 "$test_file" > "$LOG_DIR/${stem}.log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
  fi

  if [ "$rc" -ne 0 ]; then
    failed=$((failed + 1))
    failed_files+=("$stem")
    echo "FAIL  $stem  (см. $LOG_DIR/${stem}.log)"
  fi
done < <(find "$BACKEND/tests" -type f -name 'test_*.py' | sort)

echo
echo "Файлов проверено: $count"
echo "Провалилось: $failed"
if [ "$failed" -gt 0 ]; then
  printf 'FAILED: %s\n' "${failed_files[@]}"
  exit 1
fi
echo "Все backend-тесты зелёные (изолированно, по одному файлу на процесс)."
