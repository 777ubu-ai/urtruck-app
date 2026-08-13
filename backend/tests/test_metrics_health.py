"""Regression coverage for health error classification."""
import asyncio
from types import SimpleNamespace

from api import metrics


def _record(status_code: int):
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/api/v1/market/feed"),
    )

    async def call_next(_request):
        return SimpleNamespace(status_code=status_code)

    middleware = object.__new__(metrics.MetricsMiddleware)
    return asyncio.run(middleware.dispatch(request, call_next))


def test_health_separates_expected_4xx_from_server_failures():
    metrics._request_count.clear()
    metrics._request_errors.clear()
    metrics._request_client_errors.clear()

    _record(200)
    _record(401)
    _record(404)
    _record(503)

    health = metrics.health_detailed()
    assert health["total_requests"] == 4
    assert health["total_errors"] == 1
    assert health["error_rate"] == "25.0%"
    assert health["total_client_errors"] == 2
    assert health["client_error_rate"] == "50.0%"
