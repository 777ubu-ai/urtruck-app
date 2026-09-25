#!/usr/bin/env bash
set -euo pipefail

: "${SERVER_HOST:?}" "${SERVER_USER:?}" "${SERVER_PASS:?}" "${QA_API_URL:?}" "${GITHUB_RUN_ID:?}"
test "$QA_API_URL" = "https://qa2.urtruck.kz"
export SSHPASS="$SERVER_PASS"
ssh_cmd=(sshpass -e ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=20 "$SERVER_USER@$SERVER_HOST")
rsync_ssh='sshpass -e ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=20'
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
  cp "$backup/chat.py" /home/ubuntu/urtruck-qa2/backend/api/chat.py
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
whisper="$root/models/faster-whisper-large-v3-turbo"
tokenizer="$root/models/nllb-200-distilled-1.3b-tokenizer"
translated="$root/models/nllb-200-distilled-1.3b-int8"
if ! test -f "$whisper/model.bin"; then
  "$root/venv/bin/hf" download dropbox-dash/faster-whisper-large-v3-turbo \
    --revision 0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf --local-dir "$whisper"
fi
if ! test -f "$translated/model.bin"; then
  source="$root/models/nllb-200-distilled-1.3b-source"
  if ! test -f "$source/pytorch_model.bin"; then
    rm -rf "$source"
    "$root/venv/bin/hf" download facebook/nllb-200-distilled-1.3B \
      --revision 7be3e24664b38ce1cac29b8aeed6911aa0cf0576 --local-dir "$source"
  fi
  rm -rf "$translated" "$tokenizer"
  "$root/venv/bin/ct2-transformers-converter" \
    --model "$source" --output_dir "$translated" --quantization int8 \
    --copy_files tokenizer.json tokenizer_config.json sentencepiece.bpe.model special_tokens_map.json
  mkdir -p "$tokenizer"
  cp "$source"/tokenizer.json "$source"/tokenizer_config.json \
    "$source"/sentencepiece.bpe.model "$source"/special_tokens_map.json "$tokenizer"/
  rm -rf "$source"
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
Environment=QA2_STT_MIN_WORD_CONFIDENCE=0.50
ExecStart=/home/ubuntu/urtruck-qa2-ai/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8003
Restart=on-failure
RestartSec=5
MemoryMax=6G
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

voice_smoke="$(mktemp --suffix=.wav)"
espeak-ng -w "$voice_smoke" "Cargo is ready for shipment"
remote_voice="/tmp/qa2-local-ai-voice-$GITHUB_RUN_ID.wav"
sshpass -e scp -o StrictHostKeyChecking=no "$voice_smoke" "$SERVER_USER@$SERVER_HOST:$remote_voice"
rm -f "$voice_smoke"
"${ssh_cmd[@]}" 'bash -s' -- "$remote_voice" <<'REMOTE'
set -euo pipefail
voice="$1"
trap 'rm -f "$voice"' EXIT
result="$(curl -fsS --max-time 240 -F "language=en" -F "file=@$voice;type=audio/wav" http://127.0.0.1:8003/transcribe)"
printf '%s' "$result" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("provider")=="local_faster_whisper_large_v3_turbo"; assert d.get("source_lang")=="en"; assert float(d.get("confidence") or 0)>=0.50; assert "cargo" in str(d.get("transcript_text") or "").lower()'
echo "QA2_AI_TRANSCRIPTION_EN=healthy"
REMOTE

if test "${QA2_STT_FAST_PATCH_ONLY:-no}" = yes; then
  prod_after="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
  test "$prod_after" = "$prod_before"
  echo "QA2_STT_FAST_PATCH=healthy-private"
  echo "PRODUCTION=healthy-unchanged"
  exit 0
fi

"${ssh_cmd[@]}" 'python3 -' <<'PY'
import json, urllib.error, urllib.request
triples = [
    {'en':'Cargo is ready at the warehouse tomorrow morning.','ru':'Груз будет готов на складе завтра утром.','zh':'货物明天早上在仓库准备好。'},
    {'en':'The driver will arrive at the border at 09:30.','ru':'Водитель прибудет на границу в 09:30.','zh':'司机将在09:30到达边境。'},
    {'en':'Trailer number A123BC and the documents are ready.','ru':'Прицеп номер A123BC и документы готовы.','zh':'挂车号码A123BC，文件已准备好。'},
    {'en':'Loading 20 tons at the customs warehouse.','ru':'Загрузка 20 тонн на таможенном складе.','zh':'在海关仓库装货20吨。'},
    {'en':'Delivery is delayed by 2 hours because of the border queue.','ru':'Доставка задерживается на 2 часа из-за очереди на границе.','zh':'由于边境排队，交付延迟2小时。'},
    {'en':'The truck is waiting at the warehouse gate.','ru':'Машина ждёт у ворот склада.','zh':'卡车正在仓库门口等候。'},
    {'en':'Customs inspection is complete; the driver may continue.','ru':'Таможенная проверка завершена, водитель может продолжать путь.','zh':'海关检查已完成，司机可以继续行驶。'},
    {'en':'Unload the cargo at the warehouse at 17:00.','ru':'Разгрузите груз на складе в 17:00.','zh':'17:00在仓库卸货。'},
    {'en':'Call the driver before loading.','ru':'Позвоните водителю перед загрузкой.','zh':'装货前请给司机打电话。'},
]
pairs=(('ru','zh'),('zh','ru'),('en','zh'),('zh','en'),('ru','en'),('en','ru'))
count=0
failures=[]
for item in triples:
    for source,target in pairs:
        text=item[source]
        body=json.dumps({'text':text,'source_lang':source,'target_lang':target}).encode()
        req=urllib.request.Request('http://127.0.0.1:8003/translate', data=body, headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                result=json.load(response)
        except urllib.error.HTTPError as exc:
            detail=exc.read().decode('utf-8', errors='replace')
            print(f'QA2_AI_TRANSLATION_FAILURE={source}->{target} input={text!r} status={exc.code} body={detail}', flush=True)
            failures.append((source, target, text, exc.code, detail))
            continue
        translated=str(result.get('translated_text') or '').strip()
        assert translated and translated != text
        assert result.get('provider') == 'local_nllb_1_3b'
        count += 1
assert not failures, f'{len(failures)} translation cases failed'
assert count == 54
probe=json.dumps({'text':'Cargo is ready. Please arrive at the warehouse tomorrow morning.','source_lang':'en','target_lang':'zh'}).encode()
request=urllib.request.Request('http://127.0.0.1:8003/translate', data=probe, headers={'Content-Type':'application/json'})
with urllib.request.urlopen(request, timeout=180) as response:
    translated=str(json.load(response)['translated_text'])
assert '货物' in translated and '仓库' in translated
assert '牛奶' not in translated and '奶酪' not in translated
print('QA2_AI_TRANSLATION_MATRIX=54/54')
PY

"${ssh_cmd[@]}" "mkdir -p '$backup' && cp /home/ubuntu/urtruck-qa2/.env '$backup/.env' && cp /home/ubuntu/urtruck-qa2/backend/services/translate_service.py '$backup/' && cp /home/ubuntu/urtruck-qa2/backend/services/speech_to_text_service.py '$backup/' && cp /home/ubuntu/urtruck-qa2/backend/api/chat.py '$backup/'"
rollback_enabled=yes
rsync -az -e "$rsync_ssh" \
  backend/services/local_ai_client.py backend/services/translate_service.py backend/services/speech_to_text_service.py \
  "$SERVER_USER@$SERVER_HOST:/home/ubuntu/urtruck-qa2/backend/services/"
rsync -az -e "$rsync_ssh" backend/api/chat.py \
  "$SERVER_USER@$SERVER_HOST:/home/ubuntu/urtruck-qa2/backend/api/chat.py"

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
printf '%s' "$info" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["provider"]=="local_ai" and d["model"]=="nllb_200_distilled_1_3b_int8"'
prod_after="$(curl -fsS --max-time 20 https://urtruck.kz/api/version | sha256sum | awk '{print $1}')"
test "$prod_after" = "$prod_before"
rollback_enabled=no
echo "QA2_LOCAL_AI=healthy-private"
echo "PRODUCTION=healthy-unchanged"
