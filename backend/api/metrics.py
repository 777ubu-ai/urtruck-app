"""Prometheus-compatible /metrics endpoint + middleware для сбора метрик.

Формат: Prometheus text exposition (plain text).
Не требует библиотеки prometheus_client — пишем вручную для минимальных зависимостей.
"""
import sys
import time
from time import monotonic
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from api.admin import check_admin
from database import db

metrics_router = APIRouter()

# Counters
_request_count = defaultdict(int)      # {method_path: count}
_request_errors = defaultdict(int)     # {method_path: 5xx count}
_request_client_errors = defaultdict(int)  # {method_path: 4xx count}
_request_duration = defaultdict(float) # {method_path: total_seconds}
# Fixed buckets keep the endpoint label bounded while preserving the request
# distribution needed to calculate p95.  Export the standard Prometheus
# histogram triplet; a collector must aggregate buckets first and then use
# histogram_quantile, never average per-process p95 values.
_REQUEST_DURATION_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
                             1.0, 2.5, 5.0, 10.0)
_request_duration_histogram = defaultdict(
    lambda: [0] * (len(_REQUEST_DURATION_BUCKETS) + 1)
)  # {method_path: cumulative bucket observations including +Inf}
_startup_time = time.time()
_metrics_window_started_at = time.time()


def _request_metric_key(path: str, method: str) -> str:
    """Return a bounded route family, never a user-supplied URL label."""
    # Группируем по prefix чтобы не раздувать кардинальность
    if path.startswith("/api/v1/register"):
        key = "register"
    elif path.startswith("/api/v1/reviews"):
        key = "reviews"
    elif path.startswith("/api/v1/push"):
        key = "push"
    elif path.startswith("/api/v1/borders/scoreboard"):
        key = "borders_scoreboard"
    elif path.startswith("/api/v1/borders/bookings"):
        key = "borders_bookings"
    elif path.startswith("/api/v1/borders"):
        key = "borders"
    elif path.startswith("/api/v1/favorites"):
        key = "favorites"
    elif path.startswith("/api/v1/qr"):
        key = "qr"
    elif path.startswith("/api/v1/docs"):
        key = "docs"
    elif path.startswith("/admin"):
        key = "admin"
    elif path.startswith("/api/v1"):
        key = "api_other"
    else:
        key = "static"
    return f"{method}_{key}"


def _observe_request(method_key: str, duration: float, status_code: int) -> None:
    """Record one completed or failed request without exposing request data."""
    # Monotonic durations can only be non-negative. Guarding here keeps a
    # faulty clock/test double from corrupting every cumulative bucket.
    duration = max(0.0, duration)
    _request_count[method_key] += 1
    _request_duration[method_key] += duration
    buckets = _request_duration_histogram[method_key]
    for index, upper_bound in enumerate(_REQUEST_DURATION_BUCKETS):
        if duration <= upper_bound:
            buckets[index] += 1
    buckets[-1] += 1  # +Inf always includes every observation.
    if status_code >= 500:
        _request_errors[method_key] += 1
    elif status_code >= 400:
        _request_client_errors[method_key] += 1


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = monotonic()
        method_key = _request_metric_key(request.url.path, request.method)
        try:
            response = await call_next(request)
        except Exception:
            _observe_request(method_key, monotonic() - start, 500)
            raise
        _observe_request(method_key, monotonic() - start, response.status_code)
        return response


@metrics_router.get("/metrics")
def prometheus_metrics(_admin: str = Depends(check_admin)):
    """Prometheus text format."""
    lines = []
    lines.append("# HELP urtruck_requests_total Total HTTP requests")
    lines.append("# TYPE urtruck_requests_total counter")
    for k, v in sorted(_request_count.items()):
        lines.append(f'urtruck_requests_total{{endpoint="{k}"}} {v}')

    lines.append("# HELP urtruck_errors_total Total HTTP server errors (5xx)")
    lines.append("# TYPE urtruck_errors_total counter")
    for k, v in sorted(_request_errors.items()):
        lines.append(f'urtruck_errors_total{{endpoint="{k}"}} {v}')

    lines.append("# HELP urtruck_client_errors_total Total HTTP client responses (4xx)")
    lines.append("# TYPE urtruck_client_errors_total counter")
    for k, v in sorted(_request_client_errors.items()):
        lines.append(f'urtruck_client_errors_total{{endpoint="{k}"}} {v}')

    lines.append("# HELP urtruck_duration_seconds_total Total request duration")
    lines.append("# TYPE urtruck_duration_seconds_total counter")
    for k, v in sorted(_request_duration.items()):
        lines.append(f'urtruck_duration_seconds_total{{endpoint="{k}"}} {v:.3f}')

    lines.append("# HELP urtruck_request_duration_seconds Request duration histogram")
    lines.append("# TYPE urtruck_request_duration_seconds histogram")
    for key, buckets in sorted(_request_duration_histogram.items()):
        for upper_bound, count in zip(_REQUEST_DURATION_BUCKETS, buckets):
            lines.append(
                f'urtruck_request_duration_seconds_bucket{{endpoint="{key}",le="{upper_bound:g}"}} {count}'
            )
        lines.append(
            f'urtruck_request_duration_seconds_bucket{{endpoint="{key}",le="+Inf"}} {buckets[-1]}'
        )
        lines.append(f'urtruck_request_duration_seconds_count{{endpoint="{key}"}} {buckets[-1]}')
        lines.append(
            f'urtruck_request_duration_seconds_sum{{endpoint="{key}"}} {_request_duration[key]:.6f}'
        )
    lines.append("# HELP urtruck_metrics_window_start_unixtime Metrics process window start")
    lines.append("# TYPE urtruck_metrics_window_start_unixtime gauge")
    lines.append(f"urtruck_metrics_window_start_unixtime {_metrics_window_started_at:.3f}")

    # Gauges
    lines.append("# HELP urtruck_uptime_seconds Server uptime")
    lines.append("# TYPE urtruck_uptime_seconds gauge")
    lines.append(f"urtruck_uptime_seconds {time.time() - _startup_time:.0f}")

    # DB stats
    try:
        from database.db import get_conn
        with get_conn() as c:
            drivers = c.execute("SELECT COUNT(*) FROM drivers_registration").fetchone()[0]
            approved = c.execute("SELECT COUNT(*) FROM drivers_registration WHERE status='approved'").fetchone()[0]
            reviews = c.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
            blacklist = c.execute("SELECT COUNT(*) FROM blacklist WHERE is_active=1").fetchone()[0]
        lines.append("# HELP urtruck_drivers_total Total registered drivers")
        lines.append("# TYPE urtruck_drivers_total gauge")
        lines.append(f"urtruck_drivers_total {drivers}")
        lines.append(f'urtruck_drivers_approved {approved}')
        lines.append(f'urtruck_reviews_total {reviews}')
        lines.append(f'urtruck_blacklist_active {blacklist}')
    except Exception:
        pass

    # CGR metrics (раздел 8.1 чеклиста). Все 3 счётчика + 1 gauge.
    try:
        from cgr import scoreboard_service as cgr_sb
        from cgr import booking_service as cgr_bs
        from cgr import blocklist_service as cgr_bl
        from database import cgr_dal

        sb_m = cgr_sb.metrics()
        bs_m = cgr_bs.metrics()
        bl_m = cgr_bl.metrics()

        lines.append("# HELP cgr_scoreboard_fetch_total CGR scoreboard fetches by outcome")
        lines.append("# TYPE cgr_scoreboard_fetch_total counter")
        lines.append(f'cgr_scoreboard_fetch_total{{status="success"}} {sb_m["success"]}')
        lines.append(f'cgr_scoreboard_fetch_total{{status="error"}} {sb_m["error"]}')

        lines.append("# HELP cgr_booking_poll_total Total CGR booking polls")
        lines.append("# TYPE cgr_booking_poll_total counter")
        lines.append(f'cgr_booking_poll_total {bs_m["polls"]}')

        lines.append("# HELP cgr_blocklist_matches_total Pending-review matches in CGR blocklist")
        lines.append("# TYPE cgr_blocklist_matches_total counter")
        lines.append(f'cgr_blocklist_matches_total {bl_m["matches"]}')

        lines.append("# HELP cgr_blocklist_size Number of entries cached in cgr_blocklist")
        lines.append("# TYPE cgr_blocklist_size gauge")
        lines.append(f"cgr_blocklist_size {cgr_dal.get_blocklist_count()}")
    except Exception:
        # CGR ещё не подключён или БД не готова — не валим /metrics
        pass

    return Response(content="\n".join(lines) + "\n", media_type="text/plain; charset=utf-8")


_client_errors = []

@metrics_router.post("/api/v1/errors")
async def log_client_error(request: Request):
    """Логирование ошибок с клиента (ErrorBoundary)."""
    try:
        body = await request.json()
        err = {
            "message": body.get("message", "")[:500],
            "stack": body.get("stack", "")[:2000],
            "url": body.get("url", ""),
            "timestamp": body.get("timestamp", ""),
            "ip": request.client.host if request.client else "—",
        }
        _client_errors.append(err)
        if len(_client_errors) > 100:
            _client_errors.pop(0)
        print(f"[CLIENT ERROR] {err['message'][:100]} @ {err['url']}")
    except Exception:
        pass
    return {"ok": True}


@metrics_router.get("/api/v1/errors/recent")
def recent_errors(_admin: str = Depends(check_admin)):
    # Client stacks and URLs may contain sensitive operational information.
    # This is intentionally visible only to an authenticated operator.
    return {"errors": _client_errors[-20:]}


@metrics_router.get("/health")
def health_detailed():
    """Расширенный health с метриками.

    §25 hardening (2026-09-14): this used to return "status": "ok"
    unconditionally, regardless of whether the DB was actually reachable --
    a process that is alive but whose SQLite file is unreachable/corrupted
    (disk full, permissions, a bad path) still passed every liveness/
    readiness probe while every real request 500s. Root-cause note: main.py
    ALSO defined its own `@app.get("/health")` (added, then found to be
    dead code, in the same pass that added this check) -- FastAPI/Starlette
    match routes in registration order, and metrics_router is included
    before that later definition runs, so this handler here is the ONE that
    actually ever serves real /health traffic; the duplicate in main.py was
    removed rather than left as an unreachable trap for the next reader.

    Deliberately NOT checked here: OTP/storage/face/routing/email/push
    providers -- those are optional and degrade gracefully to MOCK/disabled
    per services/*.info(), not core-backend-down. Mixing an optional
    provider outage into this endpoint would make a load balancer pull a
    healthy instance out of rotation over e.g. an OCR/WhatsApp hiccup. Full
    per-subsystem MOCK/REAL diagnostics stay on GET /api/v1/system/info.
    """
    try:
        with db.get_conn() as c:
            c.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    uptime = time.time() - _startup_time
    total_req = sum(_request_count.values())
    total_err = sum(_request_errors.values())
    total_client_err = sum(_request_client_errors.values())
    body = {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "unreachable",
        "uptime_hours": round(uptime / 3600, 1),
        "total_requests": total_req,
        "total_errors": total_err,
        "error_rate": f"{(total_err / max(total_req, 1)) * 100:.1f}%",
        "total_client_errors": total_client_err,
        "client_error_rate": f"{(total_client_err / max(total_req, 1)) * 100:.1f}%",
        "top_endpoints": dict(sorted(_request_count.items(), key=lambda x: -x[1])[:5]),
    }
    if not db_ok:
        return JSONResponse(status_code=503, content=body)
    return body
