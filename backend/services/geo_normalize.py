"""Каноническая нормализация страны для сравнения маршрутов (аудит Блок 4,
P0-3): "международный/внутренний маршрут" раньше вычислялся ТОЛЬКО на
фронте (и по-разному в MyTripsScreen.js/TripDetail.js), а сервер либо не
проверял его вовсе, либо полагался на грубую эвристику
`len(code) <= 4 and code.isalpha()` — принимавшую любой алфавитный мусор
("XX", "ZZ") как "международный".

Это ЕДИНСТВЕННЫЙ источник истины на бэкенде для international/domestic —
используется в PATCH /market/deals/{id}/status (_deal_country_guard в
api/marketplace.py) и в ответе GET /market/deals/{id}
(is_international/route_country_valid), чтобы фронт мог читать готовый
результат вместо повторного вычисления.

Намеренно НЕ трогает create-time запись груза/рейса (_norm_route_triple в
api/marketplace.py, вне периметра этого фикса) — та остаётся permissive
как была, здесь только сравнение для деловой логики статусов.
"""
from typing import Optional, Tuple

# ISO-2 канон. Ключи — известные варианты ввода в нижнем регистре (ISO-2,
# ISO-3, EN и RU названия) для стран, реально встречающихся в проекте
# (маршруты Китай↔СНГ, см. CLAUDE.md) + соседи по коридору.
_COUNTRY_MAP = {
    # Казахстан
    "kz": "KZ", "kaz": "KZ", "kazakhstan": "KZ", "казахстан": "KZ",
    # Россия
    "ru": "RU", "rus": "RU", "russia": "RU", "russian federation": "RU",
    "россия": "RU", "российская федерация": "RU",
    # Китай
    "cn": "CN", "chn": "CN", "china": "CN", "китай": "CN", "кнр": "CN",
    # Кыргызстан
    "kg": "KG", "kgz": "KG", "kyrgyzstan": "KG", "kirghizia": "KG",
    "киргизия": "KG", "кыргызстан": "KG",
    # Узбекистан
    "uz": "UZ", "uzb": "UZ", "uzbekistan": "UZ", "узбекистан": "UZ",
    # Таджикистан
    "tj": "TJ", "tjk": "TJ", "tajikistan": "TJ", "таджикистан": "TJ",
    # Беларусь
    "by": "BY", "blr": "BY", "belarus": "BY", "беларусь": "BY", "белоруссия": "BY",
    # Турция
    "tr": "TR", "tur": "TR", "turkey": "TR", "turkiye": "TR", "türkiye": "TR", "турция": "TR",
    # Прочие соседи коридора (см. _COUNTRY_ALIASES в api/marketplace.py)
    "ir": "IR", "irn": "IR", "iran": "IR", "иран": "IR",
    "af": "AF", "afg": "AF", "afghanistan": "AF", "афганистан": "AF",
    "pk": "PK", "pak": "PK", "pakistan": "PK", "пакистан": "PK",
    "mn": "MN", "mng": "MN", "mongolia": "MN", "монголия": "MN",
    "ge": "GE", "geo": "GE", "georgia": "GE", "грузия": "GE",
    "az": "AZ", "aze": "AZ", "azerbaijan": "AZ", "азербайджан": "AZ",
    "am": "AM", "arm": "AM", "armenia": "AM", "армения": "AM",
    "tm": "TM", "tkm": "TM", "turkmenistan": "TM", "туркменистан": "TM",
    "ua": "UA", "ukr": "UA", "ukraine": "UA", "украина": "UA",
}

# Те же допустимые ISO-2, что уже доступны в src/utils/countries.js.
# Полный picker не должен давать маршруты, запрещённые серверным справочником.
# Неизвестные XX/ZZ не входят в конечный список и остаются запрещены.
_KNOWN_ISO2 = set(
    "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split()
)


def normalize_country(value: Optional[str]) -> Optional[str]:
    """Возвращает ISO-2 код страны или None, если значение пустое либо не
    распознано ни одним известным алиасом. Никогда не бросает исключение —
    вызывающий код сам решает, что делать с None."""
    if not value or not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    key = raw.lower()
    if key in _COUNTRY_MAP:
        return _COUNTRY_MAP[key]
    upper = raw.upper()
    if len(upper) == 2 and upper.isalpha() and upper in _KNOWN_ISO2:
        return upper
    return None


def is_international_route(from_country: Optional[str], to_country: Optional[str]) -> Tuple[Optional[bool], str]:
    """Классифицирует маршрут по нормализованным странам.

    Возвращает (is_international, code):
      is_international=True  — страны распознаны и различаются (международный).
      is_international=False — страны распознаны и совпадают (внутренний).
      is_international=None  — маршрут нельзя классифицировать; code:
        - 'ROUTE_COUNTRY_UNKNOWN' — значение было передано, но не входит
          в известный справочник (опечатка/незнакомая страна);
        - 'ROUTE_REQUIRES_CLARIFICATION' — страна(ы) не указаны вовсе.
    code == 'ok', когда классификация удалась.
    """
    fc = normalize_country(from_country)
    tc = normalize_country(to_country)
    if (from_country and not fc) or (to_country and not tc):
        return None, "ROUTE_COUNTRY_UNKNOWN"
    if not fc or not tc:
        return None, "ROUTE_REQUIRES_CLARIFICATION"
    return (fc != tc), "ok"
