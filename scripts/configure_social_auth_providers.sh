#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_REF="${SUPABASE_PROJECT_REF:-pymddxenwtjcbmrafvnc}"
SITE_URL="${URTRUCK_SITE_URL:-https://urtruck.kz}"
WEB_REDIRECT="${URTRUCK_WEB_SOCIAL_REDIRECT:-https://urtruck.kz/?social_auth=1}"
NATIVE_REDIRECT="${URTRUCK_NATIVE_SOCIAL_REDIRECT:-urtruck://auth-social}"

required=(
  SUPABASE_ACCESS_TOKEN
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  APPLE_SERVICES_ID
  APPLE_CLIENT_SECRET
)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "ERROR: required secret ${key} is missing" >&2
    exit 1
  fi
done

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  for key in "${required[@]}"; do
    echo "::add-mask::${!key}"
  done
fi

api="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
headers=(
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"
  -H "Content-Type: application/json"
)

tmp_current="$(mktemp)"
tmp_payload="$(mktemp)"
tmp_updated="$(mktemp)"
cleanup() {
  rm -f "$tmp_current" "$tmp_payload" "$tmp_updated"
}
trap cleanup EXIT INT TERM

curl -fsS "${headers[@]}" "$api" > "$tmp_current"

existing_allow="$(jq -r '.uri_allow_list // ""' "$tmp_current")"
merged_allow="$(python3 - "$existing_allow" "$WEB_REDIRECT" "$NATIVE_REDIRECT" <<'PY'
import sys
items = []
for raw in sys.argv[1:]:
    for part in raw.split(','):
        part = part.strip()
        if part and part not in items:
            items.append(part)
print(','.join(items))
PY
)"

jq -n \
  --arg site "$SITE_URL" \
  --arg allow "$merged_allow" \
  --arg google_id "$GOOGLE_OAUTH_CLIENT_ID" \
  --arg google_secret "$GOOGLE_OAUTH_CLIENT_SECRET" \
  --arg apple_id "$APPLE_SERVICES_ID" \
  --arg apple_secret "$APPLE_CLIENT_SECRET" \
  '{
    site_url: $site,
    uri_allow_list: $allow,
    external_google_enabled: true,
    external_google_client_id: $google_id,
    external_google_secret: $google_secret,
    external_google_skip_nonce_check: false,
    external_apple_enabled: true,
    external_apple_client_id: $apple_id,
    external_apple_secret: $apple_secret
  }' > "$tmp_payload"

curl -fsS -X PATCH "${headers[@]}" --data-binary @"$tmp_payload" "$api" > "$tmp_updated"

jq -e '.external_google_enabled == true' "$tmp_updated" >/dev/null
jq -e '.external_apple_enabled == true' "$tmp_updated" >/dev/null
jq -e --arg site "$SITE_URL" '.site_url == $site' "$tmp_updated" >/dev/null
jq -e --arg web "$WEB_REDIRECT" '.uri_allow_list | split(",") | index($web) != null' "$tmp_updated" >/dev/null
jq -e --arg native "$NATIVE_REDIRECT" '.uri_allow_list | split(",") | index($native) != null' "$tmp_updated" >/dev/null

printf 'SOCIAL_AUTH_CONFIG=ready\n'
printf 'SUPABASE_PROJECT_REF=%s\n' "$PROJECT_REF"
printf 'GOOGLE_PROVIDER=enabled\n'
printf 'APPLE_PROVIDER=enabled\n'
printf 'SITE_URL=%s\n' "$SITE_URL"
printf 'WEB_REDIRECT=%s\n' "$WEB_REDIRECT"
printf 'NATIVE_REDIRECT=%s\n' "$NATIVE_REDIRECT"
