"""§25 hardening (2026-09-14): GET /health must distinguish "process alive"
from "core dependency (DB) actually reachable" -- and must never fail merely
because an optional provider (OTP/storage/face/routing/email/push) is
unconfigured or in MOCK mode. Full per-subsystem MOCK/REAL diagnostics stay
on GET /api/v1/system/info; this is deliberately narrower and cheaper, the
thing a load balancer / process supervisor actually polls.

Also locks a route-shadowing bug found while adding this check: main.py used
to define its OWN `@app.get("/health")` in addition to api/metrics.py's
`metrics_router` one. FastAPI/Starlette match routes in registration order,
and metrics_router is include_router()'d before that point in main.py runs
-- so main.py's definition was pure dead code, never actually reached by any
request. The duplicate was removed; this file also pins "exactly one /health
route exists" so it cannot silently reappear.
"""
from fastapi.testclient import TestClient


def test_exactly_one_health_route_is_registered():
    """Regression lock for the shadowing bug this fix found: a second
    /health definition would silently never execute rather than error, so
    only a route-count assertion catches it."""
    from main import app

    health_routes = [r for r in app.routes if getattr(r, "path", None) == "/health"]
    assert len(health_routes) == 1, (
        f"expected exactly one /health route, found {len(health_routes)}: "
        f"{[getattr(r, 'name', r) for r in health_routes]}"
    )


def test_health_reports_ok_when_db_is_reachable():
    from main import app

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


def test_health_reports_503_when_db_is_unreachable(monkeypatch):
    from api import metrics as metrics_api
    from main import app

    def _broken_get_conn():
        raise RuntimeError("simulated: disk full / unreachable DB file")

    monkeypatch.setattr(metrics_api.db, "get_conn", _broken_get_conn)

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["db"] == "unreachable"


def test_health_does_not_import_or_evaluate_optional_providers(monkeypatch):
    """An optional provider being broken/unconfigured must never surface
    here -- otherwise a load balancer could pull a perfectly healthy
    instance out of rotation over e.g. an OCR/WhatsApp/routing hiccup."""
    import services.otp_service as otp_service

    def _boom():
        raise RuntimeError("optional provider blew up")

    monkeypatch.setattr(otp_service, "info", _boom)

    from main import app
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
