#!/usr/bin/env bash
# Устанавливает FILE_SIGNING_KEY в backend .env НА СЕРВЕРЕ, идемпотентно.
# Значение генерируется здесь и НИКОГДА не печатается. Аргумент: $1 = BACKEND_DIR.
# Гарантии: ровно 1 строка FILE_SIGNING_KEY (дедуп пустой/дубля), backup с
# сохранением прав, атомарный mv, trap-очистка temp, count-проверка.
set -euo pipefail
BACKEND_DIR="${1:?BACKEND_DIR required}"
ENVF="$BACKEND_DIR/.env"
mkdir -p "$(dirname "$ENVF")"
if [ ! -f "$ENVF" ]; then umask 077; : > "$ENVF"; fi

if grep -qE '^FILE_SIGNING_KEY=.+' "$ENVF"; then
  echo "FILE_SIGNING_KEY present (non-empty) — no change (не инвалидируем signed-URL)"
else
  KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
  umask 077
  cp -p "$ENVF" "$ENVF.bak.$(date +%s)"           # -p сохраняет права (не world-readable)
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT                          # temp с секретом не остаётся при fail
  grep -vE '^FILE_SIGNING_KEY=' "$ENVF" > "$tmp" || true  # выкинуть любую (в т.ч. пустую) старую строку
  printf 'FILE_SIGNING_KEY=%s\n' "$KEY" >> "$tmp"
  chmod --reference="$ENVF" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$ENVF"                                 # атомарно
  trap - EXIT
  unset KEY
  echo "FILE_SIGNING_KEY set (value not printed)"
fi

CNT=$(grep -cE '^FILE_SIGNING_KEY=' "$ENVF" || true)
echo "FILE_SIGNING_KEY_COUNT=$CNT"
[ "$CNT" = "1" ] || { echo "ERROR: ожидалась ровно 1 строка FILE_SIGNING_KEY, найдено $CNT"; exit 1; }
