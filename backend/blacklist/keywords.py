"""Ключевые слова для парсинга Telegram / WhatsApp чатов."""

NEGATIVE_KEYWORDS = [
    # Русский
    'кидала', 'кидалово', 'мошенник', 'мошенничество',
    'не грузить', 'не давать', 'не работать', 'не работайте',
    'украл', 'украли', 'обман', 'обманул', 'обманули',
    'пропал', 'исчез', 'не отвечает', 'заблокировал',
    'сломал', 'повредил', 'испортил',
    'левый', 'фейк', 'подстава', 'подставил',
    'черный список', 'чс', 'блок',
    'долг', 'должен', 'не заплатил', 'не оплатил',
    'кинул', 'развод', 'лохотрон',
    # Казахский
    'алаяқ', 'алдамшы',
    # Узбекский
    'алдамчи', 'фирибгар',
    # Английский
    'scam', 'fraud', 'fraudster', 'scammer', 'cheat', 'blacklist',
    # Китайский
    '骗子', '诈骗',
]

POSITIVE_KEYWORDS = [
    'рекомендую', 'отличный', 'надежный', 'проверенный',
    'довез', 'всё чётко', 'все четко', 'без проблем', 'молодец',
    'лучший', 'топ', 'огонь', 'красавчик', 'зачёт',
    'спасибо', 'благодарю',
    # Каз/Узб
    'рахмет', 'рахмат',
    # Английский
    'recommend', 'trusted', 'reliable', 'verified',
]


def detect_sentiment(text: str) -> str:
    """Простой классификатор: negative / neutral / positive."""
    if not text:
        return "neutral"
    t = text.lower()
    neg = sum(1 for kw in NEGATIVE_KEYWORDS if kw in t)
    pos = sum(1 for kw in POSITIVE_KEYWORDS if kw in t)
    if neg > pos:
        return "negative"
    if pos > neg:
        return "positive"
    return "neutral"


def extract_keywords(text: str) -> list:
    """Возвращает список найденных ключевых слов."""
    if not text:
        return []
    t = text.lower()
    found = []
    for kw in NEGATIVE_KEYWORDS + POSITIVE_KEYWORDS:
        if kw in t:
            found.append(kw)
    return found


# Регулярки для извлечения данных
import re

PHONE_REGEX = re.compile(r'\+?\d{10,13}')
PLATE_REGEXES = [
    re.compile(r'\b[A-ZА-Я]\s?\d{3}\s?[A-ZА-Я]{2}\b'),  # A 123 BC
    re.compile(r'\b\d{3}\s?[A-ZА-Я]{3}\s?\d{2,3}\b'),    # 123 ABC 01
    re.compile(r'\b\d{2}\s?[A-ZА-Я]{2}\s?\d{3,4}\b'),    # 01 AB 456
]


def extract_phone(text: str) -> str | None:
    m = PHONE_REGEX.search(text or "")
    return m.group(0) if m else None


def extract_plate(text: str) -> str | None:
    for rx in PLATE_REGEXES:
        m = rx.search(text or "")
        if m:
            return m.group(0)
    return None
