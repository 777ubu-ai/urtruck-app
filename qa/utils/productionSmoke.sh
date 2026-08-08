#!/usr/bin/env bash
# Read-only production smoke для UrTruck. Безопасен (только GET), не трогает
# пользовательские данные. Запуск ПОСЛЕ деплоя для доказательства
# production SHA == ожидаемый + базовое здоровье контуров.
#
# Использование:
#   EXPECTED_SHA=<merge_sha> qa/utils/productionSmoke.sh
#   (без EXPECTED_SHA — просто печатает текущее состояние)
set -uo pipefail
BASE="${PROD_BASE:-https://urtruck.kz}"
API="$BASE/security/api/v1"
fail=0

echo "=== build-info (production SHA) ==="
info=$(curl -s --max-time 15 "$BASE/build-info.json")
echo "$info"
if [ -n "${EXPECTED_SHA:-}" ]; then
  if echo "$info" | grep -q "$EXPECTED_SHA"; then
    echo "✅ production отдаёт ожидаемый SHA $EXPECTED_SHA"
  else
    echo "❌ production SHA != ожидаемый ($EXPECTED_SHA)"; fail=1
  fi
fi

echo "=== system/info (env/otp/face/storage) ==="
sys=$(curl -s --max-time 15 "$API/system/info")
echo "$sys" | head -c 500; echo
echo "$sys" | grep -q '"env":"production"' && echo "✅ env=production" || { echo "❌ env != production"; fail=1; }
echo "$sys" | grep -q '"beta_mode":false' && echo "✅ beta_mode=false" || { echo "❌ beta_mode не false"; fail=1; }

echo "=== critical API guards (GET, alive + shape) ==="
for ep in "market/cargos?limit=1:cargos" "market/trips?limit=1:trips"; do
  path="${ep%%:*}"; key="${ep##*:}"
  r=$(curl -s --max-time 15 "$API/$path")
  echo "$r" | grep -q "\"$key\"" && echo "✅ /$path → есть '$key'" || { echo "❌ /$path не отдал '$key'"; fail=1; }
done

echo "=== frontend HTML ==="
code=$(curl -s --max-time 12 -o /dev/null -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] && echo "✅ frontend HTTP 200" || { echo "❌ frontend HTTP $code"; fail=1; }

echo "=== signed-document readiness hint ==="
echo "ℹ FILE_SIGNING_KEY проверяется вручную: открыть документ водителя в приложении —"
echo "  ссылка должна подписываться (?exp&sig) и открываться. 500 = ключ не задан (fail-closed)."

echo "----"
[ "$fail" = 0 ] && echo "PROD SMOKE OK" || echo "PROD SMOKE FAILED"
exit $fail
