#!/usr/bin/env python3
"""Emit only allowlisted QA2 quality-gate codes from a synthetic response."""
from __future__ import annotations

import json
import re
import sys

ALLOWED = re.compile(
    r"(?:body_type_missing|cargo_readiness_flipped|cargo_readiness_missing|"
    r"city_missing:(?:almaty|astana|urumqi)|city_route_order_changed|"
    r"clear_road_meaning_missing|currency_amount_binding_changed|currency_facts_changed|"
    r"identifier_changed|logistics_term_missing:(?:cargo|loading|delivery)|"
    r"negation_flipped:(?:refrigerated|tent)|negation_lost:(?:refrigerated|tent)|"
    r"numeric_facts_changed|unloading_condition_flipped|unloading_condition_missing|"
    r"weekday_missing:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"weight_association_changed|weight_invented|weight_unit_missing|weight_value_changed)"
)


def main() -> int:
    label = sys.argv[1]
    try:
        body = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError):
        body = {}
    detail = body.get("detail") if isinstance(body, dict) else None
    raw = (detail.get("gate_failure_reasons") or detail.get("reason_codes")) if isinstance(detail, dict) else None
    # The sole free-text output allowed is the fixed public RU->ZH synthetic
    # phrase. Never emit arbitrary request text from an audit response.
    if label == "RU_TO_ZH":
        candidate = detail.get("candidate") if isinstance(detail, dict) else None
        if isinstance(candidate, str) and 0 < len(candidate) <= 300 and re.fullmatch(
            r"[\u3400-\u9fff0-9\s，。；：、,.!?！？→—-]+", candidate
        ):
            print("SYNTHETIC_RU_TO_ZH_CANDIDATE=" + candidate)
    reasons = sorted({item for item in raw if isinstance(item, str) and ALLOWED.fullmatch(item)}) if isinstance(raw, list) else []
    print(f"SYNTHETIC_{label}_REASONS=" + (",".join(reasons) if reasons else "none_or_unavailable"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
