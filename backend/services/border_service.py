"""Статус погранпереходов Казахстан ↔ Китай / Россия / Узбекистан / Кыргызстан.

Источники:
  - egov.kz / tamozhnya.gov.kz (публичные данные, scraping)
  - Telegram каналы мониторинга (парсинг)
  - DEMO режим: актуальные данные на основе времени суток

Погранпереходы:
  KZ-CN: Хоргос, Достык, Кольжат, Бахты
  KZ-RU: Сагарчин, Жайсан, Кайрак
  KZ-UZ: Жибек Жолы, Черняевка
  KZ-KG: Кордай, Карасу
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

# ТЗ онбординг §0.2 — справочник погранпереходов РК, сгруппированный по
# стране-соседу (CN/RU/UZ/KG/TM). Источник перечня — Постановление
# Правительства РК №697 от 09.07.2013. ВАЖНО: ниже только переходы, в чьём
# существовании и названии я уверен (текущие 8 + явно названные в ТЗ). Полный
# список №697 (особенно множество переходов с РФ) ДОЛЖЕН загружаться из
# официального источника — НЕ выдумываем фейковые названия/координаты. У
# переходов, добавленных без проверенных координат, lat/lon = None.
# Поле `country` — код соседа для accordion-группировки на фронте.
BORDERS = [
    # KZ-CN
    {"id": "khorgos",  "name": "Нуржолы (Хоргос)", "name_en": "Nurzholy (Khorgos)", "country": "CN", "countries": "KZ↔CN", "lat": 44.211, "lon": 80.414, "type": "auto+cargo"},
    {"id": "dostyk",   "name": "Достык",       "name_en": "Dostyk",     "country": "CN", "countries": "KZ↔CN", "lat": 45.233, "lon": 82.650, "type": "rail+cargo"},
    {"id": "kolzhat",  "name": "Кольжат",      "name_en": "Kolzhat",    "country": "CN", "countries": "KZ↔CN", "lat": 44.800, "lon": 80.900, "type": "auto"},
    {"id": "bakhty",   "name": "Бахты",        "name_en": "Bakhty",     "country": "CN", "countries": "KZ↔CN", "lat": 46.783, "lon": 85.767, "type": "auto"},
    {"id": "maykapchagay","name": "Майкапчагай","name_en": "Maykapchagay","country": "CN","countries": "KZ↔CN", "lat": None, "lon": None, "type": "auto"},
    # KZ-RU (полный перечень №697 — загрузить из официального источника)
    {"id": "sagarchin","name": "Сагарчин",     "name_en": "Sagarchin",  "country": "RU", "countries": "KZ↔RU", "lat": 51.200, "lon": 55.400, "type": "auto+cargo"},
    {"id": "zhaysan",  "name": "Жайсан",       "name_en": "Zhaysan",    "country": "RU", "countries": "KZ↔RU", "lat": 52.500, "lon": 69.700, "type": "auto"},
    {"id": "kayrak",   "name": "Кайрак",       "name_en": "Kayrak",     "country": "RU", "countries": "KZ↔RU", "lat": None, "lon": None, "type": "auto"},
    {"id": "syrym",    "name": "Сырым",        "name_en": "Syrym",      "country": "RU", "countries": "KZ↔RU", "lat": None, "lon": None, "type": "auto"},
    # KZ-UZ
    {"id": "zhibek",   "name": "Жибек Жолы",   "name_en": "Zhibek Zholy","country": "UZ","countries": "KZ↔UZ","lat": 41.200, "lon": 69.000, "type": "auto+cargo"},
    {"id": "tselinny", "name": "Целинный",     "name_en": "Tselinny",   "country": "UZ", "countries": "KZ↔UZ", "lat": None, "lon": None, "type": "auto"},
    {"id": "syrdarya", "name": "Сырдарья",     "name_en": "Syrdarya",   "country": "UZ", "countries": "KZ↔UZ", "lat": None, "lon": None, "type": "auto"},
    {"id": "konysbaeva","name": "им. Б. Конысбаева","name_en": "B. Konysbaev","country": "UZ","countries": "KZ↔UZ","lat": None, "lon": None, "type": "auto"},
    {"id": "kazygurt", "name": "Казыгурт",     "name_en": "Kazygurt",   "country": "UZ", "countries": "KZ↔UZ", "lat": None, "lon": None, "type": "auto"},
    # KZ-KG
    {"id": "korday",   "name": "Кордай",       "name_en": "Korday",     "country": "KG", "countries": "KZ↔KG", "lat": 42.900, "lon": 73.400, "type": "auto+cargo"},
    {"id": "kegen",    "name": "Кеген",        "name_en": "Kegen",      "country": "KG", "countries": "KZ↔KG", "lat": None, "lon": None, "type": "auto"},
    # KZ-TM
    {"id": "tazhen",   "name": "Тажен",        "name_en": "Tazhen",     "country": "TM", "countries": "KZ↔TM", "lat": None, "lon": None, "type": "auto"},
]

# Порядок стран для accordion (ТЗ §0.2): CN, RU, UZ, KG, TM.
COUNTRY_ORDER = ["CN", "RU", "UZ", "KG", "TM"]
COUNTRY_NAMES = {
    "CN": {"name": "Китай", "flag": "🇨🇳"},
    "RU": {"name": "Россия", "flag": "🇷🇺"},
    "UZ": {"name": "Узбекистан", "flag": "🇺🇿"},
    "KG": {"name": "Кыргызстан", "flag": "🇰🇬"},
    "TM": {"name": "Туркменистан", "flag": "🇹🇲"},
}


def _estimate_queue(border_id: str) -> dict:
    """Fallback-«очередь», когда CGR-интеграция выключена (CGR_FEATURE_ENABLED=
    false). РАНЬШЕ здесь генерировались СЛУЧАЙНЫЕ числа по времени суток — это
    вводило водителей в заблуждение (выглядело как живые данные). Удалено
    2026-06-13. Реальная загруженность теперь идёт из публичного реестра CGR
    (см. backend/cgr/scoreboard_service.py). Здесь — честный «нет данных»."""
    return {
        "trucks_in_queue": None,
        "estimated_wait_hours": None,
        "status": "unknown",
        "updated_at": None,
    }


def get_all_borders() -> list:
    result = []
    for b in BORDERS:
        q = _estimate_queue(b["id"])
        result.append({**b, **q})
    return result


def get_border(border_id: str) -> dict:
    for b in BORDERS:
        if b["id"] == border_id:
            q = _estimate_queue(b["id"])
            return {**b, **q}
    return None


def search_borders(countries: str = None) -> list:
    """Фильтр по стране: 'CN', 'RU', 'UZ', 'KG', 'TM'."""
    if not countries:
        return get_all_borders()
    code = countries.upper()
    return [
        {**b, **_estimate_queue(b["id"])}
        for b in BORDERS
        if code == b.get("country") or code in b["countries"]
    ]


def get_borders_grouped(query: str = None) -> list:
    """ТЗ §0.2 — переходы, сгруппированные по стране-соседу (accordion).

    Возвращает список групп в порядке COUNTRY_ORDER:
      [{ country, name, flag, crossings: [ {…border, …queue} ] }]
    query — необязательный поиск по названию перехода (по подстроке).
    """
    q = (query or "").strip().lower()
    groups = []
    for code in COUNTRY_ORDER:
        meta = COUNTRY_NAMES[code]
        items = []
        for b in BORDERS:
            if b.get("country") != code:
                continue
            if q and q not in b["name"].lower() and q not in b.get("name_en", "").lower():
                continue
            items.append({**b, **_estimate_queue(b["id"])})
        if items:
            groups.append({
                "country": code,
                "name": meta["name"],
                "flag": meta["flag"],
                "crossings": items,
            })
    return groups
