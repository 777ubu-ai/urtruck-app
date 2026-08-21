#!/usr/bin/env bash
# One-shot, read-only DNS diagnostic. Never mutates system state, never fails
# the deploy (caller should treat its exit code as informational only).
#
# Context: remote_bootstrap_secure_env.sh's Supabase bucket-sync curl has been
# failing with "Could not resolve host: <supabase-host>" on the production
# server across multiple consecutive deploys (2026-08-21, P0 voice/document
# upload investigation). This script narrows down WHERE resolution breaks:
# system resolver vs. a direct external resolver, and whether it's specific
# to the Supabase host or every external host.
set -uo pipefail

HOST="${1:?usage: dns_diagnose.sh <hostname>}"

echo "=== /etc/resolv.conf ==="
cat /etc/resolv.conf 2>&1 || echo "(unreadable)"

echo ""
echo "=== systemd-resolved status (if present) ==="
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active systemd-resolved 2>&1 || true
fi

echo ""
echo "=== getent ahosts $HOST (system resolver) ==="
getent ahosts "$HOST" 2>&1 || echo "FAILED"

echo ""
echo "=== python3 socket.getaddrinfo($HOST) (same resolver path httpx uses) ==="
python3 - "$HOST" <<'PY' 2>&1 || echo "FAILED"
import socket, sys
host = sys.argv[1]
print(socket.getaddrinfo(host, 443))
PY

echo ""
echo "=== control: does a DIFFERENT external host resolve? (api.mobizon.kz) ==="
getent ahosts api.mobizon.kz 2>&1 || echo "FAILED"

echo ""
echo "=== control: does github.com resolve? ==="
getent ahosts github.com 2>&1 || echo "FAILED"

echo ""
echo "=== direct query to 8.8.8.8, bypassing the system resolver entirely ==="
if command -v dig >/dev/null 2>&1; then
  dig +short +time=5 +tries=1 "$HOST" @8.8.8.8 2>&1 || echo "FAILED"
elif command -v nslookup >/dev/null 2>&1; then
  nslookup "$HOST" 8.8.8.8 2>&1 || echo "FAILED"
else
  echo "(no dig/nslookup available)"
fi

echo ""
echo "=== outbound UDP/53 reachability to 8.8.8.8 (nc, 3s timeout) ==="
if command -v nc >/dev/null 2>&1; then
  timeout 3 nc -zvu 8.8.8.8 53 2>&1 || echo "FAILED_OR_FILTERED"
else
  echo "(no nc available)"
fi

echo "DNS_DIAGNOSE_DONE"
