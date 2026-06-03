"""OCR водительских прав KZ/RU.

Извлекает:
  - license_number (AB1234567 или 99 12 345678)
  - categories (B, C, CE, D, DE, BE, M, A, A1, B1, C1, C1E, D1, D1E, Tm, Tb)
  - issue_date / expiry_date (DD.MM.YYYY)
  - fio (Фамилия Имя Отчество)
  - issued_by (место выдачи)
  - birth_date (DD.MM.YYYY)
"""
import re
import sys
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config

try:
    import pytesseract
    from PIL import Image, ImageOps, ImageFilter
    pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


ALL_CATEGORIES = [
    "Tm", "Tb",  # трамвай, троллейбус
    "A1", "B1", "C1", "D1", "C1E", "D1E",
    "A", "B", "C", "D", "M",
    "BE", "CE", "DE",
]

LICENSE_NUMBER_KZ = re.compile(r"\b(\d{9})\b")
LICENSE_NUMBER_RU = re.compile(r"\b(\d{2}\s?\d{2}\s?\d{6})\b")
DATE_REGEX = re.compile(r"(\d{2}[.\-/]\d{2}[.\-/]\d{4})")
FIO_REGEX = re.compile(r"([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?")


def _preprocess(img: "Image.Image") -> "Image.Image":
    """Grayscale + autocontrast + denoise для лучшего OCR."""
    img = img.convert("L")
    img = ImageOps.autocontrast(img, cutoff=2)
    img = img.filter(ImageFilter.MedianFilter(size=3))
    # Upscale если мелкое
    if max(img.size) < 1200:
        ratio = 1200 / max(img.size)
        img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)), Image.LANCZOS)
    return img


# OCR с rus-моделью часто читает ЛАТИНСКИЕ категории (B, C, CE) как
# КИРИЛЛИЧЕСКИЕ омоглифы (В, С, СЕ). Нормализуем их к латинице, иначе
# латинские паттерны категорий не сработают.
_CYR2LAT = str.maketrans({
    "А": "A", "В": "B", "С": "C", "Е": "E", "К": "K", "М": "M",
    "Н": "H", "О": "O", "Р": "P", "Т": "T", "Х": "X",
})


def _find_categories(text: str) -> list:
    """Извлекает категории прав, сортируя длинные → короткие чтобы CE не перекрывал C."""
    upper = text.upper().replace("\n", " ").translate(_CYR2LAT)
    found = []
    # Сначала ищем составные (CE, DE, BE, C1E, D1E) — они должны matchиться раньше C/D/B
    for cat in ALL_CATEGORIES:
        pattern = r"(?<![A-ZА-Я0-9])" + re.escape(cat.upper()) + r"(?![A-ZА-Я0-9])"
        if re.search(pattern, upper):
            found.append(cat.upper())
    # Убираем дубликаты, но если нашли CE — выкидываем C, нашли DE — выкидываем D, BE — B
    if "CE" in found:
        found = [c for c in found if c != "C" or "C1" in found]  # C1 оставляем
    return sorted(set(found), key=lambda x: (len(x), x))


def _parse_date(s: str):
    """DD.MM.YYYY → datetime."""
    for sep in [".", "-", "/"]:
        try:
            return datetime.strptime(s.replace(sep, "."), "%d.%m.%Y").date()
        except ValueError:
            continue
    return None


def _experience_years(issue_date) -> int:
    if not issue_date:
        return 0
    delta = datetime.now().date() - issue_date
    return max(0, delta.days // 365)


def extract_license_data(image_path: str) -> dict:
    """Распознаёт водительские права KZ/RU, извлекает все поля."""
    if not OCR_AVAILABLE:
        return {"success": False, "error": "OCR not available", "raw_text": ""}

    try:
        img = Image.open(image_path)
        proc = _preprocess(img)
        text = pytesseract.image_to_string(proc, lang=config.OCR_LANGUAGES)

        result = {
            "success": True,
            "raw_text": text[:1000],
            "license_number": None,
            "categories": [],
            "issue_date": None,
            "expiry_date": None,
            "birth_date": None,
            "fio": None,
            "experience_years": None,
            "expired": None,
            "confidence": 0.0,
        }

        # Номер прав
        m = LICENSE_NUMBER_RU.search(text)
        if m:
            result["license_number"] = m.group(1).replace(" ", "")
        else:
            m = LICENSE_NUMBER_KZ.search(text)
            if m:
                result["license_number"] = m.group(1)

        # Категории + флаг допуска к фуре (ТЗ §4: нужна C или CE)
        result["categories"] = _find_categories(text)
        result["has_c_ce"] = any(c in ("C", "CE") for c in result["categories"])

        # Даты: обычно на правах 3 даты — выдача, истечение, рождение
        dates_raw = DATE_REGEX.findall(text)
        parsed_dates = [d for d in (_parse_date(x) for x in dates_raw) if d]
        parsed_dates.sort()

        now = datetime.now().date()
        if parsed_dates:
            # Самая ранняя — обычно дата рождения
            past = [d for d in parsed_dates if d < now]
            future = [d for d in parsed_dates if d >= now]
            if len(parsed_dates) >= 3:
                result["birth_date"] = parsed_dates[0].isoformat()
                result["issue_date"] = parsed_dates[1].isoformat()
                result["expiry_date"] = parsed_dates[-1].isoformat() if future else None
            elif len(parsed_dates) == 2:
                if past and future:
                    result["issue_date"] = past[-1].isoformat()
                    result["expiry_date"] = future[0].isoformat()
                elif len(past) == 2:
                    result["birth_date"] = past[0].isoformat()
                    result["issue_date"] = past[1].isoformat()

            if result["expiry_date"]:
                result["expired"] = datetime.fromisoformat(result["expiry_date"]).date() < now
            if result["issue_date"]:
                result["experience_years"] = _experience_years(
                    datetime.fromisoformat(result["issue_date"]).date()
                )

        # ФИО
        m = FIO_REGEX.search(text)
        if m:
            parts = [p for p in m.groups() if p]
            result["fio"] = " ".join(parts)

        # Confidence: доля заполненных критичных полей
        critical = [
            result["license_number"],
            result["categories"],
            result["issue_date"],
        ]
        filled = sum(1 for f in critical if f)
        result["confidence"] = round(filled / len(critical), 2)

        return result

    except Exception as e:
        return {"success": False, "error": str(e), "raw_text": ""}
