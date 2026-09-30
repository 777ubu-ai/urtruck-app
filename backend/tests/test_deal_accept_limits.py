"""Ежемесячный лимит принятия сделок (accept) — тесты.

Покрывает backend-контракт лимита:
  - accept_bid списывает лимит у ПРИНИМАЮЩЕЙ стороны (shipper);
  - accept_counter списывает лимит у bidder'а (driver), принимающего контр-оффер;
  - 6-й accept после исчерпания FREE-лимита (5/мес) → 402 deal_limit_exceeded;
  - активная подписка поднимает лимит до PRO (30/мес) — включая «пробитый»
    free-лимит: после подписки accept снова разрешён;
  - повторный accept той же сделки лимит не тратит дважды;
  - смена period_key ('YYYY-MM') обнуляет счётчик;
  - отмена сделки лимит НЕ возвращает.

ВАЖНО: в тестовом окружении BETA_MODE=true по умолчанию (URTRUCK_ENV=test) —
can_accept_deal() тогда всегда True. Тесты, проверяющие сам лимит, глушат
config.BETA_MODE через контекстный менеджер limits_on().

Run from backend/:
    DB_PATH=/tmp/urtruck_test_deal_limits.db python -m tests.test_deal_accept_limits
Совместим с pytest.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("URTRUCK_ENV", "test")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Переиспользуем harness test_payments_contract (тот же патч require_level,
# та же contextvar «текущего юзера», тот же TestClient с обоими роутерами).
# Свой клон патча здесь нельзя: зависимости роутеров прибиваются к fake'у,
# активному на момент ПЕРВОГО импорта api.marketplace/api.payments, — при
# совместном прогоне двух модулей второй патчил бы зря, и чужие тесты
# получали бы протухшего юзера (см. историю test_bid_actions +
# test_payments_contract). Один общий модуль = один источник правды.
from tests.test_payments_contract import as_user, client  # noqa: F401

import config
from database import subscription_dal as sub_dal
from database.db import get_conn, new_id

# accept-флоу пишет маркер сделки в chat_rooms. В pytest-режиме схему
# поднимает tests/conftest.py (session fixture), а при прямом запуске
# (python -m tests.test_deal_accept_limits) — никто, поэтому догоняем здесь
# (идемпотентно, как в test_bid_actions.py).
_chat_schema_path = ROOT / "database" / "chat_schema.sql"
if _chat_schema_path.exists():
    with get_conn() as _c_chat:
        _c_chat.executescript(_chat_schema_path.read_text(encoding="utf-8"))


def _future(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


class limits_on:
    """На время блока включает реальный лимит accept (глушит BETA_MODE)."""

    def __enter__(self):
        self.old = (config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED,
                    config.FREE_DEAL_ACCEPT_LIMIT)
        config.BETA_MODE = False
        config.DEAL_ACCEPT_MONETIZATION_ENABLED = True
        config.FREE_DEAL_ACCEPT_LIMIT = 5

    def __exit__(self, *args):
        (config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED,
         config.FREE_DEAL_ACCEPT_LIMIT) = self.old


_seed_n = 0


def _seed_cargo(owner_id: str) -> str:
    """Минимальный активный груз (owner может принять ставку)."""
    global _seed_n
    _seed_n += 1
    cargo_id = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO cargos (id, owner_id, owner_phone, owner_name, from_city, to_city, "
            "cargo_desc, cargo_type, price, bids_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cargo_id, owner_id, "+77075554433", "Грузовладелец Тест", "Almaty", "Astana",
             f"Test cargo {_seed_n}", "tent", 3000, 0, "active"),
        )
    return cargo_id


def _bid(driver_id: str, cargo_id: str, amount: int = 2500) -> str:
    as_user(driver_id, role="driver")  # ставка на груз — только driver (track B)
    r = client.post("/api/v1/market/bids", json={"cargo_id": cargo_id, "amount": amount})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _accept_bid(shipper_id: str, bid_id: str):
    as_user(shipper_id)
    return client.post(f"/api/v1/market/bids/{bid_id}/accept")


def _accept_one(shipper_id: str, driver_id: str, tag: str) -> str:
    """Один полный цикл: груз + ставка + accept → deal_id."""
    cargo_id = _seed_cargo(shipper_id)
    bid_id = _bid(driver_id, cargo_id)
    r = _accept_bid(shipper_id, bid_id)
    assert r.status_code == 200, f"{tag}: {r.status_code} {r.text}"
    return r.json()["deal_id"]


# ------------------------------------------------- списание у принимающей
def test_accept_bid_spends_shipper_limit_not_driver():
    """accept_bid: лимит тратит ПРИНИМАЮЩАЯ сторона (shipper), не bidder."""
    with limits_on():
        shipper, driver = "da-shipper-a", "da-driver-a"
        _accept_one(shipper, driver, "accept_bid")
        assert sub_dal.count_deal_accepts_this_period(shipper) == 1
        assert sub_dal.count_deal_accepts_this_period(driver) == 0


def test_accept_counter_spends_driver_limit_not_shipper():
    """accept_counter: лимит тратит bidder (driver), принимающий контр-оффер,
    а не владелец груза, от имени которого идёт авторизация."""
    with limits_on():
        shipper, driver = "da-shipper-b", "da-driver-b"
        cargo_id = _seed_cargo(shipper)
        bid_id = _bid(driver, cargo_id)

        as_user(shipper)
        r = client.post(f"/api/v1/market/bids/{bid_id}/counter", json={"amount": 2800})
        assert r.status_code == 200, r.text

        as_user(driver, role="driver")
        r = client.post(f"/api/v1/market/bids/{bid_id}/counter/accept")
        assert r.status_code == 200, r.text

        assert sub_dal.count_deal_accepts_this_period(driver) == 1, \
            "контр-оффер принял driver — лимит должен списаться у него"
        assert sub_dal.count_deal_accepts_this_period(shipper) == 0, \
            "shipper только предложил контр-оффер — его лимит не тратится"


# ------------------------------------------------------- 402 на 6-й accept
def test_sixth_accept_rejected_with_deal_limit_exceeded():
    with limits_on():
        shipper, driver = "da-shipper-c", "da-driver-c"
        for _ in range(5):
            _accept_one(shipper, driver, "first-five")

        # 6-й accept — лимит исчерпан
        cargo_id = _seed_cargo(shipper)
        bid_id = _bid(driver, cargo_id)
        r = _accept_bid(shipper, bid_id)
        assert r.status_code == 402, f"{r.status_code} {r.text}"
        body = r.json()
        detail = body["detail"] if "detail" in body else body
        assert detail["error"] == "deal_limit_exceeded"
        assert detail["used"] == 5 and detail["limit"] == 5
        # лимит не списался и сделка не создана
        assert sub_dal.count_deal_accepts_this_period(shipper) == 5
        with get_conn() as c:
            n = c.execute(
                "SELECT COUNT(*) AS n FROM deals WHERE cargo_id = ?", (cargo_id,)
            ).fetchone()["n"]
        assert n == 0


def test_failed_accept_does_not_spend_limit():
    """402/ошибка accept не должна тратить лимит (транзакция откатывается)."""
    with limits_on():
        shipper, driver = "da-shipper-c2", "da-driver-c2"
        for _ in range(5):
            _accept_one(shipper, driver, "first-five")
        used_before = sub_dal.count_deal_accepts_this_period(shipper)
        cargo_id = _seed_cargo(shipper)
        bid_id = _bid(driver, cargo_id)
        r = _accept_bid(shipper, bid_id)
        assert r.status_code == 402
        assert sub_dal.count_deal_accepts_this_period(shipper) == used_before


# ------------------------------------------------------------ подписка Pro
def test_active_subscription_raises_limit_to_30():
    with limits_on():
        shipper, driver = "da-shipper-d", "da-driver-d"
        for _ in range(5):
            _accept_one(shipper, driver, "first-five")

        # free-лимит исчерпан — без подписки 6-й reject'ится
        cargo_id = _seed_cargo(shipper)
        blocked_bid = _bid(driver, cargo_id)
        r = _accept_bid(shipper, blocked_bid)
        assert r.status_code == 402

        # активная подписка → лимит PRO (30/мес), accept снова разрешён
        sub_dal.upsert_subscription(
            shipper, provider="google_play", product_id="pro_monthly",
            purchase_token="tok-deal-" + new_id(), status="active", auto_renewing=True,
            period_start=datetime.now(timezone.utc).isoformat(), period_end=_future(30),
        )
        st = sub_dal.get_deal_accept_limit(shipper)
        assert st["used"] == 5 and st["limit"] == 30
        assert sub_dal.can_accept_deal(shipper) is True

        r = _accept_bid(shipper, blocked_bid)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        assert sub_dal.count_deal_accepts_this_period(shipper) == 6


def test_beta_mode_and_disabled_monetization_always_allow():
    """BETA_MODE или DEAL_ACCEPT_MONETIZATION_ENABLED=False → лимит не действует."""
    old = (config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED)
    try:
        config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED = True, True
        assert sub_dal.can_accept_deal("da-anyone-beta") is True
        config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED = False, False
        assert sub_dal.can_accept_deal("da-anyone-off") is True
    finally:
        config.BETA_MODE, config.DEAL_ACCEPT_MONETIZATION_ENABLED = old


# ------------------------------------------------- идемпотентность / период
def test_double_record_same_deal_does_not_spend_twice():
    """Повторное списание той же сделки (UNIQUE(user_id, deal_id)) — 1 лимит."""
    with limits_on():
        uid, deal_id = "da-user-idem", "deal-idem-1"
        sub_dal.record_deal_accept(uid, deal_id)
        sub_dal.record_deal_accept(uid, deal_id)
        sub_dal.record_deal_accept(uid, deal_id)
        assert sub_dal.count_deal_accepts_this_period(uid) == 1
        assert sub_dal.can_accept_deal(uid) is True


def test_period_key_change_resets_counter():
    """Счётчик считается строго по period_key — новый месяц = чистый лимит."""
    uid = "da-user-period"
    sub_dal.record_deal_accept(uid, "deal-period-1")
    sub_dal.record_deal_accept(uid, "deal-period-2")
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    assert sub_dal.count_deal_accepts_this_period(uid) == 2
    assert sub_dal.count_deal_accepts_this_period(uid, "2000-01") == 0


# ------------------------------------------------- отмена не возвращает лимит
def test_cancel_deal_does_not_refund_limit():
    with limits_on():
        shipper, driver = "da-shipper-e", "da-driver-e"
        deals = [_accept_one(shipper, driver, f"deal-{i}") for i in range(5)]
        assert sub_dal.count_deal_accepts_this_period(shipper) == 5

        # 6-й accept — лимит исчерпан
        cargo_id = _seed_cargo(shipper)
        blocked_bid = _bid(driver, cargo_id)
        assert _accept_bid(shipper, blocked_bid).status_code == 402

        # отменяем одну из принятых сделок через реальный endpoint
        as_user(shipper)
        r = client.patch(f"/api/v1/market/deals/{deals[0]}/status?new_status=cancelled")
        assert r.status_code == 200, r.text

        # лимит НЕ вернулся: использовано по-прежнему 5, 6-й accept всё ещё 402
        assert sub_dal.count_deal_accepts_this_period(shipper) == 5
        assert _accept_bid(shipper, blocked_bid).status_code == 402


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  ok: {fn.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL: {fn.__name__}")
            traceback.print_exc()
    print(f"\n{'All passed' if not failed else str(failed) + ' FAILED'} ({len(tests)} tests)")
    sys.exit(1 if failed else 0)
