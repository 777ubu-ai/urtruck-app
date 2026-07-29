"""APScheduler-задачи для CGR-интеграции.

Использует AsyncIOScheduler (async-friendly) — отдельный от существующего
BackgroundScheduler в scheduler/jobs.py, чтобы не путать sync/async код.

Запускается из main.py @app.on_event("startup") если CGR_FEATURE_ENABLED=true.
Останавливается на shutdown.

Расписание (TZ §8 + раздел 3 чеклиста):
  - scoreboard fetch: каждые CGR_SCOREBOARD_INTERVAL_MIN (default 5)
  - booking poll:     каждые CGR_BOOKING_POLL_INTERVAL_MIN (default 15)
  - blocklist refresh: cron CGR_BLOCKLIST_CRON (default '0 3 * * *')
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("cgr.scheduler")

_scheduler: AsyncIOScheduler | None = None


async def _scoreboard_job():
    from cgr import scoreboard_service
    try:
        result = await scoreboard_service.fetch_and_store()
        logger.info("cgr.scheduler: scoreboard_job: %s", result)
    except Exception:
        logger.exception("cgr.scheduler: scoreboard_job crashed")


async def _booking_poll_job():
    from cgr import booking_service
    try:
        result = await booking_service.poll_active()
        logger.info("cgr.scheduler: booking_poll_job: %s", result)
    except Exception:
        logger.exception("cgr.scheduler: booking_poll_job crashed")


async def _queue_watch_job():
    from cgr import queue_watch
    try:
        result = await queue_watch.check_watches()
        logger.info("cgr.scheduler: queue_watch_job: %s", result)
    except Exception:
        logger.exception("cgr.scheduler: queue_watch_job crashed")


async def _bootstrap_job():
    """Разовый старт: засеять справочник переходов из CGR и сразу собрать
    первое табло, чтобы данные были доступны не дожидаясь первого интервала."""
    from cgr import scoreboard_service
    try:
        seeded = await scoreboard_service.seed_checkpoints_from_cgr()
        result = await scoreboard_service.fetch_and_store()
        logger.info("cgr.scheduler: bootstrap seeded=%s fetch=%s", seeded, result)
    except Exception:
        logger.exception("cgr.scheduler: bootstrap crashed")


async def _blocklist_job():
    from cgr import blocklist_service
    try:
        result = await blocklist_service.refresh_blocklist()
        logger.info("cgr.scheduler: blocklist_job: %s", result)
    except Exception:
        logger.exception("cgr.scheduler: blocklist_job crashed")


def start() -> AsyncIOScheduler | None:
    """Идемпотентный старт. Возвращает scheduler если стартанул, None если выключен."""
    global _scheduler

    try:
        from cgr.settings import cgr_settings
    except Exception as e:
        logger.warning("cgr.scheduler: settings unavailable, scheduler not started: %s", e)
        return None

    if not cgr_settings.feature_enabled:
        logger.info("cgr.scheduler: CGR_FEATURE_ENABLED=false, scheduler not started")
        return None

    if _scheduler is not None:
        logger.warning("cgr.scheduler: already running, skip")
        return _scheduler

    # Таблица watch'ей для пуш-алерта «очередь подошла».
    try:
        from cgr import queue_watch
        queue_watch.init_schema()
    except Exception:
        logger.exception("cgr.scheduler: queue_watch init_schema failed")

    s = AsyncIOScheduler(timezone="UTC")
    s.add_job(
        _queue_watch_job,
        IntervalTrigger(minutes=10),
        id="cgr_queue_watch",
        name="CGR queue-watch push alerts",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    s.add_job(
        _scoreboard_job,
        IntervalTrigger(minutes=cgr_settings.scoreboard_interval_min),
        id="cgr_scoreboard",
        name="CGR scoreboard fetch",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    s.add_job(
        _booking_poll_job,
        IntervalTrigger(minutes=cgr_settings.booking_poll_interval_min),
        id="cgr_booking_poll",
        name="CGR active bookings poll",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    # Blocklist-job НЕ регистрируем: parse_blocklist_page ещё не реализован
    # (этап разведки 1.4, PII). Иначе cron в 03:00 падал бы каждый день.
    # Вернуть после реализации парсера блок-листа.

    # Разовый bootstrap почти сразу после старта (сид справочника + первое табло).
    from datetime import datetime, timedelta, timezone
    s.add_job(
        _bootstrap_job,
        "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=5),
        id="cgr_bootstrap",
        name="CGR bootstrap seed+fetch",
        max_instances=1,
    )

    s.start()
    _scheduler = s
    logger.info(
        "cgr.scheduler: started — scoreboard every %dm, bookings every %dm (blocklist disabled until parser ready)",
        cgr_settings.scoreboard_interval_min,
        cgr_settings.booking_poll_interval_min,
    )
    return s


def stop() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            logger.exception("cgr.scheduler: shutdown error")
        _scheduler = None
