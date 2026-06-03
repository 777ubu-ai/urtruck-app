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

    s = AsyncIOScheduler(timezone="UTC")
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
    s.add_job(
        _blocklist_job,
        CronTrigger.from_crontab(cgr_settings.blocklist_cron, timezone="UTC"),
        id="cgr_blocklist",
        name="CGR blocklist daily refresh",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )

    s.start()
    _scheduler = s
    logger.info(
        "cgr.scheduler: started — scoreboard every %dm, bookings every %dm, blocklist '%s'",
        cgr_settings.scoreboard_interval_min,
        cgr_settings.booking_poll_interval_min,
        cgr_settings.blocklist_cron,
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
