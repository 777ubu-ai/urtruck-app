"""Regression: backend/api/routing.py existed and had passing unit tests
(test_global_routing.py) for multiple PRs (#230, #234) but was never
actually wired into main.py — app.include_router(routing_router, ...) was
missing. The endpoint returned 404 in production regardless of any Yandex/
ORS key being configured, because the route simply didn't exist. Guards
against silently un-mounting it again.

#291: тест проверяет исходный код main.py статически, без импорта app
(чтобы не зависеть от DB-state при коллекции pytest).
"""
from pathlib import Path


def test_routing_router_is_mounted_on_the_app():
    """main.py включает routing_router с правильным префиксом."""
    main_src = (Path(__file__).resolve().parent.parent / "main.py").read_text("utf-8")
    # Проверяем import
    assert "from api.routing import routing_router" in main_src, \
        "routing_router не импортируется в main.py"
    # Проверяем include_router
    assert 'app.include_router(routing_router, prefix="/api/v1/routing")' in main_src, \
        "routing_router не смонтирован в app с правильным prefix"
