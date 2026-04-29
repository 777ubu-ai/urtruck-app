#!/usr/bin/env bash
set -euo pipefail

SERVER="ubuntu@185.22.65.11"
KEY="$HOME/.ssh/urtruck"
REMOTE_FRONTEND="/home/ubuntu/urtruck/frontend"
REMOTE_BACKUPS="/home/ubuntu/urtruck/frontend_backups"
VERSION_TAG="$(date +%Y%m%d_%H%M%S)"

echo "======================================"
echo " UrTruck WEB SAFE DEPLOY $VERSION_TAG"
echo "======================================"

echo ""
echo "=== 1. Проверка env.js ==="
if ! grep -q "export const API_BASE" src/config/env.js; then
  echo "❌ env.js: API_BASE не найден"
  exit 1
fi

if grep -q "const SEimport\|import.*import" src/config/env.js; then
  echo "❌ env.js сломан: найден мусор import"
  cat src/config/env.js
  exit 1
fi

cat src/config/env.js

echo ""
echo "=== 2. Локальная проверка старого API в src ==="
grep -R "http://185.22.65.11:8001\|/security/api/v1\|185.22.65.11:8001" -n src || true

echo ""
echo "=== 3. Чистим старую сборку ==="
rm -rf dist .expo

echo ""
echo "=== 4. Собираем Expo Web ==="
NODE_TLS_REJECT_UNAUTHORIZED=0 npx expo export --platform web

echo ""
echo "=== 5. Ставим deploy check ==="
date > dist/__deploy_check.txt
echo "$VERSION_TAG" >> dist/__deploy_check.txt

echo ""
echo "=== 6. Проверка старого API в готовой сборке ==="
if grep -R "http://185.22.65.11:8001\|/security/api/v1\|185.22.65.11:8001" -n dist 2>/dev/null; then
  echo "❌ В dist остался старый API. Деплой остановлен."
  exit 1
else
  echo "✅ Старого API в dist нет"
fi

echo ""
echo "=== 7. Проверка нового API в готовой сборке ==="
grep -R "/api/v1" -n dist/_expo dist/assets 2>/dev/null | head -20 || true

echo ""
echo "=== 8. Backup frontend на сервере ==="
ssh -i "$KEY" "$SERVER" "
set -e
mkdir -p '$REMOTE_BACKUPS'
if [ -d '$REMOTE_FRONTEND' ]; then
  tar -czf '$REMOTE_BACKUPS/frontend_$VERSION_TAG.tar.gz' -C /home/ubuntu/urtruck frontend
fi
"

echo ""
echo "=== 9. Заливка через rsync --delete ==="
rsync -avz --delete -e "ssh -i $KEY" dist/ "$SERVER:$REMOTE_FRONTEND/"

echo ""
echo "=== 10. Проверка файлов на сервере ==="
ssh -i "$KEY" "$SERVER" "
set -e
echo '--- frontend files ---'
ls -lah '$REMOTE_FRONTEND' | head -30

echo ''
echo '--- deploy check file ---'
cat '$REMOTE_FRONTEND/__deploy_check.txt'

echo ''
echo '--- old API search on server ---'
grep -R 'http://185.22.65.11:8001\|/security/api/v1\|185.22.65.11:8001' -n '$REMOTE_FRONTEND/_expo' '$REMOTE_FRONTEND/assets' 2>/dev/null | head -50 || true

echo ''
echo '--- index.html js ---'
grep -o '/_expo/static/js/web/[^\" ]*' '$REMOTE_FRONTEND/index.html' || true
"

echo ""
echo "=== 11. Проверка HTTPS frontend ==="
curl -k -sS https://urtruck.kz/__deploy_check.txt
echo ""

echo ""
echo "=== 12. Проверка API ==="
echo "--- /api/version ---"
curl -k -sS https://urtruck.kz/api/version
echo ""

echo "--- /api/v1/ ---"
curl -k -sS https://urtruck.kz/api/v1/
echo ""

echo "--- /api/v1/register/info ---"
curl -k -sS https://urtruck.kz/api/v1/register/info
echo ""

echo ""
echo "======================================"
echo "✅ DEPLOY DONE"
echo "Открой: https://urtruck.kz/?v=$VERSION_TAG"
echo "======================================"
