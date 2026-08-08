"""P0-7/B7 + P1-14 (08.08.2026):
  * GET /api/v1/errors/recent — раньше анонимно отдавал stack-трейсы/URL/IP
    (параметр authorization читался как query и не проверялся). Теперь требует
    admin-токен (constant-time).
  * OTP-код НЕ возвращается в ответе в production — даже при mock-деградации
    канала (fail-open). Проверяем статически, что оба эндпоинта гейтят выдачу
    кода флагом IS_PRODUCTION.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_metrics.db URTRUCK_ADMIN_TOKEN=secret-tok python -m tests.test_metrics_and_otp_safety
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_metrics.db")
os.environ.setdefault("URTRUCK_ADMIN_TOKEN", "secret-admin-token-xyz")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.metrics import metrics_router

app = FastAPI()
app.include_router(metrics_router)
client = TestClient(app)


def test_errors_recent_denies_anonymous():
    r = client.get("/api/v1/errors/recent")
    assert r.status_code == 401, f"аноним не должен получать стектрейсы: {r.status_code} {r.text}"


def test_errors_recent_denies_wrong_token():
    r = client.get("/api/v1/errors/recent", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401, r.text


def test_errors_recent_allows_correct_token():
    tok = os.environ["URTRUCK_ADMIN_TOKEN"]
    r = client.get("/api/v1/errors/recent", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    assert "errors" in r.json()


def test_otp_code_suppressed_in_production_source():
    """Статический guard от регресса fail-open: оба OTP-эндпоинта обязаны
    гейтить выдачу кода через IS_PRODUCTION (не только is_mock/is_beta)."""
    reg = (ROOT / "api" / "registration.py").read_text(encoding="utf-8")
    otp = (ROOT / "api" / "auth_otp.py").read_text(encoding="utf-8")
    assert "IS_PRODUCTION" in reg and "not IS_PRODUCTION" in reg, (
        "registration.py: выдача OTP-кода должна быть закрыта в production"
    )
    assert "_IS_PRODUCTION" in otp and "not _IS_PRODUCTION" in otp, (
        "auth_otp.py: выдача OTP-кода должна быть закрыта в production"
    )


if __name__ == "__main__":
    fails = 0
    for fn in [test_errors_recent_denies_anonymous,
               test_errors_recent_denies_wrong_token,
               test_errors_recent_allows_correct_token,
               test_otp_code_suppressed_in_production_source]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
