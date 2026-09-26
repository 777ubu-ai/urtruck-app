#!/usr/bin/env bash
# Configure the existing ORS credential on isolated QA2 only.
set -euo pipefail
set +x

: "${SERVER_HOST:?SERVER_HOST is required}"
: "${SERVER_USER:?SERVER_USER is required}"
: "${SERVER_PASS:?SERVER_PASS is required}"
: "${OPENROUTESERVICE_API_KEY:?OPENROUTESERVICE_API_KEY is required}"
: "${QA_API_URL:?QA_API_URL is required}"

export SSHPASS="$SERVER_PASS"
qa_root=/home/ubuntu/urtruck-qa2
state=/tmp/urtruck-qa2-routing.state
key_file="/tmp/urtruck-qa2-ors-${GITHUB_RUN_ID:-manual}"

# Prevent a stale state file from making a future precondition failure restore
# an unrelated older backup.
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "rm -f '$state' '$key_file'"

before_prod="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
qa_before="$(curl -fsS --max-time 20 "${QA_API_URL%/}/api/v1/system/info")"
python3 - "$qa_before" <<'PY'
import json, sys
if json.loads(sys.argv[1]).get('routing', {}).get('provider') != 'none':
    raise SystemExit('QA2_ROUTING_PRECONDITION_NOT_NONE')
PY

# The secret is sent through SSH stdin and is never interpolated into a command.
printf '%s\n' "$OPENROUTESERVICE_API_KEY" |
  sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" \
  "umask 077; cat > '$key_file'"

sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" 'bash -s' -- "$key_file" "$state" <<'REMOTE'
set -euo pipefail
key_file="$1"
state="$2"
qa_root=/home/ubuntu/urtruck-qa2
qa_backend="$qa_root/backend"
env_file="$qa_root/.env"
test -f "$env_file" -a -x "$qa_backend/venv/bin/python"
test "$(id -un)" = ubuntu

listener_pid() {
  ss -ltnpH 'sport = :8002' 2>/dev/null |
    sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1
}

backup_dir="$qa_root/backups/routing-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
cp -- "$env_file" "$backup_dir/qa2.env"
chmod 600 "$backup_dir/qa2.env"
cat > "$state" <<STATE
BACKUP_DIR=$backup_dir
ENV_FILE=$env_file
STATE
chmod 600 "$state"

python3 - "$env_file" "$key_file" <<'PY'
from pathlib import Path
import os, stat, sys
env_path, key_path = map(Path, sys.argv[1:])
values = {}
for raw in env_path.read_text(encoding='utf-8').splitlines():
    if '=' in raw and not raw.lstrip().startswith('#'):
        k, v = raw.split('=', 1); values[k.strip()] = v.strip().strip('"').strip("'")
if values.get('TRANSCRIBE_PROVIDER') != 'local_ai' or values.get('TRANSLATE_PROVIDER') != 'local_ai':
    raise SystemExit('QA2_LOCAL_AI_PROVIDER_PRECONDITION_FAILED')
if values.get('LOCAL_AI_URL') != 'http://127.0.0.1:8003':
    raise SystemExit('QA2_LOCAL_AI_URL_PRECONDITION_FAILED')
key = key_path.read_text(encoding='utf-8').strip()
if not key: raise SystemExit('QA2_ORS_KEY_EMPTY')
lines = [x for x in env_path.read_text(encoding='utf-8').splitlines() if not x.startswith('OPENROUTESERVICE_API_KEY=')]
tmp = env_path.with_name(f'.{env_path.name}.routing-{os.getpid()}')
tmp.write_text('\n'.join(lines + [f'OPENROUTESERVICE_API_KEY={key}']) + '\n', encoding='utf-8')
os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
os.replace(tmp, env_path)
PY
rm -f "$key_file"

old_pid="$(listener_pid)"
test -n "$old_pid"
old_cmd="$(tr '\0' ' ' < "/proc/$old_pid/cmdline")"
printf '%s' "$old_cmd" | grep -Eq 'uvicorn|gunicorn'
printf '%s' "$old_cmd" | grep -Fq 'main:app'
test "$(ps -o user= -p "$old_pid" | xargs)" = ubuntu
test "$(readlink -f "/proc/$old_pid/cwd")" = "$(readlink -f "$qa_backend")"
kill -TERM "$old_pid" || true
for _ in {1..20}; do kill -0 "$old_pid" 2>/dev/null || break; sleep 0.5; done
kill -0 "$old_pid" 2>/dev/null && kill -KILL "$old_pid" || true
cd "$qa_backend"
nohup venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8002 > uvicorn.log 2>&1 </dev/null &
for _ in {1..40}; do curl -fsS http://127.0.0.1:8002/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8002/health >/dev/null
info="$(curl -fsS http://127.0.0.1:8002/api/v1/system/info)"
printf '%s' "$info" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["routing"]["provider"] == "openrouteservice"'
ai="$(curl -fsS http://127.0.0.1:8002/api/v1/chat/translate/info)"
printf '%s' "$ai" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("provider") == "local_ai"'
echo "QA2_ROUTING_BACKUP=$backup_dir"
echo 'QA2_ROUTING=healthy-openrouteservice'
echo 'QA2_LOCAL_AI=preserved'
REMOTE

after_prod="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
test "$after_prod" = "$before_prod"
after_info="$(curl -fsS --max-time 20 "${QA_API_URL%/}/api/v1/system/info")"
printf '%s' "$after_info" | python3 -c 'import json,sys; assert json.load(sys.stdin)["routing"]["provider"] == "openrouteservice"'
echo 'PRODUCTION_AFTER=healthy-unchanged'
echo 'QA2_ROUTING_EXTERNAL=provider-visible'
