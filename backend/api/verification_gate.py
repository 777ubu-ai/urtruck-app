"""Verification Gate — middleware для защиты эндпоинтов по уровню доверия.

Использование:
    @router.post("/contact-driver")
    def contact(driver = Depends(require_level(2))):
        # Доступно только пользователям с verification_level >= 2 (identity)
        ...
"""
from fastapi import Depends, Header, HTTPException
from database import registration_dal as reg_dal
from config import BETA_MODE

# #279: BETA_MODE может обходить ТОЛЬКО уровни до этого порога.
# Уровень 3 (driver_verified: водительские документы) никогда не обходится
# даже в dev/preview — это защита от создания «подтверждённых водителей»
# без реальной верификации документов.
_BETA_BYPASS_MAX_LEVEL = 2


LEVEL_NAMES = {
    0: "guest",
    1: "phone_verified",
    2: "identity_verified",
    3: "driver_verified",
}

LEVEL_REQUIREMENTS = {
    0: "Доступно всем",
    1: "Нужен подтверждённый номер телефона",
    2: "Нужно подтвердить личность (ИИН + селфи)",
    3: "Нужно подтвердить документы водителя (права + тех.паспорт)",
}


def _extract_driver(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token = authorization.split(" ", 1)[1]
    driver_id = reg_dal.get_driver_by_token(token)
    if not driver_id:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    driver = reg_dal.get_driver(driver_id)
    if not driver:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return driver


def require_level(min_level: int):
    """Factory: возвращает зависимость, которая проверяет verification_level >= min_level."""
    def dependency(authorization: str = Header(None)) -> dict:
        driver = _extract_driver(authorization)
        current = driver.get("verification_level", 0) or 0
        beta_can_bypass = BETA_MODE and min_level <= _BETA_BYPASS_MAX_LEVEL
        if current < min_level and not beta_can_bypass:
            # 403 с payload который фронт использует для показа VerificationGate
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "verification_required",
                    "current_level": current,
                    "required_level": min_level,
                    "required_name": LEVEL_NAMES.get(min_level, str(min_level)),
                    "hint": LEVEL_REQUIREMENTS.get(min_level, ""),
                },
            )
        return driver
    return dependency


def get_user(authorization: str = Header(None)) -> dict:
    """Просто вернуть текущего пользователя (может быть гостем)."""
    return _extract_driver(authorization)


def require_admin(authorization: str = Header(None)) -> dict:
    """Только admin / support роли. Для blacklist/add, report, alerts."""
    driver = _extract_driver(authorization)
    role = driver.get("role", "")
    if role not in ("admin", "support"):
        raise HTTPException(
            status_code=403,
            detail="Доступ только для администраторов",
        )
    return driver
