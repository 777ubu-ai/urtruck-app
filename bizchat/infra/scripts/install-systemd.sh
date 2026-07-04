#!/usr/bin/env bash
# Установка systemd unit для auto-start docker compose стека на VPS.
# После выполнения: bizchat-stack.service автоматически поднимается при
# перезагрузке VPS, остаётся в restart: unless-stopped как раньше.
set -euo pipefail

UNIT_PATH="/etc/systemd/system/bizchat-stack.service"

sudo cp /home/ubuntu/bizchat/infra/scripts/bizchat-stack.service "$UNIT_PATH"
sudo chmod 644 "$UNIT_PATH"

sudo systemctl daemon-reload
sudo systemctl enable bizchat-stack.service
echo "✅ bizchat-stack.service enabled"

sudo systemctl status bizchat-stack.service --no-pager 2>&1 | head -8 || true
