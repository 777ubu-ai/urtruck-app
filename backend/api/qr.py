"""QR-код для быстрой проверки водителя менеджером склада.
URL /qr/driver/{id} → PNG с QR, который содержит публичную ссылку на верификацию."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from io import BytesIO
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from database import registration_dal as reg_dal

qr_router = APIRouter()

VERIFY_BASE = "https://urtruck.app/verify"  # публичная ссылка (в dev — наш домен)


@qr_router.get("/driver/{driver_id}")
def driver_qr(driver_id: str):
    """Отдаёт PNG-изображение QR-кода со ссылкой на профиль водителя."""
    d = reg_dal.get_driver(driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    if d.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Водитель не одобрен")

    try:
        import qrcode
    except ImportError:
        raise HTTPException(status_code=500, detail="qrcode не установлен")

    url = f"{VERIFY_BASE}/{driver_id}"
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})


@qr_router.get("/verify/{driver_id}")
def public_verify(driver_id: str):
    """Публичная страница верификации — то что откроется при сканировании QR.
    Минимальная информация: ФИО, статус, рейтинг, авто."""
    d = reg_dal.get_driver(driver_id)
    if not d or d.get("status") != "approved":
        return {"ok": False, "reason": "Водитель не найден или не одобрен"}

    # Рейтинг
    from database import reviews_dal
    summary = reviews_dal.get_rating_summary(driver_id)

    return {
        "ok": True,
        "driver_id": driver_id,
        "full_name": d.get("full_name"),
        "verified": True,
        "vehicle": {
            "type": d.get("vehicle_type"),
            "plate": d.get("vehicle_plate"),
            "brand": d.get("vehicle_brand"),
            "year": d.get("vehicle_year"),
        },
        "security_score": d.get("security_score"),
        "security_color": d.get("security_color"),
        "rating": summary,
        "approved_at": d.get("approved_at"),
    }
