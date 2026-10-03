#!/usr/bin/env python3
"""Reject any unexpected or content-bearing field from the diagnostic artifact."""
from __future__ import annotations

import json
import sys
from pathlib import Path


_ALLOWED = {
    "diagnostic_policy": {"kind", "sqlite_mode", "sqlite_query_only", "application_mutation", "application_content_output", "provider_payload_output"},
    "stored_controlled_message": {"kind", "case", "message_id", "created_at", "stored_source_lang", "stored_target_lang", "message_cache", "shared_cache", "reason_codes"},
    "provider_contract_case": {"kind", "case", "attempt", "source_lang_requested", "target_lang_requested", "source_lang_reported", "http", "reason_codes", "identifier_exact", "city_semantic_present", "response_ms", "cache_source"},
    "reason_code_trace": {"kind", "backend", "mobile", "persistence"},
}


def main() -> int:
    lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
    if not lines:
        raise SystemExit("empty diagnostic artifact")
    kinds: list[str] = []
    for line in lines:
        row = json.loads(line)
        kind = row.get("kind")
        if kind not in _ALLOWED or set(row) - _ALLOWED[kind]:
            raise SystemExit("unsafe or unknown diagnostic row")
        # A string that looks like a full controlled sentence is evidence of
        # accidental conversation/provider body leakage.
        if any(" " in value and len(value) > 100 for value in row.values() if isinstance(value, str)):
            raise SystemExit("content-like value in diagnostic artifact")
        kinds.append(kind)
    if kinds.count("provider_contract_case") != 16:
        raise SystemExit("expected eight fresh/repeat provider cases")
    if "diagnostic_policy" not in kinds or "reason_code_trace" not in kinds:
        raise SystemExit("missing required diagnostic evidence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
