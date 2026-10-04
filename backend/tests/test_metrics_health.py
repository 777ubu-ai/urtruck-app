"""Regression coverage for health error classification."""
import asyncio
from types import SimpleNamespace

import pytest

from api import metrics


def _record(status_code: int, path: str = "/api/v1/market/feed"):
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path=path),
    )

    async def call_next(_request):
        return SimpleNamespace(status_code=status_code)

    middleware = object.__new__(metrics.MetricsMiddleware)
    return asyncio.run(middleware.dispatch(request, call_next))


def _reset_metrics():
    metrics._request_count.clear()
    metrics._request_errors.clear()
    metrics._request_client_errors.clear()
    metrics._request_duration.clear()
    metrics._request_duration_histogram.clear()


def test_health_separates_expected_4xx_from_server_failures():
    _reset_metrics()

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


def test_latency_histogram_uses_monotonic_time_and_exports_cumulative_buckets(monkeypatch):
    _reset_metrics()
    ticks = iter((10.0, 10.006, 20.0, 20.300))
    monkeypatch.setattr(metrics, "monotonic", lambda: next(ticks))

    _record(200)
    _record(503)

    payload = metrics.prometheus_metrics(_admin="test").body.decode("utf-8")
    assert 'urtruck_request_duration_seconds_bucket{endpoint="GET_api_other",le="0.005"} 0' in payload
    assert 'urtruck_request_duration_seconds_bucket{endpoint="GET_api_other",le="0.01"} 1' in payload
    assert 'urtruck_request_duration_seconds_bucket{endpoint="GET_api_other",le="0.5"} 2' in payload
    assert 'urtruck_request_duration_seconds_bucket{endpoint="GET_api_other",le="+Inf"} 2' in payload
    assert 'urtruck_request_duration_seconds_count{endpoint="GET_api_other"} 2' in payload
    assert 'urtruck_request_duration_seconds_sum{endpoint="GET_api_other"} 0.306000' in payload
    assert "urtruck_metrics_window_start_unixtime" in payload
    assert metrics._request_errors["GET_api_other"] == 1


def test_latency_histogram_records_unhandled_request_failures(monkeypatch):
    _reset_metrics()
    ticks = iter((1.0, 1.02))
    monkeypatch.setattr(metrics, "monotonic", lambda: next(ticks))
    request = SimpleNamespace(method="GET", url=SimpleNamespace(path="/api/v1/push/info"))

    async def failing_call(_request):
        raise RuntimeError("controlled failure")

    middleware = object.__new__(metrics.MetricsMiddleware)
    with pytest.raises(RuntimeError, match="controlled failure"):
        asyncio.run(middleware.dispatch(request, failing_call))

    assert metrics._request_count["GET_push"] == 1
    assert metrics._request_errors["GET_push"] == 1
    assert metrics._request_duration_histogram["GET_push"][-1] == 1
