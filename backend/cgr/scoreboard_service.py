"""Сервис онлайн-табло — fetch → parse → save в cgr_scoreboard."""
import logging

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRException
from .parsers import parse_scoreboard
from .settings import cgr_settings

logger = logging.getLogger("cgr.scoreboard")


# Метрики (см. backend/api/metrics.py для подключения)
_metrics_success = 0
_metrics_error = 0


async def fetch_and_store() -> dict:
    """Цикл fetch → parse → store. Вызывается APScheduler'ом каждые
    CGR_SCOREBOARD_INTERVAL_MIN минут.

    Returns:
        Сводка для логов: {'fetched_at': str, 'entries': int, 'errors': int}
    """
    global _metrics_success, _metrics_error

    if not cgr_settings.feature_enabled:
        logger.info("cgr.scoreboard: feature disabled, skip")
        return {"skipped": True}

    try:
        payload = await cgr_client.fetch_scoreboard()
        entries = parse_scoreboard(payload)
    except NotImplementedError:
        logger.warning(
            "cgr.scoreboard: parser not implemented yet — "
            "see docs/cgr/CGR_DISCOVERY.md before enabling"
        )
        return {"skipped": True, "reason": "parser_pending_discovery"}
    except CGRException as e:
        _metrics_error += 1
        logger.error("cgr.scoreboard: fetch failed: %s", e)
        # TODO: Sentry capture после подключения sentry-sdk
        return {"error": str(e)}

    stored = 0
    for entry in entries:
        try:
            cgr_dal.insert_scoreboard_entry(
                checkpoint_code=entry.checkpoint_code,
                direction=entry.direction,
                queue_length=entry.queue_length,
                estimated_wait_minutes=entry.estimated_wait_minutes,
                raw_payload=None,
            )
            stored += 1
        except Exception as e:
            logger.exception("cgr.scoreboard: insert failed for %s: %s", entry.checkpoint_code, e)

    _metrics_success += 1
    logger.info("cgr.scoreboard: stored %d entries", stored)
    return {"entries": stored}


def metrics() -> dict[str, int]:
    """Для подключения в /metrics — счётчики успешных/неудачных fetch'ей."""
    return {"success": _metrics_success, "error": _metrics_error}


def build_scoreboard_response() -> dict:
    """Собирает ответ для эндпоинта GET /api/v1/borders/scoreboard.

    Объединяет border_checkpoints + последние записи cgr_scoreboard.
    Если данные старше 60 мин — status='stale'.
    """
    from datetime import datetime, timedelta, timezone

    checkpoints = cgr_dal.get_all_checkpoints(active_only=True)
    latest = cgr_dal.get_latest_scoreboard()
    # index by (code, direction)
    latest_idx: dict[tuple[str, str], dict] = {
        (r["checkpoint_code"], r["direction"]): r for r in latest
    }

    now = datetime.now(timezone.utc)
    stale_threshold = timedelta(minutes=60)

    out = []
    for cp in checkpoints:
        in_row = latest_idx.get((cp["code"], "IN"))
        out_row = latest_idx.get((cp["code"], "OUT"))

        most_recent = None
        for row in (in_row, out_row):
            if row and row.get("fetched_at"):
                try:
                    t = datetime.fromisoformat(row["fetched_at"].replace("Z", "+00:00"))
                except ValueError:
                    t = None
                if t and (most_recent is None or t > most_recent):
                    most_recent = t

        if most_recent is None:
            status = "unavailable"
        elif (now - most_recent.replace(tzinfo=timezone.utc) if most_recent.tzinfo is None else now - most_recent) > stale_threshold:
            status = "stale"
        else:
            status = "ok"

        out.append({
            "code": cp["code"],
            "name_ru": cp["name_ru"],
            "name_kz": cp.get("name_kz"),
            "name_cn": cp.get("name_cn"),
            "name_en": cp.get("name_en"),
            "country_to": cp["country_to"],
            "directions": {
                "in": {
                    "queue_length": in_row["queue_length"] if in_row else None,
                    "estimated_wait_minutes": in_row["estimated_wait_minutes"] if in_row else None,
                },
                "out": {
                    "queue_length": out_row["queue_length"] if out_row else None,
                    "estimated_wait_minutes": out_row["estimated_wait_minutes"] if out_row else None,
                },
            },
            "status": status,
            "last_updated": most_recent.isoformat() if most_recent else None,
        })

    return {"fetched_at": now.isoformat(), "checkpoints": out}
