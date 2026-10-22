"""Read-only client API and isolated importer for external freight feed."""
import hmac
import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from api.verification_gate import require_level, require_admin
from database import external_freight_dal as dal
from services.external_freight_classifier import classify_message

router = APIRouter(tags=["external-freight"])


def feature_enabled():
    return os.getenv("EXTERNAL_FREIGHT_FEED_ENABLED", "false").strip().lower() in {"1", "true", "yes"}


class ImportBatch(BaseModel):
    records: list[dict[str, Any]] = Field(max_length=dal.MAX_BATCH)


class AnalyticsEvent(BaseModel):
    name: str = Field(min_length=1, max_length=40)


def _user_kind(user: dict):
    if user.get("role") == "driver":
        return "cargo"
    if user.get("role") == "client":
        return "vehicle"
    raise HTTPException(status_code=403, detail={"error": "external_feed_role_required"})


def _ensure_enabled():
    if not feature_enabled():
        raise HTTPException(status_code=404, detail={"error": "external_feed_disabled"})


@router.get("/count")
def count_external_feed(user: dict = Depends(require_level(1))):
    _ensure_enabled()
    kind = _user_kind(user)
    return {"kind": kind, "count": dal.count_active_items(kind)}


@router.get("")
def list_external_feed(
    origin: str | None = Query(None, max_length=240), destination: str | None = Query(None, max_length=240),
    origin_country: str | None = Query(None, min_length=2, max_length=3),
    destination_country: str | None = Query(None, min_length=2, max_length=3),
    body_type: str | None = Query(None, max_length=40), published_from: str | None = Query(None, max_length=40),
    published_to: str | None = Query(None, max_length=40), currency: str | None = Query(None, min_length=3, max_length=3),
    min_price: float | None = Query(None, ge=0), max_price: float | None = Query(None, ge=0),
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc)$"),
    limit: int = Query(30, ge=1, le=100), cursor: str | None = Query(None, max_length=1000),
    saved_only: bool = Query(False),
    user: dict = Depends(require_level(1)),
):
    _ensure_enabled()
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail={"error": "invalid_price_range"})
    if currency and not currency.isalpha():
        raise HTTPException(status_code=422, detail={"error": "invalid_currency"})
    if body_type and body_type not in dal.KNOWN_BODY_TYPES:
        raise HTTPException(status_code=422, detail={"error": "invalid_body_type"})
    if (min_price is not None or max_price is not None or sort.startswith("price_")) and not currency:
        raise HTTPException(status_code=422, detail={"error": "currency_required_for_price_filter"})
    if published_from and published_to:
        try:
            if dal._utc(published_from) > dal._utc(published_to):
                raise HTTPException(status_code=422, detail={"error": "invalid_date_range"})
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"error": "invalid_date_range"}) from exc
    kind = _user_kind(user)
    try:
        return dal.list_items(kind=kind, origin=origin, destination=destination, body_type=body_type,
                              origin_country=origin_country, destination_country=destination_country,
                              published_from=published_from, published_to=published_to, currency=currency,
                              min_price=min_price, max_price=max_price, sort=sort, limit=limit, cursor=cursor,
                              owner_id=user["id"], saved_only=saved_only)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc


@router.put("/{item_id}/bookmark")
def save_external_item(item_id: str, user: dict = Depends(require_level(1))):
    _ensure_enabled()
    result = dal.set_bookmark(user["id"], item_id, _user_kind(user), True)
    if result is None:
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    return result


@router.delete("/{item_id}/bookmark")
def unsave_external_item(item_id: str, user: dict = Depends(require_level(1))):
    _ensure_enabled()
    result = dal.set_bookmark(user["id"], item_id, _user_kind(user), False)
    if result is None:
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    return result


@router.post("/events")
def record_external_event(event: AnalyticsEvent, user: dict = Depends(require_level(1))):
    _ensure_enabled()
    _user_kind(user)
    try:
        dal.record_event(event.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc
    return {"ok": True}


@router.get("/{item_id}")
def get_external_item(item_id: str, user: dict = Depends(require_level(1))):
    _ensure_enabled()
    kind = _user_kind(user)
    item = dal.get_item(item_id, owner_id=user["id"])
    if not item or item["kind"] != kind:
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    return {"item": item}


@router.post("/{item_id}/translate")
def translate_external_item(item_id: str, target_lang: str = Query(..., min_length=2, max_length=2), user: dict = Depends(require_level(1))):
    """Совместимый отказ старым клиентам: перевод ленты отключён владельцем."""
    _ensure_enabled()
    item = dal.get_item(item_id, owner_id=user["id"])
    if not item or item["kind"] != _user_kind(user):
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    raise HTTPException(status_code=503, detail={"error": "external_feed_translation_disabled"})


@router.post("/import")
def import_external_batch(batch: ImportBatch, importer_key: str | None = Header(None, alias="X-External-Importer-Key")):
    _ensure_enabled()
    configured = os.getenv("EXTERNAL_FREIGHT_IMPORTER_KEY", "")
    if not configured or not importer_key or not hmac.compare_digest(configured, importer_key):
        raise HTTPException(status_code=401, detail={"error": "importer_auth_required"})
    # Never trust a client-provided kind alone. Classify the preserved source
    # text. Only explicitly approved, unambiguous records can become visible.
    for record in batch.records:
        classification = classify_message(record.get("original_text", ""))
        record["classification_status"] = "approved" if (
            classification["status"] == "active" and classification["kind"] == record.get("kind")
        ) else "review"
        if classification["status"] == "closed":
            record["status"] = "closed"
    try:
        return {"results": dal.import_records(batch.records)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc


@router.post("/{item_id}/hide")
def hide_external_item(item_id: str, admin: dict = Depends(require_admin)):
    _ensure_enabled()
    if not dal.hide_item(item_id, admin.get("id", "operator")):
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    return {"ok": True, "id": item_id}


@router.post("/{item_id}/approve")
def approve_external_item(item_id: str, admin: dict = Depends(require_admin)):
    """Оператор публикует только карточку, проверенную по оригинальному тексту."""
    _ensure_enabled()
    item = dal.get_item(item_id)
    if not item:
        # Review/expired rows are intentionally omitted from public get_item.
        from database.external_freight_connection import get_conn
        with get_conn() as c:
            row = c.execute("SELECT * FROM external_freight_items WHERE id=? AND status='review'", (item_id,)).fetchone()
        item = dict(row) if row else None
    if not item or not item.get("source_published_at"):
        raise HTTPException(status_code=404, detail={"error": "review_item_not_found"})
    from database.external_freight_connection import get_conn
    with get_conn() as c:
        c.execute("UPDATE external_freight_items SET status='active',updated_at=? WHERE id=? AND status='review' AND expires_at>?",
                  (dal._utc().isoformat(), item_id, dal._utc().isoformat()))
        updated = c.execute("SELECT changes()").fetchone()[0] > 0
        if updated:
            c.execute("INSERT INTO external_freight_audit(id,item_id,actor,action,created_at,details) VALUES(?,?,?,?,?,?)",
                      (dal.new_id(), item_id, str(admin.get("id", "operator"))[:120], "approved", dal._utc().isoformat(), "{}"))
    if not updated:
        raise HTTPException(status_code=409, detail={"error": "review_item_expired_or_changed"})
    return {"ok": True, "id": item_id}
