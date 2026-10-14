"""Small deterministic extractor; protected values are returned as slots."""
import re
from .normalizer import canonical_currency, canonical_unit, normalize_number, normalize_text

_CITIES = {"almaty": ("алматы", "almaty", "阿拉木图"), "astana": ("астана", "astana", "阿斯塔纳"), "urumqi": ("урумчи", "urumqi", "urumchi", "乌鲁木齐"), "khorgos": ("хоргос", "khorgos", "霍尔果斯")}
_BODIES = {"tent": ("тент", "тентов", "篷布车", "tent truck"), "reefer": ("рефрижератор", "冷藏车", "reefer", "refrigerated truck"), "curtain": ("шторный полуприцеп", "侧帘半挂车", "curtain-side semi-trailer")}


def _find_alias(text: str, table: dict[str, tuple[str, ...]]) -> str | None:
    lowered = normalize_text(text)
    for key, aliases in table.items():
        if any(alias.casefold() in lowered for alias in aliases):
            return key
    return None


def extract_slots(text: str, language: str) -> dict[str, str]:
    value = normalize_text(text)
    slots: dict[str, str] = {}
    cities = [key for key, aliases in _CITIES.items() if any(alias.casefold() in value for alias in aliases)]
    if cities:
        slots["city_name"] = cities[0]
        if len(cities) > 1:
            slots["city_to"] = cities[1]
    body = _find_alias(value, _BODIES)
    if body:
        slots["vehicle_type"] = body
    if any(token in value for token in ("не", "без", "нельзя", "нет", "не нужен", "不", "没", "没有", "未", "不要", "no ", "not ", "don't", "do not")):
        slots["negation"] = "required"
    ready = any(token in value for token in ("груз готов", "cargo ready", "goods are ready", "货物已经准备好了", "货物准备好了"))
    if ready:
        slots["cargo_status"] = "ready"
    not_ready = any(token in value for token in ("груз не готов", "cargo is not ready", "cargo isn't ready", "goods aren't ready", "货物未准备好"))
    if not_ready:
        slots["cargo_status"] = "not_ready"
    money = re.search(r"(?P<number>\d[\d .,]*)\s*(?P<currency>usd|доллар\w*|\$|美元|eur|€|rub|₽|kzt|₸|тенге)", value, re.I)
    if money:
        slots["amount"] = normalize_number(money.group("number"))
        slots["currency"] = canonical_currency(money.group("currency"))
    weight = re.search(r"(?P<number>\d+(?:[.,]\d+)?)\s*(?P<unit>тонн\w*|т|吨|tons?|tonnes?)", value, re.I)
    if weight:
        slots["weight"] = normalize_number(weight.group("number"))
        slots["weight_unit"] = canonical_unit(weight.group("unit"))
    clock = re.search(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\b", value)
    if clock:
        slots["time"] = f"{int(clock.group(1)):02d}:{clock.group(2)}"
    date = re.search(r"\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b", value)
    if date:
        slots["date"] = date.group(1).replace("/", "-").replace(".", "-")
    return slots
