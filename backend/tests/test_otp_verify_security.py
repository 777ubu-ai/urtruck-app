"""P1-14 / OTP-coverage (08.08.2026): OTP-верификация — входной шлюз
продукта, ранее без единого теста. Покрываем security-контракт:
  * валидный код → сессия;
  * неверный код → 400;
  * истёкший код → 400;
  * replay (код одноразовый, удаляется после успеха) → 2-й раз 400;
  * брутфорс: блок после 5 попыток (DB attempts) и rate-limit 5/10мин → 429;
  * несуществующий телефон (кода нет) → 400.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_otp.db python -m tests.test_otp_verify_security
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_otp.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()

# verification_codes / reg_sessions живут в registration-схеме — без её
# инициализации wa_verify падает на «no such table».
from database import registration_dal as _reg_setup
_reg_setup.init_registration_schema()

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.registration import reg_router
from database import registration_dal as reg_dal
from api import rate_limit

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
client = TestClient(app)

_phone_seq = [0]


def fresh_phone():
    _phone_seq[0] += 1
    return f"+7700000{_phone_seq[0]:04d}"


def reset_limits():
    rate_limit._store.clear()


def verify(phone, code):
    return client.post("/api/v1/register/whatsapp/verify", json={"phone": phone, "code": code})


def test_valid_code_creates_session():
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    r = verify(p, "1234")
    assert r.status_code == 200, r.text
    assert r.json().get("token"), "успешный verify должен вернуть token"


def test_wrong_code_rejected():
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    r = verify(p, "9999")
    assert r.status_code == 400, r.text


def test_expired_code_rejected():
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    # принудительно просрочим
    from database.db import get_conn
    past = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
    with get_conn() as c:
        c.execute("UPDATE verification_codes SET expires_at = ? WHERE phone = ?", (past, p))
    r = verify(p, "1234")
    assert r.status_code == 400, f"истёкший код должен отклоняться: {r.text}"


def test_replay_code_is_single_use():
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    r1 = verify(p, "1234")
    assert r1.status_code == 200, r1.text
    # повторная попытка тем же кодом — код удалён после успеха
    r2 = verify(p, "1234")
    assert r2.status_code == 400, f"replay того же кода должен быть отклонён: {r2.text}"


def test_unknown_phone_rejected():
    reset_limits()
    p = fresh_phone()  # код не сеяли
    r = verify(p, "1234")
    assert r.status_code == 400, r.text


def test_verify_rate_limited_after_5_attempts():
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    # 5 неверных попыток — все 400 (в пределах лимита)
    for i in range(5):
        r = verify(p, "9998")
        assert r.status_code == 400, f"попытка {i+1}: {r.status_code} {r.text}"
    # 6-я в том же окне — 429 (rate limit), не 400
    r6 = verify(p, "1234")
    assert r6.status_code == 429, f"6-я попытка должна быть 429 rate-limit: {r6.status_code} {r6.text}"


def test_db_attempts_block_after_5_wrong_then_correct():
    """Даже без rate-limit (сброс окна) БД блокирует код после 5 попыток —
    правильный код на 6-й раз уже не проходит."""
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    for i in range(5):
        reset_limits()  # обходим endpoint-лимит, проверяем именно DB-attempts
        r = verify(p, "9998")
        assert r.status_code == 400, f"попытка {i+1}: {r.text}"
    reset_limits()
    r = verify(p, "1234")
    assert r.status_code == 400, "после 5 попыток код заблокирован на уровне БД даже если верный"


if __name__ == "__main__":
    fails = 0
    for fn in [test_valid_code_creates_session, test_wrong_code_rejected,
               test_expired_code_rejected, test_replay_code_is_single_use,
               test_unknown_phone_rejected, test_verify_rate_limited_after_5_attempts,
               test_db_attempts_block_after_5_wrong_then_correct]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
