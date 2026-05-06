"""Consent audit — фиксация согласия Пользователя при регистрации.

Stage 24: согласно Публичной оферте и Политике конфиденциальности,
факт согласия должен фиксироваться вместе с phone, ролью, версиями
документов, IP, user-agent и provider'ом OTP. Согласие сохраняется
ДО отправки SMS — даже если verify не прошёл, audit остаётся как
факт попытки.

Таблица: consent_audit
  id              INTEGER PK
  user_id         TEXT     (nullable — заполняется после verify)
  phone           TEXT     (E.164 без `+`)
  role            TEXT     (driver | client | guest | NULL)
  consent_terms   INTEGER  (0/1)
  consent_privacy INTEGER  (0/1)
  consent_sms     INTEGER  (0/1)
  terms_version   TEXT     ("1.0")
  privacy_version TEXT     ("1.0")
  accepted_at     TEXT     (ISO timestamp UTC)
  ip_address      TEXT
  user_agent      TEXT
  sms_provider    TEXT     ("mobizon" | "whatsapp" | "telegram" | NULL)
  otp_verified_at TEXT     (nullable — ISO timestamp после verify)
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from database.db import get_conn


TERMS_VERSION = "1.0"
PRIVACY_VERSION = "1.0"


def init_consent_schema() -> None:
    with get_conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS consent_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                phone TEXT NOT NULL,
                role TEXT,
                consent_terms INTEGER DEFAULT 1,
                consent_privacy INTEGER DEFAULT 1,
                consent_sms INTEGER DEFAULT 1,
                terms_version TEXT,
                privacy_version TEXT,
                accepted_at TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                sms_provider TEXT,
                otp_verified_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_consent_phone ON consent_audit(phone);
            CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_audit(user_id);
            """
        )
        c.commit()


def record_consent(
    *,
    phone: str,
    role: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    sms_provider: Optional[str] = None,
) -> int:
    """Возвращает id вставленной записи."""
    now = datetime.utcnow().isoformat()
    with get_conn() as c:
        cur = c.execute(
            """
            INSERT INTO consent_audit
                (user_id, phone, role, consent_terms, consent_privacy, consent_sms,
                 terms_version, privacy_version, accepted_at, ip_address, user_agent, sms_provider)
            VALUES (NULL, ?, ?, 1, 1, 1, ?, ?, ?, ?, ?, ?)
            """,
            (phone, role, TERMS_VERSION, PRIVACY_VERSION, now, ip_address, (user_agent or "")[:512], sms_provider),
        )
        c.commit()
        return cur.lastrowid


def attach_user_after_verify(*, phone: str, user_id: str) -> None:
    """После успешного verify подвязать user_id к последней consent-записи
    этого phone и проставить otp_verified_at."""
    now = datetime.utcnow().isoformat()
    with get_conn() as c:
        c.execute(
            """
            UPDATE consent_audit
               SET user_id = ?, otp_verified_at = ?
             WHERE id = (
                SELECT id FROM consent_audit
                 WHERE phone = ? AND otp_verified_at IS NULL
                 ORDER BY id DESC LIMIT 1
             )
            """,
            (user_id, now, phone),
        )
        c.commit()
