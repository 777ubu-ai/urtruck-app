#!/usr/bin/env bash
# Verify FILE_SIGNING_KEY present + signing smoke НА СЕРВЕРЕ. Секрет не печатается.
# $1 = BACKEND_DIR. scripts/signing_smoke.py должен быть уже scp'шнут в /tmp.
set -euo pipefail
BACKEND_DIR="${1:?BACKEND_DIR required}"
SMOKE=/tmp/urtruck_signing_smoke.py
trap 'rm -f "$SMOKE"' EXIT                          # smoke-файл не остаётся даже при fail
ENVF="$BACKEND_DIR/.env"
if grep -qE '^FILE_SIGNING_KEY=.+' "$ENVF"; then
  echo "FILE_SIGNING_KEY_PRESENT=yes"
else
  echo "FILE_SIGNING_KEY_PRESENT=no"; exit 1
fi
export FILE_SIGNING_KEY="$(grep -E '^FILE_SIGNING_KEY=' "$ENVF" | head -1 | cut -d= -f2-)"
cd "$BACKEND_DIR"
python3 "$SMOKE"
