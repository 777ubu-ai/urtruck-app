#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

REQUIRED = [
    ROOT / "AGENTS.md",
    ROOT / "docs" / "ENGINEERING_STANDARDS_AND_QUALITY_PROTOCOL.md",
    ROOT / "docs" / "GOLDEN_BASELINE.md",
    ROOT / ".github" / "CODEOWNERS",
    ROOT / ".github" / "pull_request_template.md",
    ROOT / ".github" / "workflows" / "governance-contract.yml",
]

errors = []
for path in REQUIRED:
    if not path.is_file():
        errors.append(f"missing required governance file: {path.relative_to(ROOT)}")

def require(path: Path, phrases):
    if not path.is_file():
        return
    text = path.read_text(encoding="utf-8")
    for phrase in phrases:
        if phrase not in text:
            errors.append(f"{path.relative_to(ROOT)} missing required marker: {phrase!r}")

require(ROOT / "AGENTS.md", [
    "PRE-FLIGHT",
    "docs/GOLDEN_BASELINE.md",
    "NO REWRITE",
    "STOP THE LINE",
])
require(ROOT / "docs" / "GOLDEN_BASELINE.md", [
    "Baseline type:",
    "Main SHA:",
    "CI evidence",
    "Подтверждённые GOLDEN-блоки",
    "GOLDEN DESIGN BASELINE",
    "10/10 блока",
    "10/10 продукта",
    "QA073",
    "Release-specific certification table",
])
require(ROOT / ".github" / "pull_request_template.md", [
    "UrTruck PRE-FLIGHT",
    "Golden Baseline impact",
    "Final status:",
])
require(ROOT / ".github" / "CODEOWNERS", [
    "/AGENTS.md",
    "/docs/GOLDEN_BASELINE.md",
    "/.github/workflows/",
    "/backend/",
    "/src/",
])

if errors:
    print("URTRUCK_GOVERNANCE_CONTRACT=FAIL")
    for error in errors:
        print(f"ERROR: {error}")
    sys.exit(1)

print("URTRUCK_GOVERNANCE_CONTRACT=PASS")
