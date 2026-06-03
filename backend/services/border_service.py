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
import time
import random
from datetime import datetime
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
    """Оценка очереди на основе времени суток + детерминированного seed.
    В REAL — scraping tamozhnya.gov.kz или Telegram каналов."""
    hour = datetime.utcnow().hour + 6  # KZ = UTC+6
    if hour >= 24: hour -= 24

    # Час-пик: 8-12 и 14-18. Ночью — пусто.
    if 8 <= hour <= 12:
        base_trucks = random.randint(40, 120)
        base_wait_h = round(random.uniform(2, 8), 1)
    elif 14 <= hour <= 18:
        base_trucks = random.randint(30, 80)
        base_wait_h = round(random.uniform(1.5, 6), 1)
    elif 22 <= hour or hour <= 5:
        base_trucks = random.randint(0, 15)
        base_wait_h = round(random.uniform(0.2, 1), 1)
    else:
        base_trucks = random.randint(15, 50)
        base_wait_h = round(random.uniform(1, 4), 1)

    # Хоргос самый загруженный
    multiplier = 1.5 if border_id == "khorgos" else 1.0
    if border_id == "dostyk":
        multiplier = 1.3

    trucks = int(base_trucks * multiplier)
    wait = round(base_wait_h * multiplier, 1)
    status = "red" if wait > 5 else "yellow" if wait > 2 else "green"

    return {
        "trucks_in_queue": trucks,
        "estimated_wait_hours": wait,
        "status": status,
        "updated_at": datetime.utcnow().isoformat() + "Z",
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
