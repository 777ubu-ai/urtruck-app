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
SECRET_PATTERNS = (
    (re.compile(r"(--password(?:=|\s+))[^\s]+", re.I), r"\1REDACTED"),
    (re.compile(r"(--token(?:=|\s+))[^\s]+", re.I), r"\1REDACTED"),
    (re.compile(r"(postgres(?:ql)?://[^:/\s]+:)[^@\s]+(@)", re.I), r"\1REDACTED\2"),
    (re.compile(r"(Authorization:\s*Bearer\s+)[^\s]+", re.I), r"\1REDACTED"),
)

def sanitize(line: str) -> str | None:
    if line.startswith("PROCESS_8002_CMD="):
        return None
    for pattern, replacement in SECRET_PATTERNS:
        line = pattern.sub(replacement, line)
    return line

def main() -> int:
    source, json_path, markdown_path = map(Path, sys.argv[1:])
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in source.read_text(encoding="utf-8").splitlines():
        if raw.startswith("SECTION="):
            current = raw.split("=", 1)[1]
            if current in ALLOWED:
                sections.setdefault(current, [])
            continue
        if current in ALLOWED:
            safe = sanitize(raw)
            if safe is not None:
                sections[current].append(safe)
    payload = {"sanitized": True, "sections": sections}
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    routes = "\n".join(sections.get("nginx-routing", ["UNKNOWN"]))
    pid = next((line for line in sections.get("listeners", []) if ":8002" in line), "PORT_8002=unavailable")
    swap = "\n".join(line for line in sections.get("synthetic-translation-observation", []) if line.startswith("SWAP_"))
    markdown_path.write_text(
        "# QA2 read-only server audit\n\n"
        f"- Listener evidence: `{pid}`\n"
        "- Swap causality requires non-zero `pswpin/pswpout` deltas together with PSI and request latency.\n\n"
        "## Swap snapshots\n\n```text\n" + swap + "\n```\n\n"
        "## QA2 / pro-test routing\n\n```text\n" + routes + "\n```\n",
        encoding="utf-8",
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
