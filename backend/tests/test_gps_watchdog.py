"""Регрессия P1 (release/reconcile-20260901 §1) — GPS watchdog.

До этого коммита trip.gps_lost/trip.gps_restored существовали только как
строки-имена в каталоге push-событий — реального детектора не было.
Проверяем: healthy→lost даёт РОВНО один trip.gps_lost, повторные тики без
смены состояния молчат (не спамят), lost→healthy даёт РОВНО один
trip.gps_restored, а после completed/cancelled watchdog для сделки
больше не срабатывает.

Самодостаточно: своя БД, уникальные id. Все проверки scoped на конкретный
deal_id (а не на агрегатный "checked"/"lost" счётчик всего тика) — тесты
внутри одного файла делят одну БД без сброса между собой, поэтому старые
сделки прошлых тестов остаются на месте и попали бы в общий счётчик.
"""
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_gps_watchdog.db")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

import api.marketplace as marketplace
marketplace._init()

import pytest
from database.db import get_conn
from services import gps_watchdog


@pytest.fixture(autouse=True)
def _no_real_push(monkeypatch):
    """Изолируем от реальной сети — считаем вызовы, не отправляем ничего."""
    calls = []

    def _fake_send(user_id, title, body, kind="info", data=None, url="/"):
        calls.append({"user_id": user_id, "kind": kind, "data": data or {}})
        return {"web": 0, "native": 0, "total": 0}

    import services.push_sender as real_push_sender
    monkeypatch.setattr(real_push_sender, "send", _fake_send)
    yield calls


def _for_deal(calls, deal_id, event=None):
    return [c for c in calls if c["data"].get("deal_id") == deal_id and (event is None or c["data"].get("event") == event)]


def _mk_users(*uids):
    with get_conn() as c:
        for uid in uids:
            c.execute(
                "INSERT OR IGNORE INTO drivers_registration (id, full_name, phone, status, verification_level) "
                "VALUES (?, ?, ?, 'approved', 3)",
                (uid, uid, "+7" + uid[:6]),
            )


def _mk_deal_with_tracking(*, deal_status="in_progress", tracking_status="active",
                            last_signal_ago_seconds=None, gps_signal_state=None):
    shipper = "ship_" + uuid.uuid4().hex[:8]
    driver = "drv_" + uuid.uuid4().hex[:8]
    _mk_users(shipper, driver)
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (deal_id, "cargo_" + uuid.uuid4().hex[:8], None, "bid_" + uuid.uuid4().hex[:8],
             shipper, driver, "Almaty", "Urumqi", 1000, deal_status),
        )
        last_signal_at = None
        if last_signal_ago_seconds is not None:
            last_signal_at = (datetime.utcnow() - timedelta(seconds=last_signal_ago_seconds)).strftime("%Y-%m-%d %H:%M:%S")
        cols = {r["name"] for r in c.execute("PRAGMA table_info(deal_tracking)").fetchall()}
        if "gps_signal_state" not in cols:
            c.execute("ALTER TABLE deal_tracking ADD COLUMN gps_signal_state TEXT NOT NULL DEFAULT 'healthy'")
        c.execute(
            "INSERT INTO deal_tracking (deal_id, status, requested_by, requested_at, responded_at, last_signal_at, gps_signal_state, updated_at) "
            "VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,CURRENT_TIMESTAMP)",
            (deal_id, tracking_status, shipper, last_signal_at, gps_signal_state or "healthy"),
        )
    return deal_id, shipper, driver


def _state(deal_id):
    with get_conn() as c:
        row = c.execute("SELECT gps_signal_state FROM deal_tracking WHERE deal_id = ?", (deal_id,)).fetchone()
    return row["gps_signal_state"] if row else None


def test_healthy_stays_healthy_when_signal_is_fresh(_no_real_push):
    deal_id, *_ = _mk_deal_with_tracking(last_signal_ago_seconds=10)
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "healthy"
    assert _for_deal(_no_real_push, deal_id) == []


def test_stale_signal_fires_exactly_one_gps_lost(_no_real_push):
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, shipper, driver = _mk_deal_with_tracking(last_signal_ago_seconds=threshold + 30)
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "lost"
    lost_calls = _for_deal(_no_real_push, deal_id, "trip.gps_lost")
    assert len(lost_calls) == 1
    assert lost_calls[0]["user_id"] == shipper


def test_repeated_ticks_while_still_lost_do_not_spam(_no_real_push):
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, *_ = _mk_deal_with_tracking(last_signal_ago_seconds=threshold + 30)
    gps_watchdog.check_gps_watchdog()
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_lost")) == 1
    for _ in range(5):
        gps_watchdog.check_gps_watchdog()
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_lost")) == 1, "повторный gps_lost на каждом tick — запрещено"
    assert _state(deal_id) == "lost"


def test_signal_restored_fires_exactly_one_gps_restored(_no_real_push):
    deal_id, shipper, driver = _mk_deal_with_tracking(last_signal_ago_seconds=5, gps_signal_state="lost")
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "healthy"
    restored_calls = _for_deal(_no_real_push, deal_id, "trip.gps_restored")
    assert len(restored_calls) == 1
    assert restored_calls[0]["user_id"] == shipper
    for _ in range(3):
        gps_watchdog.check_gps_watchdog()
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_restored")) == 1, "повторный gps_restored на каждом tick — запрещено"


def test_full_cycle_lost_then_restored_then_lost_again(_no_real_push):
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, *_ = _mk_deal_with_tracking(last_signal_ago_seconds=threshold + 30)
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "lost"
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_lost")) == 1

    with get_conn() as c:
        c.execute("UPDATE deal_tracking SET last_signal_at = CURRENT_TIMESTAMP WHERE deal_id = ?", (deal_id,))
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "healthy"
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_restored")) == 1

    with get_conn() as c:
        stale_ts = (datetime.utcnow() - timedelta(seconds=threshold + 30)).strftime("%Y-%m-%d %H:%M:%S")
        c.execute("UPDATE deal_tracking SET last_signal_at = ? WHERE deal_id = ?", (stale_ts, deal_id))
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "lost", "второй цикл потери сигнала на той же сделке обязан снова сработать"
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_lost")) == 2


def test_no_signal_yet_is_not_treated_as_lost(_no_real_push):
    deal_id, *_ = _mk_deal_with_tracking(last_signal_ago_seconds=None)
    gps_watchdog.check_gps_watchdog()
    assert _state(deal_id) == "healthy", "трекинг только что разрешён, первая точка ещё не пришла — это не потеря сигнала"
    assert _for_deal(_no_real_push, deal_id) == []


def test_inactive_tracking_is_never_checked(_no_real_push):
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, *_ = _mk_deal_with_tracking(tracking_status="stopped", last_signal_ago_seconds=threshold + 999)
    gps_watchdog.check_gps_watchdog()
    assert _for_deal(_no_real_push, deal_id) == []
    assert _state(deal_id) == "healthy", "stopped-трекинг не должен получить state=lost, раз watchdog его не проверяет"


def test_watchdog_stops_after_deal_completed(_no_real_push):
    """После completed/cancelled watchdog для сделки больше не работает —
    даже если last_signal_at продолжает быть древним."""
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, *_ = _mk_deal_with_tracking(deal_status="in_progress", last_signal_ago_seconds=threshold + 30)
    gps_watchdog.check_gps_watchdog()
    assert len(_for_deal(_no_real_push, deal_id, "trip.gps_lost")) == 1

    with get_conn() as c:
        c.execute("UPDATE deals SET status = 'completed' WHERE id = ?", (deal_id,))
    for _ in range(3):
        gps_watchdog.check_gps_watchdog()
    # Никаких НОВЫХ событий для этой сделки после completed — второй gps_lost
    # не появился бы, но проверяем и restored: искусственно "восстановим"
    # last_signal_at и убедимся, что даже это больше не меняет state.
    with get_conn() as c:
        c.execute("UPDATE deal_tracking SET last_signal_at = CURRENT_TIMESTAMP WHERE deal_id = ?", (deal_id,))
    gps_watchdog.check_gps_watchdog()
    assert _for_deal(_no_real_push, deal_id, "trip.gps_restored") == [], "completed-сделка не должна больше проверяться watchdog'ом"
    assert _state(deal_id) == "lost", "state замер на моменте completed — watchdog его больше не трогает"


def test_watchdog_stops_after_deal_cancelled(_no_real_push):
    threshold = gps_watchdog.GPS_LOST_THRESHOLD_SECONDS
    deal_id, *_ = _mk_deal_with_tracking(deal_status="at_border", last_signal_ago_seconds=threshold + 30)
    with get_conn() as c:
        c.execute("UPDATE deals SET status = 'cancelled' WHERE id = ?", (deal_id,))
    gps_watchdog.check_gps_watchdog()
    assert _for_deal(_no_real_push, deal_id) == []
    assert _state(deal_id) == "healthy", "watchdog не должен трогать уже отменённую сделку вообще"
