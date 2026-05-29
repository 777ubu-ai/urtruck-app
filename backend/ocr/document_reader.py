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
# KZ-формат госномера приоритетнее: 3 цифры + 2-3 буквы + 2 цифры региона
# (847 ATA 02). Иначе модель ТС вроде "R500" ложно ловится letter-first
# паттерном. Буквы нормализуем кириллица→латиница перед поиском.
PLATE_KZ_REGEX = re.compile(r'(\d{3}\s?[A-Z]{2,3}\s?\d{2})')
PLATE_REGEX = re.compile(r'([A-Z]\s?\d{3}\s?[A-Z]{2,3})')
VIN_REGEX = re.compile(r'\b([A-HJ-NPR-Z0-9]{17})\b')
_PLATE_CYR2LAT = str.maketrans({
    "А": "A", "В": "B", "С": "C", "Е": "E", "К": "K", "М": "M",
    "Н": "H", "О": "O", "Р": "P", "Т": "T", "Х": "X",
})
YEAR_REGEX = re.compile(r'\b(19[89]\d|20[0-3]\d)\b')
# Грузовые марки + модели (зеркало src/utils/truckConstants.js TRUCK_BRANDS).
# Ключ — uppercase-токен для поиска в OCR-тексте; display — каноническое имя;
# models — для попытки извлечь модель (только длиной ≥2: одиночные буквы
# вроде Scania R надёжно не ловятся в OCR-шуме). aliases — доп. написания.
BRAND_MODELS = [
    {"key": "MERCEDES",  "display": "Mercedes-Benz", "aliases": ["MERCEDES-BENZ", "MB ACTROS"], "models": ["ACTROS", "AROCS", "ATEGO", "AXOR"]},
    {"key": "MAN",       "display": "MAN",            "aliases": [], "models": ["TGX", "TGS", "TGM", "TGL", "F2000"]},
    {"key": "SCANIA",    "display": "Scania",         "aliases": [], "models": ["R450", "R500", "R420"]},
    {"key": "VOLVO",     "display": "Volvo",          "aliases": [], "models": ["FH16", "FH", "FMX", "FM", "FE"]},
    {"key": "DAF",       "display": "DAF",            "aliases": [], "models": ["XF", "XG", "CF", "LF"]},
    {"key": "IVECO",     "display": "Iveco",          "aliases": [], "models": ["S-WAY", "STRALIS", "TRAKKER", "EUROCARGO"]},
    {"key": "RENAULT",   "display": "Renault Trucks", "aliases": ["RENAULT TRUCKS"], "models": ["MAGNUM", "PREMIUM"]},
    {"key": "КАМАЗ",     "display": "КАМАЗ",          "aliases": ["KAMAZ"], "models": ["54901", "5490", "65116", "6520", "43118"]},
    {"key": "МАЗ",       "display": "МАЗ",            "aliases": ["MAZ"], "models": ["5440", "6430", "5340", "4371"]},
    {"key": "HOWO",      "display": "Howo (Sinotruk)","aliases": ["SINOTRUK", "SITRAK"], "models": ["A7", "T7H", "TX"]},
    {"key": "SHACMAN",   "display": "Shacman",        "aliases": [], "models": ["X3000", "F3000", "X6000", "H3000"]},
    {"key": "FAW",       "display": "FAW",            "aliases": [], "models": ["J6", "J7", "JH6"]},
    {"key": "DONGFENG",  "display": "Dongfeng",       "aliases": [], "models": ["TIANLONG", "KX", "KL", "GX"]},
    {"key": "ISUZU",     "display": "Isuzu",          "aliases": [], "models": ["GIGA", "FORWARD", "FVR", "NQR"]},
    {"key": "HYUNDAI",   "display": "Hyundai",        "aliases": [], "models": ["XCIENT", "TRAGO", "MIGHTY"]},
    {"key": "HINO",      "display": "Hino",           "aliases": [], "models": ["500", "700", "300"]},
]


def _detect_brand_model(text_upper: str):
    """Ищет марку (по key/aliases) и, если нашла, пробует модель из её списка
    (только токены длиной ≥2). Возвращает (display_brand|None, model|None)."""
    for b in BRAND_MODELS:
        tokens = [b["key"]] + b.get("aliases", [])
        if any(tok in text_upper for tok in tokens):
            model = None
            for m in b.get("models", []):
                if len(m) >= 2 and re.search(r'\b' + re.escape(m) + r'\b', text_upper):
                    model = m
                    break
            return b["display"], model
    return None, None


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
            "model": None,
            "confidence": 0.0,
        }

        # Извлекаем поля. Госномер: латинизируем буквы, пробуем KZ-формат
        # (цифры-буквы-регион) — он не совпадает с моделью ТС, затем fallback.
        plate_src = text_upper.translate(_PLATE_CYR2LAT)
        m = PLATE_KZ_REGEX.search(plate_src) or PLATE_REGEX.search(plate_src)
        if m:
            result["plate_number"] = m.group(1).replace(" ", "")

        m = VIN_REGEX.search(text_upper)
        if m:
            result["vin"] = m.group(1)

        m = YEAR_REGEX.search(text_upper)
        if m:
            result["year"] = int(m.group(1))

        brand, model = _detect_brand_model(text_upper)
        result["brand"] = brand
        result["model"] = model

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
