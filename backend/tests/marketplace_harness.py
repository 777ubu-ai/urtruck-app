"""Общий auth harness для legacy marketplace-тестов.

Production routes остаются привязаны к настоящему ``require_level``. Тесты,
которые исторически переключали actor через разные module-local ContextVar,
могут явно установить тестового actor. При отсутствии actor dependency
делегирует настоящей bearer/session проверке, поэтому security-тесты не
получают обход auth.
"""
from __future__ import annotations

import hashlib
from contextvars import ContextVar

from fastapi import Header

from api import verification_gate


_real_require_level = verification_gate.require_level
_actor: ContextVar[dict | None] = ContextVar("marketplace_test_actor", default=None)


def hybrid_require_level(min_level: int):
    real_dependency = _real_require_level(min_level)

    def dependency(authorization: str = Header(None)) -> dict:
        actor = _actor.get()
        if actor is not None:
            return actor
        return real_dependency(authorization)

    return dependency


def install_hybrid_auth() -> None:
    verification_gate.require_level = hybrid_require_level


def clear_test_actor() -> None:
    _actor.set(None)


def _phone_for(uid: str) -> str:
    suffix = int(hashlib.sha256(uid.encode("utf-8")).hexdigest()[:12], 16) % 10_000_000_000
    return f"+7{suffix:010d}"


def set_test_actor(uid: str, *, role: str, full_name: str | None = None) -> dict:
    """Создать authoritative test identity и сделать её текущим actor.

    Driver всегда получает уникальный реальный-format phone и
    ``phone_verified=1``. Это адаптирует fixtures к production contract, а не
    подменяет ``has_verified_phone`` или operational gate.
    """
    from database import registration_dal
    from database.db import get_conn

    registration_dal.init_registration_schema()
    phone = _phone_for(uid)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO drivers_registration "
            "(id, phone, whatsapp_verified, phone_verified, verification_level, role, full_name) "
            "VALUES (?, ?, 1, 1, 1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET "
            "phone=excluded.phone, whatsapp_verified=1, phone_verified=1, "
            "verification_level=MAX(drivers_registration.verification_level, 1), "
            "role=excluded.role, full_name=excluded.full_name",
            (uid, phone, role, full_name or uid),
        )
    actor = registration_dal.get_driver(uid)
    _actor.set(actor)
    return actor
