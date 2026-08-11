#!/usr/bin/env bash
# STEP 4 (08.08.2026): централизованный резолвер SSH-аутентификации деплоя.
#
# Убирает разбросанную по deploy.yml зависимость от sshpass/SERVER_PASS/
# StrictHostKeyChecking=no в ОДНО место и делает переход на dedicated deploy
# key opt-in БЕЗ риска сломать прод:
#   * если задан секрет SERVER_SSH_KEY → key-режим с ПИННИНГОМ host-key
#     (known_hosts из SERVER_SSH_KNOWN_HOSTS, иначе ssh-keyscan), StrictHostKeyChecking=yes;
#   * если SERVER_SSH_KEY пуст → FALLBACK на текущий sshpass-путь БАЙТ-В-БАЙТ
#     (поведение сегодня не меняется, пока владелец не заведёт ключ).
#
# Секреты нигде не печатаются. Проверка построения команд без сервера:
#   DRY_RUN=1 SERVER_HOST=h SERVER_USER=u SERVER_PASS=p scripts/deploy-ssh.sh ssh "echo hi"
#   DRY_RUN=1 SERVER_HOST=h SERVER_USER=u SERVER_SSH_KEY=k scripts/deploy-ssh.sh ssh "echo hi"
#
# Использование:
#   scripts/deploy-ssh.sh ssh "<remote command>"
#   scripts/deploy-ssh.sh scp <scp-args...>     # напр. -r dist/* user@host:/path
set -euo pipefail

: "${SERVER_HOST:?SERVER_HOST required}"
: "${SERVER_USER:?SERVER_USER required}"

_tmp="${RUNNER_TEMP:-/tmp}"
_keyfile="$_tmp/urtruck_deploy_key"
_known="$_tmp/urtruck_known_hosts"

if [ -n "${SERVER_SSH_KEY:-}" ]; then
  MODE=key
  if [ "${DRY_RUN:-0}" != "1" ] && [ ! -f "$_keyfile" ]; then
    umask 077
    printf '%s\n' "$SERVER_SSH_KEY" > "$_keyfile"
    chmod 600 "$_keyfile"
    if [ -n "${SERVER_SSH_KNOWN_HOSTS:-}" ]; then
      printf '%s\n' "$SERVER_SSH_KNOWN_HOSTS" > "$_known"
    else
      ssh-keyscan -H "$SERVER_HOST" > "$_known" 2>/dev/null || true
    fi
  fi
  SSH_AUTH=(ssh -i "$_keyfile" -o "UserKnownHostsFile=$_known" -o StrictHostKeyChecking=yes)
  SCP_AUTH=(scp -i "$_keyfile" -o "UserKnownHostsFile=$_known" -o StrictHostKeyChecking=yes)
else
  MODE=pass
  : "${SERVER_PASS:?SERVER_PASS required in password mode}"
  # ВАЖНО: строка ниже воспроизводит текущий deploy.yml байт-в-байт.
  SSH_AUTH=(sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no)
  SCP_AUTH=(sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no)
fi

sub="${1:?subcommand required: ssh|scp}"; shift || true

case "$sub" in
  ssh)
    if [ "${DRY_RUN:-0}" = "1" ]; then
      printf 'MODE=%s\n' "$MODE"
      printf '%q ' "${SSH_AUTH[@]}" "$SERVER_USER@$SERVER_HOST" "$@"; echo
      exit 0
    fi
    exec "${SSH_AUTH[@]}" "$SERVER_USER@$SERVER_HOST" "$@"
    ;;
  scp)
    if [ "${DRY_RUN:-0}" = "1" ]; then
      printf 'MODE=%s\n' "$MODE"
      printf '%q ' "${SCP_AUTH[@]}" "$@"; echo
      exit 0
    fi
    exec "${SCP_AUTH[@]}" "$@"
    ;;
  *)
    echo "unknown subcommand: $sub (expected ssh|scp)" >&2
    exit 2
    ;;
esac
