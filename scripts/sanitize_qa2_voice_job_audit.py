#!/usr/bin/env python3
"""Publish a strict allowlist of QA2 voice-job operational fields only."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

JOB = re.compile(
    r"^JOB (?:none|id=\d+ message_id=\d+ status=[a-z_]+ "
    r"created_at=(?:[0-9T: .+\-]+|none) lease_at=(?:[0-9T: .+\-]+|none) "
    r"lease_worker=(?:present|none) attempts=\d+ "
    r"next_retry_at=(?:[0-9T: .+\-]+|none) expires_at=(?:[0-9T: .+\-]+|none) "
    r"last_error=[A-Za-z0-9_:\-]+ duration_seconds=\d+(?:\.\d+)?)$"
)
METRIC = re.compile(
    r"^METRIC job_id=\d+ provider=[A-Za-z0-9_.:-]+ model=[A-Za-z0-9_.:-]+ "
    r"latency_ms=(?:\d+|none) duration_seconds=(?:\d+|none) input_tokens=(?:\d+|none) "
    r"output_tokens=(?:\d+|none) total_tokens=(?:\d+|none) stage=[a-z_]+ outcome=[A-Za-z_]+ fallback=[01] "
    r"error_category=[A-Za-z0-9_:-]+ created_at=[0-9T: .+\-]+$"
)
WORKER = re.compile(r"^(ActiveState|SubState|MainPID|ExecMainStartTimestamp)=[A-Za-z0-9_: .+\-]+$")
LOG = re.compile(
    r"^.*\[(?:voice-stt|stt)\] (?:picked=\d+ ready=\d+ failed_retryable=\d+ failed_permanent=\d+ stale=\d+|"
    r"provider=(?:openai|local_ai) result=(?:success|[A-Z_]+)(?: fallback=(?:disabled|local_ai)| selected=local_fallback)?)$"
)

def main() -> int:
    source, target = map(Path, sys.argv[1:])
    target.mkdir(parents=True, exist_ok=True)
    section = None
    output = {"sanitized": True, "voice_job": [], "worker": [], "logs": []}
    for line in source.read_text(encoding="utf-8").splitlines():
        if line == "SECTION=voice-job":
            section = "voice_job"
        elif line == "SECTION=worker":
            section = "worker"
        elif section == "voice_job" and (JOB.fullmatch(line) or METRIC.fullmatch(line)):
            output[section].append(line)
        elif section == "worker" and WORKER.fullmatch(line):
            output[section].append(line)
        elif section == "worker" and LOG.fullmatch(line):
            output["logs"].append(line)
    (target / "audit.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    (target / "summary.md").write_text(
        "# QA2 voice job read-only audit\n\n"
        "The artifact contains no audio reference, transcript, translation, bearer, API key, or raw provider payload.\n\n"
        "## Job and metrics\n\n```text\n" + "\n".join(output["voice_job"]) + "\n```\n\n"
        "## Worker state\n\n```text\n" + "\n".join(output["worker"] + output["logs"]) + "\n```\n",
        encoding="utf-8",
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
