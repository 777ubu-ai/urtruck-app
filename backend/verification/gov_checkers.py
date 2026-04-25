"""Mock-проверки по госбазам стран СНГ.

В production заменяется на реальные интеграции:
  KZ: adata.kz, sgo.fcbk.kz, egov.kz, kmg.kz
  RU: gibdd.ru, fssp.gov.ru, nalog.gov.ru
  UZ: tozamet.uz, spi.uz
  KG: car.kg
  TJ: mia.tj
"""
import hashlib
import random


def _seed(phone_or_plate: str) -> int:
    """Детерминированный сид от телефона/номера для стабильных mock-данных."""
    return int(hashlib.md5((phone_or_plate or "").encode()).hexdigest()[:8], 16)


def check_kz(phone: str = None, plate: str = None) -> dict:
    """Казахстан: adata.kz + sgo.fcbk.kz."""
    if not phone and not plate:
        return {"country": "KZ", "status": "no_data"}
    rng = random.Random(_seed(phone or plate))
    insurance_valid = rng.random() > 0.15
    has_arrests = rng.random() < 0.05
    tax_debts = round(rng.random() * 500, 2) if rng.random() < 0.2 else 0
    in_wanted = rng.random() < 0.01
    return {
        "country": "KZ",
        "source": ["adata.kz", "sgo.fcbk.kz", "egov.kz"],
        "insurance_valid": insurance_valid,
        "has_arrests": has_arrests,
        "tax_debts_usd": tax_debts,
        "in_wanted_list": in_wanted,
        "score_impact": (10 if insurance_valid else -15) - (20 if has_arrests else 0) - (50 if in_wanted else 0),
    }


def check_ru(phone: str = None, plate: str = None) -> dict:
    """Россия: gibdd.ru + fssp.gov.ru."""
    if not phone and not plate:
        return {"country": "RU", "status": "no_data"}
    rng = random.Random(_seed(phone or plate))
    fines_count = rng.randint(0, 3)
    fssp_debts = round(rng.random() * 1000, 2) if rng.random() < 0.15 else 0
    return {
        "country": "RU",
        "source": ["gibdd.ru", "fssp.gov.ru"],
        "unpaid_fines": fines_count,
        "fssp_debts_rub": fssp_debts,
        "vehicle_registered": rng.random() > 0.05,
        "score_impact": -fines_count * 3 - (10 if fssp_debts > 500 else 0),
    }


def check_uz(phone: str = None, plate: str = None) -> dict:
    if not phone and not plate:
        return {"country": "UZ", "status": "no_data"}
    rng = random.Random(_seed(phone or plate))
    return {
        "country": "UZ",
        "source": ["tozamet.uz", "spi.uz"],
        "license_valid": rng.random() > 0.1,
        "vehicle_cleared_customs": rng.random() > 0.02,
        "score_impact": 5,
    }


def check_kg(phone: str = None, plate: str = None) -> dict:
    if not phone and not plate:
        return {"country": "KG", "status": "no_data"}
    rng = random.Random(_seed(phone or plate))
    return {"country": "KG", "source": ["car.kg"], "license_valid": rng.random() > 0.1, "score_impact": 0}


def check_tj(phone: str = None, plate: str = None) -> dict:
    if not phone and not plate:
        return {"country": "TJ", "status": "no_data"}
    rng = random.Random(_seed(phone or plate))
    return {"country": "TJ", "source": ["mia.tj"], "license_valid": rng.random() > 0.1, "score_impact": 0}


def cross_check_all(phone: str = None, plate: str = None) -> dict:
    """Трансграничная проверка — по всем 5 странам."""
    results = {
        "KZ": check_kz(phone, plate),
        "RU": check_ru(phone, plate),
        "UZ": check_uz(phone, plate),
        "KG": check_kg(phone, plate),
        "TJ": check_tj(phone, plate),
    }
    total_impact = sum(r.get("score_impact", 0) for r in results.values())
    warnings = []
    for country, r in results.items():
        if r.get("has_arrests"): warnings.append(f"{country}: аресты")
        if r.get("in_wanted_list"): warnings.append(f"{country}: в розыске")
        if r.get("tax_debts_usd", 0) > 0: warnings.append(f"{country}: налог. задолженность ${r['tax_debts_usd']}")
        if r.get("unpaid_fines", 0) > 0: warnings.append(f"{country}: {r['unpaid_fines']} штрафов ГИБДД")
    return {
        "results": results,
        "total_score_impact": total_impact,
        "warnings": warnings,
        "passed": len(warnings) == 0,
    }
