#!/usr/bin/env bash
# Bootstrap production backend environment without printing secret values.
# Usage: remote_bootstrap_secure_env.sh BACKEND_DIR [REMOTE_BOOTSTRAP_FILE]
set -euo pipefail
umask 077

BACKEND_DIR="${1:?BACKEND_DIR required}"
REMOTE_BOOTSTRAP="${2:-}"
ENV_FILE="$BACKEND_DIR/.env"

test -f "$ENV_FILE" || { echo 'ERROR: backend .env is missing'; exit 1; }

cleanup() {
  [ -z "$REMOTE_BOOTSTRAP" ] || rm -f "$REMOTE_BOOTSTRAP"
  [ -z "${tmp:-}" ] || rm -f "$tmp"
}
trap cleanup EXIT INT TERM

get_env() {
  local key="$1" file="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

set_env() {
  local key="$1" value="$2"
  test -n "$value" || return 0
  tmp="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  awk -v key="$key" 'index($0, key "=") != 1 { print }' "$ENV_FILE" > "$tmp"
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  tmp=""
}

current_service="$(get_env SUPABASE_SERVICE_KEY "$ENV_FILE")"
if [ -z "$current_service" ]; then
  legacy_service="$(get_env SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE")"
  [ -n "$legacy_service" ] || legacy_service="$(get_env SUPABASE_KEY "$ENV_FILE")"
  incoming_service=""
  if [ -n "$REMOTE_BOOTSTRAP" ] && [ -f "$REMOTE_BOOTSTRAP" ]; then
    incoming_service="$(get_env SUPABASE_SERVICE_KEY "$REMOTE_BOOTSTRAP")"
  fi
  set_env SUPABASE_SERVICE_KEY "${legacy_service:-$incoming_service}"
fi

# Yandex Router is the authoritative KZ/RU/CIS road router. It must remain
# server-only. Deploy may rotate it through a temporary 0600 bootstrap file;
# otherwise an already provisioned production value is preserved.
incoming_yandex_router=""
incoming_global_router=""
if [ -n "$REMOTE_BOOTSTRAP" ] && [ -f "$REMOTE_BOOTSTRAP" ]; then
  incoming_yandex_router="$(get_env YANDEX_ROUTER_API_KEY "$REMOTE_BOOTSTRAP")"
  incoming_global_router="$(get_env OPENROUTESERVICE_API_KEY "$REMOTE_BOOTSTRAP")"
fi
[ -z "$incoming_yandex_router" ] || set_env YANDEX_ROUTER_API_KEY "$incoming_yandex_router"
# China/global fallback is optional; never erase an existing server value.
[ -z "$incoming_global_router" ] || set_env OPENROUTESERVICE_API_KEY "$incoming_global_router"

[ -n "$(get_env SUPABASE_URL "$ENV_FILE")" ] || set_env SUPABASE_URL 'https://hchmnocoxjvtgdamcmmi.supabase.co'
set_env STORAGE_PROVIDER 'supabase'
[ -n "$(get_env SUPABASE_BUCKET "$ENV_FILE")" ] || set_env SUPABASE_BUCKET 'urtruck-docs'

file_key="$(get_env FILE_SIGNING_KEY "$ENV_FILE")"
[ "$(printf %s "$file_key" | wc -c)" -ge 32 ] || set_env FILE_SIGNING_KEY "$(openssl rand -hex 32)"
[ -n "$(get_env QA_AGENT_TOKEN "$ENV_FILE")" ] || set_env QA_AGENT_TOKEN "$(openssl rand -hex 32)"
unset file_key current_service legacy_service incoming_service incoming_yandex_router incoming_global_router

# Fail closed before backend restart. KZ/RU road routing is a release-critical
# feature, therefore production must have a Yandex Router API key.
test -n "$(get_env SUPABASE_SERVICE_KEY "$ENV_FILE")" || { echo 'ERROR: SUPABASE_SERVICE_KEY missing'; exit 1; }
test -n "$(get_env SUPABASE_URL "$ENV_FILE")" || { echo 'ERROR: SUPABASE_URL missing'; exit 1; }
test -n "$(get_env SUPABASE_BUCKET "$ENV_FILE")" || { echo 'ERROR: SUPABASE_BUCKET missing'; exit 1; }
test -n "$(get_env YANDEX_ROUTER_API_KEY "$ENV_FILE")" || { echo 'ERROR: YANDEX_ROUTER_API_KEY missing'; exit 1; }
[ "$(printf %s "$(get_env FILE_SIGNING_KEY "$ENV_FILE")" | wc -c)" -ge 32 ] || { echo 'ERROR: FILE_SIGNING_KEY invalid'; exit 1; }

cnt="$(grep -cE '^FILE_SIGNING_KEY=' "$ENV_FILE" || true)"
[ "$cnt" = "1" ] || { echo "ERROR: FILE_SIGNING_KEY_COUNT=$cnt"; exit 1; }
yandex_cnt="$(grep -cE '^YANDEX_ROUTER_API_KEY=' "$ENV_FILE" || true)"
[ "$yandex_cnt" = "1" ] || { echo "ERROR: YANDEX_ROUTER_API_KEY_COUNT=$yandex_cnt"; exit 1; }
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo 'SECURE_ENV=ready'
echo 'STORAGE_PROVIDER=supabase'
echo 'FILE_SIGNING_KEY_PRESENT=yes'
echo 'YANDEX_ROUTER_KEY_PRESENT=yes'
if [ -n "$(get_env OPENROUTESERVICE_API_KEY "$ENV_FILE")" ]; then
  echo 'GLOBAL_ROUTING_FALLBACK_PRESENT=yes'
else
  echo 'GLOBAL_ROUTING_FALLBACK_PRESENT=no'
fi
