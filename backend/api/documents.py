"""Генерация документов сделки UrTruck.

Документ строится только по существующей принятой сделке. Никаких demo/fallback
данных в production: доступ разрешён только грузоотправителю или водителю этой
сделки.
"""
import html
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from api.verification_gate import require_level
from database.db import get_conn

docs_router = APIRouter()


def _text(value, default="—") -> str:
    value = default if value is None or str(value).strip() == "" else value
    return html.escape(str(value))


def _row_dict(row):
    return dict(row) if row else {}


def _load_document_context(reference_id: str, user_id: str) -> dict:
    """Resolve a document to one accepted deal and authorize its participants."""
    reference_id = str(reference_id or "").strip()
    if not reference_id:
        raise HTTPException(status_code=400, detail="Идентификатор сделки не указан")

    with get_conn() as c:
        deal_row = c.execute(
            """
            SELECT d.*,
                   c.cargo_desc AS cargo_description,
                   c.cargo_type AS cargo_type,
                   c.weight_tons AS cargo_weight_tons,
                   c.volume_m3 AS cargo_volume_m3,
                   c.currency AS cargo_currency,
                   t.truck_type AS trip_truck_type,
                   t.capacity_tons AS trip_capacity_tons,
                   t.available_m3 AS trip_available_m3,
                   t.transit AS trip_transit
            FROM deals d
            LEFT JOIN cargos c ON c.id = d.cargo_id
            LEFT JOIN trips t ON t.id = d.trip_id
            WHERE d.id = ? OR d.trip_id = ?
            ORDER BY CASE WHEN d.id = ? THEN 0 ELSE 1 END, d.created_at DESC
            LIMIT 1
            """,
            (reference_id, reference_id, reference_id),
        ).fetchone()

        if not deal_row:
            raise HTTPException(status_code=404, detail="Принятая сделка не найдена")

        deal = _row_dict(deal_row)
        if deal.get("status") in ("cancelled", "rejected"):
            raise HTTPException(status_code=409, detail="Документы недоступны для отменённой сделки")
        if user_id not in (deal.get("shipper_id"), deal.get("driver_id")):
            raise HTTPException(status_code=403, detail="Документ доступен только участникам сделки")

        trip = {}
        if deal.get("trip_id"):
            trip_row = c.execute(
                "SELECT * FROM trips WHERE id = ?", (deal["trip_id"],)
            ).fetchone()
            trip = _row_dict(trip_row)

        cargo = {}
        if deal.get("cargo_id"):
            cargo_row = c.execute(
                "SELECT * FROM cargos WHERE id = ?", (deal["cargo_id"],)
            ).fetchone()
            cargo = _row_dict(cargo_row)

        driver_row = c.execute(
            "SELECT * FROM drivers_registration WHERE id = ?",
            (deal.get("driver_id"),),
        ).fetchone()
        shipper_row = c.execute(
            "SELECT * FROM drivers_registration WHERE id = ?",
            (deal.get("shipper_id"),),
        ).fetchone()

    driver = _row_dict(driver_row)
    shipper = _row_dict(shipper_row)
    return {
        "deal": deal,
        "trip": trip,
        "cargo": cargo,
        "driver": driver,
        "shipper": shipper,
    }


def _document_payload(context: dict) -> dict:
    deal = context["deal"]
    trip = context["trip"]
    cargo = context["cargo"]
    driver = context["driver"]
    shipper = context["shipper"]

    route_from = trip.get("from_city") or cargo.get("from_city") or deal.get("from_city")
    route_to = trip.get("to_city") or cargo.get("to_city") or deal.get("to_city")
    transit = trip.get("transit") or cargo.get("transit") or deal.get("transit")
    cargo_name = cargo.get("cargo_desc") or deal.get("cargo_description")
    weight = cargo.get("weight_tons")
    if weight is None:
        weight = trip.get("capacity_tons") or deal.get("trip_capacity_tons")
    volume = cargo.get("volume_m3")
    if volume is None:
        volume = trip.get("available_m3") or deal.get("trip_available_m3")
    vehicle_type = (
        trip.get("truck_type")
        or cargo.get("cargo_type")
        or deal.get("trip_truck_type")
        or deal.get("cargo_type")
    )
    currency = cargo.get("currency") or trip.get("currency") or deal.get("cargo_currency") or "USD"

    return {
        "id": deal.get("id"),
        "from": route_from,
        "to": route_to,
        "transit": transit,
        "cargo": cargo_name,
        "tons": weight,
        "m3": volume,
        "type": vehicle_type,
        "price": deal.get("amount"),
        "currency": currency,
        "driver": driver,
        "client_name": shipper.get("full_name") or shipper.get("company_name") or deal.get("shipper_id"),
    }


def _ttn_html(payload: dict) -> str:
    now = datetime.utcnow().strftime("%d.%m.%Y %H:%M")
    driver = payload["driver"]
    currency = payload.get("currency") or "USD"
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  body {{ font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }}
  h1 {{ text-align: center; border-bottom: 2px solid #1A5C3C; padding-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
  th, td {{ border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 13px; }}
  th {{ background: #f5f5f5; font-weight: 700; }}
  .sign {{ display: flex; justify-content: space-between; margin-top: 40px; }}
  .sign div {{ width: 45%; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; }}
  .footer {{ text-align: center; margin-top: 30px; font-size: 10px; color: #888; }}
</style></head><body>
<h1>UrTruck · ТТН (Товарно-транспортная накладная)</h1>
<p><strong>Дата:</strong> {now} UTC &nbsp;&nbsp;&nbsp;
<strong>Номер сделки:</strong> {_text(payload.get("id"))}</p>
<table>
  <tr><th>Маршрут</th><td>{_text(payload.get("from"))} → {_text(payload.get("to"))}</td></tr>
  <tr><th>Транзит</th><td>{_text(payload.get("transit"))}</td></tr>
  <tr><th>Груз</th><td>{_text(payload.get("cargo"))}</td></tr>
  <tr><th>Вес / Объём</th><td>{_text(payload.get("tons"))} т / {_text(payload.get("m3"))} м³</td></tr>
  <tr><th>Тип кузова</th><td>{_text(payload.get("type"))}</td></tr>
  <tr><th>Согласованная цена</th><td>{_text(payload.get("price"))} {_text(currency)}</td></tr>
</table>
<h3>Перевозчик</h3>
<table>
  <tr><th>ФИО</th><td>{_text(driver.get("full_name"))}</td></tr>
  <tr><th>ИИН</th><td>{_text(driver.get("iin"))}</td></tr>
  <tr><th>Телефон</th><td>{_text(driver.get("phone"))}</td></tr>
  <tr><th>Госномер</th><td>{_text(driver.get("vehicle_plate"))}</td></tr>
  <tr><th>Автомобиль</th><td>{_text(driver.get("vehicle_brand"))} {_text(driver.get("vehicle_year"), "")}</td></tr>
</table>
<h3>Грузоотправитель</h3>
<table><tr><th>Компания / ФИО</th><td>{_text(payload.get("client_name"))}</td></tr></table>
<div class="sign">
  <div>Подпись перевозчика: ___________________</div>
  <div>Подпись отправителя: ___________________</div>
</div>
<div class="footer">Сгенерировано UrTruck · urtruck.kz · {now}</div>
</body></html>"""


def _resolve_html(reference_id: str, user: dict) -> str:
    context = _load_document_context(reference_id, user["id"])
    return _ttn_html(_document_payload(context))


@docs_router.post("/ttn/{trip_id}")
def generate_ttn(trip_id: str, user=Depends(require_level(1))):
    """Сгенерировать HTML ТТН по принятой сделке."""
    return HTMLResponse(content=_resolve_html(trip_id, user))


@docs_router.get("/ttn/{trip_id}/pdf")
def download_ttn_pdf(trip_id: str, user=Depends(require_level(1))):
    """Вернуть PDF ТТН; при отсутствии WeasyPrint — безопасный HTML для печати."""
    html_content = _resolve_html(trip_id, user)
    safe_id = "".join(ch for ch in str(trip_id)[:32] if ch.isalnum() or ch in "-_") or "document"

    try:
        from weasyprint import HTML as WPHTML
    except ImportError:
        return HTMLResponse(
            content=html_content,
            headers={
                "Content-Disposition": f'inline; filename="TTN-{safe_id}.html"',
                "X-UrTruck-PDF-Fallback": "html",
            },
        )

    pdf = WPHTML(string=html_content).write_pdf()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="TTN-{safe_id}.pdf"'},
    )
