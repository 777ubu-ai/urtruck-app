#!/usr/bin/env bash
# P2-7 — зонд rate-limit на POST /api/v1/market/cargos.
#
# БЕЗОПАСНО ПО ДИЗАЙНУ: запросы идут БЕЗ Authorization → endpoint закрыт
# гейтом require_level(1) и отвечает 401 ещё ДО записи в БД. Значит 100
# запросов НЕ создают ни одного груза в проде. Проверяем единственное:
# включается ли rate-limit (HTTP 429) при всплеске запросов.
#
# Использование:
#   scripts/stress_cargos_ratelimit.sh [URL] [N]
# По умолчанию: прод security-прокси, 100 запросов.
#
# Если 429 ни разу не встретился — это gap (нет throttling). Фиксировать
# backend НЕ нужно (см. задачу) — задокументировать в qa/RATELIMIT_REPORT.md.
set -u

URL="${1:-https://urtruck.kz/security/api/v1/market/cargos}"
N="${2:-100}"
BODY='{}'   # пустое тело — всё равно отлетит 401/422 до бизнес-логики

echo "── P2-7 rate-limit probe ──"
echo "target : $URL"
echo "count  : $N (unauthenticated POST, no DB writes)"
echo "started: $(date -u +%FT%TZ)"
echo

declare -A codes
saw_429=0
first_429_at=""

for i in $(seq 1 "$N"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 10 \
    -X POST "$URL" \
    -H 'Content-Type: application/json' \
    --data "$BODY")
  codes["$code"]=$(( ${codes["$code"]:-0} + 1 ))
  if [ "$code" = "429" ] && [ "$saw_429" -eq 0 ]; then
    saw_429=1
    first_429_at="$i"
  fi
done

echo "── Распределение HTTP-кодов ──"
for c in "${!codes[@]}"; do
  printf "  %s : %d\n" "$c" "${codes[$c]}"
done
echo

if [ "$saw_429" -eq 1 ]; then
  echo "RESULT: ✅ rate-limit СРАБОТАЛ (первый 429 на запросе #$first_429_at)"
  exit 0
else
  echo "RESULT: ⚠️  429 НЕ встречен за $N запросов → rate-limit на POST /cargos ОТСУТСТВУЕТ (gap)."
  echo "        Задокументировать в qa/RATELIMIT_REPORT.md (backend НЕ фиксить по задаче)."
  exit 0
fi
