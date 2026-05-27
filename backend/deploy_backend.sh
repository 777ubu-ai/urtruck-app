#!/usr/bin/env bash
# Deploy UrTruck backend (build 18).
#
# Что делает:
#   1. cd в /home/ubuntu/urtruck-security  (где живёт бэкенд на проде)
#   2. git fetch + checkout main + pull (фронт-ветка claude/profile-wechat-redesign
#      должна быть смержена до запуска этого скрипта; см. README.deploy)
#   3. pip install -r requirements.txt (на случай новых зависимостей)
#   4. pm2 restart urtruck-security-api  → startup hook сам сделает
#      `_ensure_columns()` миграцию SQLite (см. backend/main.py)
#   5. Health-check: curl /api/v1/system/info
#
# Имя файла специально не `deploy.sh` — корневой .gitignore содержит
# wildcard `deploy.sh` (для основного фронт-скрипта).
#
# Запуск с локальной машины:
#   ssh ubuntu@185.22.65.11 'bash -s' < backend/deploy_backend.sh
# Или одной строкой (на сервере, после git pull):
#   cd /home/ubuntu/urtruck-security && bash backend/deploy_backend.sh

set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/home/ubuntu/urtruck-security}"
BRANCH="${DEPLOY_BRANCH:-main}"
PM2_NAME="${PM2_NAME:-urtruck-security-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8001/api/v1/system/info}"

echo "▶ Deploy UrTruck backend (build 18)"
echo "  dir:    $BACKEND_DIR"
echo "  branch: $BRANCH"
echo "  pm2:    $PM2_NAME"

cd "$BACKEND_DIR"

echo "▶ git fetch && checkout $BRANCH && pull"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "▶ pip install -r requirements.txt"
pip install -q -r requirements.txt

echo "▶ pm2 restart $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env

echo "▶ Health check $HEALTH_URL"
sleep 2
if curl -fsS --max-time 8 "$HEALTH_URL" > /tmp/urtruck_health.json; then
  echo "✓ Backend OK:"
  cat /tmp/urtruck_health.json
  echo
  echo "✓ PRO-колонки SQLite смигрированы автоматически в startup hook."
  echo "  Проверь логи: pm2 logs $PM2_NAME --lines 30 | grep -E 'PRO columns|init'"
else
  echo "✗ Health-check failed. Логи:"
  pm2 logs "$PM2_NAME" --lines 30 --nostream
  exit 1
fi
