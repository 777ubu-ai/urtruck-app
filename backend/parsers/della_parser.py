"""Парсер Della.kz + ATI.su — биржи грузоперевозок СНГ.

Della: публичные страницы перевозчиков с отзывами
ATI: карточки фирм с рейтингом и жалобами

Стратегия:
  1. Ищем перевозчика по phone/plate/name
  2. Скрейпим публичную страницу
  3. Извлекаем жалобы/рейтинг → в blacklist (если жалобы) или scoring (если ОК)

В DEMO: 3 демо-претензии + real HTTP попытка (graceful fallback)
"""
import sys
import re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from database import db


DEMO_COMPLAINTS = [
    {"phone": "+79991234567", "name": "Иван К.", "source": "della",
     "reason": "Претензия от Global Cargo: не доставил груз вовремя, Москва→Алматы 09.2025"},
    {"phone": "+77771112233", "name": "Петр М.", "source": "della",
     "reason": "Претензия от Asia Trade: $500 предоплата не возвращена"},
    {"plate": "X 999 XX", "source": "ati",
     "reason": "Фиктивные документы, 3 жалобы от разных клиентов"},
]

DELLA_SEARCH_URL = "https://della.kz/search"
ATI_SEARCH_URL = "https://ati.su/firms"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (UrTruck Security Scanner/1.0)",
    "Accept-Language": "ru",
}


def _search_della(query: str) -> list:
    """Поиск по della.kz. Возвращает список жалоб [{phone, name, reason, source}]."""
    complaints = []
    try:
        r = httpx.get(
            f"{DELLA_SEARCH_URL}?q={query}&type=complaints",
            headers=HEADERS, timeout=15.0, follow_redirects=True,
        )
        if r.status_code != 200:
            return []
        text = r.text
        # Извлекаем жалобы из публичных страниц (HTML scraping)
        # Della формат: <div class="complaint-text">...</div>
        blocks = re.findall(r'class="complaint[^"]*"[^>]*>([^<]{20,500})', text)
        phones = re.findall(r'\+?[78]\d{10}', text)
        names = re.findall(r'class="firm-name[^"]*"[^>]*>([^<]{3,50})', text)
        for i, block in enumerate(blocks[:10]):
            complaints.append({
                "phone": phones[i] if i < len(phones) else None,
                "name": names[i] if i < len(names) else None,
                "reason": f"Della.kz: {block.strip()[:300]}",
                "source": "della",
            })
    except Exception as e:
        print(f"  [della] HTTP failed: {e}")
    return complaints


def _search_ati(query: str) -> list:
    """Поиск по ati.su."""
    complaints = []
    try:
        r = httpx.get(
            f"{ATI_SEARCH_URL}?q={query}",
            headers=HEADERS, timeout=15.0, follow_redirects=True,
        )
        if r.status_code != 200:
            return []
        text = r.text
        # ATI: рейтинг фирмы и жалобы
        blocks = re.findall(r'class="complaint[^"]*"[^>]*>([^<]{20,500})', text)
        plates = re.findall(r'[A-ZА-Я]\s?\d{3}\s?[A-ZА-Я]{2,3}', text)
        for i, block in enumerate(blocks[:10]):
            complaints.append({
                "plate": plates[i].replace(" ", "") if i < len(plates) else None,
                "reason": f"ATI.su: {block.strip()[:300]}",
                "source": "ati",
            })
    except Exception as e:
        print(f"  [ati] HTTP failed: {e}")
    return complaints


def search_driver(phone: str = None, plate: str = None, name: str = None) -> list:
    """Поиск жалоб на конкретного водителя по phone/plate/name."""
    results = []
    queries = [q for q in [phone, plate, name] if q]
    for q in queries:
        results.extend(_search_della(q))
        results.extend(_search_ati(q))
    return results


def run_parse():
    """Парсинг: демо + real HTTP попытка."""
    count = 0
    # DEMO
    for entry in DEMO_COMPLAINTS:
        existing = db.blacklist_check(
            phone=entry.get("phone"), plate=entry.get("plate"),
        )
        if existing:
            continue
        db.blacklist_add(
            phone=entry.get("phone"), plate=entry.get("plate"),
            name=entry.get("name"), reason=entry["reason"],
            source=entry["source"], severity="high",
        )
        count += 1

    # Real search (graceful — не падаем если Della/ATI недоступны)
    try:
        real = _search_della("претензия перевозчик")
        for c in real[:5]:
            existing = db.blacklist_check(phone=c.get("phone"), plate=c.get("plate"))
            if not existing and (c.get("phone") or c.get("plate")):
                db.blacklist_add(
                    phone=c.get("phone"), plate=c.get("plate"),
                    name=c.get("name"), reason=c["reason"],
                    source="della", severity="medium",
                )
                count += 1
    except Exception as e:
        print(f"  [della_parser] Real search failed: {e}")

    print(f"  [della_parser] Added {count} complaints from Della/ATI")
    return count


if __name__ == "__main__":
    db.init_db()
    run_parse()
