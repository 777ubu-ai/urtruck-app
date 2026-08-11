#!/usr/bin/env bash
# Controlled restart + fail-closed health + PM2 online proof + crash-loop check.
# Секреты НЕ печатаются. Аргумент: $1 = имя процесса (default urtruck-security-api).
set -euo pipefail
PROC="${1:-urtruck-security-api}"
URL="http://127.0.0.1:8001/api/v1/system/info"
source ~/.nvm/nvm.sh 2>/dev/null || true

pm2 restart "$PROC"
sleep 4

# PM2 online proof — fail-closed (отсутствует/не online → exit != 0)
pm2 jlist | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [p for p in d if p.get('name') == '$PROC']
assert m, 'process $PROC not found in pm2'
st = m[0].get('pm2_env', {}).get('status')
assert st == 'online', 'pm2 status=%r (expected online)' % st
print('PM2_STATUS=online')
"

# fail-closed health: --fail (4xx/5xx → ошибка), таймауты, без вывода тела
check_health() {
  curl --fail --silent --show-error --connect-timeout 5 --max-time 15 -o /dev/null "$URL"
}
check_health; echo "HEALTH_HTTP=ok (1/2)"
sleep 6
# второй запрос ловит мгновенный crash-loop после старта
check_health; echo "HEALTH_HTTP=ok (2/2)"
echo "HEALTH=pass"
