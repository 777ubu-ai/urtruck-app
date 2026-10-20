"""Read-only client API and isolated importer for external freight feed."""
import hmac
import os
import re
import threading
from concurrent.futures import Future
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from api.verification_gate import require_level, require_admin
from database import external_freight_dal as dal
from services.external_freight_classifier import classify_message

router = APIRouter(tags=["external-freight"])
_translation_lock = threading.Lock()
_translation_futures: dict[tuple[str, str, str], Future] = {}
_PROTECTED = re.compile(r"(?:\+?\d[\d\s()./-]{5,}\d|\b\d+(?:[.,]\d+)?\b|\b[A-Z]{3}\b)")
_LANGS = {"RU", "KK", "ZH", "EN"}


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
                              min_price=min_price, max_price=max_price, sort=sort, limit=limit, cursor=cursor)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc


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
    item = dal.get_item(item_id)
    if not item or item["kind"] != kind:
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    return {"item": item}


def _protected_tokens(text):
    return _PROTECTED.findall(text)


def _translate_preserving_tokens(text, target_lang):
    from services.translate_service import translate_text, TranslationError

    tokens = []
    def replace(match):
        marker = f"UTMARKER{len(tokens):04d}X"
        tokens.append(match.group(0))
        return marker

    masked = _PROTECTED.sub(replace, text)
    result = translate_text(masked, target_lang.lower())
    translated = str(result.get("translated_text") or "")
    if not translated or len(translated) > 20000:
        raise TranslationError("Перевод временно недоступен", code="TRANSLATION_FAILED")
    for index, token in enumerate(tokens):
        marker = f"UTMARKER{index:04d}X"
        if translated.count(marker) != 1:
            raise TranslationError("Не удалось сохранить числа и контакты", code="TRANSLATION_FAILED")
        translated = translated.replace(marker, token)
    if _protected_tokens(translated) != tokens:
        raise TranslationError("Не удалось сохранить числа и контакты", code="TRANSLATION_FAILED")
    return translated


@router.post("/{item_id}/translate")
def translate_external_item(item_id: str, target_lang: str = Query(..., min_length=2, max_length=2), user: dict = Depends(require_level(1))):
    _ensure_enabled()
    from services.translate_service import TranslationError

    kind = _user_kind(user)
    lang = target_lang.upper()
    if lang not in _LANGS:
        raise HTTPException(status_code=422, detail={"error": "unsupported_language"})
    item = dal.get_item(item_id)
    if not item or item["kind"] != kind:
        raise HTTPException(status_code=404, detail={"error": "external_item_not_found"})
    if lang == (os.getenv("APP_DEFAULT_LANGUAGE", "RU").upper()):
        # Target usually follows the active app locale; callers may request the
        # translation explicitly, so do not silently return original text.
        pass
    revision = item["source_revision"]
    cached = dal.get_translation(item_id, revision, lang)
    if cached:
        return {"translated_text": cached, "source_revision": revision, "cached": True}
    key = (item_id, revision, lang)
    with _translation_lock:
        future = _translation_futures.get(key)
        owner = future is None
        if owner:
            future = Future()
            _translation_futures[key] = future
    try:
        if owner:
            try:
                translated = _translate_preserving_tokens(item["original_text"], lang)
                future.set_result(dal.store_translation(item_id, revision, lang, translated))
            except Exception as exc:
                future.set_exception(exc)
        try:
            translated = future.result(timeout=15)
        except TimeoutError as exc:
            raise HTTPException(status_code=503, detail={"error": "translation_timeout"}) from exc
        except TranslationError as exc:
            raise HTTPException(status_code=503, detail={"error": exc.code}) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail={"error": "translation_failed"}) from exc
        return {"translated_text": translated, "source_revision": revision, "cached": False}
    finally:
        if owner:
            with _translation_lock:
                _translation_futures.pop(key, None)


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
        from database.db import get_conn
        with get_conn() as c:
            row = c.execute("SELECT * FROM external_freight_items WHERE id=? AND status='review'", (item_id,)).fetchone()
        item = dict(row) if row else None
    if not item or not item.get("source_published_at"):
        raise HTTPException(status_code=404, detail={"error": "review_item_not_found"})
    from database.db import get_conn
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
