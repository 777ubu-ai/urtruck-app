#!/usr/bin/env bash
set -euo pipefail

: "${SERVER_HOST:?}" "${SERVER_USER:?}" "${SERVER_PASS:?}" "${QA_API_URL:?}" "${GITHUB_RUN_ID:?}"
test "$QA_API_URL" = "https://qa2.urtruck.kz"
export SSHPASS="$SERVER_PASS"
ssh_cmd=(sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST")
rsync_ssh='sshpass -e ssh -o StrictHostKeyChecking=no'
backup="/home/ubuntu/urtruck-qa2/backups/local-ai-$GITHUB_RUN_ID"
rollback_enabled=no

rollback() {
  test "$rollback_enabled" = yes || return 0
  "${ssh_cmd[@]}" bash -s -- "$backup" <<'REMOTE' || true
  backup="$1"
  test -f "$backup/.env" || exit 0
  cp "$backup/.env" /home/ubuntu/urtruck-qa2/.env
  cp "$backup/translate_service.py" /home/ubuntu/urtruck-qa2/backend/services/translate_service.py
  cp "$backup/speech_to_text_service.py" /home/ubuntu/urtruck-qa2/backend/services/speech_to_text_service.py
  rm -f /home/ubuntu/urtruck-qa2/backend/services/local_ai_client.py
  sudo systemctl restart urtruck-qa2.service
REMOTE
}
trap 'status=$?; if test $status -ne 0; then rollback; fi; exit $status' EXIT

prod_before="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
"${ssh_cmd[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
test "$(id -un)" = ubuntu
sudo -n true
if sudo systemctl list-unit-files urtruck-qa2-ai.service --no-legend 2>/dev/null | grep -q urtruck-qa2-ai; then
  curl -fsS --max-time 3 http://127.0.0.1:8003/health >/dev/null 2>&1 || sudo systemctl stop urtruck-qa2-ai.service
fi
test -d /home/ubuntu/urtruck-qa2/backend
sudo grep -Fq '/home/ubuntu/urtruck-qa2/backend' /etc/systemd/system/urtruck-qa2.service
test "$(uname -m)" = x86_64
test "$(nproc)" -ge 4
ram="$(awk '/MemTotal:/ {print $2 * 1024}' /proc/meminfo)"
disk="$(df -B1 --output=avail /home/ubuntu | tail -1 | tr -d ' ')"
test "$ram" -ge 7500000000
test "$disk" -ge 35000000000
mkdir -p /home/ubuntu/urtruck-qa2-ai/app /home/ubuntu/urtruck-qa2-ai/models
chmod 700 /home/ubuntu/urtruck-qa2-ai
echo "QA2_AI_CAPACITY=accepted-4cpu-8gb-no-gpu-int8"
REMOTE

rsync -az --delete -e "$rsync_ssh" backend/qa_ai_service/ \
  "$SERVER_USER@$SERVER_HOST:/home/ubuntu/urtruck-qa2-ai/app/"

"${ssh_cmd[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
root=/home/ubuntu/urtruck-qa2-ai
if ! test -x "$root/venv/bin/python"; then
  python3 -m venv "$root/venv"
fi
"$root/venv/bin/python" -m pip install --disable-pip-version-check -q -r "$root/app/requirements.txt"
export HF_HOME="$root/hf-cache"
whisper="$root/models/faster-whisper-small"
tokenizer="$root/models/m2m100-tokenizer"
translated="$root/models/m2m100-418m-int8"
if ! test -f "$whisper/model.bin"; then
  "$root/venv/bin/hf" download Systran/faster-whisper-small \
    --revision 536b0662742c02347bc0e980a01041f333bce120 --local-dir "$whisper"
fi
if ! test -f "$tokenizer/vocab.json"; then
  "$root/venv/bin/hf" download facebook/m2m100_418M \
    --revision 55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636 --local-dir "$tokenizer" \
    --include tokenizer_config.json sentencepiece.bpe.model special_tokens_map.json vocab.json
fi
if ! test -f "$translated/model.bin"; then
  "$root/venv/bin/hf" download auralmira/m2m100-418M-ct2-int8 \
    --revision e205afefce2fd6933a1dca3b92b5063894f2f2bb --local-dir "$translated"
fi
test -f "$whisper/model.bin"
test -f "$translated/model.bin"
test -f "$tokenizer/sentencepiece.bpe.model"
rm -rf "$root/hf-cache"
REMOTE

"${ssh_cmd[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
service_tmp="$(mktemp)"
cat > "$service_tmp" <<'SERVICE'
[Unit]
Description=UrTruck isolated QA2 local AI
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/urtruck-qa2-ai/app
Environment=PYTHONUNBUFFERED=1
Environment=HF_HUB_OFFLINE=1
Environment=TRANSFORMERS_OFFLINE=1
Environment=QA2_AI_MODEL_ROOT=/home/ubuntu/urtruck-qa2-ai/models
ExecStart=/home/ubuntu/urtruck-qa2-ai/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8003
Restart=on-failure
RestartSec=5
MemoryMax=5G
CPUQuota=350%
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE
sudo install -o root -g root -m 0644 "$service_tmp" /etc/systemd/system/urtruck-qa2-ai.service
rm -f "$service_tmp"
sudo systemctl daemon-reload
sudo systemctl enable urtruck-qa2-ai.service
sudo systemctl restart urtruck-qa2-ai.service
ready=no
for _ in {1..120}; do
  if curl -fsS http://127.0.0.1:8003/health >/tmp/qa2-ai-health.json 2>/dev/null; then
    ready=yes
    break
  fi
  sleep 2
done
test "$ready" = yes || {
  sudo journalctl -u urtruck-qa2-ai.service -n 80 --no-pager
  exit 1
}
python3 - <<'PY'
import json
with open('/tmp/qa2-ai-health.json') as source:
    data=json.load(source)
assert data == {'status':'ok','private':True,'translation_model':True,'speech_model':True,'languages':['en','kk','ru','zh']}
PY
ss -ltnH 'sport = :8003' | grep -Fq '127.0.0.1:8003'
! ss -ltnH 'sport = :8003' | grep -Fq '0.0.0.0:8003'
REMOTE

"${ssh_cmd[@]}" 'python3 -' <<'PY'
import json, urllib.request
cases = [
    ('Груз готов к отправке', 'ru', 'zh'),
    ('货物已准备好装运', 'zh', 'ru'),
    ('Жүк жөнелтуге дайын', 'kk', 'ru'),
    ('Cargo is ready for shipment', 'en', 'ru'),
]
for text, source, target in cases:
    body=json.dumps({'text':text,'source_lang':source,'target_lang':target}).encode()
    req=urllib.request.Request('http://127.0.0.1:8003/translate', data=body, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=120) as response:
        result=json.load(response)
    translated=str(result.get('translated_text') or '').strip()
    assert translated and translated != text
    assert result.get('provider') == 'local_m2m100'
    print(f'QA2_AI_TRANSLATION_{source}_{target}=healthy')
PY

"${ssh_cmd[@]}" "mkdir -p '$backup' && cp /home/ubuntu/urtruck-qa2/.env '$backup/.env' && cp /home/ubuntu/urtruck-qa2/backend/services/translate_service.py '$backup/' && cp /home/ubuntu/urtruck-qa2/backend/services/speech_to_text_service.py '$backup/'"
rollback_enabled=yes
rsync -az -e "$rsync_ssh" \
  backend/services/local_ai_client.py backend/services/translate_service.py backend/services/speech_to_text_service.py \
  "$SERVER_USER@$SERVER_HOST:/home/ubuntu/urtruck-qa2/backend/services/"

"${ssh_cmd[@]}" 'python3 -' <<'PY'
import os
from pathlib import Path
path=Path('/home/ubuntu/urtruck-qa2/.env')
lines=path.read_text().splitlines()
values={'TRANSCRIBE_PROVIDER':'local_ai','TRANSLATE_PROVIDER':'local_ai','LOCAL_AI_URL':'http://127.0.0.1:8003'}
remove=set(values) | {'LOCAL_WHISPER_MODEL_PATH'}
kept=[line for line in lines if line.partition('=')[0].strip() not in remove]
tmp=path.with_name('.env.local-ai-new')
tmp.write_text('\n'.join(kept + [f'{key}={value}' for key,value in values.items()]) + '\n')
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
"${ssh_cmd[@]}" 'sudo systemctl restart urtruck-qa2.service'

healthy=no
for _ in {1..45}; do
  if curl -fsS --max-time 20 "$QA_API_URL/health" >/dev/null; then
    healthy=yes
    break
  fi
  sleep 2
done
test "$healthy" = yes
info="$(curl -fsS --max-time 20 "$QA_API_URL/api/v1/chat/translate/info")"
printf '%s' "$info" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["provider"]=="local_ai" and d["model"]=="m2m100_418m_int8"'
prod_after="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
test "$prod_after" = "$prod_before"
rollback_enabled=no
echo "QA2_LOCAL_AI=healthy-private"
echo "PRODUCTION=healthy-unchanged"
