"""Регрессия для 10/10-hardening (предрелизный аудит, 28.08.2026):

1. OTP-код — криптостойкий (secrets), формат 4 цифры.
2. Reviewer-код: на проде с закоммиченным дефолтом bypass отключён.
3. per-IP лимит на OTP-send (анти-SMS-фрод).
4. deals.bid_id — UNIQUE-индекс (одна сделка на ставку).

CI-контракт: top-level `def test_*` (не класс). Схему БД (включая UNIQUE-
индекс, создаваемый marketplace._init) поднимает conftest — своей init нет.
"""
import os
import re
import uuid


# ── OTP entropy ─────────────────────────────────────────

def test_generate_code_uses_secrets_and_4_digits():
    from services import otp_service, whatsapp_service
    for mod in (otp_service, whatsapp_service):
        codes = {mod.generate_code() for _ in range(200)}
        for c in codes:
            assert re.fullmatch(r"\d{4}", c), f"{mod.__name__}: {c!r} не 4 цифры"
        assert len(codes) > 50, f"{mod.__name__}: подозрительно мало уникальных"


def test_no_mersenne_random_in_generate():
    import inspect
    from services import otp_service, whatsapp_service
    for mod in (otp_service, whatsapp_service):
        src = inspect.getsource(mod.generate_code)
        assert "secrets" in src, f"{mod.__name__} не использует secrets"
        assert "random.randint" not in src, f"{mod.__name__} всё ещё на random"


# ── per-IP OTP send limit ───────────────────────────────

def test_ip_limit_blocks_bulk_after_15():
    from api import rate_limit
    from fastapi import HTTPException
    ip = "203.0.113." + uuid.uuid4().hex[:6]
    for _ in range(15):
        rate_limit.limit_otp_send_ip(ip)
    raised = False
    try:
        rate_limit.limit_otp_send_ip(ip)
    except HTTPException as e:
        raised = e.status_code == 429
    assert raised, "per-IP OTP лимит не сработал на 16-й отправке"


def test_unknown_ip_not_limited():
    from api import rate_limit
    for _ in range(50):
        rate_limit.limit_otp_send_ip(None)
        rate_limit.limit_otp_send_ip("unknown")


# ── reviewer bypass gating ──────────────────────────────

def test_reviewer_default_code_disabled_in_production():
    # 2026-09-08 harness fix: this used to take a `monkeypatch` fixture and
    # rely on `monkeypatch.setenv(...)` + a same-test `finally:
    # importlib.reload(config)` to "not contaminate other tests". That
    # doesn't actually work — pytest's monkeypatch fixture restores
    # os.environ in ITS OWN teardown, which runs AFTER this function
    # returns; the `finally` block here ran while URTRUCK_ENV was still
    # "production", so the reload inside it reloaded config right back into
    # the *production* state, and nothing ever reloaded it again afterward.
    # `config` (imported via `import config`, i.e. live attribute access,
    # not `from config import IS_PRODUCTION`) stayed IS_PRODUCTION=True for
    # the rest of the pytest session — confirmed by bisection to be the
    # root cause of an order-dependent "no such table: drivers_registration"
    # a long way downstream, in unrelated test files.
    #
    # Fix: manage os.environ directly (not via monkeypatch) so the ORIGINAL
    # values are restored, and config is reloaded back to the correct state,
    # before this function returns — not relying on fixture teardown order.
    import importlib
    import config

    orig_reviewer_code = os.environ.pop("REVIEWER_DEMO_CODE", None)
    orig_env = os.environ.get("URTRUCK_ENV")
    os.environ["URTRUCK_ENV"] = "production"
    try:
        importlib.reload(config)
        assert config.REVIEWER_DEMO_CODE_IS_DEFAULT is True
        assert config.IS_PRODUCTION is True
        allowed = not (config.IS_PRODUCTION and config.REVIEWER_DEMO_CODE_IS_DEFAULT)
        assert allowed is False, "дефолтный reviewer-код принят на проде"
    finally:
        if orig_env is None:
            os.environ.pop("URTRUCK_ENV", None)
        else:
            os.environ["URTRUCK_ENV"] = orig_env
        if orig_reviewer_code is not None:
            os.environ["REVIEWER_DEMO_CODE"] = orig_reviewer_code
        importlib.reload(config)  # now genuinely back to the test-session state


def test_reviewer_overridden_code_enabled_in_production():
    # Same fix as test_reviewer_default_code_disabled_in_production above —
    # see that test's comment for why `monkeypatch` + same-test `finally`
    # reload was not actually restoring state.
    import importlib
    import config

    orig_reviewer_code = os.environ.get("REVIEWER_DEMO_CODE")
    orig_env = os.environ.get("URTRUCK_ENV")
    os.environ["REVIEWER_DEMO_CODE"] = "rot-" + uuid.uuid4().hex[:8]
    os.environ["URTRUCK_ENV"] = "production"
    try:
        importlib.reload(config)
        assert config.REVIEWER_DEMO_CODE_IS_DEFAULT is False
        allowed = not (config.IS_PRODUCTION and config.REVIEWER_DEMO_CODE_IS_DEFAULT)
        assert allowed is True, "явно заданный reviewer-код не принят на проде"
    finally:
        if orig_env is None:
            os.environ.pop("URTRUCK_ENV", None)
        else:
            os.environ["URTRUCK_ENV"] = orig_env
        if orig_reviewer_code is None:
            os.environ.pop("REVIEWER_DEMO_CODE", None)
        else:
            os.environ["REVIEWER_DEMO_CODE"] = orig_reviewer_code
        importlib.reload(config)


# ── deals.bid_id UNIQUE (создаётся conftest → marketplace._init) ──

def test_unique_index_created():
    from database.db import get_conn
    with get_conn() as c:
        idx = c.execute(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND name='idx_deals_bid_unique'"
        ).fetchone()
    assert idx, "UNIQUE-индекс idx_deals_bid_unique не создан"


def test_duplicate_bid_deal_rejected_by_db():
    import sqlite3
    from database.db import get_conn, new_id
    bid = "b-" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(deals)").fetchall()}
        base = {"id": new_id(), "bid_id": bid, "cargo_id": "c1",
                "shipper_id": "s1", "driver_id": "d1",
                "from_city": "Almaty", "to_city": "Moscow", "amount": 1000,
                "status": "accepted"}
        keys = [k for k in base if k in cols]
        c.execute(f"INSERT INTO deals ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                  [base[k] for k in keys])
        c.commit()
        raised = False
        try:
            base2 = dict(base, id=new_id())
            c.execute(f"INSERT INTO deals ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                      [base2[k] for k in keys])
            c.commit()
        except sqlite3.IntegrityError:
            raised = True
    assert raised, "БД приняла вторую сделку на тот же bid_id"
