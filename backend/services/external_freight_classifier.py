"""Консервативная классификация входящих внешних объявлений.

Не использует внешние модели и не выводит характеристики из отдельных слов.
Неоднозначные тексты остаются на ручной проверке.
"""
import re


_CARGO_CONTEXT = re.compile(
    r"(?:нужен(?:а|ы)? (?:тент|реф|машин|транспорт)|ищу (?:машин|транспорт)|"
    r"требуется\s+(?:машин|транспорт|авто)|требуются\s+(?:\d+\s*)?машин(?:а|ы)?|"
    r"нужны\s+(?:\d+\s*)?машин(?:а|ы)?|груз\s*[:：]|"
    r"забрать|перевезти|груз готов|есть груз|жүк керек|жүк бар|"
    r"need(?:s)? (?:a )?truck|looking for (?:a )?truck|cargo ready|load ready|"
    r"需要车辆|找车|货已备好)", re.I,
)
_VEHICLE_CONTEXT = re.compile(
    r"(?:есть свободн|свободн(?:ая|ый|ые)|порожн(?:ий|яя|ие)|ищу груз|нужен груз|машина свободна|"
    r"бос көлік|жүк іздеймін|free truck|available truck|empty truck|looking for cargo|"
    r"有空车|空车|找货)", re.I,
)
_CLOSE_CONTEXT = re.compile(r"(?:\bзакрыт(?:а|о|ы)?\b|\bснято\b|уже нашли|не актуальн|\bclosed\b|found a truck|found cargo|已关闭)", re.I)


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
