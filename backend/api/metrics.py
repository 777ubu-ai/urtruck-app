"""Prometheus-compatible /metrics endpoint + middleware для сбора метрик.

Формат: Prometheus text exposition (plain text).
Не требует библиотеки prometheus_client — пишем вручную для минимальных зависимостей.
"""
import sys
import time
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from api.admin import check_admin

metrics_router = APIRouter()

# Counters
_request_count = defaultdict(int)      # {method_path: count}
_request_errors = defaultdict(int)     # {method_path: 5xx count}
_request_client_errors = defaultdict(int)  # {method_path: 4xx count}
_request_duration = defaultdict(float) # {method_path: total_seconds}
_startup_time = time.time()


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start

        path = request.url.path
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

        method_key = f"{request.method}_{key}"
        _request_count[method_key] += 1
        _request_duration[method_key] += duration
        if response.status_code >= 500:
            _request_errors[method_key] += 1
        elif response.status_code >= 400:
            _request_client_errors[method_key] += 1

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
    """Расширенный health с метриками."""
    uptime = time.time() - _startup_time
    total_req = sum(_request_count.values())
    total_err = sum(_request_errors.values())
    total_client_err = sum(_request_client_errors.values())
    return {
        "status": "ok",
        "uptime_hours": round(uptime / 3600, 1),
        "total_requests": total_req,
        "total_errors": total_err,
        "error_rate": f"{(total_err / max(total_req, 1)) * 100:.1f}%",
        "total_client_errors": total_client_err,
        "client_error_rate": f"{(total_client_err / max(total_req, 1)) * 100:.1f}%",
        "top_endpoints": dict(sorted(_request_count.items(), key=lambda x: -x[1])[:5]),
    }
