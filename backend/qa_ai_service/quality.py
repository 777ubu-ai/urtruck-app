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

# Vocabulary supplied to Whisper as domain context.  This is recognition
# guidance only; it is deliberately not a post-processing replacement.  The
# transcript still has to come from the audio, and translation_quality_ok()
# remains the authority for accepting the resulting logistics meaning.
STT_VEHICLE_BODY_PROMPTS = {
    "ru": "тент, рефрижератор, платформа, изотерм, бортовой кузов",
    "zh": "篷布车，冷藏车，平板车，厢式车，栏板车",
    "en": "tent truck, reefer, flatbed, insulated truck, curtain-sided truck",
    "kk": "тент, рефрижератор, платформа, изотерм, бортты кузов",
}


def stt_prompt(language: str) -> str:
    """Return domain context for STT without rewriting its output."""
    base = {
        "ru": "Груз, склад, загрузка, разгрузка, водитель, машина, прицеп, таможня, граница, документы, маршрут, доставка.",
        "zh": "货物，仓库，装货，卸货，司机，车辆，挂车，海关，边境，文件，路线，交付。",
        "kk": "Жүк, қойма, тиеу, түсіру, жүргізуші, көлік, тіркеме, кеден, шекара, құжаттар, бағыт, жеткізу.",
        "en": "Cargo, warehouse, loading, unloading, driver, truck, trailer, customs, border, documents, route, delivery.",
    }.get(language, "")
    bodies = STT_VEHICLE_BODY_PROMPTS.get(language, "")
    cities = {
        "ru": "Алматы, Астана, Москва, Пекин, Хоргос, Достык.",
        "zh": "阿拉木图，阿斯塔纳，莫斯科，北京，霍尔果斯，多斯特克。",
        "kk": "Алматы, Астана, Мәскеу, Бейжің, Қорғас, Достық.",
        "en": "Almaty, Astana, Moscow, Beijing, Khorgos, Dostyk.",
    }.get(language, "")
    return " ".join(part for part in (base, f"Тип кузова: {bodies}." if bodies else "", cities) if part)

CITY_TERMS = {
    "almaty": {"ru": ("алматы",), "zh": ("阿拉木图",), "en": ("almaty",), "kk": ("алматы",)},
    "astana": {"ru": ("астана", "астану", "астане", "астаны"), "zh": ("阿斯塔纳",), "en": ("astana",), "kk": ("астана",)},
    "moscow": {"ru": ("москва",), "zh": ("莫斯科",), "en": ("moscow",), "kk": ("мәскеу", "москва")},
    "beijing": {"ru": ("пекин",), "zh": ("北京",), "en": ("beijing",), "kk": ("пекин",)},
    "khorgos": {"ru": ("хоргос",), "zh": ("霍尔果斯",), "en": ("khorgos",), "kk": ("қорғас", "хоргос")},
    "dostyk": {"ru": ("достык",), "zh": ("多斯特克",), "en": ("dostyk",), "kk": ("достық", "достык")},
    "urumqi": {"ru": ("урумчи",), "zh": ("乌鲁木齐",), "en": ("urumqi", "urumchi"), "kk": ("үрімжі", "урумчи")},
}

# NLLB's observed transliteration for Almaty is a city-preserving error that
# must be normalized before the strict invariant check.
CITY_OBSERVED_CONFUSIONS = {
    # Exact QA2 NLLB output for Chinese 阿拉木图. This is a model spelling
    # error, not a general transliteration rule.
    ("almaty", "ru"): ("Арматутян",),
    ("almaty", "zh"): ("阿尔马塔", "阿尔马图"),
    # NLLB occasionally truncates 阿斯塔纳 to 阿斯塔 and joins it to the
    # following noun (for example ``阿斯塔货物``).  Normalize only this
    # observed city-preserving error; unknown omissions remain a quality FAIL.
    ("astana", "zh"): ("阿斯塔",),
}
CITY_REPAIR_CANONICAL = {("almaty", "ru"): "Алматы"}

# Exact, observed QA2 repairs.  These are deliberately not a general phrase
# dictionary: they only recover a source string that NLLB left untranslated,
# or the known false-friend output for the unambiguous traffic-status phrase.
_EXACT_TRANSLATION_REPAIRS = {
    ("привет", "ru", "zh"): "你好",
}

_CLEAR_ROAD_SOURCE = re.compile(r"\b(?:road|route)\s+(?:is\s+)?clear\b", re.IGNORECASE)
_CLEAR_ROAD_ZH = ("道路畅通", "道路通畅", "路况畅通", "路况良好")
REFRIGERATED_TERMS = {
    "ru": ("рефрижератор", "рефрижераторный"),
    "en": ("refrigerated truck", "reefer"),
    "zh": ("冷藏车",),
    "kk": ("рефрижератор",),
}
LITERAL_BODY_CONFUSION_TERMS = {
    "ru": ("водопад", "ковёр", "ковер"),
    "en": ("waterfall", "carpet"),
    "zh": ("瀑布", "地毯"),
    "kk": (),
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


def _weight_unit_pattern(language: str) -> str:
    variants = sorted(WEIGHT_UNIT_TERMS.get(language, ()), key=len, reverse=True)
    return "(?:" + "|".join(re.escape(unit) for unit in variants) + ")" if variants else r"(?!)"


def _weight_profile(text: str, language: str) -> tuple[list[tuple[Decimal, int, int]], int]:
    """Return explicitly bound weights and standalone weight-unit count.

    The number and unit are kept as one fact.  This is intentional: comparing
    an unordered list of numbers lets a price, licence plate, or date steal a
    weight unit merely because it appeared earlier in the sentence.
    """
    unit = _weight_unit_pattern(language)
    if language == "zh":
        boundary = r"(?<!\d)"
        suffix = ""
    elif language in {"ru", "kk"}:
        boundary = r"(?<![\w])"
        suffix = r"(?![\w])"
    else:
        boundary = r"(?<![\w])"
        suffix = r"(?![\w])"
    bound_pattern = re.compile(
        rf"{boundary}(?P<number>\d+(?:[.,]\d+)?)\s*(?P<unit>{unit}){suffix}",
        re.IGNORECASE,
    )
    facts: list[tuple[Decimal, int, int]] = []
    bound_unit_spans: list[tuple[int, int]] = []
    for match in bound_pattern.finditer(text.casefold()):
        value = Decimal(match.group("number").replace(",", "."))
        facts.append((value, match.start("number"), match.end("number")))
        bound_unit_spans.append((match.start("unit"), match.end("unit")))

    unit_pattern = re.compile(
        rf"{boundary}(?P<unit>{unit}){suffix}", re.IGNORECASE
    )
    standalone = 0
    for match in unit_pattern.finditer(text.casefold()):
        span = (match.start("unit"), match.end("unit"))
        if not any(start <= span[0] and span[1] <= end for start, end in bound_unit_spans):
            standalone += 1
    return facts, standalone


def _source_weight(text: str, source: str) -> bool:
    facts, standalone = _weight_profile(text, source)
    return bool(facts or standalone)


def _target_weight(text: str, target: str) -> bool:
    facts, standalone = _weight_profile(text, target)
    return bool(facts or standalone)


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
    }
    normalized = text.casefold()
    for word, number in replacements.items():
        if word.isascii() or re.search(r"[\u0400-\u04ff]", word):
            normalized = re.sub(rf"(?<!\w){re.escape(word)}(?!\w)", number, normalized)
        else:
            normalized = normalized.replace(word, number)
    # Chinese classifiers such as ``一个`` describe an object, not a cargo
    # numeric fact. Convert a Han digit only immediately before a measurable
    # logistics/time/date unit; leave ``一个帐卡车`` non-numeric.
    han_digits = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9", "两": "2"}
    normalized = re.sub(
        r"([一二三四五六七八九两])(?=\s*(?:吨|美元|点|时|月|日))",
        lambda match: han_digits[match.group(1)],
        normalized,
    )
    return normalized


def _numeric_facts(text: str) -> tuple[list[tuple[int, int]], list[tuple[int, int, int]], list[Decimal]]:
    times: list[tuple[int, int]] = []

    def replace_clock(match: re.Match) -> str:
        times.append((int(match.group(1)), int(match.group(2))))
        return " "

    remaining = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", replace_clock, _normalize_number_words(text))

    dates: list[tuple[int, int, int]] = []

    def replace_ymd(match: re.Match) -> str:
        dates.append((int(match.group(1)), int(match.group(2)), int(match.group(3))))
        return " "

    def replace_dmy(match: re.Match) -> str:
        dates.append((int(match.group(3)), int(match.group(2)), int(match.group(1))))
        return " "

    remaining = re.sub(r"(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)", replace_ymd, remaining)
    remaining = re.sub(r"(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)", replace_dmy, remaining)
    remaining = re.sub(r"(?<!\d)(\d{4})年(\d{1,2})月(\d{1,2})日?(?!\d)", replace_ymd, remaining)
    month_names = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}

    def replace_month_name(match: re.Match) -> str:
        dates.append((int(match.group(3)), month_names[match.group(1).casefold()], int(match.group(2))))
        return " "

    remaining = re.sub(r"\b(" + "|".join(month_names) + r")\s+(\d{1,2}),?\s+(\d{4})\b", replace_month_name, remaining, flags=re.IGNORECASE)

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
    # A separator followed by exactly three digits is a grouping separator,
    # never a decimal fraction. Thus 12 000, 12,000 and $12,000 match 12000,
    # while 12,5 stays a decimal value.
    remaining = re.sub(
        r"(?<!\d)(\d{1,3}(?:[\s,\u00a0]\d{3})+)(?!\d)",
        lambda match: re.sub(r"[\s,\u00a0]", "", match.group(1)),
        remaining,
    )
    numbers = [Decimal(value.replace(",", ".")) for value in re.findall(r"\d+(?:[.,]\d+)?", remaining)]
    return times, dates, numbers


def _currency_facts(text: str) -> list[str]:
    lowered = text.casefold()
    facts: list[str] = []
    if re.search(r"\$|\busd\b|美元|доллар", lowered):
        facts.append("USD")
    if re.search(r"€|\beur\b|евро|欧元", lowered):
        facts.append("EUR")
    return facts


POLARITY_PATTERNS = {
    "refrigerated": {
        "ru": {"negative": (r"не\s+(?:нужен\s+)?(?:рефрижератор\w*|холодильн\w*\s+грузовик)", r"(?:рефрижератор\w*|холодильн\w*\s+грузовик)\s+(?:не\s+нужен|не\s+требуется)", r"без\s+(?:рефрижератор\w*|холодильн\w*\s+грузовик)"), "positive": (r"(?:нужен|требуется)\s+(?:рефрижератор\w*|холодильн\w*\s+грузовик)",)},
        "en": {"negative": (r"not\s+(?:a\s+)?(?:refrigerated\s+truck|reefer)", r"no\s+(?:refrigerated\s+truck|reefer)", r"(?:do\s+not|don't)\s+need\s+(?:a\s+)?(?:refrigerated\s+truck|reefer)", r"(?:refrigerated\s+truck|reefer)\s+(?:is\s+)?not\s+needed"), "positive": (r"(?:need|requires?)\s+(?:a\s+)?(?:refrigerated\s+truck|reefer)", r"(?:a\s+)?(?:refrigerated\s+truck|reefer)\s+(?:is\s+)?required")},
        "zh": {"negative": (r"(?:不是|不需要|不要|不用|无需|没有)\s*冷藏(?:车|卡车)", r"冷藏(?:车|卡车)\s*(?:不需要|不要|不用|无需)"), "positive": (r"(?:需要|要)\s*冷藏(?:车|卡车)",)},
    },
    "tent": {
        "ru": {"negative": (r"не\s+(?:нужен\s+)?тент(?:ов\w*)?", r"тент(?:ов\w*)?\s+(?:тоже\s+)?(?:не\s+нужен|не\s+требуется)", r"без\s+тент(?:ов\w*)?"), "positive": (r"(?:нужен|требуется)\s+тент(?:ов\w*)?",)},
        "en": {"negative": (r"(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?\s+(?:is\s+)?(?:also\s+)?not\s+needed", r"not\s+(?:a\s+)?(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?", r"no\s+(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?", r"(?:do\s+not|don't)\s+need\s+(?:a\s+)?(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?"), "positive": (r"(?:need|requires?)\s+(?:a\s+)?(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?", r"(?:a\s+)?(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?\s+(?:is\s+)?required")},
        "zh": {"negative": (r"(?:不是|不需要|不要|不用|无需|没有)\s*(?:篷布车|篷车|帆布车)", r"(?:篷布车|篷车|帆布车)\s*(?:不需要|不要|不用|无需)"), "positive": (r"(?:需要|要)\s*(?:篷布车|篷车|帆布车)",)},
    },
    "cargo_readiness": {
        "ru": {"negative": (r"груз\s+(?:ещё\s+)?не\s+готов", r"груз\s+готов\s*\?\s*нет"), "positive": (r"груз\s+(?:готов|готовый)",)},
        "en": {"negative": (r"(?:cargo|goods|shipment)\s+(?:(?:is|are)\s+not|isn't|aren't)\s+ready", r"(?:cargo|goods|shipment)\s+(?:(?:is|are)\s+)?ready\s*\?\s*no"), "positive": (r"(?:cargo|goods|shipment)\s+(?:is|are)\s+ready",)},
        "zh": {"negative": (r"货物(?:还)?没(?:有)?准备好", r"货物准备好了吗?\s*[？?]?\s*不"), "positive": (r"货物(?:已)?准备好",)},
    },
}


def _polarity(text: str, language: str, concept: str) -> str | None:
    patterns = POLARITY_PATTERNS.get(concept, {}).get(language, {})
    negative = any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns.get("negative", ()))
    positive = any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns.get("positive", ()))
    # A negative question/answer contains the positive lexical fragment
    # (``Goods are ready? No``); its explicit negative relation wins.
    if negative:
        return "negative"
    if positive:
        return "positive"
    return None


def repair_logistics_translation(source_text: str, translated_text: str, source: str, target: str) -> str:
    """Apply narrow, deterministic repairs for observed logistics model errors."""
    repaired = translated_text
    normalized_source = source_text.strip().casefold()
    exact_repair = _EXACT_TRANSLATION_REPAIRS.get((normalized_source, source, target))
    if exact_repair and repaired.strip().casefold() == normalized_source:
        repaired = exact_repair

    # In the dispatch context, ``Route clear`` is a traffic-status statement,
    # not an instruction to clear a route.  NLLB has emitted ``路线清理``
    # ("route cleaning"), so repair only that observed false friend.
    if source == "en" and target == "zh" and _CLEAR_ROAD_SOURCE.search(source_text):
        repaired = repaired.replace("路线清理", "道路畅通")
    if source == "zh" and target == "ru" and "乌鲁木齐" in source_text:
        repaired = re.sub(r"Уруми-Ци", "Урумчи", repaired, flags=re.IGNORECASE)
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

    # Restore a dropped unit only when every numeric token in the candidate
    # maps one-to-one, in order, to a source weight.  If the sentence also
    # contains a price, plate number, or date, that mapping is ambiguous and
    # must remain a FAIL rather than attaching the unit to the first number.
    source_weights, source_unbound_units = _weight_profile(source_text, source)
    target_weights, target_unbound_units = _weight_profile(repaired, target)
    if source_weights and not target_weights and not target_unbound_units:
        target_numbers = list(re.finditer(r"(?<!\d)\d+(?:[.,]\d+)?", repaired))
        source_values = [value for value, _start, _end in source_weights]
        target_values = [Decimal(match.group(0).replace(",", ".")) for match in target_numbers]
        if len(source_values) == len(target_values) and source_values == target_values:
            unit = WEIGHT_UNIT_CANONICAL[target]
            for match in reversed(target_numbers):
                number = match.group(0)
                repaired = (
                    repaired[:match.end()]
                    + f" {unit}"
                    + repaired[match.end():]
                )
        elif len(source_values) == 1:
            # A logistics sentence commonly contains a price as well as one
            # weight.  The old all-numbers mapping intentionally refused to
            # repair that case, which made the real control phrase fail when
            # NLLB returned ``1500 dollars, 10``.  Bind the unit only when the
            # source weight value occurs exactly once in the candidate; a
            # plate/date/price can therefore never receive a guessed unit.
            matching_numbers = [
                match
                for match in target_numbers
                if Decimal(match.group(0).replace(",", ".")) == source_values[0]
            ]
            if len(matching_numbers) == 1:
                match = matching_numbers[0]
                unit = WEIGHT_UNIT_CANONICAL[target]
                repaired = (
                    repaired[:match.end()]
                    + f" {unit}"
                    + repaired[match.end():]
                )

    # The body type is a critical cargo fact, not a generic truck synonym.
    if _contains_any(source_text, VEHICLE_BODY_TERMS.get(source, ())):
        # The QA2 NLLB model has produced the observed Russian hallucination
        # «водопад» for Chinese 篷布车.  Handle it as a glossary confusion even
        # when an earlier repair already appended the canonical body type;
        # otherwise the bad word survives beside the correct word and is then
        # cached as a successful translation.
        observed_body_confusions = {
            "en": ("waterfall",),
            "ru": ("тренажер", "водопад"),
            "zh": ("地毯", "帐卡车"),
            "kk": (),
        }
        # Do not rewrite a real waterfall/carpet that occurs in the source.
        # The glossary is solely for the observed NLLB body-type confusions.
        if not _contains_any(source_text, LITERAL_BODY_CONFUSION_TERMS.get(source, ())):
            for confused in observed_body_confusions.get(target, ()):
                if confused.casefold() in repaired.casefold():
                    if _contains_any(repaired, VEHICLE_BODY_TERMS.get(target, ())):
                        # A previous repair may already have appended the
                        # canonical body type; remove the hallucination rather
                        # than retaining both terms in a cached translation.
                        repaired = re.sub(
                            rf"{re.escape(confused)}\s*[,，]?\s*",
                            "",
                            repaired,
                            count=1,
                            flags=re.IGNORECASE,
                        )
                    else:
                        repaired = re.sub(
                            re.escape(confused),
                            VEHICLE_BODY_CANONICAL[target],
                            repaired,
                            count=1,
                            flags=re.IGNORECASE,
                        )
        if not _contains_any(repaired, VEHICLE_BODY_TERMS.get(target, ())):
            repaired = _append_before_punctuation(repaired, VEHICLE_BODY_CANONICAL[target])

    # A household refrigerator is not a logistics refrigerated vehicle. The
    # substitution is allowed only when the source explicitly names a reefer,
    # so ordinary household text is never rewritten.
    if _contains_any(source_text, REFRIGERATED_TERMS.get(source, ())):
        observed_refrigerator_confusions = {
            "en": (("refrigerator", "refrigerated truck"),),
            "ru": (("холодильный грузовик", "рефрижератор"), ("холодильник", "рефрижератор")),
            "zh": (("冰箱", "冷藏车"),),
            "kk": (),
        }
        for confused, canonical in observed_refrigerator_confusions.get(target, ()):
            repaired = re.sub(re.escape(confused), canonical, repaired, flags=re.IGNORECASE)

    # Normalize only the observed Almaty transliteration; missing cities are
    # left for the quality gate to reject rather than guessed or invented.
    for city in _city_keys(source_text, source):
        for confused in CITY_OBSERVED_CONFUSIONS.get((city, target), ()):
            if confused.casefold() in repaired.casefold():
                canonical = CITY_REPAIR_CANONICAL.get((city, target), CITY_TERMS[city][target][0])
                # Replace every observed bad variant even if the provider also
                # emitted one canonical occurrence. Otherwise the presence-only
                # quality gate accepts and caches a mixed correct/incorrect text.
                pattern = re.escape(confused)
                if canonical.casefold().startswith(confused.casefold()):
                    canonical_suffix = canonical[len(confused):]
                    if canonical_suffix:
                        pattern += f"(?!{re.escape(canonical_suffix)})"
                repaired = re.sub(pattern, canonical, repaired, flags=re.IGNORECASE)

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


def translation_quality_failures(source_text: str, translated_text: str, source: str, target: str) -> list[str]:
    failures: list[str] = []
    if _numeric_facts(source_text) != _numeric_facts(translated_text):
        failures.append("numeric_facts_changed")
    if _currency_facts(source_text) != _currency_facts(translated_text):
        failures.append("currency_facts_changed")
    for concept in ("refrigerated", "tent"):
        source_polarity = _polarity(source_text, source, concept)
        target_polarity = _polarity(translated_text, target, concept)
        if source_polarity == "negative":
            if target_polarity == "positive":
                failures.append(f"negation_flipped:{concept}")
            elif target_polarity != "negative":
                failures.append(f"negation_lost:{concept}")
        elif source_polarity == "positive" and target_polarity == "negative":
            failures.append(f"negation_flipped:{concept}")
    source_readiness = _polarity(source_text, source, "cargo_readiness")
    target_readiness = _polarity(translated_text, target, "cargo_readiness")
    if source_readiness:
        if target_readiness is None:
            failures.append("cargo_readiness_missing")
        elif target_readiness != source_readiness:
            failures.append("cargo_readiness_flipped")
    source_has_vehicle_body = _contains_any(source_text, VEHICLE_BODY_TERMS.get(source, ()))
    source_has_transport_variant = source_has_vehicle_body or _contains_any(
        source_text, REFRIGERATED_TERMS.get(source, ())
    )
    for name, variants in LOGISTICS_TERMS.items():
        # A specific body type (e.g. 篷布车) is stronger than the generic
        # ``truck`` bucket; its dedicated invariant below checks the exact
        # type instead of demanding a second generic vehicle word.
        if name == "truck" and source_has_transport_variant:
            continue
        # In a readiness statement, English ``shipment`` denotes cargo; it
        # is not an additional delivery-event fact that must survive twice.
        if name == "delivery" and source == "en" and _polarity(source_text, source, "cargo_readiness"):
            continue
        if _contains_any(source_text, variants[source]) and not _contains_any(translated_text, variants[target]):
            failures.append(f"logistics_term_missing:{name}")
    source_weights, source_unbound_units = _weight_profile(source_text, source)
    target_weights, target_unbound_units = _weight_profile(translated_text, target)
    if source_weights:
        # Preserve the association, not merely the set of numbers.  Thus
        # ``1500 吨 USD, 10`` cannot pass for ``1500 USD, 10 тонн``.
        if [value for value, _start, _end in source_weights] != [
            value for value, _start, _end in target_weights
        ]:
            failures.append("weight_value_changed")
        if source_unbound_units != target_unbound_units:
            failures.append("weight_unit_missing")
    elif source_unbound_units:
        # A source unit without a number may be retained only as a standalone
        # unit.  A target number plus that unit would invent an association.
        if target_weights or target_unbound_units != source_unbound_units:
            failures.append("weight_association_changed")
    elif target_weights or target_unbound_units:
        # Do not allow a model to invent a weight where the source had none.
        failures.append("weight_invented")
    if source_has_vehicle_body and not _contains_any(translated_text, VEHICLE_BODY_TERMS.get(target, ())):
        failures.append("body_type_missing")
    if source == "en" and target == "zh" and _CLEAR_ROAD_SOURCE.search(source_text):
        if not _contains_any(translated_text, _CLEAR_ROAD_ZH):
            failures.append("clear_road_meaning_missing")
    for city in _city_keys(source_text, source):
        if not _contains_any(translated_text, CITY_TERMS[city].get(target, ())):
            failures.append(f"city_missing:{city}")
    return list(dict.fromkeys(failures))


def translation_quality_ok(source_text: str, translated_text: str, source: str, target: str) -> bool:
    return not translation_quality_failures(source_text, translated_text, source, target)
