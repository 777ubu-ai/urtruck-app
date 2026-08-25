"""Структурированное логирование UrTruck с PII-редакцией и correlation IDs.

Issue #288: production observability — заменяет print() на structured logging
с JSON-output, correlation ID propagation и автоматической PII-фильтрацией.
"""
import logging
import json
import os
import re
import sys
import time
import uuid
from contextvars import ContextVar

# Correlation ID propagates through the entire request lifecycle
correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")

# PII patterns для автоматической редакции в логах
_PHONE_RE = re.compile(r"(\+?\d{1,3})(\d{4,})(\d{3})")
_EMAIL_RE = re.compile(r"([a-zA-Z0-9_.+-]{1,3})[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z]{2,})")
_TOKEN_RE = re.compile(r"(Bearer\s+|token[=:]\s*)[A-Za-z0-9_\-./+=]{8,}", re.IGNORECASE)
_OTP_RE = re.compile(r"(код|code|otp)[:\s]+(\d{4,6})", re.IGNORECASE)
_IIN_RE = re.compile(r"\b\d{12}\b")  # ИИН Казахстана — 12 цифр


def redact_pii(text: str) -> str:
    """Автоматическая редакция PII из строки лога.

    Маскирует: телефоны, email, Bearer-токены, OTP-коды, ИИН.
    Не трогает: deal ID, cargo ID, trip ID и прочие бизнес-идентификаторы.
    """
    if not isinstance(text, str):
        return str(text)
    text = _TOKEN_RE.sub(r"\1[REDACTED]", text)
    text = _OTP_RE.sub(r"\1: [REDACTED]", text)
    text = _EMAIL_RE.sub(r"\1***@\2", text)
    text = _PHONE_RE.sub(lambda m: f"{m.group(1)}{'*' * len(m.group(2))}{m.group(3)}", text)
    text = _IIN_RE.sub("[IIN_REDACTED]", text)
    return text


class PiiRedactingFormatter(logging.Formatter):
    """JSON-formatter с PII-редакцией и correlation ID."""

    def format(self, record: logging.LogRecord) -> str:
        cid = correlation_id.get("")
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact_pii(record.getMessage()),
        }
        if cid:
            entry["cid"] = cid
        if record.exc_info and record.exc_info[0]:
            entry["exc"] = redact_pii(self.formatException(record.exc_info))
        # Дополнительные поля из extra (если переданы через logger.info("...", extra={...}))
        for key in ("event", "user_id", "deal_id", "cargo_id", "trip_id", "duration_ms", "status_code"):
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        return json.dumps(entry, ensure_ascii=False, default=str)


def setup_logging(level: str = "INFO") -> None:
    """Настроить structured JSON-логирование для всего процесса.

    Вызывать один раз при старте main.py. Уровень управляется через
    LOG_LEVEL env (по умолчанию INFO).
    """
    log_level = getattr(logging, os.getenv("LOG_LEVEL", level).upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(log_level)

    # Удалить стандартные handler-ы
    for h in root.handlers[:]:
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(PiiRedactingFormatter())
    root.addHandler(handler)

    # Тихий uvicorn access log (не дублировать каждый запрос)
    for name in ("uvicorn.access", "uvicorn.error", "httpx"):
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Получить logger с именем модуля."""
    return logging.getLogger(f"urtruck.{name}")


def generate_correlation_id() -> str:
    """Сгенерировать короткий correlation ID для запроса."""
    return uuid.uuid4().hex[:12]
