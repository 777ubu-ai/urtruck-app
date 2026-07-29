"""Сервис онлайн-табло — fetch → parse → save в cgr_scoreboard.

Поток А: реальную загруженность собираем агрегацией публичного реестра
/ru/registry/public-list?flStatus=Pending — считаем машины «В очереди» по
каждому пункту пропуска. Времени ожидания в публичных данных нет, поэтому
estimated_wait_minutes = None (показываем длину очереди, а не выдуманные часы).
"""
import logging

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRException
from .parsers import parse_public_list, parse_checkpoint_list
from .settings import cgr_settings

logger = logging.getLogger("cgr.scoreboard")

# Безопасный потолок страниц за один цикл (15 строк/стр). «В очереди» —
# небольшое подмножество реестра, обычно укладывается с запасом.
_MAX_PAGES = 80

# Страна-сосед по имени перехода CGR — fallback для агрегации, если имя из
# реестра ещё не засеяно из справочника. Авторитетная привязка теперь идёт
# через фильтр flBorderCountry в seed_checkpoints_from_cgr (ниже).
_CHECKPOINT_COUNTRY = {
    "Нур Жолы - Хоргос": "CN",
    "Достык - Алашанькоу": "CN",
    "Бахты - Покиту": "CN",
    "Калжат - Дулаты": "CN",
    "Майкапчагай - Зимунай": "CN",
}

# Коды стран в фильтре справочника CGR flBorderCountry.
_COUNTRY_FILTER = {"CN": "x045", "RU": "x181", "UZ": "x225", "KG": "x109", "TM": "x210"}


def _country_for(name: str) -> str:
    return _CHECKPOINT_COUNTRY.get(name, "XX")

# Метрики (см. backend/api/metrics.py для подключения)
_metrics_success = 0
_metrics_error = 0


async def seed_checkpoints_from_cgr() -> int:
    """Подтянуть официальный справочник переходов из CGR с авторитетной
    страной-соседом (фильтр flBorderCountry). Идемпотентно.

    CGR-сид — единственный источник переходов: после успешного сида гасим все
    остальные (легаси-строки с короткими именами «Нуржолы (Хоргос)»), иначе в
    ленте дубли (парное «Нур Жолы - Хоргос» + короткое «Нуржолы»)."""
    n = 0
    seeded_codes: list[str] = []
    for country, code in _COUNTRY_FILTER.items():
        try:
            html = await cgr_client.fetch_checkpoint_list(country_code=code)
            cps = parse_checkpoint_list(html)
        except (CGRException, Exception) as e:  # noqa: BLE001 — мягкий старт
            logger.warning("cgr.scoreboard: seed %s failed: %s", country, e)
            continue
        for cp in cps:
            seeded_codes.append(cgr_dal.upsert_checkpoint(name_ru=cp["name"], country_to=country))
            n += 1
    # Дедупликация: гасим легаси-переходы только если CGR реально отдал список
    # (иначе при сбое фетча не обнулим всё).
    if seeded_codes:
        killed = cgr_dal.deactivate_checkpoints_except(seeded_codes)
        if killed:
            logger.info("cgr.scoreboard: deactivated %d legacy (non-CGR) checkpoints", killed)
    logger.info("cgr.scoreboard: seeded %d checkpoints from CGR (by country)", n)
    return n


async def _aggregate_queue() -> dict[str, int]:
    """Проходит страницы public-list?flStatus=Pending, считает «В очереди»
    по каждому пункту. Останавливается на неполной/повторной странице."""
    totals: dict[str, int] = {}
    prev_sig = None
    for page in range(1, _MAX_PAGES + 1):
        html = await cgr_client.fetch_public_list(status="Pending", page=page)
        rows = parse_public_list(html)
        if not rows:
            break
        sig = (rows[0]["plate"], rows[0]["checkpoint"], len(rows))
        if sig == prev_sig:  # пагинация исчерпана — CGR вернул ту же страницу
            break
        prev_sig = sig
        for r in rows:
            if r["status"]["code"] == "in_queue" and r["checkpoint"]:
                totals[r["checkpoint"]] = totals.get(r["checkpoint"], 0) + 1
        if len(rows) < 15:  # последняя страница
            break
    return totals


async def fetch_board_rows(checkpoint: str | None = None,
                           status: str | None = None,
                           max_pages: int = 4) -> list[dict]:
    """Трек 1 — полное онлайн-табло: строки очереди (ГРНЗ + статус + слот) по
    пунктам пропуска. Публичные данные public-list, без авторизации. Опционально
    фильтр по пункту (подстрока) и статусу. Возвращает список
    {checkpoint, plate, queue_datetime, status:{code,is_late,raw}}.

    Переиспользует проверенный parse_public_list — новую разметку не парсим."""
    if not cgr_settings.feature_enabled:
        return []
    out: list[dict] = []
    prev_sig = None
    for page in range(1, max_pages + 1):
        html = await cgr_client.fetch_public_list(status=status, page=page)
        rows = parse_public_list(html)
        if not rows:
            break
        sig = (rows[0]["plate"], rows[0]["checkpoint"], len(rows))
        if sig == prev_sig:  # пагинация исчерпана
            break
        prev_sig = sig
        out.extend(rows)
        if len(rows) < 15:
            break
    if checkpoint:
        cl = checkpoint.strip().lower()
        out = [r for r in out if cl in (r.get("checkpoint") or "").lower()]
    return out


async def fetch_and_store() -> dict:
    """Цикл fetch → aggregate → store. Вызывается APScheduler'ом каждые
    CGR_SCOREBOARD_INTERVAL_MIN минут."""
    global _metrics_success, _metrics_error

    if not cgr_settings.feature_enabled:
        logger.info("cgr.scoreboard: feature disabled, skip")
        return {"skipped": True}

    try:
        totals = await _aggregate_queue()
    except CGRException as e:
        _metrics_error += 1
        logger.error("cgr.scoreboard: fetch failed: %s", e)
        return {"error": str(e)}

    # Записываем реальную длину очереди по каждому пункту. Для известных
    # переходов, которых нет в очереди прямо сейчас, пишем 0 (а не stale).
    stored = 0
    known = {cp["name_ru"]: cp["code"] for cp in cgr_dal.get_all_checkpoints(active_only=True)}
    names = set(totals) | set(known)
    for name in names:
        count = totals.get(name, 0)
        code = known.get(name) or cgr_dal.upsert_checkpoint(name_ru=name, country_to=_country_for(name))
        try:
            cgr_dal.insert_scoreboard_entry(
                checkpoint_code=code,
                direction="IN",
                queue_length=count,
                estimated_wait_minutes=None,  # публичные данные не дают времени
                raw_payload=None,
            )
            stored += 1
        except Exception as e:
            logger.exception("cgr.scoreboard: insert failed for %s: %s", code, e)

    _metrics_success += 1
    logger.info("cgr.scoreboard: stored %d checkpoints (in_queue totals)", stored)
    return {"checkpoints": stored, "total_in_queue": sum(totals.values())}


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
