"""OCR техпаспорта — через pytesseract."""
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config

try:
    import pytesseract
    from PIL import Image
    pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


# Паттерны для извлечения данных из техпаспорта
PLATE_REGEX = re.compile(r'([A-ZА-Я]\s?\d{3}\s?[A-ZА-Я]{2,3})')
VIN_REGEX = re.compile(r'\b([A-HJ-NPR-Z0-9]{17})\b')
YEAR_REGEX = re.compile(r'\b(19[89]\d|20[0-3]\d)\b')
BRAND_KEYWORDS = [
    'MERCEDES', 'MAN', 'SCANIA', 'VOLVO', 'DAF', 'IVECO', 'RENAULT',
    'KAMAZ', 'КАМАЗ', 'MAZ', 'МАЗ', 'HOWO', 'FAW', 'SHACMAN',
]


def extract_passport_data(image_path: str, ui_lang: str = None) -> dict:
    """Распознаёт техпаспорт, извлекает марку, номер, VIN, год.
    ui_lang: выбор OCR-языков по языку интерфейса (RU/KZ/UZ/CN...)."""
    if not OCR_AVAILABLE:
        return {
            "success": False,
            "error": "OCR not available (install pytesseract + Pillow)",
            "raw_text": "",
        }

    try:
        img = Image.open(image_path)

        # Preprocessing: авто-поворот, контраст, grayscale
        try:
            from PIL import ImageOps, ImageEnhance
            img = ImageOps.exif_transpose(img)  # авто-поворот по EXIF
            img = img.convert('L')  # grayscale
            img = ImageEnhance.Contrast(img).enhance(1.5)  # усиление контраста
            # Resize если слишком маленькое
            if max(img.size) < 1000:
                ratio = 1500 / max(img.size)
                img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)), Image.LANCZOS)
        except Exception:
            pass

        lang = getattr(config, 'OCR_LANG_MAP', {}).get(ui_lang or 'default', config.OCR_LANGUAGES)
        text = pytesseract.image_to_string(img, lang=lang)

        text_upper = text.upper()
        result = {
            "success": True,
            "raw_text": text,
            "plate_number": None,
            "vin": None,
            "year": None,
            "brand": None,
            "confidence": 0.0,
        }

        # Извлекаем поля
        m = PLATE_REGEX.search(text_upper)
        if m:
            result["plate_number"] = m.group(1).replace(" ", "")

        m = VIN_REGEX.search(text_upper)
        if m:
            result["vin"] = m.group(1)

        m = YEAR_REGEX.search(text_upper)
        if m:
            result["year"] = int(m.group(1))

        for brand in BRAND_KEYWORDS:
            if brand in text_upper:
                result["brand"] = brand
                break

        # Оценка уверенности
        fields = [result["plate_number"], result["vin"], result["year"], result["brand"]]
        filled = sum(1 for f in fields if f)
        result["confidence"] = filled / len(fields)

        # Если confidence < 60% — помечаем что нужен ручной ввод
        if result["confidence"] < 0.6:
            result["needs_manual"] = True
            result["hint"] = "Распознавание неполное. Проверьте и дополните данные вручную."

        return result

    except Exception as e:
        return {
            "success": False,
            "error": "Ошибка обработки фото. Попробуйте другое фото.",
            "raw_text": "",
            "needs_manual": True,
        }


def extract_text_from_image(image_path: str, ui_lang: str = None) -> str:
    """Простой OCR — весь текст с картинки."""
    if not OCR_AVAILABLE:
        return ""
    try:
        img = Image.open(image_path)
        lang = getattr(config, 'OCR_LANG_MAP', {}).get(ui_lang or 'default', config.OCR_LANGUAGES)
        return pytesseract.image_to_string(img, lang=lang)
    except Exception:
        return ""
