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

# Источник истины — таблица border_checkpoints через DAL (НЕ хардкод BORDERS).
from database import cgr_dal

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


# ТЗ §4.3: пока нет официальной интеграции CarGoRuqsat/qoldau — данных о
# реальной очереди НЕ существует. Возвращаем честные null + pending-integration,
# а НЕ выдуманные числа. Никакого random. Legacy-поля (trucks_in_queue /
# estimated_wait_hours / status) сохранены для обратной совместимости фронта,
# но тоже не врут: null / 'pending-integration'.
def _pending_queue() -> dict:
    return {
        "queue_status": "pending-integration",
        "queue_count": None,
        "wait_time": None,
        "last_updated": None,
        # legacy-алиасы (старый фронт ждёт эти ключи) — тоже честные:
        "trucks_in_queue": None,
        "estimated_wait_hours": None,
        "status": "pending-integration",
    }


def _row_to_api(row: dict) -> dict:
    """Маппинг строки border_checkpoints (БД) → объект API одного КПП."""
    country = row.get("country_to")
    country_from = row.get("country_from") or "KZ"
    return {
        "id": row.get("code"),
        "code": row.get("code"),
        "name": row.get("name_ru"),
        "name_en": row.get("name_en"),
        "country": country,                                   # для accordion-группировки
        "countries": f"{country_from}↔{country}" if country else country_from,
        "lat": row.get("lat"),
        "lon": row.get("lon"),
        "type": row.get("type"),
        "region": row.get("region"),                          # null пока не наполнено по №697
        "border_status": row.get("border_status") or "unknown",
        "work_hours": row.get("work_hours"),                  # null пока не наполнено
        **_pending_queue(),
    }


def _all_rows() -> list:
    """Единый источник истины — таблица border_checkpoints (НЕ хардкод BORDERS)."""
    return cgr_dal.get_all_checkpoints(active_only=True)


def get_all_borders() -> list:
    return [_row_to_api(r) for r in _all_rows()]


def get_border(border_id: str) -> dict:
    row = cgr_dal.get_checkpoint(border_id)
    return _row_to_api(row) if row else None


def search_borders(countries: str = None) -> list:
    """Фильтр по стране-соседу: 'CN', 'RU', 'UZ', 'KG', 'TM'."""
    items = get_all_borders()
    if not countries:
        return items
    code = countries.upper()
    return [b for b in items if b.get("country") == code]


def get_borders_grouped(query: str = None) -> list:
    """ТЗ §4.2 — переходы из БД, сгруппированные по стране-соседу (accordion).

    Возвращает список групп в порядке COUNTRY_ORDER:
      [{ country, name, flag, crossings: [ {…border, …pending-queue} ] }]
    query — необязательный поиск по названию перехода (подстрока, ru/en).
    Очередь по каждому КПП — pending-integration (реальных данных нет, §4.3).
    """
    q = (query or "").strip().lower()
    by_country: dict[str, list] = {code: [] for code in COUNTRY_ORDER}
    for b in get_all_borders():
        code = b.get("country")
        if code not in by_country:
            continue
        if q and q not in (b.get("name") or "").lower() and q not in (b.get("name_en") or "").lower():
            continue
        by_country[code].append(b)

    groups = []
    for code in COUNTRY_ORDER:
        items = by_country[code]
        if items:
            meta = COUNTRY_NAMES[code]
            groups.append({
                "country": code,
                "name": meta["name"],
                "flag": meta["flag"],
                "crossings": items,
            })
    return groups
