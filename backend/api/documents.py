"""Генерация PDF-документов: ТТН (товарно-транспортная накладная) + Договор.

Использует HTML → PDF через WeasyPrint или простой text-based PDF через reportlab.
Fallback: если нет weasyprint — отдаёт HTML для печати.
"""
import sys
import os
from pathlib import Path
from datetime import datetime
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response, HTMLResponse

from api.verification_gate import require_level

docs_router = APIRouter()


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
<p><strong>Дата:</strong> {now} UTC &nbsp;&nbsp;&nbsp;
<strong>Номер:</strong> TTN-{trip.get('id', '—')[:8].upper()}</p>

<table>
  <tr><th>Маршрут</th><td>{trip.get('from', '—')} → {trip.get('to', '—')}</td></tr>
  <tr><th>Транзит</th><td>{trip.get('transit', '—') or '—'}</td></tr>
  <tr><th>Груз</th><td>{trip.get('cargo', '—')}</td></tr>
  <tr><th>Вес / Объём</th><td>{trip.get('tons', '—')} т / {trip.get('m3', '—')} м³</td></tr>
  <tr><th>Тип кузова</th><td>{trip.get('type', '—')}</td></tr>
  <tr><th>Цена</th><td>${trip.get('price', '—')}</td></tr>
</table>

<h3>Перевозчик</h3>
<table>
  <tr><th>ФИО</th><td>{driver.get('full_name', '—')}</td></tr>
  <tr><th>ИИН</th><td>{driver.get('iin', '—')}</td></tr>
  <tr><th>Телефон</th><td>{driver.get('phone', '—')}</td></tr>
  <tr><th>Госномер</th><td>{driver.get('vehicle_plate', '—')}</td></tr>
  <tr><th>Автомобиль</th><td>{driver.get('vehicle_brand', '—')} {driver.get('vehicle_year', '')}</td></tr>
  <tr><th>Security Score</th><td>{driver.get('security_score', '—')} ({driver.get('security_color', '—')})</td></tr>
</table>

<h3>Грузоотправитель</h3>
<table>
  <tr><th>Компания / ФИО</th><td>{client_name}</td></tr>
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


@docs_router.post("/ttn/{trip_id}")
def generate_ttn(trip_id: str, user=Depends(require_level(1))):
    """Генерация ТТН по рейсу. Возвращает HTML (для печати через browser print)."""
    # Для демо — создаём из user data
    from database import registration_dal as reg_dal
    driver = reg_dal.get_driver(user["id"]) or {}

    trip = {
        "id": trip_id,
        "from": "Алматы", "to": "Астана",
        "cargo": "Товары народного потребления",
        "tons": 20, "m3": 82,
        "type": driver.get("vehicle_type", "tent"),
        "price": 1500,
    }

    html = _ttn_html(trip, driver, client_name=user.get("full_name", "—"))
    return HTMLResponse(content=html)


@docs_router.get("/ttn/{trip_id}/pdf")
def download_ttn_pdf(trip_id: str):
    """PDF версия ТТН (если weasyprint установлен)."""
    try:
        from weasyprint import HTML as WPHTML
    except ImportError:
        raise HTTPException(status_code=501, detail="PDF генерация недоступна. Используйте /ttn/{id} для HTML-печати через браузер (Ctrl+P).")

    trip = {"id": trip_id, "from": "Алматы", "to": "Астана", "cargo": "Товары", "tons": 20, "m3": 82, "type": "tent", "price": 1500}
    driver = {"full_name": "—", "phone": "—", "iin": "—"}
    html = _ttn_html(trip, driver)
    pdf = WPHTML(string=html).write_pdf()
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="TTN-{trip_id[:8]}.pdf"'},
    )
