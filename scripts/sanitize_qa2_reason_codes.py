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
    raw = detail.get("reason_codes") if isinstance(detail, dict) else None
    reasons = sorted({item for item in raw if isinstance(item, str) and ALLOWED.fullmatch(item)}) if isinstance(raw, list) else []
    print(f"SYNTHETIC_{label}_REASONS=" + (",".join(reasons) if reasons else "none_or_unavailable"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
