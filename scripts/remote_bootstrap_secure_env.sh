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
legacy_service="$(get_env SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE")"
[ -n "$legacy_service" ] || legacy_service="$(get_env SUPABASE_KEY "$ENV_FILE")"
incoming_service=""
if [ -n "$REMOTE_BOOTSTRAP" ] && [ -f "$REMOTE_BOOTSTRAP" ]; then
  incoming_service="$(get_env SUPABASE_SERVICE_KEY "$REMOTE_BOOTSTRAP")"
fi
if [ -n "$incoming_service" ]; then
  set_env SUPABASE_SERVICE_KEY "$incoming_service"
elif [ -z "$current_service" ]; then
  set_env SUPABASE_SERVICE_KEY "$legacy_service"
fi

# Server-side route providers are optional enhancements for web/PWA because
# the embedded Yandex JS API 2.1 MultiRoute remains the real-road fallback.
# If a valid server key is supplied, preserve/rotate it. Never erase an
# already provisioned production key merely because a deploy omitted it.
incoming_yandex_router=""
incoming_global_router=""
if [ -n "$REMOTE_BOOTSTRAP" ] && [ -f "$REMOTE_BOOTSTRAP" ]; then
  incoming_yandex_router="$(get_env YANDEX_ROUTER_API_KEY "$REMOTE_BOOTSTRAP")"
  incoming_global_router="$(get_env OPENROUTESERVICE_API_KEY "$REMOTE_BOOTSTRAP")"
fi
[ -z "$incoming_yandex_router" ] || set_env YANDEX_ROUTER_API_KEY "$incoming_yandex_router"
[ -z "$incoming_global_router" ] || set_env OPENROUTESERVICE_API_KEY "$incoming_global_router"

# 2026-08-21 P0: hchmnocoxjvtgdamcmmi never resolves anywhere (confirmed
# from this server, the deploy runner, and an independent third network;
# it's not in this account's Supabase project list at all — the PRO
# project this ref pointed to apparently didn't survive). Force-correct a
# stale value left by earlier deploys, not just fill in when empty —
# otherwise a server whose .env already has the dead host would keep it
# forever under the old "only if missing" logic.
set_env SUPABASE_URL 'https://pymddxenwtjcbmrafvnc.supabase.co'
set_env STORAGE_PROVIDER 'supabase'
[ -n "$(get_env SUPABASE_BUCKET "$ENV_FILE")" ] || set_env SUPABASE_BUCKET 'urtruck-docs'

file_key="$(get_env FILE_SIGNING_KEY "$ENV_FILE")"
[ "$(printf %s "$file_key" | wc -c)" -ge 32 ] || set_env FILE_SIGNING_KEY "$(openssl rand -hex 32)"
[ -n "$(get_env QA_AGENT_TOKEN "$ENV_FILE")" ] || set_env QA_AGENT_TOKEN "$(openssl rand -hex 32)"
unset file_key current_service legacy_service incoming_service incoming_yandex_router incoming_global_router

# Fail closed only on secrets that are required to keep production/private
# storage safe. Routing provider absence must not freeze all frontend releases;
# web/PWA continues with Yandex JS API 2.1 MultiRoute.
test -n "$(get_env SUPABASE_SERVICE_KEY "$ENV_FILE")" || { echo 'ERROR: SUPABASE_SERVICE_KEY missing'; exit 1; }
test -n "$(get_env SUPABASE_URL "$ENV_FILE")" || { echo 'ERROR: SUPABASE_URL missing'; exit 1; }
test -n "$(get_env SUPABASE_BUCKET "$ENV_FILE")" || { echo 'ERROR: SUPABASE_BUCKET missing'; exit 1; }
[ "$(printf %s "$(get_env FILE_SIGNING_KEY "$ENV_FILE")" | wc -c)" -ge 32 ] || { echo 'ERROR: FILE_SIGNING_KEY invalid'; exit 1; }

cnt="$(grep -cE '^FILE_SIGNING_KEY=' "$ENV_FILE" || true)"
[ "$cnt" = "1" ] || { echo "ERROR: FILE_SIGNING_KEY_COUNT=$cnt"; exit 1; }
yandex_cnt="$(grep -cE '^YANDEX_ROUTER_API_KEY=' "$ENV_FILE" || true)"
[ "$yandex_cnt" -le 1 ] || { echo "ERROR: YANDEX_ROUTER_API_KEY_COUNT=$yandex_cnt"; exit 1; }
chmod 600 "$ENV_FILE" 2>/dev/null || true

# --- Best-effort cleanup of the (now obsolete) DNS-fallback /etc/hosts ---
# block a prior deploy attempt (commit 1fd0191, 2026-08-21) may have left
# behind on some server. That block pinned an IP for hchmnocoxjvtgdamcmmi.
# supabase.co, which turned out to be a stale/nonexistent project ref, not
# a DNS-resolver problem — SUPABASE_URL above is now force-corrected to
# the real live project instead, so a pinned IP for the dead host would
# just be inert. Never actually observed applied in production (every
# earlier run either skipped this or failed before reaching it), but strip
# it if present rather than leave dead state around.
if [ "$(id -u)" = "0" ] && grep -q '# BEGIN urtruck-supabase-dns-fallback' /etc/hosts 2>/dev/null; then
  hosts_tmp="$(mktemp)"
  awk '
    /^# BEGIN urtruck-supabase-dns-fallback/ {skip=1; next}
    /^# END urtruck-supabase-dns-fallback/ {skip=0; next}
    !skip {print}
  ' /etc/hosts > "$hosts_tmp"
  cp "$hosts_tmp" /etc/hosts
  rm -f "$hosts_tmp"
  echo "SUPABASE_DNS_FALLBACK=removed_obsolete"
fi

if command -v curl >/dev/null 2>&1; then
  supabase_url="$(get_env SUPABASE_URL "$ENV_FILE")"
  supabase_key="$(get_env SUPABASE_SERVICE_KEY "$ENV_FILE")"
  supabase_bucket="$(get_env SUPABASE_BUCKET "$ENV_FILE")"
  bucket_payload='{"public":false,"file_size_limit":10485760,"allowed_mime_types":["image/jpeg","image/png","application/pdf","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","text/comma-separated-values","application/csv","audio/webm","audio/mp4","audio/mpeg","audio/aac","audio/ogg","audio/wav"]}'
  bucket_code="$(curl -sS -o /tmp/urtruck_bucket_sync.out -w '%{http_code}' \
    -X PUT "$supabase_url/storage/v1/bucket/$supabase_bucket" \
    -H "Authorization: Bearer $supabase_key" \
    -H "apikey: $supabase_key" \
    -H "Content-Type: application/json" \
    --data "$bucket_payload" || true)"
  if [ "$bucket_code" = "404" ]; then
    bucket_code="$(curl -sS -o /tmp/urtruck_bucket_sync.out -w '%{http_code}' \
      -X POST "$supabase_url/storage/v1/bucket" \
      -H "Authorization: Bearer $supabase_key" \
      -H "apikey: $supabase_key" \
      -H "Content-Type: application/json" \
      --data "{\"id\":\"$supabase_bucket\",\"name\":\"$supabase_bucket\",${bucket_payload#\{}" || true)"
  fi
  if [ "$bucket_code" = "200" ] || [ "$bucket_code" = "201" ]; then
    echo 'SUPABASE_BUCKET_SYNC=ok'
  else
    echo "SUPABASE_BUCKET_SYNC=failed:$bucket_code"
  fi
  rm -f /tmp/urtruck_bucket_sync.out
  unset supabase_url supabase_key supabase_bucket bucket_payload bucket_code
fi

echo 'SECURE_ENV=ready'
echo 'STORAGE_PROVIDER=supabase'
echo 'FILE_SIGNING_KEY_PRESENT=yes'
if [ -n "$(get_env YANDEX_ROUTER_API_KEY "$ENV_FILE")" ]; then
  echo 'YANDEX_ROUTER_KEY_PRESENT=yes'
else
  echo 'YANDEX_ROUTER_KEY_PRESENT=no'
fi
if [ -n "$(get_env OPENROUTESERVICE_API_KEY "$ENV_FILE")" ]; then
  echo 'GLOBAL_ROUTING_FALLBACK_PRESENT=yes'
else
  echo 'GLOBAL_ROUTING_FALLBACK_PRESENT=no'
fi
