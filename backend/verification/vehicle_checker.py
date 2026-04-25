"""Проверка транспорта — возраст, страховка, розыск.

В production интегрируется с:
  - adata.kz (КЗ: данные транспорта)
  - sgo.fcbk.kz (КЗ: страховка)
  - gibdd.ru (РФ: штрафы/розыск)

Пока — эвристика на основе данных профиля.
"""
from datetime import datetime


def check_vehicle(plate: str, year: int = None, has_insurance: bool = True) -> dict:
    """Возвращает компоненты скоринга для транспорта."""
    warnings = []
    score = 80

    # Возраст машины
    if year:
        age = datetime.now().year - year
        if age > 20:
            score -= 30
            warnings.append(f"Машина старше 20 лет ({age}y)")
        elif age > 15:
            score -= 15
            warnings.append(f"Машина старше 15 лет ({age}y)")
        elif age > 10:
            score -= 5

    if not has_insurance:
        score -= 15
        warnings.append("Нет страховки")

    return {
        "component": "vehicle",
        "score": max(0, min(100, score)),
        "warnings": warnings,
        "plate": plate,
        "year": year,
    }


def check_financial(user_id: str) -> dict:
    """
    Проверка финансов (долги, аресты).
    В production: интеграция с adata.kz / reestr-dolg.ru
    Пока заглушка с нейтральным значением.
    """
    return {
        "component": "financial",
        "score": 70,
        "warnings": [],
        "note": "Финансовая проверка требует интеграции с гос. базами",
    }


def check_identity(user_id: str, plate_verified: bool = False, selfie_verified: bool = False) -> dict:
    """Оценка по документам."""
    score = 40
    if plate_verified:
        score += 25
    if selfie_verified:
        score += 20
    return {"component": "identity", "score": min(100, score), "warnings": []}
