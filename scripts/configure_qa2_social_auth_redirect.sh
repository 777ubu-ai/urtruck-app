#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_REF="${SUPABASE_PROJECT_REF:-pymddxenwtjcbmrafvnc}"
MODE="${QA2_AUTH_MODE:-inspect}"
QA2_REDIRECT="https://qa2.urtruck.kz/?social_auth=1"
PRODUCTION_REDIRECT="https://urtruck.kz/?social_auth=1"
MOBILE_REDIRECT="urtruck://auth-social"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo 'ERROR: SUPABASE_ACCESS_TOKEN is required' >&2
  exit 1
fi
case "$MODE" in
  inspect|apply) ;;
  *) echo "ERROR: unsupported QA2_AUTH_MODE=${MODE}" >&2; exit 2 ;;
esac

api="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
headers=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H 'Content-Type: application/json')
current="$(mktemp)"
updated="$(mktemp)"
payload="$(mktemp)"
cleanup() { rm -f "$current" "$updated" "$payload"; }
trap cleanup EXIT INT TERM

curl -fsS "${headers[@]}" "$api" > "$current"
existing="$(jq -r '.uri_allow_list // ""' "$current")"

python3 - "$existing" "$PRODUCTION_REDIRECT" "$MOBILE_REDIRECT" <<'PY'
import sys
items = [p.strip() for p in sys.argv[1].split(',') if p.strip()]
required = sys.argv[2:]
missing = [item for item in required if item not in items]
if missing:
    raise SystemExit('QA2_AUTH_PRESERVATION_PRECHECK_FAILED:' + ','.join(missing))
print('QA2_AUTH_EXISTING_ALLOW_LIST=' + ','.join(items))
print('QA2_AUTH_PRODUCTION_PRESERVED=true')
print('QA2_AUTH_MOBILE_PRESERVED=true')
PY

if [[ "$MODE" == inspect ]]; then
  if python3 - "$existing" "$QA2_REDIRECT" <<'PY'
import sys
raise SystemExit(0 if sys.argv[2] in [p.strip() for p in sys.argv[1].split(',') if p.strip()] else 1)
PY
  then
    echo 'QA2_AUTH_REDIRECT=present'
  else
    echo 'QA2_AUTH_REDIRECT=missing'
  fi
  exit 0
fi

merged="$(python3 - "$existing" "$QA2_REDIRECT" <<'PY'
import sys
items = [p.strip() for p in sys.argv[1].split(',') if p.strip()]
if sys.argv[2] not in items:
    items.append(sys.argv[2])
print(','.join(items))
PY
)"

# The apply path changes only uri_allow_list. It never rewrites site_url,
# provider credentials, or any other Supabase Auth setting.
jq -n --arg allow "$merged" '{uri_allow_list: $allow}' > "$payload"
curl -fsS -X PATCH "${headers[@]}" --data-binary @"$payload" "$api" > "$updated"

python3 - "$existing" "$(jq -r '.uri_allow_list // ""' "$updated")" "$QA2_REDIRECT" <<'PY'
import sys
before = [p.strip() for p in sys.argv[1].split(',') if p.strip()]
after = [p.strip() for p in sys.argv[2].split(',') if p.strip()]
qa2 = sys.argv[3]
if any(item not in after for item in before):
    raise SystemExit('QA2_AUTH_EXISTING_REDIRECT_REMOVED')
if qa2 not in after:
    raise SystemExit('QA2_AUTH_REDIRECT_NOT_PERSISTED')
print('QA2_AUTH_REDIRECT=added')
print('QA2_AUTH_EXISTING_REDIRECTS_PRESERVED=true')
print('QA2_AUTH_CHANGED_SETTING=uri_allow_list_only')
PY

if [[ -n "${SUPABASE_ANON_KEY:-}" ]]; then
  base="https://${PROJECT_REF}.supabase.co/auth/v1/authorize"
  headers_out="$(curl -sS -o /dev/null -D - -H "apikey: ${SUPABASE_ANON_KEY}" \
    "${base}?provider=google&redirect_to=https%3A%2F%2Fqa2.urtruck.kz%2F%3Fsocial_auth%3D1")"
  if ! printf '%s\n' "$headers_out" | grep -qi '^location:.*accounts.google.com'; then
    echo 'ERROR: Google authorize endpoint did not redirect to Google' >&2
    exit 1
  fi
  echo 'QA2_AUTH_GOOGLE_AUTHORIZE=redirects-to-google'
  echo 'QA2_AUTH_GOOGLE_REDIRECT_TO=qa2'
fi
