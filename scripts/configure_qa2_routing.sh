#!/usr/bin/env bash
# Configure the existing ORS credential on isolated QA2 only.
set -euo pipefail
set +x

: "${SERVER_HOST:?SERVER_HOST is required}"
: "${SERVER_USER:?SERVER_USER is required}"
: "${QA2_SSH_KEY:?QA2_SSH_KEY is required}"
: "${QA2_SSH_KNOWN_HOSTS:?QA2_SSH_KNOWN_HOSTS is required}"
: "${OPENROUTESERVICE_API_KEY:?OPENROUTESERVICE_API_KEY is required}"
: "${QA_API_URL:?QA_API_URL is required}"

state=/tmp/urtruck-qa2-routing.state
key_file="/tmp/urtruck-qa2-ors-${GITHUB_RUN_ID:-manual}"
ssh_cmd=(ssh -i "$QA2_SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$QA2_SSH_KNOWN_HOSTS")

# Prevent a stale state file from making a future precondition failure restore
# an unrelated older backup.
"${ssh_cmd[@]}" "$SERVER_USER@$SERVER_HOST" "rm -f '$state' '$key_file'"

before_prod="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
qa_before="$(curl -fsS --max-time 20 "${QA_API_URL%/}/api/v1/system/info")"
python3 - "$qa_before" <<'PY'
import json, sys
if json.loads(sys.argv[1]).get('routing', {}).get('provider') != 'none':
    raise SystemExit('QA2_ROUTING_PRECONDITION_NOT_NONE')
PY

# The secret is sent through SSH stdin and is never interpolated into a command.
printf '%s\n' "$OPENROUTESERVICE_API_KEY" |
  "${ssh_cmd[@]}" "$SERVER_USER@$SERVER_HOST" "umask 077; cat > '$key_file'"

"${ssh_cmd[@]}" "$SERVER_USER@$SERVER_HOST" 'bash -s' -- "$key_file" "$state" <<'REMOTE'
set -euo pipefail
key_file="$1"
state="$2"
qa_backend=/home/ubuntu/urtruck-qa2/backend
env_file="$qa_backend/.env"
unit=/etc/systemd/system/urtruck-qa2.service
test -f "$env_file" -a -x "$qa_backend/venv/bin/python" -a -f "$unit"
test "$(id -un)" = ubuntu
grep -Fq "$qa_backend" "$unit"
grep -Eq '(^|[[:space:]])(--port[= ]8002|8002)([[:space:]]|$)' "$unit"
test "$(systemctl is-active urtruck-qa2.service)" = active
main_pid="$(systemctl show -p MainPID --value urtruck-qa2.service)"
listener_pid="$(sudo -n ss -ltnpH 'sport = :8002' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
service_cgroup="$(systemctl show -p ControlGroup --value urtruck-qa2.service)"
test "$main_pid" -gt 0 -a -n "$listener_pid" -a -n "$service_cgroup"
grep -Fq "$service_cgroup" "/proc/$listener_pid/cgroup"

backup="$qa_backend/.env.routing-backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp -- "$env_file" "$backup"
chmod 600 "$backup"
printf 'BACKUP=%s\n' "$backup" > "$state"
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

sudo -n systemctl restart urtruck-qa2.service
for _ in {1..40}; do
  systemctl is-active --quiet urtruck-qa2.service &&
    curl -fsS http://127.0.0.1:8002/health >/dev/null 2>&1 &&
    break
  sleep 1
done
test "$(systemctl is-active urtruck-qa2.service)" = active
main_pid="$(systemctl show -p MainPID --value urtruck-qa2.service)"
listener_pid="$(sudo -n ss -ltnpH 'sport = :8002' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
service_cgroup="$(systemctl show -p ControlGroup --value urtruck-qa2.service)"
test "$main_pid" -gt 0 -a -n "$listener_pid" -a -n "$service_cgroup"
grep -Fq "$service_cgroup" "/proc/$listener_pid/cgroup"
curl -fsS http://127.0.0.1:8002/health >/dev/null
info="$(curl -fsS http://127.0.0.1:8002/api/v1/system/info)"
printf '%s' "$info" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["routing"]["provider"] == "openrouteservice"'
ai="$(curl -fsS http://127.0.0.1:8002/api/v1/chat/translate/info)"
printf '%s' "$ai" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("provider") == "local_ai"'
echo "QA2_ROUTING_BACKUP=$backup"
echo 'QA2_ROUTING=healthy-openrouteservice'
echo 'QA2_LOCAL_AI=preserved'
REMOTE

after_prod="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
test "$after_prod" = "$before_prod"
after_info="$(curl -fsS --max-time 20 "${QA_API_URL%/}/api/v1/system/info")"
printf '%s' "$after_info" | python3 -c 'import json,sys; assert json.load(sys.stdin)["routing"]["provider"] == "openrouteservice"'
echo 'PRODUCTION_AFTER=healthy-unchanged'
echo 'QA2_ROUTING_EXTERNAL=provider-visible'
