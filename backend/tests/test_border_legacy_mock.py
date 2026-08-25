"""#293: Regression test — legacy/mock border path honestly returns null queue data.

When CGR feature is disabled, the border API falls back to the hardcoded BORDERS
list. This must NEVER produce fake/random queue numbers — only null/unknown.
Protects against accidental reintroduction of the removed random queue generator.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.border_service import search_borders, BORDERS


def test_legacy_borders_list_has_null_queue():
    """Все КПП в legacy-списке имеют trucks_in_queue=None."""
    for b in BORDERS:
        assert b.get("trucks_in_queue") is None, \
            f"КПП {b['name']} имеет trucks_in_queue={b.get('trucks_in_queue')} (должен быть None)"


def test_search_borders_returns_null_estimates():
    """search_borders() не генерирует фальшивые очереди."""
    results = search_borders()
    for crossing in results:
        assert crossing.get("trucks_in_queue") is None, \
            f"{crossing['name']}: trucks_in_queue={crossing.get('trucks_in_queue')} (должен быть None)"
        assert crossing.get("estimated_wait_hours") is None, \
            f"{crossing['name']}: estimated_wait_hours={crossing.get('estimated_wait_hours')} (должен быть None)"


def test_legacy_borders_have_required_fields():
    """Все КПП имеют обязательные поля id, name, country."""
    for b in BORDERS:
        assert b.get("id"), f"КПП без id: {b}"
        assert b.get("name"), f"КПП без name: {b}"
        assert b.get("country"), f"КПП без country: {b}"


def test_no_random_or_time_based_queue_generation():
    """Вызов search_borders() дважды даёт одинаковый результат (нет random/time-based генерации)."""
    r1 = search_borders()
    r2 = search_borders()
    for a, b in zip(r1, r2):
        assert a.get("trucks_in_queue") == b.get("trucks_in_queue")
        assert a.get("estimated_wait_hours") == b.get("estimated_wait_hours")
