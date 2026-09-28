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


# Hardening B (2026-09-14): GET /api/v1/system/info now surfaces routing
# provider diagnostics (api/routing.py's info()) — presence booleans only,
# never the key value, matching email_service.info()'s shape. Regression
# guard for both "reports configured" and "never leaks the key".
def test_routing_info_reports_provider_presence_without_leaking_keys(monkeypatch):
    monkeypatch.delenv("YANDEX_ROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTESERVICE_API_KEY", raising=False)
    monkeypatch.delenv("ORS_API_KEY", raising=False)
    from api import routing

    info = routing.info()
    assert info["provider"] == "none"
    assert info["yandex_configured"] is False
    assert info["ors_configured"] is False
    assert info["configured"] is False

    monkeypatch.setenv("YANDEX_ROUTER_API_KEY", "top-secret-yandex-key")
    monkeypatch.setenv("OPENROUTESERVICE_API_KEY", "top-secret-ors-key")
    info2 = routing.info()
    assert info2["provider"] == "yandex+openrouteservice"
    assert info2["yandex_configured"] is True
    assert info2["ors_configured"] is True
    assert info2["configured"] is True
    dumped = repr(info2)
    assert "top-secret-yandex-key" not in dumped
    assert "top-secret-ors-key" not in dumped


def test_system_info_endpoint_includes_routing_block():
    from main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/api/v1/system/info")
    assert response.status_code == 200, response.text
    body = response.json()
    assert "routing" in body
    assert "provider" in body["routing"]
    assert "yandex_configured" in body["routing"]
    assert "ors_configured" in body["routing"]
