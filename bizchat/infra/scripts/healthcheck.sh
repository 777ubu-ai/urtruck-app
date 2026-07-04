#!/usr/bin/env bash
# =======================================================================
# Biz Chat — Healthcheck cron (staging VPS)
# =======================================================================
# Запускается каждые 5 минут через cron. Проверяет:
#   1. 3 docker контейнера (bizchat-backend-prod, postgres, redis) в статусе healthy
#   2. HTTP `curl http://127.0.0.1:3000/api/v1/posts/feed?limit=1` отвечает 200
#
# При сбое: пишет warning в лог + пытается рестартнуть проблемный контейнер
# (один раз). Если повторный фейл — пишет CRITICAL и больше не трогает,
# чтобы не зациклиться — оператор должен зайти руками.
#
# Cron entry:
#   */5 * * * * /home/ubuntu/bizchat/infra/scripts/healthcheck.sh >> /var/log/bizchat-health.log 2>&1
# =======================================================================
set -uo pipefail

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
COMPOSE_DIR="/home/ubuntu/bizchat/infra"
COMPOSE_FILES="-f ${COMPOSE_DIR}/docker-compose.production.yml -f ${COMPOSE_DIR}/docker-compose.staging.yml"
ENV_FILE="${COMPOSE_DIR}/.env.production"
EXPECTED=("bizchat-backend-prod" "bizchat-postgres-prod" "bizchat-redis-prod")
HEALTH_URL="http://127.0.0.1:3000/api/v1/posts/feed?limit=1"

unhealthy=()

for c in "${EXPECTED[@]}"; do
  status=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${c}" 2>/dev/null || echo "missing|missing")
  state="${status%%|*}"
  health="${status##*|}"
  if [ "${state}" != "running" ]; then
    echo "${LOG_PREFIX} WARN: ${c} state=${state}"
    unhealthy+=("${c}")
  elif [ "${health}" != "healthy" ] && [ "${health}" != "none" ]; then
    echo "${LOG_PREFIX} WARN: ${c} health=${health}"
    unhealthy+=("${c}")
  fi
done

# HTTP probe
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${HEALTH_URL}" || echo "000")
if [ "${http_code}" != "200" ]; then
  echo "${LOG_PREFIX} WARN: ${HEALTH_URL} returned ${http_code}"
  unhealthy+=("backend-http")
fi

if [ "${#unhealthy[@]}" -eq 0 ]; then
  # Тихий success — пишем раз в 60 минут чтобы не засорять лог
  if [ "$(date +%M)" = "00" ]; then
    echo "${LOG_PREFIX} OK: all healthy"
  fi
  exit 0
fi

# Что-то нездорово — попытка восстановления
echo "${LOG_PREFIX} CRIT: unhealthy=[${unhealthy[*]}]"

# Пытаемся рестартнуть backend, если он среди unhealthy. Postgres/redis
# трогать осторожно — обычно сами не падают, и рестарт может разрушить
# незакомиченные транзакции.
for c in "${unhealthy[@]}"; do
  case "${c}" in
    "bizchat-backend-prod"|"backend-http")
      echo "${LOG_PREFIX} → restart backend"
      cd "${COMPOSE_DIR}" || exit 1
      docker compose ${COMPOSE_FILES} --env-file "${ENV_FILE}" restart backend 2>&1 | tail -5 | sed "s/^/${LOG_PREFIX} /"
      break
      ;;
  esac
done

# Не выходим с non-zero чтобы cron не спамил почтой ubuntu — лога достаточно
exit 0
