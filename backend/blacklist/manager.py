"""Управление чёрным списком — обёртка над DAL."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db


def add_to_blacklist(phone=None, plate=None, name=None, reason="", source="manual",
                     severity="medium") -> dict:
    return db.blacklist_add(phone=phone, plate=plate, name=name, reason=reason,
                             source=source, severity=severity)


def check_blacklist(phone=None, plate=None, name=None) -> list:
    return db.blacklist_check(phone=phone, plate=plate, name=name)


def seed_demo_blacklist():
    """Загружает демо-данные для показа работы системы.

    Ревизия 26.07.2026: в production демо-записи в реальную таблицу blacklist
    НЕ сеем (канон: no seed/demo data in prod). Включается только явным
    SEED_DEMO_BLACKLIST=true в .env (например, на стенде для показа).
    """
    import os
    if os.getenv("SEED_DEMO_BLACKLIST", "false").strip().lower() not in ("1", "true", "yes"):
        return
    existing = db.blacklist_check(phone="+79991234567")
    if existing:
        return
    samples = [
        {"phone": "+79991234567", "name": "Иван К.", "reason": "Не оплатил перевозку Москва→Алматы, август 2025",
         "source": "telegram", "severity": "critical"},
        {"plate": "X 999 XX", "name": "Неизвестный", "reason": "Фиктивные документы на груз",
         "source": "della", "severity": "high"},
        {"phone": "+77771112233", "name": "Петр М.", "reason": "Кинул на предоплату $500",
         "source": "ati", "severity": "critical"},
        {"phone": "+77772223344", "name": "Сергей Л.", "reason": "Украл груз в Хоргосе, 2024",
         "source": "telegram", "severity": "critical"},
    ]
    for s in samples:
        db.blacklist_add(**s)
    print(f"  Seeded {len(samples)} blacklist entries")
