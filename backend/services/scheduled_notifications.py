"""Атомарные события напоминаний; история не проигрывается после обновления."""
import hashlib
import json
import logging
from datetime import timedelta

from database.db import get_conn
from services import notification_policy as policy, push_gateway, push_i18n
from api.notifications import create_notification

log = logging.getLogger(__name__)


def _legacy_seen(c, user_id, event_key, category, data):
    if c.execute("SELECT 1 FROM notifications WHERE user_id=? AND event_key=?", (user_id, event_key)).fetchone():
        return True
    if category == "saved_search" and event_key.startswith("reminder-route:"):
        old_key = f"reminder-route:{data.get('from')}:{data.get('to')}:{event_key.rsplit(':',1)[-1]}"
        if c.execute("SELECT 1 FROM notifications WHERE user_id=? AND event_key=?", (user_id,old_key)).fetchone():
            return True
    # Старые попытки без inbox также считаются уже созданным поводом. Ни окно
    # 20 часов, ни совпадение подстроки ID больше не участвуют в дедупликации.
    if category == "no_bids":
        field = "cargo_id" if data.get("cargo_id") else "trip_id"
        entity_id = data[field]
        for row in c.execute("SELECT data_json FROM push_log WHERE user_id=? AND kind='no_bids'", (user_id,)):
            try:
                if json.loads(row[0] or "{}").get(field) == entity_id:
                    return True
            except (ValueError, TypeError, AttributeError):
                continue
    return False


def _queue(c, user_id, event_key, category, event, data, *, url, icon, params=None):
    """Вызывается только внутри write-транзакции после повторной проверки."""
    existing = c.execute("SELECT 1 FROM notification_event_claims WHERE user_id=? AND event_key=?", (user_id, event_key)).fetchone()
    if existing:
        return False
    legacy = _legacy_seen(c, user_id, event_key, category, data)
    c.execute("INSERT INTO notification_event_claims(user_id,event_key,category,state) VALUES(?,?,?,?)",
              (user_id, event_key, category, "legacy_seen" if legacy else "queued"))
    if legacy:
        return False
    row = c.execute("SELECT locale FROM push_devices WHERE user_id=? AND enabled=1 ORDER BY last_seen_at DESC,id DESC LIMIT 1", (user_id,)).fetchone()
    params = params or {}
    title, body = push_i18n.push_text(event, row[0] if row else None, **params)
    if title is None or body is None:
        raise ValueError("scheduled_notification_template_missing")
    create_notification(user_id, category, title, body, icon, url=url, event_key=event_key, conn=c)
    notification = c.execute("SELECT id FROM notifications WHERE user_id=? AND event_key=?", (user_id, event_key)).fetchone()
    payload_data = {**data, "event_id": event_key, "event_key": event_key, "url": url,
                    "kind": category, "notification_category": category, "i18n_event": event,
                    "i18n_params": params, "notification_id": notification[0]}
    if not push_gateway.enqueue_event(event_key, event, user_id,
                                      {"title": title, "body": body, "data": payload_data}, conn=c):
        # Существующая outbox-история тоже не является поводом повторной отправки.
        c.execute("UPDATE notification_event_claims SET state='legacy_seen' WHERE user_id=? AND event_key=?", (user_id,event_key))
        return False
    return True


def queue_no_bids(entity_type, entity_id, *, now=None):
    now = policy.utc_now(now)
    with get_conn() as c:
        c.execute("BEGIN IMMEDIATE")
        row = policy.listing(c, entity_type, entity_id)
        user_id = row.get("owner_id") if row and entity_type == "cargo" else row.get("driver_id") if row else None
        if not user_id:
            return False
        key = f"no_bids:{entity_type}:{entity_id}"
        data = {f"{entity_type}_id": entity_id, "event_id": key, "notification_category": "no_bids"}
        if policy.delivery_block_reason(user_id, data, conn=c, now=now):
            return False
        return _queue(c, user_id, key, "no_bids", f"no_bids_{entity_type}", data,
                      url=f"/{'cargos' if entity_type == 'cargo' else 'trips'}/{entity_id}",
                      icon="📦" if entity_type == "cargo" else "🚛",
                      params={"route": f"{row.get('from_city')} → {row.get('to_city')}"})


def no_bids_job(*, now=None):
    now = policy.utc_now(now)
    with get_conn() as c:
        candidates = [("cargo",r[0]) for r in c.execute("SELECT id FROM cargos WHERE status='active'")]
        candidates += [("trip",r[0]) for r in c.execute("SELECT id FROM trips WHERE status='active'")]
    count = sum(queue_no_bids(kind, eid, now=now) for kind,eid in candidates)
    log.info("no_bids queued=%d", count)
    return count


def queue_route_match(user_id, cargo_id):
    now = policy.utc_now()
    with get_conn() as c:
        c.execute("BEGIN IMMEDIATE")
        row = policy.listing(c, "cargo", cargo_id)
        if not policy.active_listing(row, now) or not policy.matching_searches(c,user_id,row.get("from_city"),row.get("to_city")):
            return False
        return _queue(c,user_id,f"saved_search:{cargo_id}","saved_search","saved_search_match",
                      {"cargo_id":cargo_id}, url=f"/cargos/{cargo_id}",icon="📦",
                      params={"route":f"{row.get('from_city')} → {row.get('to_city')}"})


def reminders_job(*, now=None):
    now = policy.utc_now(now)
    counts = {"inactive":0,"route_match":0}
    with get_conn() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM drivers_registration WHERE status='approved' AND role IN ('driver','client')")]
        routes = [dict(r) for r in c.execute("SELECT * FROM saved_searches WHERE notify=1")]
    for uid in ids:
        with get_conn() as c:
            c.execute("BEGIN IMMEDIATE")
            data={"notification_category":"inactivity"}
            if policy.delivery_block_reason(uid,data,conn=c,now=now):
                continue
            counts["inactive"] += _queue(c,uid,f"reminder-inactive:{now.date()}","inactivity","inactive_reminder",data,url="/",icon="🚛")
    for route in routes:
        with get_conn() as c:
            c.execute("BEGIN IMMEDIATE")
            if not c.execute("SELECT 1 FROM saved_searches WHERE id=? AND user_id=? AND notify=1",(route["id"],route["user_id"])).fetchone():
                continue
            matches=[]
            for rr in c.execute("SELECT * FROM cargos WHERE status='active'"):
                if policy.owner_is_deleted(c,rr["owner_id"]):
                    continue
                row=dict(rr);published=policy.publication_time(row)
                if policy.active_listing(row,now) and published and now-timedelta(days=1) <= published <= now and policy.city_key(row.get("from_city"))==policy.city_key(route["from_city"]) and policy.city_key(row.get("to_city"))==policy.city_key(route["to_city"]):
                    matches.append(row)
            if not matches:
                continue
            route_hash=hashlib.sha256(f"{policy.city_key(route['from_city'])}:{policy.city_key(route['to_city'])}".encode()).hexdigest()[:24]
            data={"notification_category":"saved_search","from":route["from_city"],"to":route["to_city"]}
            counts["route_match"] += _queue(c,route["user_id"],f"reminder-route:{route_hash}:{now.date()}","saved_search","saved_search_digest",data,url="/",icon="📦",params={"count":len(matches),"route":f"{route['from_city']} → {route['to_city']}"})
    return counts


def lifecycle_job(*, now=None):
    now=policy.utc_now(now)
    with get_conn() as c:
        # Новая политика сама атомарно записывает одно событие на период.
        from services import owned_publication_periods
        if owned_publication_periods.is_enabled(c):
            return 0
        candidates=[("cargo",r[0]) for r in c.execute("SELECT id FROM cargos WHERE status IN ('active','expired')")]
        candidates += [("trip",r[0]) for r in c.execute("SELECT id FROM trips WHERE status IN ('active','expired')")]
    count=0
    for kind,eid in candidates:
        with get_conn() as c:
            c.execute("BEGIN IMMEDIATE")
            row=policy.listing(c,kind,eid)
            if row and policy.auto_renewing_listing(row):
                continue
            published=policy.publication_time(row) if row else None
            if not published:
                continue
            deadline=published+timedelta(days=30)
            stage="expired" if row.get("status")=="expired" and deadline<=now<deadline+timedelta(days=1) else "expiring" if policy.active_listing(row,now) and deadline-now<=timedelta(days=1) else None
            if not stage:
                continue
            uid=row.get("owner_id") if kind=="cargo" else row.get("driver_id")
            data={f"{kind}_id":eid,"notification_category":"listing_lifecycle","publication_at":published.isoformat(),"lifecycle_stage":stage}
            if not uid or policy.delivery_block_reason(uid,data,conn=c,now=now):
                continue
            count += _queue(c,uid,f"listing-{stage}:{kind}:{eid}","listing_lifecycle",f"listing_{stage}",data,url=f"/{'cargos' if kind=='cargo' else 'trips'}/{eid}",icon="📭",params={"route":f"{row.get('from_city')} → {row.get('to_city')}"})
    return count
