"""Движок скоринга UrTruck — формула из SECURITY_ARCHITECTURE.md"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from database import db
from scoring.color_code import color_from_score


def reputation_from_reviews(user_id: str) -> int:
    """Репутация 0..100 на основе реальных отзывов.
    Формула: avg_rating/5 * 80 + min(count, 20) — до 100.
    Без отзывов = 50 (нейтрально)."""
    try:
        from database import reviews_dal
        s = reviews_dal.get_rating_summary(user_id)
        if not s.get("count"):
            return 50
        avg = s.get("average") or 0
        cnt = s.get("count") or 0
        base = (avg / 5.0) * 80.0
        bonus = min(cnt, 20)  # до +20 за накопленный опыт
        return int(max(0, min(100, base + bonus)))
    except Exception as e:
        print(f"[reputation] failed: {e}")
        return 50


def calculate_score(user_id: str, components: dict = None) -> dict:
    """
    Вычисляет скоринг 0-100 по формуле:
      TOTAL = identity*0.20 + reputation*0.25 + social*0.15 + experience*0.15
              + vehicle*0.10 + financial*0.10 + bonus*0.05
    components — словарь с сырыми значениями 0-100 для каждого компонента.
    reputation подтягивается автоматически из реальных отзывов, если не передан.
    """
    comp = {
        "identity": 50, "reputation": 50, "social": 50,
        "experience": 50, "vehicle": 50, "financial": 50, "bonus": 0,
    }
    if components:
        comp.update(components)
    # Если reputation не передан явно (или передан дефолт 50) — считаем из reviews
    if not components or components.get("reputation") in (None, 50):
        real_rep = reputation_from_reviews(user_id)
        comp["reputation"] = real_rep

    weights = config.SCORING_WEIGHTS
    total = sum(comp[k] * weights[k] for k in weights)
    total = max(0, min(100, round(total)))

    # Автоматические правила (бан)
    bl = db.blacklist_check(phone=components.get("phone") if components else None,
                            plate=components.get("plate") if components else None)
    if bl:
        total = 0
        color = "black"
        db.add_alert(
            "blacklist_match", "critical", user_id,
            f"В чёрном списке: {bl[0].get('reason', 'unknown')}"
        )
    else:
        color = color_from_score(total)

    # Сохраняем
    score_row = db.upsert_score(user_id, {
        "total_score": total,
        "color_code": color,
        "identity_score": comp["identity"],
        "reputation_score": comp["reputation"],
        "social_score": comp["social"],
        "experience_score": comp["experience"],
        "vehicle_score": comp["vehicle"],
        "financial_score": comp["financial"],
        "bonus_score": comp["bonus"],
    })

    db.log_verification(user_id, "scoring", "engine", "pass",
                         {"components": comp, "total": total, "color": color},
                         total - 50)

    return {
        "user_id": user_id,
        "total_score": total,
        "color_code": color,
        "components": comp,
        "blacklisted": bool(bl),
        "blacklist_details": bl,
    }


def quick_check(phone: str = None, plate: str = None, name: str = None) -> dict:
    """Быстрая проверка только по чёрному списку."""
    bl = db.blacklist_check(phone=phone, plate=plate, name=name)
    mentions = db.get_mentions(phone=phone, plate=plate)
    negative = [m for m in mentions if m.get("sentiment") == "negative"]
    return {
        "in_blacklist": bool(bl),
        "blacklist_entries": bl,
        "negative_mentions": len(negative),
        "recent_mentions": mentions[:5],
        "recommendation": (
            "BLOCK" if bl else "WARNING" if len(negative) >= 3 else "OK"
        ),
    }
