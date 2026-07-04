#!/usr/bin/env bash
# Установка SSL Let's Encrypt для biz-chat.net.
# Запускать когда DNS A-запись biz-chat.net → 185.22.65.11 пропагировалась.
# Проверка: dig +short biz-chat.net A должен вернуть 185.22.65.11
set -euo pipefail

DOMAIN="biz-chat.net"
EMAIL="noreply@bizchat.local"
IP="185.22.65.11"

echo "==> Checking DNS propagation for $DOMAIN..."
RESOLVED=$(dig +short "$DOMAIN" A 2>/dev/null | head -1)
if [ "$RESOLVED" != "$IP" ]; then
  echo "ERROR: $DOMAIN resolves to '$RESOLVED' (expected $IP)"
  echo "DNS не пропагировался. Добавьте A-запись в панели хостера:"
  echo "  $DOMAIN → $IP"
  echo "  www.$DOMAIN → $IP"
  echo "Попробуйте снова через 15-30 минут."
  exit 1
fi
echo "DNS OK: $DOMAIN → $RESOLVED"

echo "==> Running certbot..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> Verifying HTTPS..."
curl -sI "https://$DOMAIN/health" | head -5

echo "✅ SSL installed for $DOMAIN"
