"""Консервативная классификация входящих внешних объявлений.

Не использует внешние модели и не выводит характеристики из отдельных слов.
Неоднозначные тексты остаются на ручной проверке.
"""
import re


_CARGO_CONTEXT = re.compile(
    r"(?:нуж(?:ен|на|ны|но)\s+(?:\d+\s*)?(?:тент|реф|машин|транспорт|авто|фур)|ищу (?:машин|транспорт)|"
    r"требуется\s+(?:машин|транспорт|авто)|требуются\s+(?:\d+\s*)?машин(?:а|ы)?|"
    r"нужны\s+(?:\d+\s*)?машин(?:а|ы)?|груз\s*[:：]|(?:^|\n)\s*груз\s*\.|"
    r"забрать|перевезти|груз готов|есть груз|жүк бар|yuk bor|"
    r"need(?:s)? (?:a )?truck|looking for (?:a )?truck|cargo ready|load ready|"
    r"需要车辆|找车|货已备好)", re.I,
)
_VEHICLE_CONTEXT = re.compile(
    r"(?:свободн(?:ая|ый|ые)\s+(?:машин\w*|тент\w*|реф\w*|фур\w*|транспорт|авто)|порожн(?:ий|яя|ие)\s+(?:машин\w*|тягач\w*|фур\w*)|ищ(?:у|ем)\s+(?:груз|загруз)|возьму\s+груз|нужен груз|жүк керек|(?:машина|фура|тент)\s+свободн(?:а|ы)|"
    r"свобод(?:ен|на)\s+(?:тент|реф|машин|фур)|бос көлік|жүк іздеймін|yuk kerak|mashina bor|free truck|available truck|empty truck|looking for cargo|"
    r"有空车|空车|找货)", re.I,
)
# Дополнительные предложения принимаем только как утверждение в начале строки.
# Вопросы и просьбы «нужна пустая машина» не являются свободным транспортом.
_VEHICLE_OFFER = re.compile(
    r"(?:^|\n)[ \t]*(?:(?:есть|у меня|у нас)\s+)?"
    r"пуст(?:ая|ой|ые)\s+(?:машин\w*|фур\w*|тент\w*|реф\w*)\b"
    r"|(?:^|\n)[ \t]*(?:(?:menda|bizda|менда|бизда)\s+)?"
    r"(?:fura|фура|tent|тент|ref|реф)\s+(?:bor|бор)\b(?!\s*(?:mi|ми)\b)",
    re.I,
)

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
    cargo = bool(_CARGO_CONTEXT.search(value))
    vehicle = bool(_VEHICLE_CONTEXT.search(value))
    if not vehicle and "?" not in value and "？" not in value and not re.search(
        r"(?i)нуж(?:ен|на|ны|но)|требу(?:ется|ются)|продаж|продам|куплю|занят|загружен|ремонт|сломал|\bне\b|\bнет\b|"
        r"sotiladi|sotaman|сотилади|сотаман|\bemas\b|\bэмас\b|yo['’ʻ]?q|йўқ|йук", value
    ):
        vehicle = bool(_VEHICLE_OFFER.search(value))
    if cargo == vehicle:
        return {"kind": None, "status": "review", "segments": [value]}
    # Split only on explicit, separately numbered/bulleted blocks. A line break
    # alone is common in contact details and is not sufficient evidence.
    blocks = re.split(r"(?m)(?=^(?:\s*(?:\d+[.)]|[-•])\s+))", value)
    blocks = [part.strip() for part in blocks if part.strip()]
    if len(blocks) <= 1:
        return {"kind": "cargo" if cargo else "vehicle", "status": "active", "segments": [value]}
    typed = []
    for block in blocks:
        c = bool(_CARGO_CONTEXT.search(block))
        v = bool(_VEHICLE_CONTEXT.search(block))
        if c == v:
            return {"kind": None, "status": "review", "segments": blocks}
        typed.append({"kind": "cargo" if c else "vehicle", "status": "active", "segments": [block]})
    return {"kind": None, "status": "split", "segments": typed}
