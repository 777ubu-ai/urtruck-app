#!/usr/bin/env python3
"""Replay a saved synthetic QA2 diagnostic without contacting AI or QA2.

The input must be a GitHub Actions log or JSONL containing only the public
``safe_translation`` rows emitted by qa2_ai_readonly_diagnostic.py. This tool
never opens application storage, media, or databases.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from qa_ai_service.quality import repair_logistics_translation, translation_quality_failures


def _load_runner():
    spec = importlib.util.spec_from_file_location(
        "qa2_readonly_diagnostic", REPO_ROOT / "scripts" / "qa2_ai_readonly_diagnostic.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _rows(path: Path):
    decoder = json.JSONDecoder()
    for line in path.read_text().splitlines():
        start = line.find('{"kind": "safe_translation"')
        if start < 0:
            continue
        row, _ = decoder.raw_decode(line[start:])
        yield row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    args = parser.parse_args()
    runner = _load_runner()
    rows = list(_rows(args.input))
    if len(rows) != 60:
        raise SystemExit(f"expected exactly 60 synthetic rows, found {len(rows)}")

    before_pass = after_pass = accepted_422 = semantic_fixed = 0
    remaining_model = remaining_review = 0
    for row in rows:
        candidate = row["translated_text"] if row["http"] == 200 else row.get("rejected_candidate")
        repaired = repair_logistics_translation(
            row["input_text"], candidate or "", row["source_lang"], row["target_lang"]
        ) if candidate else None
        failures = translation_quality_failures(
            row["input_text"], repaired or "", row["source_lang"], row["target_lang"]
        ) if repaired else ["candidate_missing"]
        semantic_pass, missing, forbidden = runner.semantic_check(
            row["target_lang"], row["phrase_kind"], repaired
        )
        before = row["http"] == 200 and row["semantic_pass"]
        after = not failures and semantic_pass
        before_pass += before
        after_pass += after
        accepted_422 += row["http"] == 422 and not failures
        semantic_fixed += row["http"] == 200 and not row["semantic_pass"] and after
        if not after:
            if (
                "waterfall" in (repaired or "").casefold()
                or "водопад" in (repaired or "").casefold()
                or "地毯" in (repaired or "")
                or "invented_travel_history" in forbidden
            ):
                remaining_model += 1
            else:
                remaining_review += 1
        print(json.dumps({
            "kind": "replay_row", "case_id": row["case_id"], "attempt": row["attempt"],
            "direction": f'{row["source_lang"]}->{row["target_lang"]}',
            "phrase_kind": row["phrase_kind"], "before_pass": before, "after_pass": after,
            "http_before": row["http"], "candidate_before": candidate,
            "repaired_candidate": repaired, "quality_failures_after": failures,
            "semantic_missing_after": missing, "semantic_forbidden_after": forbidden,
        }, ensure_ascii=False))
    print(json.dumps({
        "kind": "replay_summary", "total": len(rows), "before_pass": before_pass,
        "after_pass": after_pass, "accepted_422": accepted_422,
        "semantic_fixed": semantic_fixed, "remaining_model": remaining_model,
        "remaining_review": remaining_review,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
