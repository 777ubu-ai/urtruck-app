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
    sched.start()
    print("Scheduler started: TG-parse 6h, rescore monthly, DB backup hourly, reminders 10:00 Almaty")
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
