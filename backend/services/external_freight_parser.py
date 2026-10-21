"""Консервативное извлечение полей из выбранных сообщений Telegram-агента.

Извлекаются только явно обозначенные значения. Неоднозначный маршрут,
неизвестная валюта и контакты нескольких заявок не публикуются автоматически.
"""
import json
import re
import unicodedata
from datetime import datetime, timezone

from services.external_freight_classifier import classify_message

_ROUTE = re.compile(r"(?m)^[ \t]*([^\n→]{2,80}?)(?:[ \t]*(?:→|->|➜|➡)[ \t]*|[ \t]+[-–—][ \t]+)([^\n]{2,120}?)[ \t]*$")
_NOT_ROUTE_LABEL = re.compile(r"(?i)^(?:груз|цена|фрахт|вес|объём|объем|оплата|контакт|телефон|нужен|нужны|требуется)\b")
_LABELLED_ROUTE = re.compile(
    r"(?is)(?:откуда|загрузка|погрузка)\s*[:：-]\s*([^\n,;]{2,80})[\s,;]+(?:куда|выгрузка|доставка)\s*[:：-]\s*([^\n,;]{2,80})"
)
_WEIGHT = re.compile(r"(?i)(?<![\w.])(\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*(т(?:онн(?:а|ы)?)?|тонн(?:а|ы)?|кг)\b")
_VOLUME = re.compile(r"(?i)(?<![\w.])(\d+(?:[.,]\d+)?)\s*(м\s*[³3]|куб(?:ов|а)?)\b")
_COUNT = re.compile(r"(?i)(?:нужно|требуется|требуются|нужны|количество)\s*[:：-]?\s*(\d{1,4})\s*(?:машин|авто|фур)")
_CARGO = re.compile(r"(?im)^\s*(?:груз|наименование груза)\s*[:：-]\s*([^\n;]{2,120})")
_READY = re.compile(r"(?im)^\s*(?:готовность|готов|дата погрузки|загрузка)\s*[:：-]\s*([^\n;]{2,120})")
_PRICE = re.compile(r"(?i)(?<!\d)(\d[\d \t.,]{0,14})[ \t]*(USD|US\$|\$|EUR|€|RUB|₽|KZT|тг|CNY|¥)(?=$|[\W])")
_NEGOTIABLE = re.compile(r"(?i)\b(?:договорная|цена договорная|торг уместен)\b")
_DATE = re.compile(r"(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?!\d)")
_BODY = (
    ("tent", re.compile(r"(?i)\b(?:тент|тентов(?:ый|ая|ое)|tent)\b")),
    ("ref", re.compile(r"(?i)\b(?:реф|рефрижератор|reefer)\b")),
    ("izoterm", re.compile(r"(?i)\b(?:изотерм|изотермич(?:еский|ка)|isotherm)\b")),
    ("board", re.compile(r"(?i)\b(?:борт|платформа|board)\b")),
    ("tipper", re.compile(r"(?i)\b(?:самосвал|tipper)\b")),
    ("lowboy", re.compile(r"(?i)\b(?:низкорамник|трал|lowboy)\b")),
)
_CURRENCY = {"USD": "USD", "US$": "USD", "$": "USD", "EUR": "EUR", "€": "EUR", "RUB": "RUB", "₽": "RUB", "KZT": "KZT", "тг": "KZT", "CNY": "CNY", "¥": "CNY"}


def _place(value):
    # Strip decoration only. Keep the spelling supplied by the source;
    # never resolve a city, country or coordinates from an emoji.
    value = "".join(c for c in value if unicodedata.category(c) not in {"So", "Sk"} and c != "\ufe0f")
    value = value.strip(" \t,.;:!#")
    if (not value or len(value) > 80 or _NOT_ROUTE_LABEL.search(value)
            or re.search(r"(?i)\b(?:срочно|готов|погрузка|выгрузка|тент|реф|тонн|фрахт|машин)\b", value)
            or any(c.isdigit() for c in value)
            or not all(c.isalpha() or c.isspace() or c in "-(),.'’" for c in value)):
        return None
    return value


def _first(pattern, text, group=1):
    match = pattern.search(text)
    return match.group(group).strip(" \t,.;") if match else None


def _amount(text):
    match = _PRICE.search(text)
    if not match:
        return None, None, "negotiable" if _NEGOTIABLE.search(text) else "unknown"
    raw, currency_raw = match.groups()
    currency = _CURRENCY.get(currency_raw.upper(), _CURRENCY.get(currency_raw))
    if not currency:
        return None, None, "unknown"
    numeric = raw.replace(" ", "").replace("\t", "")
    if "," in numeric and "." in numeric:
        return None, None, "unknown"
    separator = "," if "," in numeric else "." if "." in numeric else None
    if separator and len(numeric.rsplit(separator, 1)[-1]) == 3 and len(numeric.rsplit(separator, 1)[0]) <= 3:
        # 4,500 / 4.500 can be a decimal or thousands separator; keep it unknown.
        return None, None, "unknown"
    try:
        amount = float(numeric.replace(",", "."))
    except ValueError:
        return None, None, "unknown"
    return (amount, currency, "known") if amount > 0 else (None, None, "unknown")


def _published(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    return str(value)


def _weight_tonnes(text):
    match = _WEIGHT.search(text)
    if not match:
        return None
    value = float(match.group(1).replace(" ", "").replace("\u00a0", "").replace(",", "."))
    return value / 1000 if match.group(2).lower() == "кг" else value


def _loading_date(text):
    for match in _DATE.finditer(text):
        value = match.group(1)
        line_start = text.rfind("\n", 0, match.start()) + 1
        line_end = text.find("\n", match.end())
        line = text[line_start:line_end if line_end >= 0 else len(text)]
        if not re.search(r"(?i)(?:погруз|загруз|готов|подач|выезд|свобод|освобод|дата)", line):
            continue
        for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%y", "%d/%m/%y", "%d-%m-%y"):
            try:
                datetime.strptime(value, fmt)
                return value
            except ValueError:
                continue
    return None


def map_selected_message(raw: dict) -> dict:
    """Преобразует одну выбранную запись агента в контракт importer API."""
    if not isinstance(raw, dict):
        raise ValueError("selected_message_must_be_object")
    text = raw.get("original_text", raw.get("text"))
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError("invalid_original_text")
    classification = classify_message(text)
    kind = classification.get("kind")
    status = classification.get("status")
    # Multi-request messages require human segmentation/contact attribution.
    if status != "active" or not kind:
        status = "review" if status != "closed" else "closed"
        kind = kind if kind in {"cargo", "vehicle"} else "cargo"
    routes = [match for match in _ROUTE.finditer(text)
              if not _NOT_ROUTE_LABEL.search(_place(match.group(1)) or match.group(1).strip())]
    if len(routes) > 1:
        status = "review"
        route = None
    else:
        route = routes[0] if routes else _LABELLED_ROUTE.search(text)
    origin = _place(route.group(1)) if route else raw.get("origin")
    destination = _place(route.group(2)) if route else raw.get("destination")
    if (not origin or not destination) and status == "active":
        status = "review"
    amount, currency, price_state = _amount(text)
    bodies = [name for name, pattern in _BODY if pattern.search(text)]
    phones = raw.get("contacts", raw.get("phones", []))
    if isinstance(phones, str):
        try:
            phones = json.loads(phones)
        except (TypeError, json.JSONDecodeError):
            phones = []
    if not isinstance(phones, list):
        phones = []
    phones = [str(phone)[:200] for phone in phones if str(phone).strip()][:20]
    # Never attach a shared contact bundle to multiple separately typed blocks.
    if classification.get("status") == "split" or len(routes) > 1:
        status = "review"
        phones = []
    return {
        "source_id": str(raw.get("source_id") or raw.get("source") or "")[:120],
        "source_message_id": str(raw.get("source_message_id") or raw.get("source_message") or raw.get("source_id_message") or raw.get("id") or "")[:160],
        "segment_id": str(raw.get("segment_id") or "0")[:80],
        "source_published_at": _published(raw.get("source_published_at", raw.get("source_date", raw.get("published_date")))),
        "original_text": text,
        "kind": kind,
        "status": status,
        "classification_status": "approved" if status == "active" else "review",
        "origin": origin or None,
        "destination": destination or None,
        "cargo_name": _first(_CARGO, text),
        "body_types": bodies,
        "weight": _weight_tonnes(text),
        "volume": float(_first(_VOLUME, text).replace(",", ".").replace(" ", "")) if _first(_VOLUME, text) else None,
        "vehicle_count": int(_first(_COUNT, text)) if _first(_COUNT, text) else None,
        "loading_date": _loading_date(text),
        "ready_text": _first(_READY, text),
        "amount": amount,
        "currency": currency,
        "price_state": price_state,
        "contacts": phones,
        "source_revision": str(raw.get("source_revision") or raw.get("fingerprint") or "")[:160],
        "origin_source": str(raw.get("origin_source") or raw.get("source") or "")[:120] or None,
    }
