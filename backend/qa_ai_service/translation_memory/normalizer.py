"""Conservative normalization used only for exact TM lookup."""
import re
import unicodedata

_CURRENCY = {"$": "usd", "＄": "usd", "доллар": "usd", "долларов": "usd", "美元": "usd", "usd": "usd", "€": "eur", "евро": "eur", "eur": "eur", "₽": "rub", "руб": "rub", "rub": "rub", "₸": "kzt", "тенге": "kzt", "kzt": "kzt", "¥": "cny", "cny": "cny"}
_UNITS = {"тонна": "ton", "тонны": "ton", "тонн": "ton", "т": "ton", "tons": "ton", "tonnes": "ton", "тон": "ton", "吨": "ton", "кг": "kg", "килограмм": "kg", "килограммов": "kg", "kg": "kg", "кубов": "m3", "м³": "m3", "м3": "m3", "кубометр": "m3", "кубометров": "m3"}


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", text).casefold().strip()
    value = value.replace("—", "-").replace("–", "-").replace("−", "-")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s*([,;:!?])\s*", r"\1 ", value)
    value = re.sub(r"\s*-\s*", "-", value)
    return value.strip()


def normalize_number(value: str) -> str:
    value = value.replace("\u00a0", " ").strip()
    if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+", value):
        return value.replace(" ", "").replace(".", "")
    return value.replace(",", ".")


def canonical_currency(value: str) -> str:
    return _CURRENCY.get(normalize_text(value), normalize_text(value))


def canonical_unit(value: str) -> str:
    return _UNITS.get(normalize_text(value), normalize_text(value))


def normalized_slot_key(slots: dict[str, str]) -> str:
    parts = []
    for name in sorted(slots):
        value = slots[name]
        if name in {"amount", "weight", "volume", "percentage"}:
            value = normalize_number(value)
        elif name == "currency":
            value = canonical_currency(value)
        elif name in {"weight_unit", "volume_unit"}:
            value = canonical_unit(value)
        else:
            value = normalize_text(value)
        parts.append(f"{name}={value}")
    return "|".join(parts)
