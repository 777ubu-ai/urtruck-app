"""Deterministic quality gates shared by local AI inference and tests."""
import re
from decimal import Decimal

STT_LATIN_ALLOWLIST = {"almaty", "astana", "moscow", "beijing", "khorgos", "dostyk"}

LOGISTICS_TERMS = {
    "cargo": {
        "en": ("cargo", "freight", "goods", "shipment"), "ru": ("груз", "товар", "поставк"),
        "zh": ("货物", "货品", "货运", "载货"), "kk": ("жүк",),
    },
    "warehouse": {
        "en": ("warehouse", "storage", "depot"), "ru": ("склад", "хранилищ", "терминал", "депо", "баз"),
        "zh": ("仓库", "仓储", "货仓", "库房"), "kk": ("қойма", "қоймасы"),
    },
    "driver": {"en": ("driver",), "ru": ("водител", "шофер"), "zh": ("司机", "驾驶员"), "kk": ("жүргізуш",)},
    "truck": {
        "en": ("truck", "vehicle", "car"), "ru": ("машин", "грузовик", "автомобил", "транспорт"),
        "zh": ("卡车", "车辆", "货车", "汽车", "车"), "kk": ("көлік", "жүк көліг"),
    },
    "trailer": {"en": ("trailer",), "ru": ("прицеп", "полуприцеп", "трейлер"), "zh": ("挂车", "拖车", "车厢"), "kk": ("тіркеме",)},
    "customs": {"en": ("customs",), "ru": ("тамож",), "zh": ("海关",), "kk": ("кеден",)},
    "border": {"en": ("border", "checkpoint"), "ru": ("границ", "погранич"), "zh": ("边境", "口岸", "边界"), "kk": ("шекара",)},
    "loading": {
        "en": ("loading", "load", "loaded", "unload", "unloading"), "ru": ("загруз", "погруз", "разгруз", "выгруз"),
        "zh": ("装货", "装载", "装卸", "上货", "卸货", "卸载", "卸到", "装车"), "kk": ("тиеу", "тиел", "түсір"),
    },
    "delivery": {
        "en": ("delivery", "deliver", "shipment"), "ru": ("достав", "перевоз"),
        "zh": ("交付", "送达", "配送", "交货", "运送", "递送"), "kk": ("жеткіз",),
    },
}

# Critical cargo facts are stricter than generic logistics vocabulary.  A
# translation that keeps ``10`` but drops ``тонн`` (or turns ``тент`` into a
# generic cargo word) is not safe to show as a successful translation.
WEIGHT_UNIT_TERMS = {
    "ru": ("тонн", "тонна", "тонны", "т"),
    "zh": ("吨",),
    "en": ("ton", "tons", "tonne", "tonnes"),
    "kk": ("тонна", "тонн", "т"),
}
WEIGHT_UNIT_CANONICAL = {"ru": "тонн", "zh": "吨", "en": "tons", "kk": "тонна"}

VEHICLE_BODY_TERMS = {
    "ru": ("тент", "тентов"),
    "zh": ("篷布车", "篷车", "帆布车"),
    "en": ("tent truck", "tent trailer", "curtain-sided", "curtain side"),
    "kk": ("тент", "тентті"),
}
VEHICLE_BODY_CANONICAL = {"ru": "тент", "zh": "篷布车", "en": "tent truck", "kk": "тент"}

CITY_TERMS = {
    "almaty": {"ru": ("алматы",), "zh": ("阿拉木图",), "en": ("almaty",), "kk": ("алматы",)},
    "astana": {"ru": ("астана",), "zh": ("阿斯塔纳",), "en": ("astana",), "kk": ("астана",)},
    "moscow": {"ru": ("москва",), "zh": ("莫斯科",), "en": ("moscow",), "kk": ("мәскеу", "москва")},
    "beijing": {"ru": ("пекин",), "zh": ("北京",), "en": ("beijing",), "kk": ("пекин",)},
    "khorgos": {"ru": ("хоргос",), "zh": ("霍尔果斯",), "en": ("khorgos",), "kk": ("қорғас", "хоргос")},
    "dostyk": {"ru": ("достык",), "zh": ("多斯特克",), "en": ("dostyk",), "kk": ("достық", "достык")},
}

# NLLB's observed transliteration for Almaty is a city-preserving error that
# must be normalized before the strict invariant check.
CITY_OBSERVED_CONFUSIONS = {
    ("almaty", "zh"): ("阿尔马塔",),
}


def _contains_any(text: str, variants: tuple[str, ...]) -> bool:
    lowered = text.casefold()
    for value in variants:
        candidate = value.casefold()
        if candidate.isalpha() and candidate.isascii():
            if re.search(rf"(?<![a-z]){re.escape(candidate)}(?![a-z])", lowered):
                return True
        elif candidate.isalpha() and re.search(r"[\u0400-\u04ff]", candidate):
            if re.search(rf"(?<![\u0400-\u04ff]){re.escape(candidate)}", lowered):
                return True
        elif candidate == "车":
            if re.search(r"(?<![挂拖])车", lowered):
                return True
        elif candidate in lowered:
            return True
    return False


def _source_weight(text: str, source: str) -> bool:
    variants = WEIGHT_UNIT_TERMS.get(source, ())
    if not variants:
        return False
    for unit in variants:
        if source == "zh":
            pattern = rf"(?<!\d)\d+(?:[.,]\d+)?\s*{re.escape(unit)}"
        elif unit == "т":
            pattern = r"(?<![\w])\d+(?:[.,]\d+)?\s*т(?![\w])"
        else:
            pattern = rf"(?<!\w)\d+(?:[.,]\d+)?\s*{re.escape(unit)}(?![\w])"
        if re.search(pattern, text.casefold()):
            return True
    return False


def _target_weight(text: str, target: str) -> bool:
    for unit in WEIGHT_UNIT_TERMS.get(target, ()):
        if target == "zh":
            pattern = rf"(?<!\d)\d+(?:[.,]\d+)?\s*{re.escape(unit)}"
        elif unit == "т":
            pattern = r"(?<![\w])\d+(?:[.,]\d+)?\s*т(?![\w])"
        else:
            pattern = rf"(?<!\w)\d+(?:[.,]\d+)?\s*{re.escape(unit)}(?![\w])"
        if re.search(pattern, text.casefold()):
            return True
    return False


def _city_keys(text: str, language: str) -> list[str]:
    return [key for key, variants in CITY_TERMS.items() if _contains_any(text, variants.get(language, ()))]


def _append_before_punctuation(text: str, addition: str) -> str:
    match = re.search(r"([.!?。！？])\s*$", text)
    if match:
        prefix = text[:match.start()].rstrip(" ,，")
        return f"{prefix}, {addition}{match.group(1)}"
    return f"{text.rstrip()}, {addition}"


def _normalize_number_words(text: str) -> str:
    replacements = {
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
        "ноль": "0", "один": "1", "одна": "1", "два": "2", "две": "2", "три": "3", "четыре": "4", "пять": "5",
        "一个": "1", "一": "1", "两个": "2", "两": "2", "二": "2", "三": "3", "四": "4", "五": "5",
    }
    normalized = text.casefold()
    for word, number in replacements.items():
        if word.isascii() or re.search(r"[\u0400-\u04ff]", word):
            normalized = re.sub(rf"(?<!\w){re.escape(word)}(?!\w)", number, normalized)
        else:
            normalized = normalized.replace(word, number)
    return normalized


def _numeric_facts(text: str) -> tuple[list[tuple[int, int]], list[Decimal]]:
    times: list[tuple[int, int]] = []

    def replace_clock(match: re.Match) -> str:
        times.append((int(match.group(1)), int(match.group(2))))
        return " "

    remaining = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", replace_clock, _normalize_number_words(text))

    def replace_chinese_clock(match: re.Match) -> str:
        period, hour_text, minute_text = match.groups()
        hour = int(hour_text)
        if period == "下午" and hour < 12:
            hour += 12
        elif period == "上午" and hour == 12:
            hour = 0
        minute = 30 if minute_text == "半" else int((minute_text or "0").rstrip("分"))
        times.append((hour, minute))
        return " "

    remaining = re.sub(r"(上午|下午)?\s*(\d{1,2})\s*(?:点|时)(半|\d{1,2}分?)?", replace_chinese_clock, remaining)
    numbers = [Decimal(value.replace(",", ".")) for value in re.findall(r"\d+(?:[.,]\d+)?", remaining)]
    return times, numbers


def repair_logistics_translation(source_text: str, translated_text: str, source: str, target: str) -> str:
    """Apply narrow, deterministic repairs for observed logistics model errors."""
    repaired = translated_text
    trailer_source = _contains_any(source_text, LOGISTICS_TERMS["trailer"][source])
    truck_source = _contains_any(source_text, LOGISTICS_TERMS["truck"][source])
    trailer_target = _contains_any(repaired, LOGISTICS_TERMS["trailer"][target])
    if trailer_source and not truck_source and not trailer_target:
        canonical = {"en": "trailer", "ru": "прицеп", "zh": "挂车", "kk": "тіркеме"}[target]
        observed_confusions = {"en": (), "ru": ("тренажер",), "zh": (), "kk": ()}
        for confused in (*LOGISTICS_TERMS["truck"][target], *observed_confusions[target]):
            if confused.casefold() in repaired.casefold():
                repaired = re.sub(re.escape(confused), canonical, repaired, count=1, flags=re.IGNORECASE)
                break

    customs_source = _contains_any(source_text, LOGISTICS_TERMS["customs"][source])
    if customs_source and target == "zh" and "海关" not in repaired:
        repaired = repaired.replace("关税", "海关", 1)

    loading_source = _contains_any(source_text, LOGISTICS_TERMS["loading"][source])
    loading_target = _contains_any(repaired, LOGISTICS_TERMS["loading"][target])
    if repaired and source == "zh" and target == "ru" and "装货" in source_text and loading_source and not loading_target:
        repaired = f"Загрузка {repaired[0].lower() + repaired[1:]}"

    delivery_source = _contains_any(source_text, LOGISTICS_TERMS["delivery"][source])
    delivery_target = _contains_any(repaired, LOGISTICS_TERMS["delivery"][target])
    if target == "zh" and delivery_source and not delivery_target and "延迟" in repaired:
        repaired = f"交付{repaired}"

    # Preserve a source weight unit when NLLB keeps the number but drops the
    # unit (the observed ``10`` -> ``10`` regression).  This is a narrow
    # deterministic repair; the gate below still rejects missing numbers,
    # cities, or vehicle body terms.
    if _source_weight(source_text, source) and not _target_weight(repaired, target):
        source_number = re.search(r"(?<!\d)\d+(?:[.,]\d+)?", source_text)
        if source_number:
            target_number = re.search(r"(?<!\d)\d+(?:[.,]\d+)?", repaired)
            if target_number and target_number.group(0) == source_number.group(0):
                unit = WEIGHT_UNIT_CANONICAL[target]
                separator = " " if target != "zh" else " "
                repaired = (
                    repaired[:target_number.start()]
                    + f"{target_number.group(0)}{separator}{unit}"
                    + repaired[target_number.end():]
                )

    # The body type is a critical cargo fact, not a generic truck synonym.
    if _contains_any(source_text, VEHICLE_BODY_TERMS.get(source, ())) and not _contains_any(repaired, VEHICLE_BODY_TERMS.get(target, ())):
        repaired = _append_before_punctuation(repaired, VEHICLE_BODY_CANONICAL[target])

    # Normalize only the observed Almaty transliteration; missing cities are
    # left for the quality gate to reject rather than guessed or invented.
    for city in _city_keys(source_text, source):
        for confused in CITY_OBSERVED_CONFUSIONS.get((city, target), ()):
            if confused.casefold() in repaired.casefold() and not _contains_any(repaired, CITY_TERMS[city][target]):
                repaired = re.sub(re.escape(confused), CITY_TERMS[city][target][0], repaired, count=1, flags=re.IGNORECASE)
                break

    source_times = re.findall(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", source_text)
    if len(source_times) == 1:
        preserved = f"{int(source_times[0][0]):02d}:{int(source_times[0][1]):02d}"
        clock_patterns = (
            r"(?<!\d)\d{1,2}:\d{2}(?!\d)",
            r"(?:上午|下午)?\s*\d{1,2}\s*(?:点|时)(?:半|\d{1,2}分?)?(?:前|后)?",
            r"[一二三四五六七八九十两]+\s*(?:点|时)(?:半|[一二三四五六七八九十两]+分?)?(?:前|后)?",
        )
        for pattern in clock_patterns:
            candidate, changed = re.subn(pattern, preserved, repaired, count=1)
            if changed:
                repaired = candidate
                break
    return repaired


def transcription_quality_ok(
    transcript: str,
    source: str,
    confidence: float,
    *,
    minimum_confidence: float = 0.50,
) -> bool:
    """Reject low-confidence or script-incoherent speech recognition output."""
    text = str(transcript or "").strip()
    if not text or confidence < minimum_confidence:
        return False

    cyrillic = len(re.findall(r"[\u0400-\u04ff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    han = len(re.findall(r"[\u3400-\u9fff]", text))
    letters = cyrillic + latin + han
    if letters == 0:
        return False

    if source in {"ru", "kk"}:
        latin_words = {
            word.casefold()
            for word in re.findall(r"(?<![A-Za-z])[A-Za-z]{4,}(?![A-Za-z])", text)
        }
        if latin_words - STT_LATIN_ALLOWLIST:
            return False
        if cyrillic == 0 or han / (cyrillic + han) > 0.25:
            return False
    elif source == "zh":
        if han / letters < 0.50:
            return False
    elif source == "en":
        if latin / letters < 0.85:
            return False
    else:
        return False

    words = re.findall(r"[\w\u3400-\u9fff]+", text.casefold())
    if len(words) >= 8:
        seen = set()
        for trigram in zip(words, words[1:], words[2:]):
            if trigram in seen:
                return False
            seen.add(trigram)
    return True


def translation_quality_ok(source_text: str, translated_text: str, source: str, target: str) -> bool:
    if _numeric_facts(source_text) != _numeric_facts(translated_text):
        return False
    source_has_body = _contains_any(source_text, VEHICLE_BODY_TERMS.get(source, ()))
    for name, variants in LOGISTICS_TERMS.items():
        # A specific body type (e.g. 篷布车) is stronger than the generic
        # ``truck`` bucket; its dedicated invariant below checks the exact
        # type instead of demanding a second generic vehicle word.
        if name == "truck" and source_has_body:
            continue
        if _contains_any(source_text, variants[source]) and not _contains_any(translated_text, variants[target]):
            return False
    if _source_weight(source_text, source) and not _target_weight(translated_text, target):
        return False
    if source_has_body and not _contains_any(translated_text, VEHICLE_BODY_TERMS.get(target, ())):
        return False
    for city in _city_keys(source_text, source):
        if not _contains_any(translated_text, CITY_TERMS[city].get(target, ())):
            return False
    return True
