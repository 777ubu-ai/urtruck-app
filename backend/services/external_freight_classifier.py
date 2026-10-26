"""Консервативная классификация входящих внешних объявлений.

Не использует внешние модели и не выводит характеристики из отдельных слов.
Неоднозначные тексты остаются на ручной проверке.
"""
import re


_CARGO_FORMAT_CONTEXT = re.compile(
    r"(?:^|\n)[^\w\n]*груз[ \t]*[-–—📦]|\bюк\s+(?:тай[её]р|таййор|бор)\b", re.I,
)
_CARGO_CONTEXT = re.compile(
    r"(?:нуж(?:ен|на|ны|но)\s+(?:\d+\s*)?(?:тент|реф|машин|транспорт|авто|фур)|ищу (?:машин|транспорт)|"
    r"требуется\s+(?:\d+\s*)?(?:машин|транспорт|авто|реф|тент)|требуются\s+(?:\d+\s*)?машин(?:а|ы)?|"
    r"нужен\s+перевозчик|(?:ищу|ищем|предлагайте)\s+свободн\w*\s+(?:машин|реф|тент|фур)|"
    r"(?:реф|тент)\s+нужен|(?:m[ao]shina|fura|tent|ref)\s+kerak\b|машин\w*\s+керек\b|"
    r"нужны\s+(?:\d+\s*)?машин(?:а|ы)?|груз\s*[:：]|(?:^|\n)\s*груз\s*\.|"
    r"забрать|перевезти|груз готов|есть груз|жүк бар|yuk bor|"
    r"need(?:s)? (?:a )?truck|looking for (?:a )?truck|cargo ready|load ready|"
    r"需要车辆|找车|货已备好|"
    r"ищ(?:у|ем)\s+(?:машин\w*|транспорт|авто|фур\w*|перевозк\w*)|"
    r"нуж(?:ен|на|ны|но)\s+(?:автомобил\w*|авто|перевозк\w*|доставк\w*)|"
    r"требу(?:ется|ются)\s+(?:автомобил\w*|авто|перевозк\w*|транспорт\w*)|"
    r"(?:грузоперевозк\w*|перевозк\s+груз\w*|доставк\w*\s+груз\w*)|"
    r"(?:load|cargo)\s+(?:from|ready|available)|freight\s+(?:from|to)|"
    # В коротких объявлениях о грузе часто пишут только требование к машине:
    # «нужен 6 ось», «нужен 96 куб». Это заявка на перевозку, не свободный авто.
    r"нуж(?:ен|на|ны|но)\s+[^\n]{0,40}\b(?:ос[ьи]|куб(?:ов|а)?|м\s*[³3])\b)", re.I,
)
_CARGO_DETAIL_CONTEXT = re.compile(
    r"(?i)(?:\b\d+(?:[.,]\d+)?\s*(?:тонн\w*|т|кг|куб(?:ов|а)?|м\s*[³3])\b|"
    r"\b(?:ADR|химикат\w*|оборудован\w*)\b|\bгруз\s*[:：]\s*[^\n.!?]{2,})"
)
_UNSPECIFIED_VEHICLE_MENTION = re.compile(r"(?i)\bмашин\w*\b")
_VEHICLE_CONTEXT = re.compile(
    r"(?:\bесть\s+(?:свободн\w*\s+)?(?:машин[ауы]?|транспорт|фур[ауы]?|тент[аы]?|р[еэ]ф(?:а|ы)?)\b|"
    r"свободн(?:ая|ый|ые)\s+(?:машин\w*|тент\w*|реф\w*|фур\w*|транспорт|авто)|порожн(?:ий|яя|ие)\s+(?:машин\w*|тягач\w*|фур\w*)|ищ(?:у|ем)\s+(?:груз|загруз)|возьму\s+груз|нужен груз|нужна\s+загрузка|жүк керек|(?:машина|фура|тент)\s+свободн(?:а|ы)|"
    r"свобод(?:ен|на)\s+(?:тент|реф|машин|фур)|бос көлік|жүк іздеймін|yuk kerak\b|юк\s+керак\b|(?:m[ao]shina|fura) bor\b|free truck|available truck|empty truck|looking for cargo|"
    r"有空车|空车|找货|"
    r"предлага(?:ю|ем)\s+(?:свободн\w*\s+)?(?:машин\w*|авто|фур\w*|транспорт|тент\w*|реф\w*|тягач\w*|грузовик\w*)|"
    r"(?:машин\w*|авто|фур\w*|тент\w*|реф\w*|тягач\w*|грузовик\w*)\s+(?:свободн\w*|готов\w*|освободил\w*)|"
    r"располага(?:ю|ем)\s+(?:машин\w*|авто|фур\w*|транспорт|тент\w*|реф\w*|тягач\w*)|"
    r"в\s+наличии\s+(?:есть\s+)?(?:машин\w*|авто|фур\w*|тент\w*|реф\w*|тягач\w*)|"
    r"(?:driver|carrier)\s+(?:available|ready)|truck\s+(?:available|ready)|машина\s+на\s+линии)", re.I,
)



_EMPTY_VEHICLE_OFFER = re.compile(
    r"(?im)^[ \t]*[^\w\n]*пуст(?:ой|ая|ые)\s+"
    r"(?:эвакуатор\w*|машин\w*|фур\w*|тент\w*|реф\w*|тягач\w*)\b")
_UNAVAILABLE_OFFER = re.compile(
    r"(?i)\b(?:не|нет|если|нужен|нужна|нужны|куплю|продам|продаётся|продается|"
    r"ремонт\w*|занят\w*|загруж\w*)\b|[?？❓❔]")

_SERVICE_SEARCH_PREFIX = re.compile(
    r"(?i)\b(?:находите|находить|найдите|найти|ищите|поиск(?:а)?|"
    r"размещать|размещайте|оставляйте|регистрируйтесь)\b")


def _direct_vehicle_context(value):
    # Призыв искать/размещать транспорт рекламирует сервис, а не машину.
    # Проверяем строку конкретного совпадения: отдельный footer не гасит заявку.
    for match in _VEHICLE_CONTEXT.finditer(value):
        start = value.rfind('\n', 0, match.start()) + 1
        if not _SERVICE_SEARCH_PREFIX.search(value[max(start, match.start() - 240):match.start()]):
            return True
    return False


def uses_extended_intent(value):
    """Limit new route handling to newly recognized intent formats."""
    return bool(
        (_CARGO_FORMAT_CONTEXT.search(value) and not _CARGO_CONTEXT.search(value))
        or (_EMPTY_VEHICLE_OFFER.search(value) and not _direct_vehicle_context(value))
    )


def _intents(value):
    cargo = bool(_CARGO_CONTEXT.search(value) or _CARGO_FORMAT_CONTEXT.search(value))
    # Вопрос грузоотправителя «Есть машина?» не является предложением машины.
    vehicle_text = re.sub(r"[^\n.!?]*\?", " ", value)
    vehicle_text = re.sub(
        r"(?i)(?:ищу|ищем|предлагайте)\s+свободн\w*\s+(?:машин\w*|реф\w*|тент\w*|фур\w*)",
        " ", vehicle_text,
    )
    # Условие, поиск перевозчика и ремонт не подтверждают наличие свободной машины.
    vehicle_text = re.sub(
        r'(?im)^.*\b(?:у\s+кого|если)\s+есть\s+[^\n]*$', ' ', vehicle_text)
    vehicle_text = re.sub(
        r'(?im)^.*\b(?:машин\w*|фур\w*|транспорт|тент\w*|р[еэ]ф\w*)\s+'
        r'(?:в\s+ремонте|не\s+свободн\w*|занят\w*|недоступ\w*)[^\n]*$', ' ', vehicle_text)
    if cargo:
        vehicle_text = re.sub(
            r'(?i)\bесть\s+(?:свободн\w*\s+)?(?:машин\w*|фур\w*|транспорт)\s*[-–—]\s*'
            r'(?:пишите|звоните|забирайте|подключайтесь)[^\n.!?]*', ' ', vehicle_text)
    empty_offer = bool(_EMPTY_VEHICLE_OFFER.search(vehicle_text)) and not _UNAVAILABLE_OFFER.search(value)
    return cargo, _direct_vehicle_context(vehicle_text) or empty_offer
# Закрытие относится к заявке: закрытый кузов/граница — лишь условия перевозки.
_CLOSE_CONTEXT = re.compile(
    r"(?:\b(?:заявка|объявление|заказ|груз|рейс|перевозка|маршрут)\s+"
    r"(?:уже\s+)?(?:закрыт(?:а|о|ы)?|снят(?:а|о|ы)?|не\s*актуальн(?:а|о|ы|ен))\b|"
    r"^\s*(?:(?:статус|status)\s*[:：]\s*)?(?:закрыт(?:а|о|ы)?|снято|не\s*актуальн(?:а|о|ы|ен)|closed|已关闭)[.!。!\s]*$|"
    r"\bуже\s+нашли\s+(?:машин\w*|транспорт|водител\w*|груз)\b|"
    r"\b(?:request|listing|load|cargo|order)\s+(?:is\s+)?closed\b|"
    r"\bfound (?:a truck|cargo)\b|(?:订单|货源)已关闭)", re.I | re.M,
)


def classify_message(text: str) -> dict:
    value = str(text or "")[:20000]
    if _CLOSE_CONTEXT.search(value):
        return {"kind": None, "status": "closed", "segments": [value]}
    cargo, vehicle = _intents(value)
    # The owned freight channel also contains shorthand load offers with no
    # verb: route + load/weight/capacity is enough to treat as cargo unless an
    # explicit free-vehicle offer is present. The source text remains intact.
    if (not cargo and not vehicle and _CARGO_DETAIL_CONTEXT.search(value)
            and not _VEHICLE_CONTEXT.search(value)
            and not _UNSPECIFIED_VEHICLE_MENTION.search(value)):
        cargo = True
    if cargo == vehicle:
        return {"kind": None, "status": "review", "segments": [value],
                "reason": "mixed_intents" if cargo else (
                    "promotional_content" if _VEHICLE_CONTEXT.search(value)
                    and not _direct_vehicle_context(value) else "unrecognized_intent")}
    # Split only on explicit, separately numbered/bulleted blocks. A line break
    # alone is common in contact details and is not sufficient evidence.
    blocks = re.split(r"(?m)(?=^(?:\s*(?:\d+[.)]|[-•])\s+))", value)
    blocks = [part.strip() for part in blocks if part.strip()]
    if len(blocks) <= 1:
        return {"kind": "cargo" if cargo else "vehicle", "status": "active", "segments": [value]}
    typed = []
    for block in blocks:
        c, v = _intents(block)
        if c == v:
            return {"kind": None, "status": "review", "segments": blocks}
        typed.append({"kind": "cargo" if c else "vehicle", "status": "active", "segments": [block]})
    return {"kind": None, "status": "split", "segments": typed}
