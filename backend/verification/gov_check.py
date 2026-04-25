"""Проверка через госреестры KZ/RU.

egov.kz — публичные сервисы:
  - Проверка ИИН (физлица)
  - Проверка ТС по госномеру (через egov.kz/services)

В DEMO: детерминированный ответ на основе последних цифр ИИН.
В REAL: HTTP к public endpoints egov.kz (когда откроют API).
"""
import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

EGOV_API_KEY = os.getenv("EGOV_API_KEY", "")
EGOV_P12_PATH = os.getenv("EGOV_P12_PATH", "")
EGOV_P12_PASSWORD = os.getenv("EGOV_P12_PASSWORD", "")
EGOV_MOCK = not (EGOV_API_KEY or EGOV_P12_PATH)


def check_iin_kz(iin: str) -> dict:
    """Проверка ИИН через egov.kz.
    Возвращает: {valid, full_name, birth_date, gender, region, is_active, source}
    """
    if not iin or len(iin) != 12:
        return {"valid": False, "error": "ИИН должен содержать 12 цифр"}

    if EGOV_MOCK:
        return _mock_iin(iin)

    # Два способа аутентификации: API key (REST) или P12 сертификат (mTLS)
    try:
        if EGOV_API_KEY:
            # REST API data.egov.kz
            r = httpx.get(
                f"https://data.egov.kz/api/v4/iin_check/{iin}",
                headers={"Authorization": f"Bearer {EGOV_API_KEY}"},
                timeout=10.0,
            )
        elif EGOV_P12_PATH:
            # mTLS с ЭЦП — для SOAP/REST сервисов eGov
            import ssl
            import subprocess
            import tempfile
            # Извлекаем cert+key из p12 через openssl (legacy для GOST)
            tmp = tempfile.mkdtemp()
            cert_pem = f"{tmp}/cert.pem"
            key_pem = f"{tmp}/key.pem"
            subprocess.run([
                "openssl", "pkcs12", "-in", EGOV_P12_PATH,
                "-passin", f"pass:{EGOV_P12_PASSWORD}",
                "-out", cert_pem, "-clcerts", "-nokeys", "-legacy",
            ], capture_output=True, timeout=10)
            subprocess.run([
                "openssl", "pkcs12", "-in", EGOV_P12_PATH,
                "-passin", f"pass:{EGOV_P12_PASSWORD}",
                "-out", key_pem, "-nocerts", "-nodes", "-legacy",
            ], capture_output=True, timeout=10)
            # mTLS запрос
            r = httpx.get(
                f"https://data.egov.kz/api/v4/iin_check/{iin}",
                cert=(cert_pem, key_pem),
                timeout=15.0,
            )
            # Удаляем temp
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        else:
            return _mock_iin(iin)

        if r.status_code == 200:
            data = r.json()
            return {
                "valid": True,
                "full_name": data.get("full_name"),
                "birth_date": data.get("birth_date"),
                "gender": data.get("gender"),
                "region": data.get("region"),
                "is_active": data.get("is_active", True),
                "source": "egov.kz",
            }
        # eGov вернул не 200 — fallback на MOCK с пометкой
        print(f"[egov] ИИН check returned {r.status_code}: {r.text[:200]}")
        result = _mock_iin(iin)
        result["egov_status"] = r.status_code
        return result
    except Exception as e:
        print(f"[egov] ИИН check failed: {e}")
        return _mock_iin(iin)


def _mock_iin(iin: str) -> dict:
    """Детерминированный MOCK на основе ИИН."""
    from services.iin_validator import validate_iin_kz, extract_birthdate_from_iin
    valid = validate_iin_kz(iin)
    if not valid:
        return {"valid": False, "error": "Контрольная сумма ИИН не совпадает", "source": "mock"}

    birthdate = extract_birthdate_from_iin(iin)
    century_digit = int(iin[6])
    gender = "male" if century_digit % 2 == 1 else "female"

    # Регион по 2-й и 3-й цифрам месяца (демо-логика)
    regions = {
        '01': 'Алматы', '02': 'Астана', '03': 'Шымкент',
        '04': 'Караганда', '05': 'Атырау', '06': 'Актобе',
        '07': 'Тараз', '08': 'Павлодар', '09': 'Семей',
        '10': 'Костанай', '11': 'Петропавловск', '12': 'Кызылорда',
    }
    month = iin[2:4]
    region = regions.get(month, 'Алматинская обл.')

    return {
        "valid": True,
        "full_name": None,  # MOCK не знает ФИО
        "birth_date": birthdate,
        "gender": gender,
        "region": region,
        "is_active": True,
        "source": "mock",
    }


def check_vehicle_kz(plate: str) -> dict:
    """Проверка ТС по госномеру через egov.kz."""
    if not plate:
        return {"found": False, "error": "Госномер не указан"}

    if EGOV_MOCK:
        return _mock_vehicle(plate)

    try:
        r = httpx.get(
            f"https://data.egov.kz/api/v4/vehicle/{plate}",
            headers={"Authorization": f"Bearer {EGOV_API_KEY}"},
            timeout=10.0,
        )
        if r.status_code == 200:
            data = r.json()
            return {
                "found": True,
                "brand": data.get("brand"),
                "model": data.get("model"),
                "year": data.get("year"),
                "vin": data.get("vin"),
                "owner_iin": data.get("owner_iin"),
                "is_wanted": data.get("is_wanted", False),
                "source": "egov.kz",
            }
        return {"found": False, "error": f"egov.kz returned {r.status_code}", "source": "egov.kz"}
    except Exception as e:
        print(f"[egov] Vehicle check failed: {e}")
        return _mock_vehicle(plate)


def _mock_vehicle(plate: str) -> dict:
    """MOCK ответ для ТС."""
    import re
    digits = re.findall(r'\d', plate)
    year = 2015 + (int(digits[0]) if digits else 0)
    brands = ['KAMAZ', 'MAN', 'VOLVO', 'SCANIA', 'DAF', 'MERCEDES', 'HOWO', 'FAW']
    brand = brands[hash(plate) % len(brands)]
    return {
        "found": True,
        "brand": brand,
        "model": None,
        "year": year,
        "vin": None,
        "owner_iin": None,
        "is_wanted": False,
        "source": "mock",
    }


def info() -> dict:
    return {
        "egov_mode": "MOCK" if EGOV_MOCK else "REAL",
        "services": ["iin_check", "vehicle_check"],
    }
