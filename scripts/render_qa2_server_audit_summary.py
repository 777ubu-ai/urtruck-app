#!/usr/bin/env python3
"""Render a Markdown index for the sanitized QA2 server-audit JSONL."""
from __future__ import annotations
import json
import sys
from pathlib import Path

source, destination = map(Path, sys.argv[1:3])
records = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
by_section = {record["section"]: record["payload"] for record in records}
delta = by_section.get("translation_resource_delta", "")
before = next((line for line in delta.splitlines() if line.startswith("before_vmstat=")), "UNKNOWN")
after = next((line for line in delta.splitlines() if line.startswith("after_vmstat=")), "UNKNOWN")
process = by_section.get("port_8002_process", "listener_not_found")
pid = process.splitlines()[0]
routes = by_section.get("nginx_routes", "UNKNOWN").strip() or "UNKNOWN"
if pid == "listener_not_found":
    status = "SERVER BLOCKED"
elif "PPid:\t1" in process or before != after:
    status = "SERVER DEGRADED"
else:
    status = "SERVER HEALTHY"
destination.write_text("\n".join([
    "# QA2 read-only server audit", "", "This artifact contains sanitized technical metadata only.",
    "", f"- Backend :8002: `{pid}`", f"- Swap counters before: `{before}`", f"- Swap counters after: `{after}`",
    "- Swap causality: confirmed only when pswpin/pswpout deltas are non-zero during the three synthetic requests.",
    f"- Preliminary status: **{status}**", "", "## QA2 / pro-test routes", "", "```text", routes, "```",
    "", "## Collected sections", "", *[f"- `{key}`" for key in by_section], "",
]), encoding="utf-8")
