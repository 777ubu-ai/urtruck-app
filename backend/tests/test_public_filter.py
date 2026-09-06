"""Regression tests for the public-feed filter helpers in api/marketplace.

Pinned bug: `_parse_iso_date` used to slice the input via
`s[:len(fmt.replace('%','')) + 4]`, which truncated 'YYYY-MM-DD' to 9 chars
and dropped the second digit of the day. Cargo with pickup '2026-05-25'
parsed as date(2026,5,2) and was hidden from the public feed as "stale".
That regression now stays out via parse_iso_date_keeps_full_day_digit.

Run from backend/:
    python -m tests.test_public_filter
Exits with non-zero on any assertion failure.
"""
import os
import sys
from datetime import date, datetime
from pathlib import Path

# Isolated DB so importing marketplace doesn't touch production data
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_public_filter.db")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.marketplace import (
    _parse_iso_date,
    _is_dirty_text,
    _public_cargo_ok,
    _norm_route_triple,
    _city_matches,
    PUBLIC_CUTOFF_DATE,
)

_failures = []


def _check(cond, label):
    if cond:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")
        _failures.append(label)


def parse_iso_date_keeps_full_day_digit():
    """Day 2 vs 25 must NOT collapse onto the same date."""
    print("parse_iso_date — full day digit")
    _check(_parse_iso_date("2026-05-25") == date(2026, 5, 25),
           "'2026-05-25' → date(2026,5,25)")
    _check(_parse_iso_date("2026-05-02") == date(2026, 5, 2),
           "'2026-05-02' → date(2026,5,2)")
    _check(_parse_iso_date("2026-12-31") == date(2026, 12, 31),
           "'2026-12-31' → date(2026,12,31)")
    _check(_parse_iso_date("2026-06-01") == date(2026, 6, 1),
           "'2026-06-01' → date(2026,6,1)")


def parse_iso_date_handles_timestamps():
    print("parse_iso_date — timestamps and DD.MM.YYYY")
    _check(_parse_iso_date("2026-05-25 17:08:15") == date(2026, 5, 25),
           "'2026-05-25 17:08:15' → date(2026,5,25)")
    _check(_parse_iso_date("2026-05-25T17:08:15") == date(2026, 5, 25),
           "ISO-T form → date(2026,5,25)")
    _check(_parse_iso_date("25.05.2026") == date(2026, 5, 25),
           "'25.05.2026' → date(2026,5,25)")
    _check(_parse_iso_date("2026-05-25T17:08:15.123Z") == date(2026, 5, 25),
           "ISO with fractional + Z (regex fallback)")
    _check(_parse_iso_date(None) is None, "None → None")
    _check(_parse_iso_date("") is None, "empty → None")
    _check(_parse_iso_date("garbage") is None, "garbage → None")


def is_dirty_text_blocks_known_tokens_but_lets_qa_through():
    print("is_dirty_text — token list + [ar-] override")
    _check(_is_dirty_text("Тестовая партия", "Алматы", "Москва", "tent") is True,
           "'Тестовая партия' → dirty")
    _check(_is_dirty_text("Партия demo груза", "Алматы", "Москва", "tent") is True,
           "'demo' → dirty")
    _check(_is_dirty_text("Boris cargo", "Алматы", "Москва", "tent") is False,
           "clean text → not dirty")
    _check(_is_dirty_text("Партия test [ar-rmor1234]", "Алматы", "Москва", "tent") is False,
           "[ar-...] override beats 'test' substring")
    _check(_is_dirty_text("[ar-rm]", "Тестер", "Москва", "tent") is False,
           "[ar-...] override beats dirty city")


def public_cargo_ok_uses_correct_pickup_date():
    """Future pickup must NOT be marked stale due to date-parsing bug."""
    print("public_cargo_ok — pickup_date never collapses")
    today = date(2026, 5, 4)
    base_row = {
        "cargo_desc": "Партия Boris [ar-rmor]",
        "from_city": "Алматы",
        "to_city": "Москва",
        "cargo_type": "tent",
        "created_at": "2026-05-04 10:00:00",
    }
    for pd in ("2026-05-10", "2026-05-15", "2026-05-25", "2026-05-31",
               "2026-06-01", "2027-01-15"):
        ok = _public_cargo_ok({**base_row, "pickup_date": pd}, today=today)
        _check(ok is True, f"future pickup {pd} → visible")

    # Genuinely stale pickup must still be hidden
    stale = _public_cargo_ok({**base_row, "pickup_date": "2026-04-01"}, today=today)
    _check(stale is False, "pickup 2026-04-01 (>1 day past) → hidden")

    # Pickup exactly today minus 1 → still visible (24h grace)
    edge = _public_cargo_ok({**base_row, "pickup_date": "2026-05-03"}, today=today)
    _check(edge is True, "pickup today-1 (within 24h grace) → visible")


def public_cargo_ok_respects_cutoff_for_undated_legacy_rows():
    print("public_cargo_ok — pre-cutoff legacy rows")
    today = date(2026, 5, 4)
    legacy = {
        "cargo_desc": "Старый груз",
        "from_city": "Алматы",
        "to_city": "Москва",
        "cargo_type": "tent",
        "created_at": "2026-04-15 10:00:00",
        "pickup_date": None,
    }
    _check(_public_cargo_ok(legacy, today=today) is False,
           "pre-cutoff legacy with no pickup → hidden")

    # Same row but with a future pickup → visible
    legacy_with_pickup = {**legacy, "pickup_date": "2026-05-25"}
    _check(_public_cargo_ok(legacy_with_pickup, today=today) is True,
           "pre-cutoff but valid future pickup → visible")


def norm_route_triple_normalises_safely():
    """Stage 8 helper that converts free-form picker output into the
    canonical SQL-stored shape. The function must drop nonsense
    (long codes, unknown types) and trim names without crashing."""
    print("norm_route_triple")
    _check(_norm_route_triple('kz', 'city', 'Алматы') == ('KZ', 'city', 'Алматы'),
           "lower-case country → upper")
    _check(_norm_route_triple('CN', 'BORDER', '  Хоргос  ') == ('CN', 'border', 'Хоргос'),
           "type lowercased, name trimmed")
    _check(_norm_route_triple(None, None, None) == (None, None, None),
           "all-None passes through")
    _check(_norm_route_triple('', '', '') == (None, None, None),
           "empty strings → None")
    _check(_norm_route_triple('XYZ123', 'city', 'X') == (None, 'city', 'X'),
           "garbage country dropped to None")
    _check(_norm_route_triple('PL', 'spaceport', 'X') == ('PL', None, 'X'),
           "unknown point_type dropped to None")
    _check(_norm_route_triple('KZ', 'terminal', 'a' * 300)[2].endswith('a' * 1) and
           len(_norm_route_triple('KZ', 'terminal', 'a' * 300)[2]) == 200,
           "name trimmed to 200 chars")


def unicode_city_search_is_casefolded_outside_sqlite():
    print("unicode city search")
    _check(_city_matches("Алматы", "алматы"), "Cyrillic casefold")
    _check(_city_matches("  Шымкент  ", "ымкент"), "trimmed substring")
    _check(_city_matches("Қостанай", "қостанай"), "Kazakh characters")
    _check(_city_matches("北京市", "北京"), "Chinese dictionary value")
    _check(not _city_matches("Алматы", "Астана"), "different cities do not match")


if __name__ == "__main__":
    print(f"PUBLIC_CUTOFF_DATE={PUBLIC_CUTOFF_DATE}")
    parse_iso_date_keeps_full_day_digit()
    parse_iso_date_handles_timestamps()
    is_dirty_text_blocks_known_tokens_but_lets_qa_through()
    public_cargo_ok_uses_correct_pickup_date()
    public_cargo_ok_respects_cutoff_for_undated_legacy_rows()
    norm_route_triple_normalises_safely()
    unicode_city_search_is_casefolded_outside_sqlite()

    if _failures:
        print(f"\nFAILED ({len(_failures)}):")
        for f in _failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nALL GREEN")
