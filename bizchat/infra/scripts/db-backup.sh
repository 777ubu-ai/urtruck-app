#!/usr/bin/env bash
# =======================================================================
# Biz Chat — Daily PostgreSQL backup (staging VPS)
# =======================================================================
# Запускается через cron каждый день в 03:00 Asia/Almaty.
# Делает pg_dump из контейнера bizchat-postgres-prod, сжимает gzip,
# складывает в /home/ubuntu/bizchat-backups/, ротирует старее 14 дней.
#
# Cron entry (см. infra/scripts/install-cron.sh):
#   0 3 * * * /home/ubuntu/bizchat/infra/scripts/db-backup.sh >> /var/log/bizchat-backup.log 2>&1
#
# Восстановление:
#   gunzip -c /home/ubuntu/bizchat-backups/bizchat-2026-04-12_030000.sql.gz | \
#     docker exec -i bizchat-postgres-prod psql -U bizchat -d bizchat
# =======================================================================
set -euo pipefail

CONTAINER="bizchat-postgres-prod"
DB_USER="bizchat"
DB_NAME="bizchat"
BACKUP_DIR="/home/ubuntu/bizchat-backups"
RETENTION_DAYS=14
TS=$(date +%Y-%m-%d_%H%M%S)
OUT="${BACKUP_DIR}/bizchat-${TS}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup start → ${OUT}"

# pg_dump в формате plain SQL → gzip. --no-owner --no-acl чтобы дамп
# был портативным между средами (другой пароль, другой owner).
if docker exec "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
     --no-owner --no-acl --clean --if-exists 2>/dev/null \
   | gzip -9 > "${OUT}"; then
  SIZE=$(du -h "${OUT}" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup OK (${SIZE})"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup FAILED"
  rm -f "${OUT}"
  exit 1
fi

# Ротация — удалить файлы старше RETENTION_DAYS дней
DELETED=$(find "${BACKUP_DIR}" -name 'bizchat-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] rotated ${DELETED} old backups (>${RETENTION_DAYS}d)"
fi

# Текущий статистический отчёт
COUNT=$(ls -1 "${BACKUP_DIR}"/bizchat-*.sql.gz 2>/dev/null | wc -l)
TOTAL=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] vault: ${COUNT} files, ${TOTAL} total"
