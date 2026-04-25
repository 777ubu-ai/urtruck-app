"""WhatsApp monitor — Phase 3 (требует WhatsApp Business API).

В production используется whatsapp-web.js или Twilio WhatsApp API.
Сейчас — только заглушка + обработка импорта скриншотов через OCR.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db
from blacklist import keywords
from ocr.document_reader import extract_text_from_image


def process_screenshot(image_path: str, chat_name: str = "whatsapp_import") -> dict:
    """Когда пользователь присылает скриншот WhatsApp чата — распознаём текст."""
    text = extract_text_from_image(image_path)
    if not text:
        return {"success": False, "error": "OCR failed"}

    # Извлекаем телефоны и ключевые слова
    phone = keywords.extract_phone(text)
    plate = keywords.extract_plate(text)
    kws = keywords.extract_keywords(text)
    sentiment = keywords.detect_sentiment(text)

    db.add_telegram_mention(
        chat_name=chat_name,
        message_text=text[:500],
        phone=phone, plate=plate,
        keywords=kws, sentiment=sentiment,
    )

    # Если negative + есть телефон — автодобавление в blacklist
    if sentiment == "negative" and phone:
        critical = any(k in text.lower() for k in ["кинул", "украл", "мошенник", "обман"])
        if critical and not db.blacklist_check(phone=phone):
            db.blacklist_add(
                phone=phone, reason=f"WhatsApp screenshot: {text[:150]}",
                source="whatsapp", severity="high",
            )

    return {
        "success": True,
        "text_length": len(text),
        "phone": phone,
        "plate": plate,
        "sentiment": sentiment,
        "keywords": kws,
    }
