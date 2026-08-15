"""Пуш-алерт «🚛 ваша очередь подошла» — слежение за статусом ГРНЗ в CGR.

Водитель сохраняет свой госномер (QueueScreen) → мы кладём watch на сервере →
джоба планировщика периодически смотрит статус в публичном реестре CGR и, когда
он МЕНЯЕТСЯ на важный (вызван / пересёк), шлёт пуш. Данные публичные (Поток А),
но watch привязан к user_id, чтобы адресно пушить.
"""
import logging
from database.db import get_conn

logger = logging.getLogger("cgr.queue_watch")


def init_schema():
    with get_conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS queue_watches (
                user_id     TEXT NOT NULL,
                plate       TEXT NOT NULL,
                last_status TEXT,
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, plate)
            )
        """)
        from database import cgr_dal
        cgr_dal.migrate_legacy_identity_values(c, "queue_watches", "user_id")


def _norm(p: str) -> str:
    import re
    return re.sub(r"[\s\-]", "", (p or "")).upper()


def add_watch(user_id: str, plate: str) -> bool:
    from database import cgr_dal
    p = _norm(plate)
    if not user_id or cgr_dal.is_token_shaped_identity(user_id) or len(p) < 3:
        return False
    with get_conn() as c:
        c.execute(
            "INSERT INTO queue_watches (user_id, plate) VALUES (?, ?) "
            "ON CONFLICT(user_id, plate) DO UPDATE SET updated_at = CURRENT_TIMESTAMP",
            (user_id, p),
        )
    return True


def remove_watch(user_id: str, plate: str) -> bool:
    with get_conn() as c:
        c.execute("DELETE FROM queue_watches WHERE user_id = ? AND plate = ?", (user_id, _norm(plate)))
    return True


def list_watches(user_id: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT plate, last_status, updated_at FROM queue_watches WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# Статусы, о которых стоит пушить (важные для водителя переходы).
_NOTIFY = {
    "called":  ("🚛 Ваша очередь подошла", "Вас вызвали на пункт пропуска — можно ехать."),
    "crossed": ("✅ Пункт пропуска пройден", "Ваша машина пересекла границу."),
    "revoked": ("⚠️ Пропуск отозван", "Проверьте статус брони в CarGoRuqsat."),
}


async def check_watches() -> dict:
    """Джоба планировщика: сверяет статус каждого watched-номера и пушит при
    смене на важный. Публичный lookup CGR, без авторизации."""
    from cgr.settings import cgr_settings
    if not cgr_settings.feature_enabled:
        return {"skipped": True}
    from cgr import booking_service
    from api.push import send_to_user

    with get_conn() as c:
        watches = [dict(r) for r in c.execute(
            "SELECT user_id, plate, last_status FROM queue_watches").fetchall()]

    sent = 0
    for w in watches:
        try:
            res = await booking_service.lookup_by_plate(w["plate"])
        except Exception:
            continue
        if not res or not res.get("found"):
            continue
        status = res.get("status")
        if not status or status == w.get("last_status"):
            continue  # не изменился — не пушим
        # статус сменился → обновляем и, если важный, пушим
        with get_conn() as c:
            c.execute(
                "UPDATE queue_watches SET last_status = ?, updated_at = CURRENT_TIMESTAMP "
                "WHERE user_id = ? AND plate = ?",
                (status, w["user_id"], w["plate"]),
            )
        msg = _NOTIFY.get(status)
        if msg:
            title, body = msg
            cp = res.get("checkpoint")
            try:
                send_to_user(w["user_id"], title,
                             f"{w['plate']}{(' · ' + cp) if cp else ''} — {body}",
                             url="/", kind="queue")
                sent += 1
            except Exception:
                pass
    logger.info("cgr.queue_watch: checked %d watches, sent %d pushes", len(watches), sent)
    return {"watches": len(watches), "sent": sent}
