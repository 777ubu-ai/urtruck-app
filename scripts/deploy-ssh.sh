#!/usr/bin/env bash
# Centralized SSH/SCP transport for UrTruck deploy/admin workflows.
#
# Preferred mode:
#   SERVER_SSH_KEY + SERVER_SSH_KNOWN_HOSTS
#   - private key is written to a 0600 runner temp file
#   - host key MUST be supplied out-of-band and is pinned
#   - StrictHostKeyChecking=yes
#
# Legacy compatibility mode:
#   SERVER_PASS only
#   - retained temporarily for repositories/servers that have not completed
#     the key migration yet
#   - never selected when SERVER_SSH_KEY is present
#
# SECURITY: key mode deliberately does NOT run ssh-keyscan at deploy time.
# A host key learned over the same untrusted network would not be a pin and
# would not protect against MITM. Obtain/verify the fingerprint independently
# and store the resulting known_hosts line in SERVER_SSH_KNOWN_HOSTS.
set -euo pipefail

: "${SERVER_HOST:?SERVER_HOST required}"
: "${SERVER_USER:?SERVER_USER required}"

_tmp="${RUNNER_TEMP:-/tmp}"
_keyfile="$_tmp/urtruck_deploy_key_${GITHUB_RUN_ID:-$$}"
_known="$_tmp/urtruck_known_hosts_${GITHUB_RUN_ID:-$$}"

cleanup() {
  rm -f "$_keyfile" "$_known"
}
trap cleanup EXIT INT TERM

if [ -n "${SERVER_SSH_KEY:-}" ]; then
  MODE=key
  : "${SERVER_SSH_KNOWN_HOSTS:?SERVER_SSH_KNOWN_HOSTS required when SERVER_SSH_KEY is set}"

  if [ "${DRY_RUN:-0}" != "1" ]; then
    umask 077
    printf '%s\n' "$SERVER_SSH_KEY" > "$_keyfile"
    printf '%s\n' "$SERVER_SSH_KNOWN_HOSTS" > "$_known"
    chmod 600 "$_keyfile" "$_known"
    test -s "$_keyfile"
    test -s "$_known"
  fi

  SSH_AUTH=(ssh -i "$_keyfile" -o IdentitiesOnly=yes -o "UserKnownHostsFile=$_known" -o StrictHostKeyChecking=yes)
  SCP_AUTH=(scp -i "$_keyfile" -o IdentitiesOnly=yes -o "UserKnownHostsFile=$_known" -o StrictHostKeyChecking=yes)
else
  MODE=pass
  : "${SERVER_PASS:?SERVER_PASS required when SERVER_SSH_KEY is not configured}"
  SSH_AUTH=(sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no)
  SCP_AUTH=(sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no)
fi

sub="${1:?subcommand required: ssh|scp}"
shift || true

if [ "${DRY_RUN:-0}" = "1" ]; then
  # Never print secret material in dry-run output.
  printf 'MODE=%s SUBCOMMAND=%s HOST=%s@%s\n' "$MODE" "$sub" "$SERVER_USER" "$SERVER_HOST"
  exit 0
fi

case "$sub" in
  ssh)
    set +e
    "${SSH_AUTH[@]}" "$SERVER_USER@$SERVER_HOST" "$@"
    rc=$?
    set -e
    exit "$rc"
    ;;
  scp)
    set +e
    "${SCP_AUTH[@]}" "$@"
    rc=$?
    set -e
    exit "$rc"
    ;;
  *)
    echo "unknown subcommand: $sub (expected ssh|scp)" >&2
    exit 2
    ;;
esac
