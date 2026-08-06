"""Блок 4 аудита (P0-3): services/geo_normalize.py — единый backend-канон
для "международный/внутренний маршрут". Раньше сервер либо не проверял
страну вовсе, либо использовал эвристику `len(code)<=4 and code.isalpha()`,
пропускавшую любой алфавитный мусор ("XX"/"ZZ") как "международный".

Чистый unit-тест (без HTTP/БД) — предметная логика сравнения стран.
Отдельно HTTP-уровень (что этот модуль реально enforce-ит на
PATCH /market/deals/{id}/status) покрыт в test_deal_status_actor_fsm.py.

Run from backend/:
    python -m tests.test_route_country_fsm
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.geo_normalize import normalize_country, is_international_route


def test_kz_kz_domestic():
    intl, code = is_international_route("KZ", "KZ")
    assert intl is False and code == "ok"


def test_kz_ru_international():
    intl, code = is_international_route("KZ", "RU")
    assert intl is True and code == "ok"


def test_full_english_names_international():
    intl, code = is_international_route("Kazakhstan", "Russia")
    assert intl is True and code == "ok"


def test_full_russian_names_domestic():
    intl, code = is_international_route("Казахстан", "Казахстан")
    assert intl is False and code == "ok"


def test_mixed_case_and_alias_forms():
    intl, code = is_international_route("kazakhstan", "RUSSIA")
    assert intl is True and code == "ok"
    intl2, code2 = is_international_route("КНР", "kz")
    assert intl2 is True and code2 == "ok"


def test_both_empty_unknown():
    intl, code = is_international_route("", "")
    assert intl is None and code == "ROUTE_REQUIRES_CLARIFICATION"
    intl2, code2 = is_international_route(None, None)
    assert intl2 is None and code2 == "ROUTE_REQUIRES_CLARIFICATION"


def test_one_side_missing_unknown():
    intl, code = is_international_route("KZ", "")
    assert intl is None and code == "ROUTE_REQUIRES_CLARIFICATION"
    intl2, code2 = is_international_route("", "RU")
    assert intl2 is None and code2 == "ROUTE_REQUIRES_CLARIFICATION"


def test_unknown_country_name_not_treated_as_international():
    """Регресс главной находки аудита: 'XX'/'ZZ' раньше проходили как
    валидная страна (len<=4 and isalpha()). Теперь — явный unknown, а не
    тихое "международный"."""
    intl, code = is_international_route("XX", "KZ")
    assert intl is None and code == "ROUTE_COUNTRY_UNKNOWN"
    intl2, code2 = is_international_route("KZ", "ZZ")
    assert intl2 is None and code2 == "ROUTE_COUNTRY_UNKNOWN"
    intl3, code3 = is_international_route("Narnia", "Mordor")
    assert intl3 is None and code3 == "ROUTE_COUNTRY_UNKNOWN"


def test_normalize_country_returns_iso2_or_none():
    assert normalize_country("kz") == "KZ"
    assert normalize_country("Kazakhstan") == "KZ"
    assert normalize_country("Казахстан") == "KZ"
    assert normalize_country("KAZ") == "KZ"
    assert normalize_country("") is None
    assert normalize_country(None) is None
    assert normalize_country("XX") is None
    assert normalize_country("   ") is None


if __name__ == "__main__":
    fails = 0
    for fn in [test_kz_kz_domestic, test_kz_ru_international,
               test_full_english_names_international, test_full_russian_names_domestic,
               test_mixed_case_and_alias_forms, test_both_empty_unknown,
               test_one_side_missing_unknown, test_unknown_country_name_not_treated_as_international,
               test_normalize_country_returns_iso2_or_none]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
