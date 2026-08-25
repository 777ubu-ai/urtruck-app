"""Тесты PII-редакции и correlation ID (Issue #288).

Проверяем, что sensitive данные не попадают в логи как есть.
"""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_logging.db")
os.environ.setdefault("ENV", "test")

from services.logging_service import redact_pii, generate_correlation_id


def test_phone_redacted():
    """Телефон маскируется в логах: середина заменяется звёздочками."""
    text = "Отправляем код на +77012345678"
    result = redact_pii(text)
    assert "2345" not in result, f"Середина телефона не замаскирована: {result}"
    assert "678" in result, "Последние 3 цифры должны остаться"
    assert "+7" in result, "Код страны должен остаться"


def test_email_redacted():
    """Email маскируется: остаётся первые символы + домен."""
    text = "Пользователь user@example.com запросил удаление"
    result = redact_pii(text)
    assert "user@example.com" not in result
    assert "@example.com" in result  # домен остаётся для диагностики


def test_bearer_token_redacted():
    """Bearer-токен заменяется на [REDACTED]."""
    text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"
    result = redact_pii(text)
    assert "eyJhbG" not in result
    assert "[REDACTED]" in result


def test_otp_code_redacted():
    """OTP-код маскируется."""
    for text in ["код: 4829", "code 1234", "OTP: 567890"]:
        result = redact_pii(text)
        assert "[REDACTED]" in result, f"OTP не замаскирован в '{text}': {result}"


def test_iin_redacted():
    """12-значный ИИН маскируется (телефонным или ИИН-паттерном)."""
    text = "ИИН водителя 123456789012 прошёл проверку"
    result = redact_pii(text)
    # ИИН может быть замаскирован как телефон (середина → *) или как ИИН →
    # [IIN_REDACTED]. Важно что оригинал не проходит.
    assert "123456789012" not in result, f"ИИН не замаскирован: {result}"


def test_business_ids_preserved():
    """Бизнес-идентификаторы НЕ маскируются."""
    text = "deal_id=abc123 cargo_id=xyz789 trip_id=t001"
    result = redact_pii(text)
    assert "abc123" in result
    assert "xyz789" in result
    assert "t001" in result


def test_correlation_id_format():
    """Correlation ID — 12 hex-символов."""
    cid = generate_correlation_id()
    assert len(cid) == 12
    assert all(c in "0123456789abcdef" for c in cid)


def test_correlation_id_unique():
    """Два последовательных ID не совпадают."""
    ids = {generate_correlation_id() for _ in range(100)}
    assert len(ids) == 100
