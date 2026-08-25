"""Парсер Telegram групп дальнобойщиков.

Работает в 2 режимах:
1. REAL: через telethon (требует TG_API_ID и TG_API_HASH от my.telegram.org)
2. DEMO: имитирует парсинг для демонстрации скоринга (текущий режим)
"""
import sys
import random
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from database import db
from blacklist import keywords


TELEGRAM_GROUPS = [
    # Казахстан
    'gruzoperevozki_kz', 'dalnoboi_kz', 'fury_almaty',
    'kargo_kitai_kz', 'logistics_kazakhstan',
    # Узбекистан
    'gruzoperevozki_uz', 'tashkent_cargo', 'uzbek_logistics',
    # Россия
    'dalnoboi_ru', 'gruzoperevozki_russia', 'cargo_china_russia',
    # Кыргызстан
    'cargo_bishkek', 'logistics_kg',
    # Международные
    'china_cargo_sng', 'yiwu_logistics', 'guangzhou_cargo', 'khorgos_border',
]


# Демо-сообщения чтобы показать работу скоринга без реальных telegram credentials
DEMO_MESSAGES = [
    ("dalnoboi_kz", "Ребята, не грузите Иван К. +79991234567 — кинул меня на Алматы-Москва, не оплатил", "negative"),
    ("gruzoperevozki_kz", "Рекомендую Ержан К., довез быстро, всё чётко, без проблем", "positive"),
    ("fury_almaty", "Бахтиёр У. +998901112233 — проверенный водитель, три раза возил, надёжный", "positive"),
    ("dalnoboi_ru", "Внимание! X 999 XX — фиктивные документы, не работать!", "negative"),
    ("cargo_china_russia", "Ищу машину Иу → Новосибирск, 15 тонн, тент", "neutral"),
    ("khorgos_border", "Кто стоит на Хоргосе? Сколько часов очередь?", "neutral"),
    ("tashkent_cargo", "Петр М. +77771112233 мошенник, кинул на предоплату", "negative"),
    ("dalnoboi_kz", "Сергей Л. +77772223344 украл груз в Хоргосе, чёрный список", "negative"),
    ("gruzoperevozki_uz", "Ержан К. топ, рекомендую всем", "positive"),
]


def parse_message(chat_name: str, text: str) -> dict:
    """Разбирает одно сообщение: извлекает телефон, номер, sentiment."""
    phone = keywords.extract_phone(text)
    plate = keywords.extract_plate(text)
    kws = keywords.extract_keywords(text)
    sentiment = keywords.detect_sentiment(text)
    return {
        "chat_name": chat_name,
        "text": text,
        "phone": phone,
        "plate": plate,
        "keywords": kws,
        "sentiment": sentiment,
    }


def process_message(chat_name: str, text: str):
    """Полный пайплайн обработки сообщения."""
    parsed = parse_message(chat_name, text)
    db.add_telegram_mention(
        chat_name=chat_name,
        message_text=text,
        phone=parsed["phone"],
        plate=parsed["plate"],
        keywords=parsed["keywords"],
        sentiment=parsed["sentiment"],
    )
    # Если очень негативное — автодобавление в blacklist
    if parsed["sentiment"] == "negative" and parsed["phone"]:
        critical = any(k in text.lower() for k in ["кинул", "украл", "мошенник", "обман"])
        if critical and not db.blacklist_check(phone=parsed["phone"]):
            db.blacklist_add(
                phone=parsed["phone"],
                name=parsed.get("name"),
                reason=f"Auto-detected from {chat_name}: {text[:100]}",
                source="telegram",
                severity="high",
            )
    return parsed


def run_demo_parse():
    """Имитация парсинга — обрабатывает DEMO_MESSAGES."""
    count = 0
    for chat, text, _expected in DEMO_MESSAGES:
        process_message(chat, text)
        count += 1
    print(f"  [telegram_parser] Processed {count} demo messages from {len(TELEGRAM_GROUPS)} groups")
    return count


def run_real_parse():
    """
    Реальный парсинг через telethon.
    Требует: TG_API_ID и TG_API_HASH в env.
    На первом запуске запросит номер телефона и код авторизации.
    """
    try:
        from telethon.sync import TelegramClient
    except ImportError:
        print("  [telegram_parser] telethon not installed, skipping real parse")
        return 0

    client = TelegramClient(
        config.TELEGRAM_SESSION,
        int(config.TELEGRAM_API_ID),
        config.TELEGRAM_API_HASH,
    )
    count = 0
    with client:
        for group in TELEGRAM_GROUPS:
            try:
                for msg in client.iter_messages(group, limit=50):
                    if msg.text:
                        process_message(group, msg.text)
                        count += 1
            except Exception as e:
                print(f"  [telegram_parser] Error {group}: {e}")
    return count


def run():
    if config.TELEGRAM_DEMO_MODE:
        # Ревизия 25.08.2026 (#289): в DEMO-режиме НЕ вставляем фейковые
        # записи в telegram_mentions / blacklist — это загрязняло production
        # DB каждые 6ч (scheduler). Demo-парсинг полезен только для ручного
        # CLI-тестирования, но НЕ для scheduled jobs.
        import os
        if os.getenv("SEED_DEMO_BLACKLIST", "false").strip().lower() in ("1", "true", "yes"):
            return run_demo_parse()
        print("  [telegram_parser] DEMO mode, skipping (set SEED_DEMO_BLACKLIST=true to run demo parse)")
        return 0
    return run_real_parse()


if __name__ == "__main__":
    db.init_db()
    print(f"[telegram_parser] mode={'DEMO' if config.TELEGRAM_DEMO_MODE else 'REAL'}")
    while True:
        try:
            n = run()
            print(f"[telegram_parser] processed {n} messages")
        except Exception as e:
            print(f"[telegram_parser] ERROR: {e}")
        # В демо-режиме спим 6 часов (согласно ТЗ)
        time.sleep(6 * 3600)
