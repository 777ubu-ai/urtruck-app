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
            os.environ.setdefault(k.strip(), v.strip())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import router
from api.admin import admin_router
from api.registration import reg_router
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
from api.notifications import notif_router
from api.profile import profile_router
from database import db
from database import registration_dal
from database import reviews_dal
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

# Версия для мягкого обновления
import time as _time
BUILD_VERSION = "1.0.50"
BUILD_TIME = _time.strftime("%Y-%m-%d %H:%M", _time.gmtime())

@app.get("/api/version")
def get_version():
    return {"version": BUILD_VERSION, "build_time": BUILD_TIME}

app.include_router(router, prefix="/api/v1")
app.include_router(reg_router, prefix="/api/v1/register")
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
app.include_router(notif_router, prefix="/api/v1/notifications")
app.include_router(profile_router, prefix="/api/v1/users")
app.include_router(ss_router, prefix="/api/v1/searches")
app.include_router(metrics_router, prefix="")
app.include_router(admin_router, prefix="/admin")

# Раздача локального storage (только если provider=local)
if storage_service.PROVIDER == "local":
    storage_service.LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount("/storage", StaticFiles(directory=str(storage_service.LOCAL_ROOT)), name="storage")


@app.on_event("startup")
def startup():
    db.init_db()
    registration_dal.init_registration_schema()
    reviews_dal.init_reviews_schema()
    blacklist_mgr.seed_demo_blacklist()
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
    print("=" * 50)
    print("UrTruck Security API started on port 8001")
    print("  API:        http://localhost:8001/api/v1")
    print("  Docs:       http://localhost:8001/docs")
    print("  Admin:      http://localhost:8001/admin")
    print("=" * 50)


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
