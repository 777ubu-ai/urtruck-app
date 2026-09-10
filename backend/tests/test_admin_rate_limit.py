"""C1.1 (security-спринт, 08.09.2026): rate limiting /admin Basic Auth.

Контракт, который фиксируем:
  * 5 неудачных попыток входа с одного IP → каждая отвечает 401, после 5-й
    IP блокируется: любой следующий запрос — 429 + Retry-After, даже с
    верным паролем;
  * счётчик живёт в SQLite sidecar и переживает «рестарт процесса»
    (имитация — importlib.reload модуля хранилища, module-level state
    сбрасывается, данные на диске остаются);
  * хранилище недоступно → FAIL-CLOSED 503, а не «лимитов нет»;
  * /health и запросы к /admin с других IP блокировкой не затрагиваются;
  * успешный вход сбрасывает счётчик неудач;
  * запрос без Authorization-заголовка тоже считается неудачной попыткой
    (regression на auto_error=False в HTTPBasic).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_admin_rl.db python -m tests.test_admin_rate_limit
Совместим с pytest (общий conftest-подъём схем; sidecar лимитов изолируем
autouse-фикстурой, чтобы не протекать в другие тесты сессии).
"""
import base64
import importlib
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_admin_rl.db")
Path(TEST_DB).unlink(missing_ok=True)
os.environ.setdefault("URTRUCK_ENV", "test")
# setdefault: не переопределяем значения, если CI/окружение задало свои —
# api.admin и _auth() ниже читают одни и те же переменные.
os.environ.setdefault("URTRUCK_ADMIN_USER", "rl-test-admin")
os.environ.setdefault("URTRUCK_ADMIN_PASS", "rl-test-pass-9f3b")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import persistent_rate_limit as prl

# Чистый sidecar перед импортом роутера (и до любых тестов).
try:
    prl._db_path().unlink(missing_ok=True)
except OSError:
    pass

from api.admin import admin_router  # noqa: E402  (после выставления env)

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(admin_router, prefix="/admin")
client = TestClient(app)

ADMIN_USER = os.environ["URTRUCK_ADMIN_USER"]
ADMIN_PASS = os.environ["URTRUCK_ADMIN_PASS"]


class _IpOverrideApp:
    """ASGI-обёртка: подменяет scope['client'] на заданный IP. TestClient в
    starlette 0.38 не умеет client= (httpx.ASGITransport — async-only), а
    лимитер читает IP из request.client — поэтому подменяем на уровне scope,
    ровно так же, как это делает сам TestClient ('testclient', 50000)."""

    def __init__(self, asgi_app, ip: str):
        self._asgi_app = asgi_app
        self._ip = ip

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope = dict(scope, client=(self._ip, 50000))
        await self._asgi_app(scope, receive, send)


def _client_for_ip(ip: str) -> TestClient:
    return TestClient(_IpOverrideApp(app, ip))


def _auth_header(user: str, password: str):
    raw = f"{user}:{password}".encode()
    return {"Authorization": "Basic " + base64.b64encode(raw).decode()}


def _good():
    return _auth_header(ADMIN_USER, ADMIN_PASS)


def _bad():
    return _auth_header("nope-" + uuid.uuid4().hex[:6], "wrong-pass")


def _fresh_ip():
    return "198.51.100." + str(uuid.uuid4().int % 200 + 1)


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_rate_limit_store():
    # До и ПОСЛЕ каждого теста: в сессии pytest sidecar общий для всех
    # файлов, блокировку testclient-IP нельзя протащить в чужие тесты
    # (например, в успешные admin-логины test_favorites_contract).
    prl.reset_all()
    yield
    prl.reset_all()


def _get(path, headers=None, ip="198.51.100.7"):
    return _client_for_ip(ip).get(path, headers=headers or {})


def test_bruteforce_admin_returns_429_after_5_failures():
    ip = _fresh_ip()
    for i in range(5):
        r = _get("/admin/", headers=_bad(), ip=ip)
        assert r.status_code == 401, f"попытка {i+1}: {r.status_code} {r.text}"
        assert r.headers.get("WWW-Authenticate"), "401 без challenge-заголовка"
    # 5-я неудачная попытка уже ставит блокировку — Retry-After приходит
    # сразу с последним 401.
    r_blocked = _get("/admin/", headers=_bad(), ip=ip)
    assert r_blocked.status_code == 429, f"после 5 неудачных должен быть 429: {r_blocked.status_code} {r_blocked.text}"
    retry_after = int(r_blocked.headers.get("Retry-After", "0"))
    assert 0 < retry_after <= 15 * 60, f"Retry-After вне окна блокировки: {retry_after}"


def test_blocked_ip_rejected_even_with_correct_password():
    ip = _fresh_ip()
    for _ in range(5):
        _get("/admin/", headers=_bad(), ip=ip)
    r = _get("/admin/", headers=_good(), ip=ip)
    assert r.status_code == 429, f"верный пароль не должен пробивать блокировку: {r.status_code}"
    assert int(r.headers.get("Retry-After", "0")) > 0


def test_failures_persist_across_process_restart():
    """Счётчик на диске: 'рестарт' (reload модуля) не сбрасывает блокировку."""
    ip = _fresh_ip()
    for _ in range(5):
        _get("/admin/", headers=_bad(), ip=ip)
    r = _get("/admin/", headers=_bad(), ip=ip)
    assert r.status_code == 429

    importlib.reload(prl)  # module-level state обнуляется, диск — нет
    r = _get("/admin/", headers=_good(), ip=ip)
    assert r.status_code == 429, "после 'рестарта процесса' блокировка потерялась"


def test_fail_closed_when_store_unavailable(monkeypatch):
    def _boom(scope, subject):
        raise prl.RateLimitUnavailable("simulated store outage")

    monkeypatch.setattr(prl, "check_allowed", _boom)
    r = _get("/admin/", headers=_good(), ip=_fresh_ip())
    assert r.status_code == 503, f"недоступное хранилище → fail-closed 503, получено {r.status_code}"


def test_fail_closed_on_record_failure(monkeypatch):
    def _boom(scope, subject, max_failures, block_seconds):
        raise prl.RateLimitUnavailable("simulated store outage")

    monkeypatch.setattr(prl, "check_allowed", lambda scope, subject: (True, 0))
    monkeypatch.setattr(prl, "record_failure", _boom)
    r = _get("/admin/", headers=_bad(), ip=_fresh_ip())
    assert r.status_code == 503, f"сбой записи неудачи → 503, получено {r.status_code}"


def test_health_not_rate_limited():
    ip = _fresh_ip()
    for _ in range(5):
        _get("/admin/", headers=_bad(), ip=ip)
    r = _client_for_ip(ip).get("/health")
    assert r.status_code == 200, f"/health не должен лимитироваться: {r.status_code}"
    assert r.json() == {"status": "ok"}


def test_other_ips_not_affected_by_block():
    blocked_ip = _fresh_ip()
    for _ in range(5):
        _get("/admin/", headers=_bad(), ip=blocked_ip)
    other = _fresh_ip()
    while other == blocked_ip:
        other = _fresh_ip()
    r = _get("/admin/", headers=_good(), ip=other)
    assert r.status_code == 200, f"другой IP не должен страдать от чужой блокировки: {r.status_code}"
    assert "UrTruck Security" in r.text


def test_successful_login_resets_failure_counter():
    ip = _fresh_ip()
    for _ in range(4):
        _get("/admin/", headers=_bad(), ip=ip)
    r_ok = _get("/admin/", headers=_good(), ip=ip)
    assert r_ok.status_code == 200
    # после сброса снова доступны полные 5 неудачных, а не 1 до 429
    for i in range(5):
        r = _get("/admin/", headers=_bad(), ip=ip)
        assert r.status_code == 401, f"после сброса попытка {i+1}: {r.status_code}"
    r = _get("/admin/", headers=_bad(), ip=ip)
    assert r.status_code == 429, "счётчик не сбросился успешным входом"


def test_missing_auth_header_counts_as_failure():
    ip = _fresh_ip()
    r = _get("/admin/", headers={}, ip=ip)
    assert r.status_code == 401, f"запрос без заголовка → 401, получено {r.status_code}"
    assert r.headers.get("WWW-Authenticate")
    for _ in range(4):
        _get("/admin/", headers=_bad(), ip=ip)
    r = _get("/admin/", headers={}, ip=ip)
    assert r.status_code == 429, "попытки без Authorization-заголовка должны попадать в счётчик"


if __name__ == "__main__":
    fails = 0
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in tests:
        try:
            fn()
            print(f"  ✅ {fn.__name__}")
        except TypeError:
            # тесты с аргументами (monkeypatch) — только под pytest
            print(f"  ⏭  {fn.__name__} (требует pytest)")
        except Exception as e:
            fails += 1
            print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails) + ' FAIL'}")
    sys.exit(1 if fails else 0)
