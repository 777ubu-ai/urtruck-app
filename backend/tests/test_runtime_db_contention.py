"""P0 regression coverage for QA2 marketplace availability under DB pressure."""
import contextvars
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_runtime_contention.db")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import marketplace
from api.marketplace import mp_router
from api.push import push_router
from api.runtime_errors import install_runtime_error_handlers
from database.db import DatabaseBusyError, get_conn
from tests.auth_harness import override_require_level

_current_user = contextvars.ContextVar("runtime_contention_user", default=None)


def _fake_require_level(_minimum):
    def dep():
        user = _current_user.get()
        if not user:
            raise HTTPException(status_code=401, detail="No test user")
        return user
    return dep


app = FastAPI()
app.include_router(mp_router, prefix="/api/v1/market")
app.include_router(push_router, prefix="/api/v1/push")
install_runtime_error_handlers(app)
override_require_level(app, _fake_require_level(1))
client = TestClient(app)


def _as_owner():
    _current_user.set({
        "id": "runtime-contention-owner",
        "full_name": "QA2 owner",
        "phone": "+70000000000",
        "verification_level": 1,
        "role": "client",
    })


def _cargo_body():
    return {
        "from_city": "Yiwu", "to_city": "Almaty",
        "cargo_desc": "QA2 runtime contention regression",
        "cargo_type": "tent", "price": 1500, "currency": "USD",
        "pickup_date": "2026-10-05", "weight_tons": 10, "volume_m3": 82,
    }


def test_database_busy_is_a_retryable_503_not_an_unhandled_timeout(monkeypatch):
    _as_owner()

    @contextmanager
    def locked_connection():
        raise DatabaseBusyError("SQLite временно занята")
        yield  # pragma: no cover - makes this a generator context manager

    monkeypatch.setattr(marketplace, "get_conn", locked_connection)
    response = client.post("/api/v1/market/cargos", json=_cargo_body())

    assert response.status_code == 503, response.text
    assert response.headers["retry-after"] == "1"
    assert response.json()["detail"] == {"code": "database_busy", "retryable": True}


def test_cargo_post_returns_within_three_seconds_during_push_and_stt_db_activity():
    """Concurrent QA2 workers may cause a retryable 503, never a silent hang."""
    _as_owner()

    def push_write(index):
        return client.post("/api/v1/push/register-native", json={
            "token": f"qa2-runtime-token-{index:03d}-abcdefghijk",
            "provider": "fcm", "platform": "android", "device_id": f"qa2-device-{index}",
        }).status_code

    def stt_worker_read(_index):
        with get_conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM voice_processing_jobs").fetchone()[0]

    with ThreadPoolExecutor(max_workers=12) as pool:
        work = [pool.submit(push_write, index) for index in range(24)]
        work.extend(pool.submit(stt_worker_read, index) for index in range(24))
        started = time.monotonic()
        response = client.post("/api/v1/market/cargos", json=_cargo_body())
        elapsed = time.monotonic() - started
        # Push tasks return HTTP status while STT tasks return a row count;
        # both are only background pressure for this contract.  They must
        # complete, but their result types must not be conflated.
        for future in work:
            future.result(timeout=3)

    assert elapsed < 3.0, f"cargo POST took {elapsed:.3f}s"
    assert response.status_code in (200, 503), response.text
