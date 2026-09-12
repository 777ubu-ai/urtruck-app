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
        # Level 3 is a conjunctive invariant: a stale numeric level must not
        # survive an explicit rejection.
        level3_rejected = min_level >= 3 and driver.get("status") != "approved"
        if (current < min_level or level3_rejected) and not BETA_MODE:
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


def require_active_level(min_level: int):
    """Track B (2026-09-10): same as require_level(min_level), but ALSO
    fails closed when the driver's own status is 'rejected' -- regardless
    of level. require_level() itself only ever consults `status` for
    min_level>=3 (the level3_rejected check above); every other level was
    never checking it at all, so a driver who reached verification_level=1
    (phone-verified) and was later rejected during document moderation
    (blacklist hit or failed verification -- 'rejected' is the only status
    that mechanism ever sets; there is no separate 'blacklisted'/'blocked'
    literal in this codebase) kept full level-1 marketplace write access
    indefinitely. Confirmed gap, Block 1 audit.

    Deliberately NOT folded into require_level() itself: require_level()
    is also the auth dependency for chat/reviews/notifications/profile/
    favorites, where a driver rejected mid-deal must still be able to
    coordinate wind-down of an ALREADY-accepted commitment (message the
    other party, view their own profile) rather than being locked out of
    everything the moment moderation rejects them. This wraps require_level
    and adds the same "not rejected" invariant it already applies at level
    3, for callers that specifically need it -- see api/marketplace.py's
    write endpoints (listing create/edit/publish, bid lifecycle, deal
    status transitions) for where it's actually used.

    NOT gated by BETA_MODE, unlike the underlying level check. BETA_MODE
    exists so testers can skip real SMS/OTP verification -- a convenience
    about *how much you've proven*, not a reason to ignore an explicit
    moderation decision that a specific account is rejected. A BETA_MODE
    tester realistically never has status='rejected' in the first place
    (they never went through real moderation), so this only matters for a
    genuinely-rejected row, where it should hold regardless.
    """
    base_dependency = require_level(min_level)

    def dependency(authorization: str = Header(None)) -> dict:
        driver = base_dependency(authorization)
        if driver.get("status") == "rejected":
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "account_rejected",
                    "message": "Аккаунт отклонён модерацией — действия в маркетплейсе недоступны",
                },
            )
        return driver
    return dependency


def require_driver_trip_publication(authorization: str = Header(None)) -> dict:
    """Разрешить публикацию рейса только после basic onboarding или Pro."""
    driver = require_active_level(1)(authorization)
    if driver.get("role") != "driver":
        raise HTTPException(status_code=403, detail={"error": "driver_role_required"})
    if not (
        driver.get("basic_onboarding_completed")
        or driver.get("status") == "approved"
        or int(driver.get("verification_level") or 0) >= 3
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "basic_onboarding_required",
                "message": "Сначала заполните базовый профиль водителя и данные автомобиля",
            },
        )
    return driver


def get_user(authorization: str = Header(None)) -> dict:
    """Просто вернуть текущего пользователя (может быть гостем)."""
    return _extract_driver(authorization)


# Track B (2026-09-10), moved here in Vehicle Security & Trip Integrity
# Repair Round 2 (2026-09-11): the CANONICAL server-side role-direction
# guard. Originally lived as a private helper inside api/marketplace.py
# (create_cargo/create_trip/create_bid had no user["role"] check at all --
# a client account could publish a driver trip, or vice versa). Promoted
# here, public, once api/vehicles.py needed the identical check and
# duplicating it there would have been exactly the "second incompatible
# role mechanism" this project's own conventions warn against (see Round 2
# audit item 5). `role` is normalized the same way api/profile.py already
# does when a user sets it (bare "shipper" -> "client"; drivers_registration
# itself never stores literal "shipper") -- matched here in case an older
# token/row predates that normalization.
def require_role(user: dict, allowed: tuple, action: str) -> None:
    role = (user.get("role") or "").strip().lower()
    if role == "shipper":
        role = "client"
    if role not in allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "ROLE_NOT_ALLOWED",
                "message": f"Действие «{action}» недоступно для вашей роли",
                "your_role": role or "not_set",
                "allowed_roles": list(allowed),
            },
        )


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
