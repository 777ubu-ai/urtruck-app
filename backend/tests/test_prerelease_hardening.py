"""Регрессия для 10/10-hardening (предрелизный аудит, 28.08.2026):

1. OTP-код — криптостойкий (secrets), формат 4 цифры сохранён.
2. Reviewer-код: на проде с закоммиченным дефолтом bypass отключён.
3. deals.bid_id — UNIQUE-индекс создаётся (одна сделка на ставку).
"""
import os
import re
import uuid
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_hardening.db")


class TestOtpEntropy:
    def test_generate_code_uses_secrets_and_4_digits(self):
        from services import otp_service, whatsapp_service
        for mod in (otp_service, whatsapp_service):
            codes = {mod.generate_code() for _ in range(200)}
            for c in codes:
                assert re.fullmatch(r"\d{4}", c), f"{mod.__name__}: {c!r} не 4 цифры"
            # 200 выборок должны дать заметное разнообразие (не константа)
            assert len(codes) > 50, f"{mod.__name__}: подозрительно мало уникальных"

    def test_no_mersenne_random_in_generate(self):
        import inspect
        from services import otp_service, whatsapp_service
        for mod in (otp_service, whatsapp_service):
            src = inspect.getsource(mod.generate_code)
            assert "secrets" in src, f"{mod.__name__} не использует secrets"
            assert "random.randint" not in src, f"{mod.__name__} всё ещё на random"


class TestOtpSendIpLimit:
    def test_ip_limit_blocks_bulk_after_15(self):
        from api import rate_limit
        from fastapi import HTTPException
        ip = "203.0.113." + uuid.uuid4().hex[:6]  # уникальный IP на тест
        # 15 разрешено
        for i in range(15):
            rate_limit.limit_otp_send_ip(ip)
        # 16-й — 429
        raised = False
        try:
            rate_limit.limit_otp_send_ip(ip)
        except HTTPException as e:
            raised = e.status_code == 429
        assert raised, "per-IP OTP лимит не сработал на 16-й отправке"

    def test_unknown_ip_not_limited(self):
        from api import rate_limit
        # None и "unknown" не лимитируем — иначе легитимные запросы без client
        for _ in range(50):
            rate_limit.limit_otp_send_ip(None)
            rate_limit.limit_otp_send_ip("unknown")


class TestReviewerBypassGating:
    def test_default_code_disabled_in_production(self, monkeypatch):
        # Дефолт + прод → bypass запрещён
        import importlib
        monkeypatch.delenv("REVIEWER_DEMO_CODE", raising=False)
        monkeypatch.setenv("URTRUCK_ENV", "production")
        import config
        importlib.reload(config)
        assert config.REVIEWER_DEMO_CODE_IS_DEFAULT is True
        assert config.IS_PRODUCTION is True
        # правило гейта, зеркалящее registration.py
        allowed = not (config.IS_PRODUCTION and config.REVIEWER_DEMO_CODE_IS_DEFAULT)
        assert allowed is False, "дефолтный reviewer-код принят на проде"

    def test_overridden_code_enabled_in_production(self, monkeypatch):
        import importlib
        monkeypatch.setenv("REVIEWER_DEMO_CODE", "9times-" + uuid.uuid4().hex[:8])
        monkeypatch.setenv("URTRUCK_ENV", "production")
        import config
        importlib.reload(config)
        assert config.REVIEWER_DEMO_CODE_IS_DEFAULT is False
        allowed = not (config.IS_PRODUCTION and config.REVIEWER_DEMO_CODE_IS_DEFAULT)
        assert allowed is True, "явно заданный reviewer-код не принят на проде"

    def teardown_method(self, _):
        # вернуть config к дефолту среды, чтобы не заражать другие тесты
        import importlib, config
        importlib.reload(config)


class TestDealsUniqueBidIndex:
    def test_unique_index_created(self):
        dbf = "/tmp/urtruck_test_unique_bid.db"
        Path(dbf).unlink(missing_ok=True)
        os.environ["DB_PATH"] = dbf
        import importlib
        from database import db as dbm
        importlib.reload(dbm)
        dbm.init_db()
        from api import marketplace
        importlib.reload(marketplace)
        marketplace._init()
        from database.db import get_conn
        with get_conn() as c:
            idx = c.execute(
                "SELECT name FROM sqlite_master WHERE type='index' "
                "AND name='idx_deals_bid_unique'"
            ).fetchone()
        assert idx, "UNIQUE-индекс idx_deals_bid_unique не создан"

    def test_duplicate_bid_deal_rejected_by_db(self):
        dbf = "/tmp/urtruck_test_unique_bid2.db"
        Path(dbf).unlink(missing_ok=True)
        os.environ["DB_PATH"] = dbf
        import importlib
        from database import db as dbm
        importlib.reload(dbm)
        dbm.init_db()
        from api import marketplace
        importlib.reload(marketplace)
        marketplace._init()
        from database.db import get_conn, new_id
        import sqlite3
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
