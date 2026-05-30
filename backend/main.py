"""UrTruck Security API — точка входа."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Загрузка .env (до всех imports которые читают env)
_env = Path(__file__).resolve().parent / ".env"
if _env.exists():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

# Sentry init — как можно раньше, до создания FastAPI app, чтобы ловить
# ошибки startup. Если SENTRY_DSN пуст — graceful no-op.
# См. docs/cgr/DECISIONS.md §2.
_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            integrations=[FastApiIntegration()],
            send_default_pii=False,  # ИИН/ФИО водителей в Sentry не уходят
        )
        print("[sentry] initialized", flush=True)
    except Exception as e:
        print(f"[sentry] init failed (continuing without): {e}", flush=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Добавляет базовые security-заголовки ко всем ответам."""
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

from api.routes import router
from api.admin import admin_router
from api.registration import reg_router
from api.driver_registration import driver_reg_router
from api.reviews import reviews_router
from api.push import push_router
from api.qr import qr_router
from api.telegram_webhook import tg_webhook_router
from api.documents import docs_router
from api.favorites import fav_router
from api.borders import borders_router
from api.metrics import metrics_router, MetricsMiddleware
from api.leaderboard import leader_router
from api.saved_searches import ss_router
from api.marketplace import mp_router
from api.chat import chat_router
from api.deal_room import deal_room_router
from api.notifications import notif_router
from api.profile import profile_router
from api.auth_otp import auth_otp_router
from api.qa import qa_router
from database import db
from database import registration_dal
from database import reviews_dal
from database import consent_dal
from blacklist import manager as blacklist_mgr
from services import storage_service

import os

# В production: docs выключены, доступны только через /admin (с паролем)
app = FastAPI(
    title="UrTruck Security API",
    version="2.0",
    description="Регистрация водителей, Scoring, Blacklist, OCR, Reviews, Push, Borders, QR, Documents",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8081,http://localhost:19006,http://185.22.65.11:8080,https://185.22.65.11:8443"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
    expose_headers=["X-Total-Count"],
)
app.add_middleware(MetricsMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Версия для мягкого обновления
import time as _time
BUILD_VERSION = "1.0.50"
BUILD_TIME = _time.strftime("%Y-%m-%d %H:%M", _time.gmtime())

@app.get("/api/version")
def get_version():
    return {"version": BUILD_VERSION, "build_time": BUILD_TIME}

app.include_router(router, prefix="/api/v1")
app.include_router(reg_router, prefix="/api/v1/register")
app.include_router(driver_reg_router, prefix="/api/v1/driver/registration")
app.include_router(reviews_router, prefix="/api/v1/reviews")
app.include_router(push_router, prefix="/api/v1/push")
app.include_router(qr_router, prefix="/api/v1/qr")
app.include_router(tg_webhook_router, prefix="/api/v1/telegram")
app.include_router(docs_router, prefix="/api/v1/docs")
app.include_router(fav_router, prefix="/api/v1/favorites")
app.include_router(borders_router, prefix="/api/v1/borders")
app.include_router(leader_router, prefix="/api/v1/leaderboard")
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(chat_router, prefix="/api/v1/chat")
# Deal Room foundation — новые endpoints (/chat/conversations, /deals/{id}/timeline,
# /support/escalate) под /api/v1. Старые /chat/rooms, /chat/messages не трогаются.
app.include_router(deal_room_router, prefix="/api/v1")
app.include_router(notif_router, prefix="/api/v1/notifications")
app.include_router(profile_router, prefix="/api/v1/users")
app.include_router(auth_otp_router, prefix="/api/auth")
app.include_router(ss_router, prefix="/api/v1/searches")
app.include_router(qa_router, prefix="/api/v1/qa")
app.include_router(metrics_router, prefix="")
app.include_router(admin_router, prefix="/admin")

# Раздача локального storage (только если provider=local)
if storage_service.PROVIDER == "local":
    storage_service.LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount("/storage", StaticFiles(directory=str(storage_service.LOCAL_ROOT)), name="storage")


@app.on_event("startup")
def startup():
    # Stage 21 prod hardening: log a clear list of mock/missing
    # values when running with URTRUCK_ENV=production. Refuses to
    # boot when URTRUCK_FAIL_ON_BAD_ENV=1 is also set.
    try:
        from services.env_check import enforce_production_env
        enforce_production_env()
    except RuntimeError:
        raise
    except Exception as e:
        print(f"[env-check] guard failed: {e}", flush=True)
    db.init_db()
    registration_dal.init_registration_schema()
    reviews_dal.init_reviews_schema()
    consent_dal.init_consent_schema()
    blacklist_mgr.seed_demo_blacklist()

    # CGR schema + seed border_checkpoints из хардкода BORDERS (идемпотентно).
    # Безопасно при выключенном CGR_FEATURE_ENABLED — это только подготовка БД.
    try:
        from database import cgr_dal
        cgr_dal.init_cgr_schema()
        n = cgr_dal.seed_border_checkpoints_from_legacy()
        print(f"[startup] CGR schema applied, border_checkpoints seeded: +{n}", flush=True)
    except Exception as e:
        print(f"[startup] CGR schema init failed (continuing): {e}", flush=True)

    # Deal Room foundation — схема + backfill участников из chat_rooms.
    # Идемпотентно, безопасно при повторе; старый чат не затрагивается.
    try:
        from database import deal_room_dal
        deal_room_dal.init_deal_room_schema()
        bf = deal_room_dal.backfill_participants()
        print(f"[startup] Deal Room schema applied, participants backfilled: +{bf}", flush=True)
    except Exception as e:
        print(f"[startup] Deal Room schema init failed (continuing): {e}", flush=True)
    # PR-D1 (build 18): идемпотентная миграция PRO-колонок водителя.
    # _ensure_columns делает ALTER TABLE add-if-missing для 9 колонок
    # (city, about, legal_form, china_experience_years, favorite_borders,
    # emergency_contact, passport_intl_url, tir_book_url, cmr_insurance_url).
    # Запускается на каждом старте — безопасно благодаря PRAGMA-проверке.
    try:
        from api.profile import _ensure_columns as _ensure_pro_columns
        _ensure_pro_columns()
        print("PRO columns ensured")
    except Exception as e:
        print(f"PRO columns migration failed: {e}", flush=True)
    # DB optimization indexes
    try:
        from database.db import get_conn
        idx_sql = Path(__file__).resolve().parent / "database" / "optimize_indexes.sql"
        if idx_sql.exists():
            with get_conn() as c:
                c.executescript(idx_sql.read_text(encoding="utf-8"))
                c.commit()
            print("DB indexes optimized")
    except Exception as e:
        print(f"Indexes failed: {e}")

    # Telegram bot polling
    print(f"[startup] TELEGRAM_BOT_TOKEN = {'SET' if os.getenv('TELEGRAM_BOT_TOKEN') else 'EMPTY'}", flush=True)
    try:
        from services.telegram_bot import start_bot
        start_bot()
        print("[startup] TG bot started OK", flush=True)
    except Exception as e:
        import traceback
        print(f"[startup] TG bot FAILED: {e}", flush=True)
        traceback.print_exc()
    # Парсинг Della/ATI при старте
    try:
        from parsers.della_parser import run_parse as della_parse
        della_parse()
    except Exception as e:
        print(f"Della parse failed: {e}")
    # CGR scheduler (AsyncIOScheduler, separate from existing BackgroundScheduler).
    # Стартует только если CGR_FEATURE_ENABLED=true И CGR_IIN_SALT задан.
    try:
        from scheduler import cgr_jobs
        sched = cgr_jobs.start()
        if sched is not None:
            print("[startup] CGR scheduler started", flush=True)
        else:
            print("[startup] CGR scheduler skipped (feature disabled or settings missing)", flush=True)
    except Exception as e:
        print(f"[startup] CGR scheduler FAILED (continuing): {e}", flush=True)

    print("=" * 50)
    print("UrTruck Security API started on port 8001")
    print("  API:        http://localhost:8001/api/v1")
    print("  Docs:       http://localhost:8001/docs")
    print("  Admin:      http://localhost:8001/admin")
    print("=" * 50)


@app.on_event("shutdown")
async def shutdown():
    """Корректная остановка CGR-scheduler и httpx-клиента."""
    try:
        from scheduler import cgr_jobs
        cgr_jobs.stop()
    except Exception as e:
        print(f"[shutdown] cgr_jobs.stop failed: {e}", flush=True)
    try:
        from cgr.client import cgr_client
        await cgr_client.close()
    except Exception as e:
        print(f"[shutdown] cgr_client.close failed: {e}", flush=True)


@app.get("/")
def root():
    return {
        "service": "UrTruck Security",
        "version": "1.0",
        "docs": "/docs",
        "api": "/api/v1",
        "admin": "/admin",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/system/info")
def system_info():
    """Режимы работы подсистем MVP."""
    from services import otp_service
    from biometrics.liveness import info as face_info
    return {
        "otp": otp_service.info(),
        "face": face_info(),
        "storage": storage_service.info(),
    }


if __name__ == "__main__":
    import uvicorn
    import config
    uvicorn.run(app, host=config.API_HOST, port=config.API_PORT)
