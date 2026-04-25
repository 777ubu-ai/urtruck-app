"""Цветовой код на основе скоринга."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config


def color_from_score(score: int) -> str:
    if score <= 0:
        return "black"
    if score >= config.COLOR_THRESHOLDS["green"]:
        return "green"
    if score >= config.COLOR_THRESHOLDS["yellow"]:
        return "yellow"
    return "red"


def label_from_color(color: str) -> str:
    return {
        "green": "🟢 Надёжный",
        "yellow": "🟡 Новичок",
        "red": "🔴 Есть проблемы",
        "black": "⛔ В чёрном списке",
    }.get(color, "🟡 Не проверен")
