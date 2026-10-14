#!/usr/bin/env bash
# Emits sanitized JSONL only.  The remote program is intentionally read-only.
set -euo pipefail

: "${SERVER_HOST:?SERVER_HOST is required}"
: "${SERVER_USER:?SERVER_USER is required}"
: "${SERVER_PASS:?SERVER_PASS is required}"

export SSHPASS="$SERVER_PASS"
sshpass -e ssh -o BatchMode=no -o StrictHostKeyChecking=yes \
  "$SERVER_USER@$SERVER_HOST" 'bash -s' <<'REMOTE'
set -u
emit() {
  local section="$1"
  python3 -c 'import json,sys; print(json.dumps({"section":sys.argv[1],"payload":sys.stdin.read()}, ensure_ascii=False))' "$section"
}
safe() { "$@" 2>&1 || true; }

{
  printf 'df_hT\n'; safe df -hT
  printf 'df_i\n'; safe df -i
  printf 'free\n'; safe free -h
  printf 'swapon\n'; safe swapon --show --bytes
  printf 'vmstat\n'; safe vmstat 1 3
  printf 'psi_memory\n'; safe cat /proc/pressure/memory
  printf 'psi_cpu\n'; safe cat /proc/pressure/cpu
  printf 'psi_io\n'; safe cat /proc/pressure/io
} | emit system_resources

safe ps -eo pid,ppid,user,stat,pcpu,pmem,rss,lstart,comm --sort=-rss | head -40 | emit processes_by_rss
safe ps -eo pid,ppid,user,stat,pcpu,pmem,rss,lstart,comm --sort=-pcpu | head -40 | emit processes_by_cpu
safe ss -ltnp | grep -E ':(8001|8002|8003|3101)\\b' | emit listeners

{
  for unit in urtruck-qa2.service urtruck-qa2-ai.service urtruck-factory.service; do
    systemctl show "$unit" -p Id -p ActiveState -p MainPID -p FragmentPath --no-pager 2>/dev/null || true
    printf '%s\n' '--'
  done
} | emit urtruck_systemd

pid="$(ss -ltnpH 'sport = :8002' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
if test -n "$pid" && test -r "/proc/$pid/status"; then
  {
    printf 'pid=%s\n' "$pid"
    awk '/^(Name|PPid):/ {print}' "/proc/$pid/status"
    printf 'start_time='; ps -p "$pid" -o lstart= 2>/dev/null
    printf 'executable='; readlink -f "/proc/$pid/exe" 2>/dev/null || true
    printf 'cwd='; readlink -f "/proc/$pid/cwd" 2>/dev/null || true
    printf 'cgroup='; cat "/proc/$pid/cgroup" 2>/dev/null || true
    printf 'command='; tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null | sed -E 's/(token|password|secret|key)=[^ ]+/\1=REDACTED/Ig'; printf '\n'
  } | emit port_8002_process
else
  printf 'listener_not_found\n' | emit port_8002_process
fi

{
  safe docker system df -v
  printf 'containers\n'; safe docker ps -a --size --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Size}}|{{.Ports}}'
  printf 'images\n'; safe docker image ls --digests --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Digest}}|{{.CreatedSince}}|{{.Size}}'
  printf 'volumes\n'; safe docker volume ls --format '{{.Name}}|{{.Driver}}|{{.Scope}}'
  printf 'networks\n'; safe docker network ls --format '{{.Name}}|{{.Driver}}|{{.Scope}}'
  printf 'mounts\n'; docker ps -aq | xargs -r docker inspect --format '{{.Name}}|{{range .Mounts}}{{.Type}}:{{.Source}}->{{.Destination}},{{end}}' 2>/dev/null || true
} | emit docker_inventory

{
  for path in /home/ubuntu /home/ubuntu/urtruck /home/ubuntu/urtruck-rollback /home/ubuntu/urtruck-releases /home/ubuntu/urtruck-backups /home/ubuntu/urtruck-qa2 /home/ubuntu/urtruck-qa2-ai /home/ubuntu/.cache /var/lib/docker /var/log /tmp; do
    test -e "$path" && du -shx "$path" 2>/dev/null || true
  done
  journalctl --disk-usage 2>/dev/null || true
  find /var/lib/docker/containers -type f -name '*-json.log' -printf '%s %p\n' 2>/dev/null | sort -nr | head -20 || true
} | emit storage_sizes

sudo -n nginx -T 2>/dev/null | awk '
  /^[[:space:]]*server_name[[:space:]]/ {name=$0}
  /^[[:space:]]*proxy_pass[[:space:]]/ && name ~ /(qa2\\.urtruck\\.kz|pro-test\\.urtruck\\.kz)/ {print name " -> " $0}
' | emit nginx_routes

health_body="$(curl -sS --max-time 15 http://127.0.0.1:8002/health 2>/dev/null || true)"
version_body="$(curl -sS --max-time 15 http://127.0.0.1:8002/api/version 2>/dev/null || true)"
health_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8002/health 2>/dev/null || true)"
version_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8002/api/version 2>/dev/null || true)"
{
  printf 'health_http=%s\n' "$health_status"
  printf 'version_http=%s\n' "$version_status"
  printf '%s\n%s' "$health_body" "$version_body" | python3 -c 'import re,sys; text=sys.stdin.read(); found=sorted(set(re.findall(r"[0-9a-f]{7,64}", text))); print("source_sha=" + (found[0] if len(found) == 1 else "UNKNOWN"))'
} | emit qa2_health

before_vm="$(awk '/^(pswpin|pswpout) / {printf "%s=%s ",$1,$2}' /proc/vmstat)"
before_mem="$(awk '/^MemAvailable:/ {print $2 * 1024}' /proc/meminfo)"
before_psi="$(cat /proc/pressure/memory 2>/dev/null | tr '\n' ';')"
python3 - <<'PY' | emit synthetic_translation_load
import json, time, urllib.error, urllib.request
cases = [
    ("Алматы — Астана: груз 10 тонн, тент.", "ru", "zh"),
    ("阿拉木图到阿斯塔纳：货物10吨，篷布车。", "zh", "en"),
    ("Not a refrigerated truck; a tent truck is required, 20 tonnes.", "en", "ru"),
]
for number, (text, source, target) in enumerate(cases, 1):
    request = urllib.request.Request("http://127.0.0.1:8003/translate", data=json.dumps({"text": text, "source_lang": source, "target_lang": target}).encode(), headers={"Content-Type":"application/json"}, method="POST")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            code = response.status
            response.read()
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.read()
    except Exception as exc:
        code = type(exc).__name__
    print(json.dumps({"case": number, "source": source, "target": target, "http": code, "latency_ms": round((time.monotonic()-started)*1000, 2)}))
PY
after_vm="$(awk '/^(pswpin|pswpout) / {printf "%s=%s ",$1,$2}' /proc/vmstat)"
after_mem="$(awk '/^MemAvailable:/ {print $2 * 1024}' /proc/meminfo)"
after_psi="$(cat /proc/pressure/memory 2>/dev/null | tr '\n' ';')"
printf 'before_vmstat=%s\nbefore_mem_available_bytes=%s\nbefore_memory_psi=%s\nafter_vmstat=%s\nafter_mem_available_bytes=%s\nafter_memory_psi=%s\n' "$before_vm" "$before_mem" "$before_psi" "$after_vm" "$after_mem" "$after_psi" | emit translation_resource_delta
REMOTE
