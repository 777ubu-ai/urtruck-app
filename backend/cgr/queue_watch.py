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


def _norm(p: str) -> str:
    import re
    return re.sub(r"[\s\-]", "", (p or "")).upper()


def add_watch(user_id: str, plate: str) -> bool:
    p = _norm(plate)
    if not user_id or len(p) < 3:
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


def _active_deals_for_plate(driver_id: str, plate: str) -> list[dict]:
    """Return active deals whose canonical deal/trip vehicle matches plate."""
    target = _norm(plate)
    if not target:
        return []
    with get_conn() as c:
        deal_cols = {r["name"] for r in c.execute("PRAGMA table_info(deals)").fetchall()}
        has_snapshot = "vehicle_plate_snapshot" in deal_cols
        rows = c.execute(
            "SELECT d.*, t.vehicle_id AS trip_vehicle_id "
            "FROM deals d LEFT JOIN trips t ON t.id = d.trip_id "
            "WHERE d.driver_id = ? AND d.status IN ('accepted','in_progress','at_border','delivered','received')",
            (driver_id,),
        ).fetchall()
        out = []
        for raw in rows:
            d = dict(raw)
            candidate = d.get("vehicle_plate_snapshot") if has_snapshot else None
            vehicle_id = d.get("vehicle_id") if "vehicle_id" in deal_cols else None
            vehicle_id = vehicle_id or d.get("trip_vehicle_id")
            if not candidate and vehicle_id:
                try:
                    v = c.execute(
                        "SELECT license_plate FROM vehicles WHERE id = ? AND owner_user_id = ?",
                        (vehicle_id, driver_id),
                    ).fetchone()
                    candidate = v["license_plate"] if v else None
                except Exception:
                    candidate = None
            if candidate and _norm(candidate) == target:
                out.append(d)
        return out


def _notify_shipper_cgr(deal: dict, status: str, plate: str, checkpoint: str | None) -> None:
    event = {"called": "cgr_called", "crossed": "cgr_crossed", "revoked": "cgr_revoked"}.get(status)
    if not event or not deal.get("shipper_id"):
        return
    try:
        from services import push_gateway, push_i18n
        from api.push import send_to_user
        from api.notifications import create_notification
        recipient = deal["shipper_id"]
        loc = push_gateway.get_recipient_locale(recipient)
        title, body = push_i18n.push_text(event, loc, booking=plate)
        if checkpoint:
            body = f"{body} {checkpoint}."
        event_key = f"deal:{deal['id']}:cgr:{status}:{_norm(plate)}"
        send_to_user(
            recipient, title, body, url=f"/deals/{deal['id']}", kind="queue",
            data={"event_key": event_key, "event": f"cgr.{status}", "deal_id": deal["id"], "plate": plate},
        )
        create_notification(
            recipient, f"cgr_{status}", title, body, "🛂",
            url=f"/deals/{deal['id']}", event_key=event_key,
        )
    except Exception:
        logger.exception("cgr.queue_watch: shipper notification failed deal=%s status=%s", deal.get("id"), status)


def _sync_crossed_to_deal(deal: dict) -> None:
    """Use the canonical deal FSM; never write deals.status directly."""
    if deal.get("status") != "in_progress":
        return
    try:
        from api.marketplace import update_deal_status
        update_deal_status(deal["id"], "at_border", user={"id": deal["driver_id"]})
    except Exception as exc:
        # Country/actor/FSM guards stay authoritative. A CGR mismatch must not
        # corrupt the deal; it remains visible as a CGR event/notification.
        logger.warning("cgr.queue_watch: deal FSM sync skipped deal=%s: %s", deal.get("id"), exc)


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
            cp = res.get("checkpoint")
            try:
                from services import push_gateway, push_i18n
                from api.notifications import create_notification
                event = {"called": "cgr_called", "crossed": "cgr_crossed", "revoked": "cgr_revoked"}[status]
                loc = push_gateway.get_recipient_locale(w["user_id"])
                title, body = push_i18n.push_text(event, loc, booking=w["plate"])
                if cp:
                    body = f"{body} {cp}."
                event_key = f"driver:{w['user_id']}:cgr:{status}:{_norm(w['plate'])}"
                send_to_user(
                    w["user_id"], title, body, url="/queue", kind="queue",
                    data={"event_key": event_key, "event": f"cgr.{status}", "plate": w["plate"]},
                )
                create_notification(
                    w["user_id"], f"cgr_{status}", title, body, "🛂",
                    url="/queue", event_key=event_key,
                )
                sent += 1
            except Exception:
                logger.exception("cgr.queue_watch: driver notification failed user=%s status=%s", w.get("user_id"), status)
            deals = _active_deals_for_plate(w["user_id"], w["plate"])
            for deal in deals:
                if status == "crossed":
                    _sync_crossed_to_deal(deal)
                _notify_shipper_cgr(deal, status, w["plate"], cp)
    logger.info("cgr.queue_watch: checked %d watches, sent %d pushes", len(watches), sent)
    return {"watches": len(watches), "sent": sent}
