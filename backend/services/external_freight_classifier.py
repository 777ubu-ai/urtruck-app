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
    r"需要车辆|找车|货已备好|"
    r"ищ(?:у|ем)\s+(?:машин\w*|транспорт|авто|фур\w*|перевозк\w*)|"
    r"нуж(?:ен|на|ны|но)\s+(?:автомобил\w*|авто|перевозк\w*|доставк\w*)|"
    r"требу(?:ется|ются)\s+(?:автомобил\w*|авто|перевозк\w*|транспорт\w*)|"
    r"(?:грузоперевозк\w*|перевозк\s+груз\w*|доставк\w*\s+груз\w*)|"
    r"(?:load|cargo)\s+(?:from|ready|available)|freight\s+(?:from|to))", re.I,
)
_VEHICLE_CONTEXT = re.compile(
    r"(?:(?m:^\s*(?:есть|имеется)\s+(?:свободная\s+)?(?:машина|авто|фура)\s*[.!]?\s*$)|"
    r"\bесть\s+(?:свободн\w*\s+)?(?:машин\w*|авто|фур\w*|тягач\w*|грузовик\w*|тент\w*|реф\w*)\b|"
    r"свободн(?:ая|ый|ые)\s+(?:машин\w*|тент\w*|реф\w*|фур\w*|транспорт|авто|тягач\w*|грузовик\w*)|"
    r"порожн(?:ий|яя|ие)\s+(?:машин\w*|тягач\w*|фур\w*)|ищ(?:у|ем)\s+(?:груз|загруз)|возьму\s+груз|нужен груз|жүк керек|(?:машина|фура|тент)\s+свободн(?:а|ы)|"
    r"свобод(?:ен|на)\s+(?:тент|реф|машин|фур)|бос көлік|жүк іздеймін|yuk kerak|mashina bor|free truck|available truck|empty truck|looking for cargo|"
    r"有空车|空车|找货|"
    r"предлага(?:ю|ем)\s+(?:свободн\w*\s+)?(?:машин\w*|авто|фур\w*|транспорт|тент\w*|реф\w*|тягач\w*|грузовик\w*)|"
    r"(?:машин\w*|авто|фур\w*|тент\w*|реф\w*|тягач\w*|грузовик\w*)\s+(?:свободн\w*|готов\w*|освободил\w*)|"
    r"располага(?:ю|ем)\s+(?:машин\w*|авто|фур\w*|транспорт|тент\w*|реф\w*|тягач\w*)|"
    r"в\s+наличии\s+(?:есть\s+)?(?:машин\w*|авто|фур\w*|тент\w*|реф\w*|тягач\w*)|"
    r"(?:driver|carrier)\s+(?:available|ready)|truck\s+(?:available|ready)|"
    r"машина\s+на\s+линии)", re.I,
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
