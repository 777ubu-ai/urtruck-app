"""Фоновые задачи: парсинг и переоценка."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from database import db
from parsers import telegram_parser
from scoring.engine import calculate_score
from scheduler.backup_job import run_backup
from datetime import datetime


def parse_telegram_job():
    print(f"[{datetime.now().isoformat()}] TG parse start")
    try:
        n = telegram_parser.run()
        print(f"  processed {n} messages")
    except Exception as e:
        print(f"  ERROR: {e}")


def monthly_rescore_job():
    """Переоценка всех водителей — раз в месяц."""
    print(f"[{datetime.now().isoformat()}] Monthly rescore start")
    from database.db import get_conn
    with get_conn() as c:
        rows = c.execute("SELECT user_id FROM driver_scores").fetchall()
    for row in rows:
        try:
            calculate_score(row["user_id"], None)
        except Exception as e:
            print(f"  Error rescoring {row['user_id']}: {e}")
    print(f"  Rescored {len(rows)} drivers")


def push_reminders_job():
    """Ежедневное напоминание в 10:00 (по серверу):
    - неактивные (>3 дней без логина) → "Загляните в UrTruck, есть новые грузы";
    - по сохранённым маршрутам есть свежие грузы → "5 новых по Алматы→Иу".
    """
    from datetime import timedelta
    from database.db import get_conn
    from services import push_sender

    now = datetime.utcnow()
    threshold = (now - timedelta(days=3)).isoformat()
    cnt = {"inactive": 0, "route_match": 0}

    # 1) Неактивные водители с токенами
    with get_conn() as c:
        # Все юзеры у которых есть хоть один push-токен и нет активности больше 3 дней
        rows = c.execute("""
            SELECT DISTINCT d.id, d.full_name
            FROM drivers_registration d
            WHERE d.status = 'approved'
              AND d.role IN ('driver', 'client')
              AND (d.updated_at IS NULL OR d.updated_at < ?)
              AND (
                EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = d.id)
                OR EXISTS (SELECT 1 FROM push_tokens_native WHERE user_id = d.id)
              )
              AND NOT EXISTS (
                SELECT 1 FROM push_log
                WHERE user_id = d.id AND kind = 'reminder'
                  AND created_at > ?
              )
            LIMIT 200
        """, (threshold, (now - timedelta(hours=20)).isoformat())).fetchall()
    for r in rows:
        try:
            push_sender.send(
                r["id"],
                "🚛 UrTruck ждёт вас",
                "Есть новые грузы. Загляните в ленту.",
                kind="reminder",
                url="/",
            )
            cnt["inactive"] += 1
        except Exception as e:
            print(f"  reminder err {r['id']}: {e}")

    # 2) Сохранённые маршруты: новые грузы по ним за последние 24 часа
    day_ago = (now - timedelta(hours=24)).isoformat()
    try:
        with get_conn() as c:
            saved = c.execute("""
                SELECT s.user_id, s.from_city, s.to_city,
                       (SELECT COUNT(*) FROM cargos c
                        WHERE c.from_city = s.from_city AND c.to_city = s.to_city
                          AND c.created_at > ?) AS cnt
                FROM saved_searches s
                WHERE EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = s.user_id)
                   OR EXISTS (SELECT 1 FROM push_tokens_native WHERE user_id = s.user_id)
            """, (day_ago,)).fetchall()
        for r in saved:
            if (r["cnt"] or 0) < 1:
                continue
            try:
                push_sender.send(
                    r["user_id"],
                    f"📦 {r['cnt']} новых грузов",
                    f"{r['from_city']} → {r['to_city']}",
                    kind="reminder",
                    data={"from": r["from_city"], "to": r["to_city"]},
                    url="/",
                )
                cnt["route_match"] += 1
            except Exception:
                pass
    except Exception as e:
        print(f"  saved_searches reminder err: {e}")

    print(f"[{now.isoformat()}] reminders: inactive={cnt['inactive']} route_match={cnt['route_match']}")


def expired_notify_job():
    """Ежедневно (Модель А): владельцам грузов/рейсов шлём напоминания по
    нарастающей, пока публикация «стареет» (день выезда +1, +2, +3):
      +1 день — «Ещё актуально?» (ещё в ленте)
      +2 дня  — «Завтра уберём из ленты»
      +3 дня  — «Убрано из ленты — вернуть?»
    Дальше не напоминаем (без спама). Дедуп на пользователя через push_log
    (kind='expired'). Продление — одним тапом «Ещё актуально» в приложении."""
    from datetime import timedelta
    from database.db import get_conn
    from services import push_sender

    now = datetime.utcnow()
    today = now.date()

    def _pd(s):
        s = str(s or "").strip()
        for fmt, cut in (("%Y-%m-%d", 10), ("%d.%m.%Y", None)):
            try:
                return datetime.strptime(s[:cut] if cut else s, fmt).date()
            except Exception:
                pass
        return None

    # user_id -> самая срочная стадия (1..3) среди его стареющих публикаций
    urgency = {}
    try:
        with get_conn() as c:
            cargos = c.execute("SELECT owner_id AS uid, pickup_date AS d FROM cargos WHERE status = 'active'").fetchall()
            trips = c.execute("SELECT driver_id AS uid, departure AS d FROM trips WHERE status = 'active'").fetchall()
        for r in list(cargos) + list(trips):
            dd = _pd(r["d"])
            if not r["uid"] or not dd:
                continue
            days_past = (today - dd).days
            if 1 <= days_past <= 3:
                urgency[r["uid"]] = max(urgency.get(r["uid"], 0), days_past)
    except Exception as e:
        print(f"  expired-notify query err: {e}")
        return

    MSG = {
        1: ("🕐 Ваша публикация ещё актуальна?", "Продлите одним тапом — «Ещё актуально»."),
        2: ("⏳ Завтра уберём из ленты", "Груз/рейс скоро исчезнет из поиска. Продлить?"),
        3: ("📭 Публикация убрана из ленты", "Хотите вернуть? Нажмите «Ещё актуально»."),
    }
    thresh = (now - timedelta(hours=20)).isoformat()
    sent = 0
    for uid, dp in urgency.items():
        try:
            with get_conn() as c:
                dup = c.execute(
                    "SELECT 1 FROM push_log WHERE user_id = ? AND kind = 'expired' AND created_at > ?",
                    (uid, thresh)).fetchone()
            if dup:
                continue
            title, body = MSG[dp]
            push_sender.send(uid, title, body, kind="expired", url="/")
            sent += 1
        except Exception as e:
            print(f"  expired push err {uid}: {e}")
    print(f"[{now.isoformat()}] expired-notify: sent={sent}")


def no_bids_notify_job():
    """Проактивная подсказка владельцу, если на груз/рейс за 18+ часов не
    пришло ни одной ставки (стандарт бирж грузоперевозок — Della/АТИ дают
    похожую нотификацию + предлагают поднять/скорректировать цену). Раз в
    жизни публикации — дедуп через push_log(kind='no_bids'), не спамим."""
    from datetime import timedelta
    from database.db import get_conn
    from services import push_sender

    now = datetime.utcnow()
    threshold = (now - timedelta(hours=18)).isoformat()
    dedup_thresh = (now - timedelta(hours=20)).isoformat()  # шире окна проверки — шлём 1 раз
    sent = 0

    with get_conn() as c:
        cargos = c.execute("""
            SELECT id, owner_id, from_city, to_city FROM cargos
            WHERE status = 'active' AND bids_count = 0 AND created_at < ?
        """, (threshold,)).fetchall()
        trips = c.execute("""
            SELECT t.id, t.driver_id, t.from_city, t.to_city FROM trips t
            WHERE t.status = 'active' AND t.created_at < ?
              AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.trip_id = t.id)
        """, (threshold,)).fetchall()

    def already_sent(uid, entity_id):
        with get_conn() as c:
            return bool(c.execute(
                "SELECT 1 FROM push_log WHERE user_id = ? AND kind = 'no_bids' "
                "AND data_json LIKE ? AND created_at > ?",
                (uid, f"%{entity_id}%", dedup_thresh)).fetchone())

    for cid, owner_id, fr, to in cargos:
        if not owner_id or already_sent(owner_id, cid):
            continue
        try:
            push_sender.send(
                owner_id, "📦 Пока нет предложений",
                f"{fr} → {to} · 18 часов без ставок. Возможно, стоит скорректировать цену?",
                kind="no_bids", data={"cargo_id": cid}, url="/",
            )
            sent += 1
        except Exception as e:
            print(f"  no_bids cargo err {cid}: {e}")

    for tid, driver_id, fr, to in trips:
        if not driver_id or already_sent(driver_id, tid):
            continue
        try:
            push_sender.send(
                driver_id, "🚛 Пока нет предложений",
                f"{fr} → {to} · 18 часов без предложений на рейс. Возможно, стоит скорректировать цену?",
                kind="no_bids", data={"trip_id": tid}, url="/",
            )
            sent += 1
        except Exception as e:
            print(f"  no_bids trip err {tid}: {e}")

    print(f"[{now.isoformat()}] no-bids-notify: sent={sent}")


def start_scheduler():
    sched = BackgroundScheduler()
    # Парсинг каждые 6 часов
    sched.add_job(parse_telegram_job, IntervalTrigger(hours=6), id="telegram_parse")
    # Переоценка 1-го числа каждого месяца в 03:00
    sched.add_job(monthly_rescore_job, CronTrigger(day=1, hour=3, minute=0), id="monthly_rescore")
    # Бэкап БД каждый час
    sched.add_job(run_backup, IntervalTrigger(hours=1), id="db_backup")
    # Бот-напоминания: 10:00 UTC+6 (04:00 UTC) = Алматы утро
    sched.add_job(push_reminders_job, CronTrigger(hour=4, minute=0), id="push_reminders")
    # Уведомление о просроченных публикациях: 05:00 UTC (11:00 Алматы)
    sched.add_job(expired_notify_job, CronTrigger(hour=5, minute=0), id="expired_notify")
    # «Пока нет предложений» (18ч без ставок) — проверяем каждые 3 часа,
    # дедуп по data_json удерживает один пуш на публикацию.
    sched.add_job(no_bids_notify_job, IntervalTrigger(hours=3), id="no_bids_notify")
    sched.start()
    print("Scheduler started: TG-parse 6h, rescore monthly, DB backup hourly, reminders 10:00 Almaty, no-bids 3h")
    return sched


if __name__ == "__main__":
    db.init_db()
    sched = start_scheduler()
    # Первый запуск парсера сразу
    parse_telegram_job()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        sched.shutdown()
