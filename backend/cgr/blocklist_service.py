"""Сервис чёрного списка CGR.

⚠️ ПРАВИЛА (см. TZ §3.4 + раздел 6 чеклиста):
  1. Автоматического бана НЕТ — только pending_review запись для модератора
  2. ИИН — только хэш, открытый ИИН НИКОГДА не покидает parsers.py
  3. Данные третьих лиц НИКОГДА не отдаются в публичных API UrTruck
  4. Доступ к таблице cgr_blocklist — только из этого модуля
"""
import logging

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRException
from .parsers import parse_blocklist_page
from .settings import cgr_settings

logger = logging.getLogger("cgr.blocklist")


# Метрики
_metrics_matches = 0


async def refresh_blocklist() -> dict:
    """Cron: ежедневно в 03:00 — полное обновление чёрного списка.

    Раздел 5.1 чеклиста + 6.1.
    """
    if not cgr_settings.feature_enabled:
        return {"skipped": True}

    all_entries = []
    page = 1
    while True:
        try:
            payload = await cgr_client.fetch_blocklist_page(page=page)
            entries = list(parse_blocklist_page(payload, iin_salt=cgr_settings.iin_salt))
        except NotImplementedError:
            logger.warning("cgr.blocklist: parser not implemented (waiting on discovery)")
            return {"skipped": True, "reason": "parser_pending_discovery"}
        except CGRException as e:
            logger.error("cgr.blocklist: fetch page %d failed: %s", page, e)
            return {"error": str(e), "fetched_pages": page - 1}

        if not entries:
            break

        all_entries.extend([e.model_dump() for e in entries])
        page += 1
        if page > 200:
            logger.warning("cgr.blocklist: pagination cap reached (200 pages)")
            break

    inserted = cgr_dal.replace_blocklist(all_entries)
    logger.info("cgr.blocklist: refresh done, %d entries", inserted)
    return {"entries": inserted, "pages": page - 1}


def check_user_against_blocklist(
    user_id: str,
    iin: str | None = None,
    grnz: str | None = None,
    full_name: str | None = None,
) -> dict | None:
    """Проверяет одного водителя UrTruck по чёрному списку.

    Returns:
        None если совпадений нет.
        dict {match_type, match_confidence, cgr_blocklist_id, match_id} если есть.
        В случае срабатывания — автоматически создаёт запись в cgr_blocklist_matches
        со статусом 'pending_review'. НЕ блокирует пользователя.
    """
    global _metrics_matches

    if not cgr_settings.feature_enabled:
        return None

    match = None
    if iin and cgr_settings.iin_salt:
        h = cgr_dal.hash_iin(iin, cgr_settings.iin_salt)
        row = cgr_dal.find_blocklist_by_iin_hash(h)
        if row:
            match = {"type": "iin", "confidence": "exact", "blocklist_id": row["id"]}

    if match is None and grnz:
        row = cgr_dal.find_blocklist_by_grnz(grnz)
        if row:
            match = {"type": "grnz", "confidence": "exact", "blocklist_id": row["id"]}

    # TODO: fuzzy matching по ФИО (SQLite LIKE + Левенштейн на коротком списке)

    if match is None:
        return None

    match_id = cgr_dal.record_match(
        urtruck_user_id=user_id,
        match_type=match["type"],
        match_confidence=match["confidence"],
        cgr_blocklist_id=match["blocklist_id"],
    )
    _metrics_matches += 1

    # TODO: notify Перизат через admin push / Slack #cgr-moderation
    logger.info(
        "cgr.blocklist: MATCH user=%s type=%s confidence=%s match_id=%s",
        user_id, match["type"], match["confidence"], match_id,
    )

    return {
        "match_id": match_id,
        "match_type": match["type"],
        "match_confidence": match["confidence"],
        "cgr_blocklist_id": match["blocklist_id"],
    }


def metrics() -> dict[str, int]:
    return {"matches": _metrics_matches}
