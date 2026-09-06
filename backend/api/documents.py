"""Генерация PDF-документов: ТТН (товарно-транспортная накладная) + Договор.

Использует HTML → PDF через WeasyPrint или простой text-based PDF через reportlab.
Fallback: если нет weasyprint — отдаёт HTML для печати.
"""
import sys
import os
from html import escape
from pathlib import Path
from datetime import datetime
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, HTMLResponse

from api.verification_gate import require_level
from database.db import get_conn

docs_router = APIRouter()


def _display(value, default="—"):
    return escape(str(value if value not in (None, "") else default))


def _ttn_html(trip: dict, driver: dict, client_name: str = "—") -> str:
    now = datetime.utcnow().strftime("%d.%m.%Y %H:%M")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  body {{ font-family: 'DM Sans', Arial, sans-serif; padding: 30px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }}
  h1 {{ text-align: center; border-bottom: 2px solid #1A5C3C; padding-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
  th, td {{ border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 13px; }}
  th {{ background: #f5f5f5; font-weight: 700; }}
  .sign {{ display: flex; justify-content: space-between; margin-top: 40px; }}
  .sign div {{ width: 45%; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; }}
  .footer {{ text-align: center; margin-top: 30px; font-size: 10px; color: #888; }}
  @media print {{ body {{ padding: 10px; }} }}
</style></head><body>
<h1>🚛 UrTruck · ТТН (Товарно-транспортная накладная)</h1>
<p><strong>Дата:</strong> {_display(now)} UTC &nbsp;&nbsp;&nbsp;
<strong>Номер:</strong> TTN-{_display(trip.get('id'))[:8].upper()}</p>

<table>
  <tr><th>Маршрут</th><td>{_display(trip.get('from'))} → {_display(trip.get('to'))}</td></tr>
  <tr><th>Транзит</th><td>{_display(trip.get('transit'))}</td></tr>
  <tr><th>Груз</th><td>{_display(trip.get('cargo'))}</td></tr>
  <tr><th>Вес / Объём</th><td>{_display(trip.get('tons'))} т / {_display(trip.get('m3'))} м³</td></tr>
  <tr><th>Тип кузова</th><td>{_display(trip.get('type'))}</td></tr>
  <tr><th>Цена</th><td>${_display(trip.get('price'))}</td></tr>
</table>

<h3>Перевозчик</h3>
<table>
  <tr><th>ФИО</th><td>{_display(driver.get('full_name'))}</td></tr>
  <tr><th>ИИН</th><td>{_display(driver.get('iin'))}</td></tr>
  <tr><th>Телефон</th><td>{_display(driver.get('phone'))}</td></tr>
  <tr><th>Госномер</th><td>{_display(driver.get('vehicle_plate'))}</td></tr>
  <tr><th>Автомобиль</th><td>{_display(driver.get('vehicle_brand'))} {_display(driver.get('vehicle_year'), '')}</td></tr>
  <tr><th>Security Score</th><td>{_display(driver.get('security_score'))} ({_display(driver.get('security_color'))})</td></tr>
</table>

<h3>Грузоотправитель</h3>
<table>
  <tr><th>Компания / ФИО</th><td>{_display(client_name)}</td></tr>
</table>

<div class="sign">
  <div>Подпись перевозчика: ___________________</div>
  <div>Подпись отправителя: ___________________</div>
</div>

<div class="footer">
  Сгенерировано UrTruck · urtruck.kz · {_display(now)}<br/>
  Документ имеет юридическую силу после подписания обеими сторонами.
</div>
</body></html>"""


def _load_ttn_context(document_ref: str, user_id: str) -> tuple[dict, dict, str]:
    """Resolve a legacy trip/deal reference to one authorized live deal."""
    with get_conn() as conn:
        deal = conn.execute(
            "SELECT * FROM deals WHERE trip_id = ? OR id = ? ORDER BY created_at DESC LIMIT 1",
            (document_ref, document_ref),
        ).fetchone()
        if not deal:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        if str(user_id) not in {str(deal["shipper_id"]), str(deal["driver_id"])}:
            raise HTTPException(status_code=403, detail="Нет доступа к документу")
        row = conn.execute(
            """
            SELECT d.id, d.trip_id, d.from_city AS deal_from, d.to_city AS deal_to,
                   d.amount, d.status AS deal_status,
                   c.id AS cargo_id, c.cargo_desc, c.cargo_type, c.weight_tons, c.volume_m3, c.pickup_date,
                   t.transit, t.truck_type, t.capacity_tons, t.available_m3,
                   t.departure, t.arrival,
                   dr.full_name AS driver_full_name, dr.phone AS driver_phone,
                   dr.iin AS driver_iin, dr.vehicle_plate, dr.vehicle_brand,
                   dr.vehicle_year, dr.vehicle_type, dr.security_score, dr.security_color,
                   sh.full_name AS shipper_full_name
              FROM deals d
              LEFT JOIN cargos c ON c.id = d.cargo_id
              LEFT JOIN trips t ON t.id = d.trip_id
              LEFT JOIN drivers_registration dr ON dr.id = d.driver_id
              LEFT JOIN drivers_registration sh ON sh.id = d.shipper_id
             WHERE d.id = ?
            """,
            (deal["id"],),
        ).fetchone()
        data = dict(row)

    trip = {
        "id": data["trip_id"] or data["id"], "from": data["deal_from"], "to": data["deal_to"],
        "transit": data["transit"], "cargo": data["cargo_desc"] or data["cargo_type"],
        "tons": data["weight_tons"] if data["cargo_id"] else data["capacity_tons"],
        "m3": data["volume_m3"] if data["cargo_id"] else data["available_m3"],
        "type": data["truck_type"] or data["vehicle_type"], "price": data["amount"],
        "departure": data["departure"] or data["pickup_date"], "arrival": data["arrival"],
        "status": data["deal_status"],
    }
    driver = {
        "full_name": data["driver_full_name"], "phone": data["driver_phone"], "iin": data["driver_iin"],
        "vehicle_plate": data["vehicle_plate"], "vehicle_brand": data["vehicle_brand"],
        "vehicle_year": data["vehicle_year"], "security_score": data["security_score"],
        "security_color": data["security_color"],
    }
    required = {
        "route": (trip["from"], trip["to"]), "cargo": trip["cargo"], "weight": trip["tons"],
        "volume": trip["m3"], "amount": trip["price"], "driver": driver["full_name"],
        "shipper": data["shipper_full_name"], "vehicle": trip["type"],
    }
    missing = [name for name, value in required.items() if value in (None, "", 0)]
    if missing:
        raise HTTPException(status_code=409, detail={"code": "TTN_DATA_INCOMPLETE", "fields": missing})
    return trip, driver, data["shipper_full_name"]


@docs_router.post("/ttn/{trip_id}")
def generate_ttn(trip_id: str, user=Depends(require_level(1))):
    """Generate a printable TTN from the authorized canonical deal context."""
    trip, driver, shipper_name = _load_ttn_context(trip_id, user["id"])
    return HTMLResponse(content=_ttn_html(trip, driver, client_name=shipper_name))


@docs_router.get("/ttn/{trip_id}/pdf")
def download_ttn_pdf(trip_id: str, user=Depends(require_level(1))):
    """PDF версия ТТН; без WeasyPrint возвращает печатный HTML."""
    trip, driver, shipper_name = _load_ttn_context(trip_id, user["id"])
    html = _ttn_html(trip, driver, client_name=shipper_name)
    safe_id = "".join(ch for ch in trip_id[:8] if ch.isalnum() or ch in "-_") or "document"

    try:
        from weasyprint import HTML as WPHTML
    except ImportError:
        # Production images may intentionally omit the heavy native
        # WeasyPrint stack. Keep the document usable through the browser's
        # Print / Save as PDF flow instead of exposing a 501 dead end.
        return HTMLResponse(
            content=html,
            headers={
                "Content-Disposition": f'inline; filename="TTN-{safe_id}.html"',
                "X-UrTruck-PDF-Fallback": "html",
            },
        )

    pdf = WPHTML(string=html).write_pdf()
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="TTN-{safe_id}.pdf"'},
    )
