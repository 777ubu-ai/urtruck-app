"""APScheduler jobs for CGR integration.

Driver-facing checkpoint data is intentionally lazy: the Border screen loads a
local catalogue, and CGR is contacted only after a driver taps a checkpoint.
Therefore there is no periodic all-checkpoint scoreboard crawl here.

Background jobs kept here are user-specific or operational:
- active booking poll;
- queue-watch push alerts;
- one-time checkpoint catalogue seed on backend start.
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("cgr.scheduler")

_scheduler: AsyncIOScheduler | None = None


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
    """Seed only the lightweight checkpoint catalogue.

    Do NOT fetch current queue/booking data here. Those are loaded per checkpoint
    after an explicit driver tap and cached by checkpoint_detail_service.
    """
    from cgr import scoreboard_service
    try:
        seeded = await scoreboard_service.seed_checkpoints_from_cgr()
        logger.info("cgr.scheduler: bootstrap catalog seeded=%s (live fetch deferred until tap)", seeded)
    except Exception:
        logger.exception("cgr.scheduler: bootstrap crashed")


def start() -> AsyncIOScheduler | None:
    """Idempotent scheduler start."""
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
        _booking_poll_job,
        IntervalTrigger(minutes=cgr_settings.booking_poll_interval_min),
        id="cgr_booking_poll",
        name="CGR active bookings poll",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Blocklist refresh stays disabled until its PII parser is implemented.

    from datetime import datetime, timedelta, timezone
    s.add_job(
        _bootstrap_job,
        "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=5),
        id="cgr_bootstrap",
        name="CGR checkpoint catalogue seed",
        max_instances=1,
    )

    s.start()
    _scheduler = s
    logger.info(
        "cgr.scheduler: started — lazy checkpoint live data; bookings every %dm; queue-watch every 10m",
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
