from .entity_extractor import extract_slots


def validate_facts(source: str, target: str, source_language: str, target_language: str) -> tuple[bool, list[str]]:
    src = extract_slots(source, source_language)
    dst = extract_slots(target, target_language)
    reasons: list[str] = []
    for field in ("amount", "currency", "weight", "weight_unit", "city_name", "city_to", "time", "date", "vehicle_type", "cargo_status"):
        if field in src and dst.get(field) != src[field]:
            reasons.append(f"{field}_changed")
    if src.get("negation") and dst.get("negation") != src["negation"]:
        reasons.append("negation_changed")
    return not reasons, reasons
