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


def _ttn_html(trip: dict, driver: dict, client_name: str = "—") -> str:
    def text(value, fallback="—"):
        return escape(str(value if value not in (None, "") else fallback))

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
<p><strong>Дата:</strong> {text(now)} UTC &nbsp;&nbsp;&nbsp;
<strong>Номер:</strong> TTN-{text(trip.get('id', '—'))[:8].upper()}</p>

<table>
  <tr><th>Маршрут</th><td>{text(trip.get('from'))} → {text(trip.get('to'))}</td></tr>
  <tr><th>Транзит</th><td>{text(trip.get('transit'))}</td></tr>
  <tr><th>Груз</th><td>{text(trip.get('cargo'))}</td></tr>
  <tr><th>Вес / Объём</th><td>{text(trip.get('tons'))} т / {text(trip.get('m3'))} м³</td></tr>
  <tr><th>Тип кузова</th><td>{text(trip.get('type'))}</td></tr>
  <tr><th>Цена</th><td>${text(trip.get('price'))}</td></tr>
  <tr><th>Дата рейса</th><td>{text(trip.get('departure'))} → {text(trip.get('arrival'))}</td></tr>
</table>

<h3>Перевозчик</h3>
<table>
  <tr><th>ФИО</th><td>{text(driver.get('full_name'))}</td></tr>
  <tr><th>ИИН</th><td>{text(driver.get('iin'))}</td></tr>
  <tr><th>Телефон</th><td>{text(driver.get('phone'))}</td></tr>
  <tr><th>Госномер</th><td>{text(driver.get('vehicle_plate'))}</td></tr>
  <tr><th>Автомобиль</th><td>{text(driver.get('vehicle_brand'))} {text(driver.get('vehicle_year'), '')}</td></tr>
  <tr><th>Security Score</th><td>{text(driver.get('security_score'))} ({text(driver.get('security_color'))})</td></tr>
</table>

<h3>Грузоотправитель</h3>
<table>
  <tr><th>Компания / ФИО</th><td>{text(client_name)}</td></tr>
</table>

<div class="sign">
  <div>Подпись перевозчика: ___________________</div>
  <div>Подпись отправителя: ___________________</div>
</div>

<div class="footer">
  Сгенерировано UrTruck · urtruck.kz · {now}<br/>
  Документ имеет юридическую силу после подписания обеими сторонами.
</div>
</body></html>"""


def _load_ttn_context(trip_id: str, user_id: str) -> tuple[dict, dict, str]:
    """Load one authorized deal context; never synthesize shipment data."""
    with get_conn() as c:
        row = c.execute(
            """
            SELECT t.*, d.id AS deal_id, d.shipper_id, d.driver_id AS deal_driver_id,
                   d.amount AS deal_amount, d.status AS deal_status,
                   c.cargo_desc, c.weight_tons, c.volume_m3, c.cargo_type,
                   c.from_city AS cargo_from, c.to_city AS cargo_to,
                   dr.full_name AS driver_full_name, dr.phone AS driver_phone,
                   dr.iin AS driver_iin, dr.vehicle_type, dr.vehicle_plate,
                   dr.vehicle_brand, dr.vehicle_year, dr.security_score,
                   dr.security_color, sh.full_name AS shipper_full_name
              FROM trips t
              JOIN deals d ON d.trip_id = t.id
              LEFT JOIN cargos c ON c.id = d.cargo_id
              LEFT JOIN drivers_registration dr ON dr.id = d.driver_id
              LEFT JOIN drivers_registration sh ON sh.id = d.shipper_id
             WHERE t.id = ? AND d.status NOT IN ('cancelled')
             ORDER BY d.created_at DESC
             LIMIT 1
            """,
            (trip_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Активная сделка для рейса не найдена")
    if str(user_id) not in {str(row["shipper_id"]), str(row["deal_driver_id"])}:
        raise HTTPException(status_code=403, detail="Документ доступен только участникам сделки")

    required = {
        "from": row["from_city"] or row["cargo_from"],
        "to": row["to_city"] or row["cargo_to"],
        "cargo": row["cargo_desc"],
        "tons": row["weight_tons"],
        "m3": row["volume_m3"],
        "price": row["deal_amount"],
        "driver": row["driver_full_name"],
        "shipper": row["shipper_full_name"],
        "vehicle": row["vehicle_type"] or row["truck_type"],
    }
    missing = [key for key, value in required.items() if value in (None, "") or (key in {"tons", "m3"} and float(value or 0) <= 0)]
    if missing:
        raise HTTPException(status_code=409, detail={"error": "TTN_DATA_INCOMPLETE", "missing": missing})

    trip = {
        "id": trip_id,
        "from": row["from_city"] or row["cargo_from"],
        "to": row["to_city"] or row["cargo_to"],
        "transit": row["transit"],
        "cargo": row["cargo_desc"],
        "tons": row["weight_tons"],
        "m3": row["volume_m3"],
        "type": row["vehicle_type"] or row["truck_type"],
        "price": row["deal_amount"],
        "departure": row["departure"],
        "arrival": row["arrival"],
    }
    driver = {
        "full_name": row["driver_full_name"], "iin": row["driver_iin"],
        "phone": row["driver_phone"], "vehicle_plate": row["vehicle_plate"],
        "vehicle_brand": row["vehicle_brand"], "vehicle_year": row["vehicle_year"],
        "security_score": row["security_score"], "security_color": row["security_color"],
    }
    return trip, driver, row["shipper_full_name"]


@docs_router.post("/ttn/{trip_id}")
def generate_ttn(trip_id: str, user=Depends(require_level(1))):
    """Генерация ТТН по рейсу. Возвращает HTML (для печати через browser print)."""
    trip, driver, shipper_name = _load_ttn_context(trip_id, user["id"])
    html = _ttn_html(trip, driver, client_name=shipper_name)
    return HTMLResponse(content=html)


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
