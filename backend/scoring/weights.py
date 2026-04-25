"""Веса и штрафы для скоринга (из SECURITY_ARCHITECTURE.md)."""

# Автоматические штрафы (вычитаются из компонента)
AUTO_PENALTIES = {
    "claim_on_della": -30,          # Претензия на Della/ATI
    "no_insurance": -15,            # Нет страховки
    "old_vehicle_15y": -10,         # Машина старше 15 лет
    "experience_less_2y": -10,      # Стаж < 2 лет
    "negative_review": -5,          # Каждый отрицательный отзыв
    "telegram_negative": -20,       # Упоминание в Telegram негатив
}

# Автоматические бонусы
AUTO_BONUSES = {
    "completed_trip": 2,            # Каждый успешный рейс
    "positive_review": 1,           # Каждый положительный отзыв
    "verified_document": 5,         # Верифицированный документ
    "verified_license": 5,          # Верифицированные права
    "long_tenure": 10,              # В системе > 1 года
}


def apply_penalties_and_bonuses(base_score: int, facts: dict) -> int:
    """
    facts — словарь с фактами:
      - 'complaints_count' (int)
      - 'has_insurance' (bool)
      - 'vehicle_age_years' (int)
      - 'experience_years' (int)
      - 'negative_reviews' (int)
      - 'positive_reviews' (int)
      - 'completed_trips' (int)
      - 'telegram_negative' (int)
    """
    score = base_score
    if facts.get("complaints_count", 0) > 0:
        score += AUTO_PENALTIES["claim_on_della"] * facts["complaints_count"]
    if not facts.get("has_insurance", True):
        score += AUTO_PENALTIES["no_insurance"]
    if facts.get("vehicle_age_years", 0) > 15:
        score += AUTO_PENALTIES["old_vehicle_15y"]
    if facts.get("experience_years", 10) < 2:
        score += AUTO_PENALTIES["experience_less_2y"]

    score += AUTO_PENALTIES["negative_review"] * facts.get("negative_reviews", 0)
    score += AUTO_PENALTIES["telegram_negative"] * facts.get("telegram_negative", 0)
    score += AUTO_BONUSES["completed_trip"] * facts.get("completed_trips", 0)
    score += AUTO_BONUSES["positive_review"] * facts.get("positive_reviews", 0)

    return max(0, min(100, score))
