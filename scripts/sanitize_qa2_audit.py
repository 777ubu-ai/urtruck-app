#!/usr/bin/env python3
"""Allowlist sanitizer for the QA2 server audit stream."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ALLOWED = {
    "disk", "inodes", "memory", "vmstat", "psi-memory", "psi-io", "psi-cpu",
    "top-cpu", "top-rss", "listeners", "port-8002-process", "systemd",
    "nginx-routing", "docker-images", "docker-volumes", "docker-containers",
    "docker-build-cache", "docker-mount-links", "technical-directory-sizes",
    "health", "synthetic-translation-observation",
}
SIZE = r"\d+(?:\.\d+)?[KMGTP]?"
FIELD_PATTERNS = {
    "disk": re.compile(rf"^(Filesystem\s+Type\s+Size\s+Used\s+Avail\s+Use%\s+Mounted on|(?:/[^ ]+|tmpfs|overlay|udev|devtmpfs|/dev/[^ ]+)\s+[^ ]+\s+{SIZE}\s+{SIZE}\s+{SIZE}\s+\d+%\s+[-A-Za-z0-9_./]+)$"),
    "inodes": re.compile(rf"^(Filesystem\s+Inodes\s+IUsed\s+IFree\s+IUse%\s+Mounted on|(?:/[^ ]+|tmpfs|overlay|udev|devtmpfs|/dev/[^ ]+)\s+{SIZE}\s+{SIZE}\s+{SIZE}\s+\d+%\s+[-A-Za-z0-9_./]+)$"),
    "memory": re.compile(r"^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+\d+\s*(kB|KiB|MiB|GiB)?$|^(Mem|Swap):\s+.*$"),
    "vmstat": re.compile(r"^(?:procs|memory|swap|io|system|cpu)\b.*|^r\s+b\s+.*|^\d+(?:\s+\d+)+$"),
    "psi-memory": re.compile(r"^(some|full)\s+avg10=[0-9.]+\s+avg60=[0-9.]+\s+avg300=[0-9.]+\s+total=\d+$"),
    "psi-io": re.compile(r"^(some|full)\s+avg10=[0-9.]+\s+avg60=[0-9.]+\s+avg300=[0-9.]+\s+total=\d+$"),
    "psi-cpu": re.compile(r"^some\s+avg10=[0-9.]+\s+avg60=[0-9.]+\s+avg300=[0-9.]+\s+total=\d+$"),
    "top-cpu": re.compile(r"^(PID|\s*\d+\s+\d+\s+[A-Za-z0-9._-]+\s+[A-Za-z0-9._-]+\s+[0-9.]+\s+[0-9.]+\s+\d+\s+.+)$"),
    "top-rss": re.compile(r"^(PID|\s*\d+\s+\d+\s+[A-Za-z0-9._-]+\s+[A-Za-z0-9._-]+\s+[0-9.]+\s+[0-9.]+\s+\d+\s+.+)$"),
    "listeners": re.compile(r"^(?:PORT=(?:8001|8002|8003|3101)|PORT_8002_PID=\d+)$"),
    "port-8002-process": re.compile(r"^(PROCESS_8002_(PID|PPID|USER|COMM|ELAPSED|CPU_PCT|MEM_PCT|RSS_KB|EXEC|CWD|SUPERVISION)=|PROCESS_8002_CGROUP=(systemd|user|docker|unknown):[-A-Za-z0-9_./:]+$)"),
    "systemd": re.compile(r"^(UNIT=urtruck-(qa2|factory)(-ai)?\.service|(?:Id|ActiveState|SubState|MainPID|FragmentPath|ExecMainStartTimestamp)=([A-Za-z0-9_./:+ -]+))$"),
    "nginx-routing": re.compile(r"^server_name (qa2\.urtruck\.kz|pro-test\.urtruck\.kz) -> proxy_pass http://127\.0\.0\.1:[0-9]{1,5}$"),
    "docker-images": re.compile(r"^DOCKER_IMAGE=[A-Za-z0-9./_-]+:[A-Za-z0-9._-]+\|sha256:[0-9a-f]{12,64}\|[0-9.]+[KMGTP]B$"),
    "docker-volumes": re.compile(r"^DOCKER_VOLUME=[A-Za-z0-9_-]+\|[A-Za-z0-9._-]+$"),
    "docker-containers": re.compile(r"^DOCKER_CONTAINER=[0-9a-f]{12,64}\|[A-Za-z0-9./:_-]+\|[A-Za-z0-9._-]+\|[A-Za-z0-9 ()-]+$"),
    "docker-build-cache": re.compile(r"^DOCKER_BUILD_CACHE=[A-Za-z0-9._:/-]+\|[0-9.]+[KMGTP]B$"),
    "docker-mount-links": re.compile(r"^DOCKER_MOUNT=[A-Za-z0-9._-]+\|(bind|volume|tmpfs)->/[A-Za-z0-9._/-]+$"),
    "technical-directory-sizes": re.compile(rf"^{SIZE}\s+/(?:home/ubuntu/(?:urtruck(?:-rollback|-releases|-backups|-qa2(?:-ai)?)?)|var/lib/docker|var/log|tmp)$"),
    "health": re.compile(r"^HEALTH_(qa2-8002|ai-8003)=\{.*\}$"),
    "synthetic-translation-observation": re.compile(r"^(SYNTHETIC_CASE=(RU_TO_ZH|ZH_TO_RU|EN_TO_ZH)|SYNTHETIC_(RU_TO_ZH|ZH_TO_RU|EN_TO_ZH)_RESULT=\d{3}\s+\d+\.\d+|SWAP_[A-Z0-9_]+=(?:pswpin=\d+;pswpout=\d+;?)|PSI_[A-Z0-9_]+_(?:MEMORY|IO)=some .*|AI_[A-Z0-9_]+_PROCESS=pid=\d+ ppid=\d+ comm=[A-Za-z0-9._-]+ pcpu=[0-9.]+ pmem=[0-9.]+ rss=\d+)$"),
}
SECRET_PATTERNS = (
    (re.compile(r"(--password(?:=|\s+))[^\s]+", re.I), r"\1REDACTED"),
    (re.compile(r"(--token(?:=|\s+))[^\s]+", re.I), r"\1REDACTED"),
    (re.compile(r"(postgres(?:ql)?://[^:/\s]+:)[^@\s]+(@)", re.I), r"\1REDACTED\2"),
    (re.compile(r"(Authorization:\s*Bearer\s+)[^\s]+", re.I), r"\1REDACTED"),
)

def sanitize(line: str) -> str | None:
    if line.startswith("PROCESS_8002_CMD=") or line.startswith("CUSTOM_SECRET="):
        return None
    for pattern, replacement in SECRET_PATTERNS:
        line = pattern.sub(replacement, line)
    if line.startswith(("PROCESS_8002_EXEC=", "PROCESS_8002_CWD=")) and not re.fullmatch(
        r"PROCESS_8002_(?:EXEC|CWD)=/[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*", line
    ):
        return None
    if line.startswith("HEALTH_"):
        match = re.fullmatch(r"HEALTH_(qa2-8002|ai-8003)=(\{.*\})", line)
        if not match:
            return None
        try:
            body = json.loads(match.group(2))
        except json.JSONDecodeError:
            return None
        allowed_health = {"status", "source_sha", "version", "private", "translation_model", "speech_model", "languages"}
        if set(body) - allowed_health:
            return None
        if any(not isinstance(value, (str, int, float, bool, list)) for value in body.values()):
            return None
    return line

def main() -> int:
    source, json_path, markdown_path = map(Path, sys.argv[1:])
    sections: dict[str, list[str]] = {}
    current: str | None = None
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    for raw in source.read_text(encoding="utf-8").splitlines():
        if raw.startswith("SECTION="):
            current = raw.split("=", 1)[1]
            if current in ALLOWED:
                sections.setdefault(current, [])
            continue
        if current in ALLOWED:
            safe = sanitize(raw)
            if safe is not None and FIELD_PATTERNS[current].fullmatch(safe):
                sections[current].append(safe)
    payload = {"sanitized": True, "sections": sections}
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    routes = "\n".join(sections.get("nginx-routing", ["UNKNOWN"]))
    pid = next((line for line in sections.get("listeners", []) if line.startswith("PORT_8002_PID=")), "PORT_8002_PID=unavailable")
    swap = "\n".join(line for line in sections.get("synthetic-translation-observation", []) if line.startswith("SWAP_"))
    psi = "\n".join(line for line in sections.get("synthetic-translation-observation", []) if line.startswith("PSI_"))
    latency = "\n".join(line for line in sections.get("synthetic-translation-observation", []) if line.startswith("SYNTHETIC_") and "_RESULT=" in line)
    markdown_path.write_text(
        "# QA2 read-only server audit\n\n"
        f"- Listener evidence: `{pid}`\n"
        "- Swap causality requires non-zero `pswpin/pswpout` deltas together with PSI and request latency.\n\n"
        "## Synthetic latency\n\n```text\n" + latency + "\n```\n\n"
        "## Swap snapshots\n\n```text\n" + swap + "\n```\n\n"
        "## PSI snapshots\n\n```text\n" + psi + "\n```\n\n"
        "## QA2 / pro-test routing\n\n```text\n" + routes + "\n```\n",
        encoding="utf-8",
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
