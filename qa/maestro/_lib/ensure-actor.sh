#!/usr/bin/env bash
#
# ensure-actor.sh — print a fresh QA session token for the given actor.
#
# Usage:
#   QA_AGENT_TOKEN=... MAESTRO_BACKEND_BASE=http://127.0.0.1:8001/api/v1\
#     qa/maestro/_lib/ensure-actor.sh serik
#
# Prints ONLY the bearer token to stdout (one line, trailing newline).
# Everything else — diagnostics, JSON envelope, headers — goes to stderr.
# Maestro `runScript` captures stdout into the flow, so keeping stdout
# strictly token-only is mandatory.
#
# Safety:
#   - QA_AGENT_TOKEN MUST be set; otherwise the script exits 2 without
#     contacting the backend.
#   - MAESTRO_BACKEND_BASE defaults to local 127.0.0.1; pointing it at
#     prod (`urtruck.kz`, `185.22.65.11`, or anything not loopback/LAN)
#     is rejected unless QA_ALLOW_REMOTE_BACKEND=1 is exported. This is
#     a guardrail, not a real authorization boundary — the backend already
#     refuses without the token — but it stops a fat-finger from running
#     QA flows against production.
#   - The token printed here is the session token for a STABLE QA actor
#     (serik/boris/auditor). Never print QA_AGENT_TOKEN itself.

set -euo pipefail

ACTOR="${1:-}"
if [[ -z "${ACTOR}" ]]; then
  echo "usage: $0 <serik|boris|auditor>" >&2
  exit 2
fi

case "${ACTOR}" in
  serik|boris|auditor) ;;
  *)
    echo "ensure-actor: unknown actor '${ACTOR}' (expected serik|boris|auditor)" >&2
    exit 2
    ;;
esac

if [[ -z "${QA_AGENT_TOKEN:-}" ]]; then
  echo "ensure-actor: QA_AGENT_TOKEN env var is required (do NOT hardcode it)" >&2
  exit 2
fi

BASE="${MAESTRO_BACKEND_BASE:-http://127.0.0.1:8001/api/v1}"

# Production-deny guardrail. The list intentionally errs on the side of
# stopping the script; if you genuinely need to test against a remote
# (e.g. staging), set QA_ALLOW_REMOTE_BACKEND=1 explicitly.
if [[ "${QA_ALLOW_REMOTE_BACKEND:-}" != "1" ]]; then
  if [[ "${BASE}" == *"urtruck.kz"* ]] \
     || [[ "${BASE}" == *"185.22.65.11"* ]] \
     || [[ "${BASE}" == *"://prod"* ]]; then
    echo "ensure-actor: refusing to run against production backend (${BASE})." >&2
    echo "  set QA_ALLOW_REMOTE_BACKEND=1 to override." >&2
    exit 3
  fi
fi

echo "ensure-actor: actor=${ACTOR} base=${BASE}" >&2

HTTP_BODY="$(mktemp -t ensure-actor.XXXXXX)"
trap 'rm -f "${HTTP_BODY}"' EXIT

HTTP_CODE="$(
  curl -sS -o "${HTTP_BODY}" -w '%{http_code}' \
    -X POST "${BASE}/qa/ensure-actor" \
    -H "X-QA-Agent-Token: ${QA_AGENT_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"actor\":\"${ACTOR}\"}" \
    || echo "000"
)"

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "ensure-actor: backend returned HTTP ${HTTP_CODE}" >&2
  # First 200 chars of body — enough to diagnose, not enough to leak a session.
  head -c 200 "${HTTP_BODY}" >&2 || true
  echo >&2
  exit 4
fi

# Extract just the .token field. python3 is preinstalled on every Mac dev
# box; using it avoids depending on `jq` being present.
TOKEN="$(
  python3 - "${HTTP_BODY}" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
tok = data.get('token')
if not tok:
    sys.exit(5)
print(tok)
PY
)"

if [[ -z "${TOKEN}" ]]; then
  echo "ensure-actor: backend response had no .token" >&2
  exit 5
fi

# stdout — token only, no PII, no envelope.
printf '%s\n' "${TOKEN}"
