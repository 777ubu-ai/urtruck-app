"""Консервативное извлечение полей из выбранных сообщений Telegram-агента.

Извлекаются только явно обозначенные значения. Неоднозначный маршрут,
неизвестная валюта и контакты нескольких заявок не публикуются автоматически.
"""
import json
import re
import unicodedata
from datetime import datetime, timezone

from services.external_freight_classifier import classify_message, uses_extended_intent
from services.external_freight_route_places import COMPACT_ROUTE_PLACES

_ROUTE = re.compile(r"(?m)^[ \t]*([^\n→]{2,80}?)(?:[ \t]*(?:→|->|➜|➡)[ \t]*|[ \t]+[-–—][ \t]+)([^\n]{2,120}?)[ \t]*$")
_NOT_ROUTE_LABEL = re.compile(r"(?i)^(?:груз|цена|фрахт|вес|объём|объем|оплата|контакт|телефон|нужен|нужны|требуется)\b")
_WEB_DOMAIN = re.compile(r"(?i)(?:https?://|www\.|(?<!\w)[\w-]+\.[^\W\d_]{2,63}(?!\w))")
_LABELLED_ROUTE = re.compile(
    r"(?is)(?:откуда|загрузка|погрузка)\s*[:：-]\s*([^\n,;]{2,80})[\s,;]+(?:куда|выгрузка|доставка)\s*[:：-]\s*([^\n,;]{2,80})"
)
_WEIGHT = re.compile(r"(?i)(?<![\w.])(\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*(т(?:онн(?:а|ы)?)?|тонн(?:а|ы)?|кг)\b")
_VOLUME = re.compile(r"(?i)(?<![\w.])(\d+(?:[.,]\d+)?)\s*(м\s*[³3]|куб(?:ов|а)?)\b")
_COUNT = re.compile(r"(?i)(?:нужно|требуется|требуются|нужны|количество)\s*[:：-]?\s*(\d{1,4})\s*(?:машин|авто|фур)")
_CARGO = re.compile(r"(?im)^\s*(?:груз|наименование груза)\s*[:：-]\s*([^\n;]{2,120})")
_READY = re.compile(r"(?im)^\s*(?:готовность|готов|дата погрузки|загрузка)\s*[:：-]\s*([^\n;]{2,120})")
_VEHICLE_READY = re.compile(r'(?im)^([^\n]{0,80}\b(?:освободим\w*|освободит\w*|(?:готов\w*|свободн\w*)\s+(?:к\s+загрузке|завтра|послезавтра|через\s+|\d{1,2}[.]))[^\n]{0,120})$')
_PRICE = re.compile(r"(?i)(?<!\d)(\d[\d \t.,]{0,14})[ \t]*(USD|US\$|\$|EUR|€|RUB|₽|KZT|тг|CNY|JPY|¥)(?:[ \t]*\([ \t]*(CNY|JPY)[ \t]*\))?(?=$|[\W])")
_NEGOTIABLE = re.compile(r"(?i)\b(?:договорная|цена договорная|торг уместен|(?:narx|нарх)\s*[:：]\s*(?:kelishiladi|келишилади))\b")
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
    'toshkent': 'tashkent', 'ташкент': 'tashkent', 'ташкента': 'tashkent',
    'самарканд': 'samarkand', 'самарканда': 'samarkand',
    'samarqand': 'samarkand', 'samarkand': 'samarkand',
    'nukus': 'nukus', 'нукус': 'nukus',
    'qashqadaryo': 'qashqadaryo', 'кашкадарё': 'qashqadaryo',
    'қашқадарё': 'qashqadaryo', 'кашкадарья': 'qashqadaryo',
    'andijon': 'andijan', 'андижон': 'andijan', 'андижан': 'andijan',
    'qarshi koson': 'qarshi-koson', 'qarshi': 'qarshi', 'карши': 'qarshi',
    'buxoro': 'bukhara', 'бухоро': 'bukhara', 'бухара': 'bukhara',
    'uluĝchat': 'ulugchat', 'ulugchat': 'ulugchat', 'улучат': 'ulugchat',
    'оренбург': 'orenburg', 'оренбурга': 'orenburg',
}
_VEHICLE_PLACE_PATTERN = '|'.join(re.escape(p) for p in sorted(_VEHICLE_PLACES, key=len, reverse=True))
_UZ_ORIGIN = re.compile(r'(?i)\b(' + _VEHICLE_PLACE_PATTERN + r')(?:dan|дан)\b')
_UZ_DESTINATION = re.compile(r'(?i)\b(' + _VEHICLE_PLACE_PATTERN + r')(?:ga|га)\b')
_RU_VEHICLE_PAIR_HINT = re.compile(
    r'(?i)\b(?:ищу|ищем|нужен)\s+груз\s+(?:с|из)\s+[^\n]{1,80}?\s+(?:до|в|на)\s+')
_RU_VEHICLE_PAIR = re.compile(
    r'(?i)\b(?:ищу|ищем|нужен)\s+груз\s+(?:с|из)\s+('
    + _VEHICLE_PLACE_PATTERN + r')\s+(?:до|в|на)\s+('
    + _VEHICLE_PLACE_PATTERN + r')(?![\w-])')
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
        pairs = list(_RU_VEHICLE_PAIR.finditer(line))
        pair = pairs[0] if pairs else None
        pair_hints = list(_RU_VEHICLE_PAIR_HINT.finditer(line))
        if pair_hints:
            # Не заменяем непонятную/альтернативную пару другой известной строкой.
            if (len(pair_hints) != 1 or len(pairs) != 1 or re.search(r'[?？/→]|->', line)
                    or re.search(r'(?i)^\s*[,;]?\s*(?:или|либо|до|в|на)\b', line[pair.end():])):
                return None, None
            add(origins, pair.group(1))
            add(destinations, pair.group(2))
        cleaned = _place(line.strip('*_'))
        if cleaned and cleaned.casefold() in _VEHICLE_PLACES:
            add(origins, cleaned)
        direction = re.search(r'(?i)\bнаправление\s*[:：]?\s+(.+)$', line)
        if direction:
            add(destinations, direction.group(1))
        search_origin = re.fullmatch(
            r'(?i)\s*(?:ищу|ищем)\s+груз\s+(?:с|из)\s+(.+?)\s*', line)
        if search_origin and not pair:
            place = _place(search_origin.group(1))
            # Только проверенное место; «с оплатой» и неизвестные слова не города.
            if (place or '').casefold() not in _VEHICLE_PLACES:
                return None, None
            add(origins, place)
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


def _compact_routes(text, *, allow_space=False, allow_hyphenated=False):
    return [m for m in _COMPACT_ROUTE.finditer(text)
            if (allow_space or re.search(r"[-–—]", text[m.end(1):m.start(2)]))
            and (allow_hyphenated or not ('-' in m.group(1) or '-' in m.group(2)))
            and not re.search(r"[→➡➜↔]", m.group())
            and not re.search(r"[?？❓❔/]", m.group())]


def _place(value):
    # Strip decoration only. Keep the spelling supplied by the source;
    # never resolve a city, country or coordinates from an emoji.
    value = "".join(c for c in value if unicodedata.category(c) not in {"So", "Sk"} and c != "\ufe0f")
    value = value.strip(" \t,.;:!#")
    # Сокращения города допустимы, доменные имена географией не становятся.
    domain_candidate = re.sub(r"(?i)^(?:г\.|st\.|ste\.|mt\.)(?=[^\W\d_])", "", value)
    if (not value or len(value) > 80 or _NOT_ROUTE_LABEL.search(value)
            or _WEB_DOMAIN.search(domain_candidate)
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
              if (_place(match.group(1)) and _place(match.group(2))
                  and not _NOT_ROUTE_LABEL.search(_place(match.group(1)) or match.group(1).strip()))]
    malformed_web_route = any(
        _WEB_DOMAIN.search(re.sub(r"(?i)^(?:г\.|st\.|ste\.|mt\.)", "", endpoint.strip()))
        for match in _ROUTE.finditer(text)
        for endpoint in (match.group(1), match.group(2))
    )
    # В свободной форме предложения машины компактный дефисный город может
    # означать местонахождение. Подтверждённый груз задаёт маршрут явно.
    # Два известных географических названия без стрелки/дефиса также задают
    # направление: такие строки встречаются в коротких Telegram-объявлениях.
    compact = _compact_routes(text, allow_space=True, allow_hyphenated=kind == 'cargo')
    # Count mixed arrow/compact formats together; never collapse two requests.
    routes += [m for m in compact if not any(
        m.start() < existing.end() and m.end() > existing.start() for existing in routes)]
    routes.sort(key=lambda m: m.start())
    route_conflict = len(routes) > 1 or bool(compact and re.search(
        r'(?i)\b(?:откуда|куда|погрузка|выгрузка|загрузка|доставка)(?:\s*[:：]|\s+)', text))
    if route_conflict:
        # Несколько/неразобранных направлений не должны скрывать объявление.
        # Полный текст остаётся на карточке; поля маршрута оставляем пустыми.
        route = None
    else:
        route = routes[0] if routes else _LABELLED_ROUTE.search(text)
    origin = None if route_conflict else _place(route.group(1)) if route else raw.get("origin")
    destination = None if route_conflict else _place(route.group(2)) if route else raw.get("destination")
    if not route_conflict and not route and kind == 'vehicle' and not origin and not destination:
        origin, destination = _vehicle_locations(text)
    if not route_conflict and not origin and not destination:
        partial = re.search(r"(?im)^\s*(?:местонахождение|нахожусь|стою|откуда|из)\s*[:：]?\s+([^\n;]{2,80})$", text)
        origin = _place(partial.group(1)) if partial else None
        if not origin and kind=="vehicle":
            location = re.search(
                r"(?m)^\s*(?i:свободн(?:ая|ый|ые)\s+(?:машин\w*|тент\w*|реф\w*|фур\w*|транспорт|авто)\s+в)\s+"
                r"([А-ЯЁA-Z][^\n,.;]{1,79})(?:[,.;\n]|$)",text)
            origin = _place(location.group(1)) if location else None
    amount, currency, price_state = _amount(text)
    if malformed_web_route:
        status = "review"
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
    # Источник может передать неполный список контактов. Дополняем его
    # осторожным разбором текста объявления, сохраняя исходный формат номера.
    known_phone_ids = {_phone_identity(phone) for phone in phones if _phone_identity(phone)}
    for phone in block_contacts(text):
        identity = _phone_identity(phone)
        if identity and identity not in known_phone_ids and len(phones) < 20:
            phones.append(phone)
            known_phone_ids.add(identity)
    # Explicit numbered multi-request posts need segmentation first. A route
    # list that the parser cannot split remains one visible card with its full
    # source text rather than disappearing into review.
    if classification.get("status") == "split":
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
        "ready_text": _first(_READY, text) or (_first(_VEHICLE_READY, text) if kind == 'vehicle' else None),
        "amount": amount,
        "currency": currency,
        "price_state": price_state,
        "contacts": phones,
        "source_revision": str(raw.get("source_revision") or raw.get("fingerprint") or "")[:160],
        "origin_source": str(raw.get("origin_source") or raw.get("source") or "")[:120] or None,
    }


_PHONE_BLOCK = re.compile(r"(?<!\d)\+?\d[\d \t().-]{4,24}\d(?!\d)")
_PHONE_CONTEXT = re.compile(
    r'(?i)(?:📞|📲|☎|\bтел(?:ефон)?\.?|\btel|контакт|whats?app|telegram|'
    r'\bномер\b|\bсвязь\b|\bмоб(?:ильный)?\b|ватсап|телеграм)'
    r'\ufe0f?\s*[:=—–-]?\s*'
)
_NON_PHONE_ID_PREFIX = re.compile(
    r'(?i)\b(?:ID|номер\s+(?:заявки|заказа|договора|сч[её]та|рейса|авто|машины|тс))\s*[:#=]?\s*$')


def _unicode_phone_runs(value):
    """Read ASCII, Arabic, and Telegram keycap digits without guessing a country."""
    runs = []
    digits = []
    plus = False
    for char in value:
        try:
            digit = unicodedata.digit(char)
        except (TypeError, ValueError):
            digit = None
        if digit is not None:
            digits.append(str(digit))
        elif char == '+' and not digits:
            plus = True
        elif char.isspace() or char in '().-\ufe0f\u20e3':
            continue
        else:
            if digits:
                runs.append(('+' if plus else '') + ''.join(digits))
            digits = []
            plus = False
    if digits:
        runs.append(('+' if plus else '') + ''.join(digits))
    return runs


def _vehicle_count(text, kind):
    if kind == 'vehicle':
        match = _VEHICLE_COUNT.search(text)
        return int(next(value for value in match.groups() if value)) if match else None
    return int(_first(_COUNT, text)) if _first(_COUNT, text) else None


def block_contacts(text):
    """Номера из блока без угадывания страны, включая Unicode и местный формат."""
    # Нормализуем только копию для извлечения: полный исходник сохраняется
    # буквально. Невидимые разделители и цифры-клавиши не разрывают телефон.
    normalized = []
    for char in text:
        if unicodedata.category(char) == 'Cf' or char in '\ufe0f\u20e3':
            continue
        try:
            normalized.append(str(unicodedata.digit(char)))
        except (TypeError, ValueError):
            normalized.append(' ' if unicodedata.category(char) == 'Zs' else char)
    text = ''.join(normalized)
    result = []
    lines = text.splitlines()
    nonempty = [index for index, line in enumerate(lines) if line.strip()]
    footer_lines = set(nonempty[-3:])
    # Числа цены/веса/объёма не становятся телефоном даже рядом со словом «телефон».
    numeric_fields = [match.span() for pattern in (_PRICE, _WEIGHT, _VOLUME, _DATE)
                      for match in pattern.finditer(text)]
    for match in _PHONE_BLOCK.finditer(text):
        raw = match.group().strip()
        digits = re.sub(r"\D", "", raw)
        start = text.rfind('\n', 0, match.start()) + 1
        end = text.find('\n', match.end())
        line = text[start:end if end >= 0 else len(text)]
        line_number = text.count('\n', 0, start)
        prefix = text[start:match.start()]
        if re.search(r'(?i)\bуточняйте\b', prefix):
            continue
        if _NON_PHONE_ID_PREFIX.search(prefix):
            continue
        if (any(match.start() < right and match.end() > left for left, right in numeric_fields)
                or re.search(r'(?i)(?:\b(?:цена|стоимость|ставка|оплата|price|вес|объ[её]м)\s*[:=—–-]?\s*'
                             r'(?:[a-z]{3}|тг|[$€₽¥])?|\b(?:USD|EUR|RUB|KZT|CNY|JPY|тг)|[$€₽¥])\s*$', prefix)):
            continue
        phone_context = _PHONE_CONTEXT.search(prefix)
        # Короткие местные номера: принимаем отдельную строку в любой части
        # объявления, либо номер с явной подписью контакта. Числовые поля,
        # даты и номера заявок выше уже исключены.
        short_phone = (
            (7 <= len(digits) <= 9 and line.strip() == raw)
            or (6 <= len(digits) <= 9 and (bool(phone_context)
                or (line_number in footer_lines and line.strip() == raw)))
        )
        if (10 <= len(digits) <= 15 or short_phone) and raw not in result:
            result.append(raw)
    # Many Telegram channels render digits as keycap emoji (9️⃣8️⃣...), which
    # the ordinary phone regex cannot see. A nearby phone label makes this
    # representation explicit; standalone 6–9 digit footer values are also
    # accepted under the owner-confirmed rule.
    for line_number, line in enumerate(lines):
        marker = _PHONE_CONTEXT.search(line)
        candidates = _unicode_phone_runs(line[marker.end():]) if marker else []
        if not candidates and line_number in footer_lines:
            candidates = _unicode_phone_runs(line)
            if any(char.isalpha() for char in line):
                candidates = []
        for candidate in candidates:
            digits = re.sub(r'\D', '', candidate)
            candidate_start = line.find(candidate)
            prefix = line[:candidate_start] if candidate_start >= 0 else ""
            if _NON_PHONE_ID_PREFIX.search(prefix):
                continue
            price_markers = list(re.finditer(
                r"(?i)\b(?:цена|стоимость|ставка|оплата|price)\b", line
            ))
            last_price_marker = price_markers[-1].start() if price_markers else -1
            if re.search(r"(?i)\bуточняйте\b", prefix):
                continue
            if last_price_marker >= 0 and last_price_marker < candidate_start and (
                    marker is None or last_price_marker > marker.start()):
                continue
            numeric_values = {
                re.sub(r'\D', '', match.group())
                for pattern in (_PRICE, _WEIGHT, _VOLUME, _DATE)
                for match in pattern.finditer(line)
            }
            if digits and digits in numeric_values:
                continue
            allowed = 6 <= len(digits) <= 15 if marker else line_number in footer_lines and 6 <= len(digits) <= 9
            if allowed and _phone_identity(candidate) not in {_phone_identity(item) for item in result}:
                result.append(candidate)
    return result[:20]


def _phone_identity(value):
    digits = ''.join(str(unicodedata.digit(char)) for char in str(value or '') if char.isdigit())
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    return digits


def _single_post_footer_contact(text):
    """Return one unambiguous contact footer for the current source post only."""
    numbered = list(re.finditer(r"(?m)^\s*\d+[.)]\s+", text))
    if (len(numbered) > 1 and not text[:numbered[0].start()].strip()) or _country_header_offsets(text):
        # Explicit block/section boundaries indicate distinct requests. Their
        # contacts stay local even when the final section ends in a phone.
        return None
    lines = [line for line in text.splitlines() if line.strip()]
    # A number at the end of an earlier route block is local to that request.
    # Only a contact on the final non-empty line is a post-level footer.
    # После общего номера часто стоит строка «Telegram, WhatsApp».
    # Она не превращает номер в локальный контакт последнего маршрута.
    while lines and re.fullmatch(
            r'(?i)[\s,:;/|]*(?:(?:telegram|whats?app|телеграм|ватсап)[\s,:;/|]*)+', lines[-1]):
        lines.pop()
    footer = lines[-1] if lines else ""
    all_contacts = block_contacts(text)
    footer_contacts = block_contacts(footer)
    identities = {_phone_identity(value) for value in all_contacts if _phone_identity(value)}
    footer_identities = {_phone_identity(value) for value in footer_contacts if _phone_identity(value)}
    if len(identities) != 1 or identities != footer_identities:
        return None
    identity = next(iter(identities))
    # Preserve the exact source spelling and prefer the occurrence in the footer.
    for value in reversed(footer_contacts):
        if _phone_identity(value) == identity:
            return value
    return None


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


def source_contact_values(raw):
    """Контакты исходного сообщения, включая подсказки из Telegram entities."""
    result = []
    for key in ('contacts', 'phones', 'source_contacts'):
        values = raw.get(key) or []
        if isinstance(values, str):
            try:
                values = json.loads(values)
            except (TypeError, ValueError):
                values = []
        if isinstance(values, list):
            for value in values:
                if isinstance(value, str) and value.strip() and value not in result:
                    result.append(value[:200])
    return result[:20]


def _single_unambiguous_post_contact(text, source_contacts=()):
    """Return the post's one unique phone, wherever it appears in the source."""
    candidates = [*block_contacts(text), *(source_contacts or ())]
    by_identity = {}
    for candidate in candidates:
        identity = _phone_identity(candidate)
        if identity:
            by_identity.setdefault(identity, candidate)
    if len(by_identity) != 1:
        return None
    identity = next(iter(by_identity))
    # Prefer the spelling from the last occurrence in the original message.
    for candidate in reversed(block_contacts(text)):
        if _phone_identity(candidate) == identity:
            return candidate
    return by_identity[identity]


def _single_footer_contact(text):
    """Return one number from the terminal footer, even with local block phones."""
    lines = [line for line in str(text or "").splitlines() if line.strip()]
    while lines and re.fullmatch(
            r'(?i)[\s,:;/|]*(?:(?:telegram|whats?app|телеграм|ватсап)[\s,:;/|]*)+', lines[-1]):
        lines.pop()
    contacts = block_contacts(lines[-1]) if lines else []
    identities = {_phone_identity(value) for value in contacts if _phone_identity(value)}
    return contacts[-1] if len(identities) == 1 and contacts else None


def map_selected_messages(raw):
    """Split explicit request blocks; allow one explicit footer contact per post."""
    text = raw.get("original_text", raw.get("text", ""))
    if not isinstance(text,str) or len(text)>20000:
        raise ValueError("invalid_original_text")
    shared_post_contact = (_single_unambiguous_post_contact(text)
                           or _single_footer_contact(text))
    numbered = list(re.finditer(r"(?m)^\s*\d+[.)]\s+",text))
    blocks = []
    route_matches = [m for m in _ROUTE.finditer(text) if _place(m.group(1)) and _place(m.group(2))]
    if not route_matches or uses_extended_intent(text):
        route_matches += [m for m in _compact_routes(text, allow_space=True) if not any(
            m.start() < existing.end() and m.end() > existing.start() for existing in route_matches)]
    route_matches.sort(key=lambda m: m.start())
    if len(numbered)>1 and not text[:numbered[0].start()].strip():
        for i,m in enumerate(numbered):
            end = numbered[i+1].start() if i+1<len(numbered) else len(text)
            blocks.append(text[m.end():end].strip())
    else:
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
        item = map_selected_message(raw)
        item['source_contacts'] = source_contact_values(raw)
        shared_header = bool(route_matches and (
            not _only_country_headers(text[:route_matches[0].start()])
            or _country_header_offsets(text)
        ))
        if len(route_matches) > 1 and shared_header:
            # Keep the whole source post visible in review: don't assign shared
            # fields from a country/request section to the wrong route.
            item["status"] = "review"
            item["classification_status"] = "review"
        return [item]
    result=[]
    for i,block in enumerate(blocks):
        item_raw = {k:v for k,v in raw.items() if k not in {
            "text","original_text","phones","contacts","origin","destination","amount","currency","kind","status"}}
        item_raw.update(text=block,contacts=block_contacts(block),segment_id=f"block-{i+1}")
        item=map_selected_message(item_raw)
        # Поля маршрута/цены разбираются из блока; раскрытие карточки должно
        # показывать весь неизменённый пост, включая общую шапку и контакты.
        item["source_text"] = text
        item['source_contacts'] = source_contact_values(raw)
        # A single footer phone belongs to the whole published post. Reuse it
        # only among that post's route-split blocks; multiple post contacts or
        # phones outside the footer remain local to their own block.
        # A sole phone belongs to the source post, even when it appears in a
        # footer or another segment. Explicitly numbered requests retain local
        # attribution because their contacts may belong to individual blocks.
        explicitly_numbered = len(numbered) > 1 and not text[:numbered[0].start()].strip()
        if (not explicitly_numbered and not item.get("contacts") and
                len(blocks) > 1 and shared_post_contact):
            item["contacts"] = [shared_post_contact]
        result.append(item)
    return result
