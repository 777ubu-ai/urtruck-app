"""Консервативное извлечение полей из выбранных сообщений Telegram-агента.

Извлекаются только явно обозначенные значения. Неоднозначный маршрут,
неизвестная валюта и контакты нескольких заявок не публикуются автоматически.
"""
import json
import re
import unicodedata
from datetime import datetime, timezone

from services.external_freight_classifier import classify_message
from services.external_freight_route_places import COMPACT_ROUTE_PLACES

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
_PRICE = re.compile(r"(?i)(?<!\d)(\d[\d \t.,]{0,14})[ \t]*(USD|US\$|\$|EUR|€|RUB|₽|KZT|тг|CNY|JPY|¥)(?:[ \t]*\([ \t]*(CNY|JPY)[ \t]*\))?(?=$|[\W])")
_NEGOTIABLE = re.compile(r"(?i)\b(?:договорная|цена договорная|торг уместен)\b")
_DATE = re.compile(r"(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?!\d)")
_BODY = (
    ("tent", re.compile(r"(?i)\b(?:тент|тентов(?:ый|ая|ое)|tent)\b")),
    ("ref", re.compile(r"(?i)\b(?:р[еэ]ф|рефрижератор|reefer|ref)\b")),
    ("izoterm", re.compile(r"(?i)\b(?:изотерм|изотермич(?:еский|ка)|isotherm)\b")),
    ("board", re.compile(r"(?i)\b(?:борт|платформа|board)\b")),
    ("tipper", re.compile(r"(?i)\b(?:самосвал|tipper)\b")),
    ("lowboy", re.compile(r"(?i)\b(?:низкорамник|трал|lowboy)\b")),
)
_CURRENCY = {"USD": "USD", "US$": "USD", "$": "USD", "EUR": "EUR", "€": "EUR", "RUB": "RUB", "₽": "RUB", "KZT": "KZT", "тг": "KZT", "CNY": "CNY", "JPY": "JPY"}

# Только проверенные написания из источников. Значения служат для проверки
# совпадения bilingual-блоков; отображаем исходное написание, страну не выводим.
_VEHICLE_PLACES = {
    'хоргос': 'khorgos', 'khorgos': 'khorgos', 'алматы': 'almaty',
    'москва': 'moscow', 'астана': 'astana', 'алашанькоу': 'alashankou',
    'toshkent': 'tashkent', 'ташкент': 'tashkent', 'nukus': 'nukus', 'нукус': 'nukus',
    'qashqadaryo': 'qashqadaryo', 'кашкадарё': 'qashqadaryo',
    'қашқадарё': 'qashqadaryo', 'кашкадарья': 'qashqadaryo',
    'andijon': 'andijan', 'андижон': 'andijan', 'андижан': 'andijan',
    'qarshi koson': 'qarshi-koson', 'qarshi': 'qarshi', 'карши': 'qarshi',
    'buxoro': 'bukhara', 'бухоро': 'bukhara', 'бухара': 'bukhara',
    'uluĝchat': 'ulugchat', 'ulugchat': 'ulugchat', 'улучат': 'ulugchat',
}
_VEHICLE_PLACE_PATTERN = '|'.join(re.escape(p) for p in sorted(_VEHICLE_PLACES, key=len, reverse=True))
_UZ_ORIGIN = re.compile(r'(?i)\b(' + _VEHICLE_PLACE_PATTERN + r')(?:dan|дан)\b')
_UZ_DESTINATION = re.compile(r'(?i)\b(' + _VEHICLE_PLACE_PATTERN + r')(?:ga|га)\b')
_VEHICLE_COUNT = re.compile(
    r'(?i)(?:\b(?:fura|m[ao]shina)\s+bor\s+(\d{1,4})\s*ta\b|'
    r'\b(\d{1,4})\s*ta\s+(?:katta\s+)?(?:isuzu(?:ga)?|fura|m[ao]shina)\b|'
    r'\bесть\s+(\d{1,4})\s+машин\w*)')


def _vehicle_locations(text):
    origins, destinations = {}, {}

    def add(target, value):
        cleaned = _place(value)
        key = _VEHICLE_PLACES.get((cleaned or '').casefold())
        if key:
            target.setdefault(key, cleaned)

    for match in _UZ_ORIGIN.finditer(text):
        add(origins, match.group(1))
    for match in _UZ_DESTINATION.finditer(text):
        add(destinations, match.group(1))
    for line in text.splitlines():
        cleaned = _place(line.strip('*_'))
        if cleaned and cleaned.casefold() in _VEHICLE_PLACES:
            add(origins, cleaned)
        direction = re.search(r'(?i)\bнаправление\s*[:：]?\s+(.+)$', line)
        if direction:
            add(destinations, direction.group(1))
        # Без пробелов дефис может быть частью города: нужны два известных конца.
        for match in re.finditer(r'[-–—]', line):
            left, right = _place(line[:match.start()]), _place(line[match.end():])
            if ((left or '').casefold() in _VEHICLE_PLACES
                    and (right or '').casefold() in _VEHICLE_PLACES):
                add(origins, left)
                add(destinations, right)
    if len(origins) > 1 or len(destinations) > 1:
        return None, None
    return next(iter(origins.values()), None), next(iter(destinations.values()), None)



# Accept a whole line containing two explicit known names. A hyphen inside one
# city (Санкт-Петербург) never creates a route. Preserve the literal spelling.
_COMPACT_PLACES = "|".join(re.escape(name) for name in COMPACT_ROUTE_PLACES)
_COMPACT_ROUTE = re.compile(
    r"(?im)^[ \t]*[^\w\n]*?(" + _COMPACT_PLACES + r")"
    r"(?:[ \t]*[-–—]{1,2}[ \t]*|[ \t]+)[^\w\n]*?("
    + _COMPACT_PLACES + r")[^\w\n]*$"
)


def _compact_routes(text, *, allow_space=False):
    return [m for m in _COMPACT_ROUTE.finditer(text)
            if (allow_space or re.search(r"[-–—]", text[m.end(1):m.start(2)]))
            and not re.search(r"[?？❓❔/]", m.group())]


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
    raw, currency_raw, yen_code = match.groups()
    # Символ ¥ используется и для CNY, и для JPY; без явного кода не угадываем.
    if currency_raw == "¥":
        currency_raw = yen_code or ""
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
    compact = _compact_routes(text, allow_space=kind == "vehicle")
    # Count mixed arrow/compact formats together; never collapse two requests.
    routes += [m for m in compact if not any(
        m.start() < existing.end() and m.end() > existing.start() for existing in routes)]
    routes.sort(key=lambda m: m.start())
    if len(routes) > 1:
        status = "review"
        route = None
    else:
        route = routes[0] if routes else _LABELLED_ROUTE.search(text)
    origin = _place(route.group(1)) if route else raw.get("origin")
    destination = _place(route.group(2)) if route else raw.get("destination")
    if not route and kind == 'vehicle' and not origin and not destination:
        origin, destination = _vehicle_locations(text)
    if not origin and not destination:
        partial = re.search(r"(?im)^\s*(?:местонахождение|нахожусь|стою|откуда|из)\s*[:：]?\s+([^\n;]{2,80})$", text)
        origin = _place(partial.group(1)) if partial else None
        if not origin and kind=="vehicle":
            location = re.search(
                r"(?m)^\s*(?i:свободн(?:ая|ый|ые)\s+(?:машин\w*|тент\w*|реф\w*|фур\w*|транспорт|авто)\s+в)\s+"
                r"([А-ЯЁA-Z][^\n,.;]{1,79})(?:[,.;\n]|$)",text)
            origin = _place(location.group(1)) if location else None
    if ((route and (not origin or not destination)) or (not origin and not destination)) and status == "active":
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
    if not phones:
        phones = block_contacts(text)
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
        "vehicle_count": _vehicle_count(text, kind),
        "loading_date": _loading_date(text),
        "ready_text": _first(_READY, text),
        "amount": amount,
        "currency": currency,
        "price_state": price_state,
        "contacts": phones,
        "source_revision": str(raw.get("source_revision") or raw.get("fingerprint") or "")[:160],
        "origin_source": str(raw.get("origin_source") or raw.get("source") or "")[:120] or None,
    }


_PHONE_BLOCK = re.compile(r"(?<!\d)(?:\+?\d[\d \t().-]{7,24}\d)(?!\d)")


def _vehicle_count(text, kind):
    if kind == 'vehicle':
        match = _VEHICLE_COUNT.search(text)
        return int(next(value for value in match.groups() if value)) if match else None
    return int(_first(_COUNT, text)) if _first(_COUNT, text) else None


def block_contacts(text):
    """Только явно написанные в блоке номера, без угадывания страны."""
    result = []
    # Числа цены/веса/объёма не становятся телефоном даже рядом со словом «телефон».
    numeric_fields = [match.span() for pattern in (_PRICE, _WEIGHT, _VOLUME, _DATE)
                      for match in pattern.finditer(text)]
    for match in _PHONE_BLOCK.finditer(text):
        raw = match.group().strip()
        digits = re.sub(r"\D", "", raw)
        start = text.rfind('\n', 0, match.start()) + 1
        end = text.find('\n', match.end())
        line = text[start:end if end >= 0 else len(text)]
        prefix = text[start:match.start()]
        if (any(match.start() < right and match.end() > left for left, right in numeric_fields)
                or re.search(r'(?i)(?:\b(?:цена|стоимость|ставка|оплата|price|вес|объ[её]м)\s*[:=—–-]?\s*'
                             r'(?:[a-z]{3}|тг|[$€₽¥])?|\b(?:USD|EUR|RUB|KZT|CNY|JPY|тг)|[$€₽¥])\s*$', prefix)):
            continue
        phone_context = re.search(r'(?i)(?:📞|☎|\bтел(?:ефон)?\.?|\btel)\s*[:=—–-]?\s*$', prefix)
        local_phone = (len(digits) == 9 and raw.replace(' ', '').replace('\t', '').isdigit()
                       and (line.strip() == raw or phone_context))
        if (10 <= len(digits) <= 15 or local_phone) and raw not in result:
            result.append(raw)
    return result[:20]


def _only_country_headers(value):
    # Разрешаем только известные заголовки стран/декор; общие контакты и условия
    # перед первым маршрутом не могут быть безопасно распределены по заявкам.
    allowed={"россия","казахстан","китай","европа","беларусь","узбекистан","киргизия",
             "russia","kazakhstan","china","europe","中国","俄罗斯","哈萨克斯坦"}
    for line in value.splitlines():
        cleaned="".join(c for c in line if c.isalpha() or c.isspace()).strip().casefold()
        if cleaned and cleaned not in allowed:
            return False
        if any(c.isdigit() for c in line) or "@" in line or "http" in line.casefold():
            return False
    return True


def _country_header_offsets(value):
    offset=0
    result=[]
    for line in value.splitlines(keepends=True):
        if any(c.isalpha() for c in line) and _only_country_headers(line):
            result.append(offset)
        offset+=len(line)
    return result


def map_selected_messages(raw):
    """Нумерованные или явно разделённые маршрутные блоки, без наследования."""
    text = raw.get("original_text", raw.get("text", ""))
    if not isinstance(text,str) or len(text)>20000:
        raise ValueError("invalid_original_text")
    numbered = list(re.finditer(r"(?m)^\s*\d+[.)]\s+",text))
    blocks = []
    if len(numbered)>1 and not text[:numbered[0].start()].strip():
        for i,m in enumerate(numbered):
            end = numbered[i+1].start() if i+1<len(numbered) else len(text)
            blocks.append(text[m.end():end].strip())
    else:
        route_matches = [m for m in _ROUTE.finditer(text) if _place(m.group(1)) and _place(m.group(2))]
        route_matches += [m for m in _compact_routes(text) if not any(
            m.start() < existing.end() and m.end() > existing.start() for existing in route_matches)]
        route_matches.sort(key=lambda m: m.start())
        # Безопасен список, где каждый блок начинается своим маршрутом.
        if len(route_matches)>1 and _only_country_headers(text[:route_matches[0].start()]):
            candidate_blocks=[]
            safe=True
            for i,m in enumerate(route_matches):
                end=route_matches[i+1].start() if i+1<len(route_matches) else len(text)
                headers=_country_header_offsets(text[m.end():end])
                if headers:
                    cut=m.end()+headers[0]
                    # Поля перед следующим маршрутом могут быть общими для новой
                    # секции. Нельзя присвоить их предыдущей или следующей заявке.
                    if i+1==len(route_matches) or not _only_country_headers(text[cut:end]):
                        safe=False
                        break
                    end=cut
                candidate_blocks.append(text[m.start():end].strip())
            if safe:
                blocks=candidate_blocks
    if not blocks:
        return [map_selected_message(raw)]
    result=[]
    for i,block in enumerate(blocks):
        item_raw = {k:v for k,v in raw.items() if k not in {
            "text","original_text","phones","contacts","origin","destination","amount","currency","kind","status"}}
        item_raw.update(text=block,contacts=block_contacts(block),segment_id=f"block-{i+1}")
        item=map_selected_message(item_raw)
        result.append(item)
    return result
