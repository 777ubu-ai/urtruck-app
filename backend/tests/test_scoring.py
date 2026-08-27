"""Unit-тесты для scoring/weights.py и scoring/color_code.py.

Чистые функции без обращения к БД — формула из SECURITY_ARCHITECTURE.md:
TOTAL = identity*0.20 + reputation*0.25 + social*0.15 + experience*0.15
        + vehicle*0.10 + financial*0.10 + bonus*0.05
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from scoring.color_code import color_from_score, label_from_color
from scoring.weights import apply_penalties_and_bonuses, AUTO_PENALTIES, AUTO_BONUSES


# ---------------------------------------------------------------------------
# color_from_score / label_from_color
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("score,expected", [
    (0, "black"),
    (-5, "black"),
    (1, "red"),
    (39, "red"),
    (40, "yellow"),
    (69, "yellow"),
    (70, "green"),
    (100, "green"),
])
def test_color_from_score_thresholds(score, expected):
    assert color_from_score(score) == expected


def test_label_from_color_known_values():
    assert label_from_color("green") == "🟢 Надёжный"
    assert label_from_color("yellow") == "🟡 Новичок"
    assert label_from_color("red") == "🔴 Есть проблемы"
    assert label_from_color("black") == "⛔ В чёрном списке"


def test_label_from_color_unknown_falls_back_to_yellow_label():
    assert label_from_color("unknown-color") == "🟡 Не проверен"


# ---------------------------------------------------------------------------
# apply_penalties_and_bonuses
# ---------------------------------------------------------------------------

def test_no_facts_returns_base_score_unchanged():
    # has_insurance по умолчанию True, experience_years по умолчанию 10 —
    # штрафы за них не срабатывают при пустом facts.
    assert apply_penalties_and_bonuses(50, {}) == 50


def test_claim_on_della_penalty_scales_with_count():
    score = apply_penalties_and_bonuses(50, {"complaints_count": 1})
    assert score == 50 + AUTO_PENALTIES["claim_on_della"]


def test_no_insurance_penalty():
    score = apply_penalties_and_bonuses(50, {"has_insurance": False})
    assert score == 50 + AUTO_PENALTIES["no_insurance"]


def test_has_insurance_true_no_penalty():
    score = apply_penalties_and_bonuses(50, {"has_insurance": True})
    assert score == 50


def test_old_vehicle_penalty_applies_above_15_years():
    assert apply_penalties_and_bonuses(50, {"vehicle_age_years": 16}) == 50 + AUTO_PENALTIES["old_vehicle_15y"]
    # ровно 15 лет — штраф не применяется (строгое >)
    assert apply_penalties_and_bonuses(50, {"vehicle_age_years": 15}) == 50


def test_experience_less_than_2_years_penalty():
    assert apply_penalties_and_bonuses(50, {"experience_years": 1}) == 50 + AUTO_PENALTIES["experience_less_2y"]
    # ровно 2 года — штраф не применяется
    assert apply_penalties_and_bonuses(50, {"experience_years": 2}) == 50


def test_negative_reviews_and_telegram_negative_scale_linearly():
    facts = {"negative_reviews": 1, "telegram_negative": 1}
    expected = 50 + AUTO_PENALTIES["negative_review"] + AUTO_PENALTIES["telegram_negative"]
    assert apply_penalties_and_bonuses(50, facts) == expected


def test_completed_trips_and_positive_reviews_bonus_scale_linearly():
    facts = {"completed_trips": 4, "positive_reviews": 5}
    expected = 50 + AUTO_BONUSES["completed_trip"] * 4 + AUTO_BONUSES["positive_review"] * 5
    assert apply_penalties_and_bonuses(50, facts) == expected


def test_score_clamped_to_zero_minimum():
    facts = {"complaints_count": 10}  # 10 * -30 = -300
    assert apply_penalties_and_bonuses(50, facts) == 0


def test_score_clamped_to_hundred_maximum():
    facts = {"completed_trips": 100}  # 100 * 2 = +200
    assert apply_penalties_and_bonuses(50, facts) == 100


def test_combined_penalties_and_bonuses():
    facts = {
        "complaints_count": 1,       # -30
        "has_insurance": False,      # -15
        "vehicle_age_years": 20,     # -10
        "experience_years": 1,       # -10
        "negative_reviews": 1,       # -5
        "positive_reviews": 3,       # +3
        "completed_trips": 2,        # +4
    }
    expected = 50 - 30 - 15 - 10 - 10 - 5 + 3 + 4
    assert apply_penalties_and_bonuses(50, facts) == max(0, min(100, expected))
