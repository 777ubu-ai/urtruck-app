"""GPS watchdog — детектор потери/восстановления сигнала активного рейса.

P1 (release/reconcile-20260901 §1). До этого коммита `trip.gps_lost` /
`trip.gps_restored` существовали только как строки-имена в каталоге
push-событий (push_gateway.py) — реального детектора не было вообще.

Модель: deal_tracking.last_signal_at обновляется на каждый успешный
POST /deals/{id}/location (marketplace.py::update_deal_location). Водитель
шлёт координаты раз в ~25с (src/hooks/useDealLocationBroadcast.js), поэтому
"тишина" дольше GPS_LOST_THRESHOLD_SECONDS — реальный признак потери связи
(типично — граница), а не просто редкий тик.

Идемпотентность: per-deal состояние хранится в deal_tracking.gps_signal_state
('healthy' | 'lost'). Переход healthy→lost создаёт РОВНО ОДИН trip.gps_lost
(следующие тики видят state уже 'lost' и молчат — требование "не слать
повторный gps_lost на каждый tick"). Переход lost→healthy — ровно один
trip.gps_restored. Обычный watch-тик без перехода не шлёт ничего.

Область действия watchdog'а — только deal_tracking.status='active' AND
deals.status IN ('in_progress','at_border'): как только сделка уходит в
delivered/received/completed/cancelled (или трекинг остановлен), она
перестаёт возвращаться этим запросом и watchdog для неё больше не
срабатывает — без отдельной очистки состояния.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

from database.db import get_conn

# Сколько секунд без нового сигнала считается потерей связи. Клиент шлёт
# точку раз в 25с (INTERVAL_MS в useDealLocationBroadcast.js) — порог с
# запасом на пропущенные тики/задержку сети, но не настолько большой, чтобы
# реальная потеря на границе долго оставалась незамеченной.
GPS_LOST_THRESHOLD_SECONDS = int(os.getenv("GPS_LOST_THRESHOLD_SECONDS", "180"))

_ACTIVE_TRIP_STATUSES = ("in_progress", "at_border")


def _ensure_watchdog_column() -> None:
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(deal_tracking)").fetchall()}
        if "gps_signal_state" not in cols:
            c.execute("ALTER TABLE deal_tracking ADD COLUMN gps_signal_state TEXT NOT NULL DEFAULT 'healthy'")


def _parse_ts(raw) -> datetime | None:
    if not raw:
        return None
    try:
        # SQLite CURRENT_TIMESTAMP — naive UTC "YYYY-MM-DD HH:MM:SS".
        return datetime.strptime(str(raw)[:19], "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _notify(user_id: str, kind: str, gateway_event: str, title: str, body: str, deal_id: str) -> None:
    """Единый существующий push-gateway — то же, чем шлёт _tracking_notify()
    в marketplace.py. Best-effort: watchdog не должен падать из-за push.
    gateway_event — точная строка из push_gateway.PUSH_EVENT_CATALOG
    ("trip.gps_lost" / "trip.gps_restored"), kind — локальный ярлык для
    create_notification/логов (может отличаться от gateway_event)."""
    try:
        from api.notifications import create_notification
        create_notification(user_id, kind, title, body, "📡", url=f"/deals/{deal_id}?action=tracking")
    except Exception:
        pass
    try:
        from services import push_sender
        push_sender.send(
            user_id, title, body, kind=kind,
            data={"event": gateway_event, "deal_id": deal_id, "action": "tracking"},
            url=f"/deals/{deal_id}?action=tracking",
        )
    except Exception:
        pass


def check_gps_watchdog() -> dict:
    """Один тик watchdog'а. Возвращает {"checked": N, "lost": N, "restored": N}
    — вызывающий (scheduler job или тест) может проверить результат."""
    _ensure_watchdog_column()
    now = datetime.utcnow()
    result = {"checked": 0, "lost": 0, "restored": 0}

    with get_conn() as c:
        placeholders = ",".join("?" for _ in _ACTIVE_TRIP_STATUSES)
        rows = c.execute(
            f"SELECT dt.deal_id, dt.last_signal_at, dt.gps_signal_state, "
            f"d.shipper_id, d.driver_id "
            f"FROM deal_tracking dt JOIN deals d ON d.id = dt.deal_id "
            f"WHERE dt.status = 'active' AND d.status IN ({placeholders})",
            _ACTIVE_TRIP_STATUSES,
        ).fetchall()

        for row in rows:
            result["checked"] += 1
            last_signal = _parse_ts(row["last_signal_at"])
            state = row["gps_signal_state"] or "healthy"
            if last_signal is None:
                # Трекинг разрешён, но ни одной точки ещё не пришло — рано
                # делать вывод (первая точка ещё в пути / permission flow не
                # завершён). Не считаем это потерей сигнала.
                continue
            stale = (now - last_signal) > timedelta(seconds=GPS_LOST_THRESHOLD_SECONDS)

            if stale and state != "lost":
                c.execute(
                    "UPDATE deal_tracking SET gps_signal_state = 'lost' WHERE deal_id = ?",
                    (row["deal_id"],),
                )
                result["lost"] += 1
                _notify(row["shipper_id"], "gps_signal_lost", "trip.gps_lost",
                        "Связь с водителем потеряна",
                        "GPS водителя не обновлялся несколько минут — возможно, граница или плохая связь.",
                        row["deal_id"])
            elif not stale and state == "lost":
                c.execute(
                    "UPDATE deal_tracking SET gps_signal_state = 'healthy' WHERE deal_id = ?",
                    (row["deal_id"],),
                )
                result["restored"] += 1
                _notify(row["shipper_id"], "gps_signal_restored", "trip.gps_restored",
                        "Связь с водителем восстановлена",
                        "GPS водителя снова обновляется в реальном времени.",
                        row["deal_id"])
            # else: состояние не изменилось — ничего не шлём (idempotent tick).

    return result


def gps_watchdog_job() -> None:
    """Точка входа для APScheduler — тонкая обёртка с логом, без бизнес-логики."""
    try:
        r = check_gps_watchdog()
        if r["lost"] or r["restored"]:
            print(f"[gps-watchdog] checked={r['checked']} lost={r['lost']} restored={r['restored']}")
    except Exception as e:
        print(f"[gps-watchdog] ERROR: {e}")
