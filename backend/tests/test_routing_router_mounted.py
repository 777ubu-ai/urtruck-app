"""Regression: backend/api/routing.py existed and had passing unit tests
(test_global_routing.py) for multiple PRs (#230, #234) but was never
actually wired into main.py — app.include_router(routing_router, ...) was
missing. The endpoint returned 404 in production regardless of any Yandex/
ORS key being configured, because the route simply didn't exist. Guards
against silently un-mounting it again.
"""


def test_routing_router_is_mounted_on_the_app():
    from main import app

    paths = {r.path for r in app.routes if hasattr(r, "path")}
    assert "/api/v1/routing/road-route" in paths, sorted(paths)
