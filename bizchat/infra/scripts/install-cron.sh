#!/usr/bin/env bash
# =======================================================================
# Biz Chat — установка cron заданий на staging VPS
# =======================================================================
# Идемпотентен: можно запускать несколько раз, дубликатов не появится.
# Создаёт два задания через /etc/cron.d/bizchat (root):
#   - daily db backup в 03:00 Asia/Almaty
#   - healthcheck каждые 5 минут
# =======================================================================
set -euo pipefail

CRON_FILE="/etc/cron.d/bizchat"
SCRIPTS_DIR="/home/ubuntu/bizchat/infra/scripts"
BACKUP_LOG="/var/log/bizchat-backup.log"
HEALTH_LOG="/var/log/bizchat-health.log"

# Создаём log файлы с правами на запись для ubuntu (cron от ubuntu)
sudo touch "${BACKUP_LOG}" "${HEALTH_LOG}"
sudo chown ubuntu:ubuntu "${BACKUP_LOG}" "${HEALTH_LOG}"
sudo chmod 644 "${BACKUP_LOG}" "${HEALTH_LOG}"

# Делаем скрипты исполняемыми
chmod +x "${SCRIPTS_DIR}/db-backup.sh" "${SCRIPTS_DIR}/healthcheck.sh"

# Записываем cron file (полностью перезаписываем — идемпотентно)
sudo tee "${CRON_FILE}" >/dev/null <<EOF
# Biz Chat staging cron — managed by install-cron.sh
# DO NOT edit manually, изменения перезапишутся при следующем install.
#
# Format: minute hour dom month dow user command
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TZ=Asia/Almaty

# Daily PostgreSQL backup в 03:00
0 3 * * * ubuntu ${SCRIPTS_DIR}/db-backup.sh >> ${BACKUP_LOG} 2>&1

# Healthcheck каждые 5 минут
*/5 * * * * ubuntu ${SCRIPTS_DIR}/healthcheck.sh >> ${HEALTH_LOG} 2>&1
EOF

sudo chmod 644 "${CRON_FILE}"
sudo systemctl reload cron 2>/dev/null || sudo service cron reload 2>/dev/null || true

echo "✅ cron installed at ${CRON_FILE}"
echo "   logs: ${BACKUP_LOG}, ${HEALTH_LOG}"
echo
echo "Текущие задания:"
sudo cat "${CRON_FILE}" | grep -vE '^#|^$|^SHELL|^PATH|^TZ'
