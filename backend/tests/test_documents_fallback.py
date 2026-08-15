import builtins

import pytest
from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from api import documents


def _authorized_context():
    return {
        "deal": {
            "id": "deal-real-123",
            "shipper_id": "shipper-1",
            "driver_id": "driver-1",
            "from_city": "Москва",
            "to_city": "Казань",
            "amount": 4200,
        },
        "trip": {
            "id": "trip-real-123",
            "from_city": "Москва",
            "to_city": "Казань",
            "transit": "Нижний Новгород",
            "truck_type": "tent",
            "capacity_tons": 20,
            "available_m3": 82,
        },
        "cargo": {
            "cargo_desc": "Реальный груз",
            "weight_tons": 12,
            "volume_m3": 48,
            "currency": "USD",
        },
        "driver": {
            "full_name": "Иван Петров",
            "phone": "+70000000000",
            "vehicle_plate": "A123BC",
        },
        "shipper": {"full_name": "ООО Реальный отправитель"},
    }


def test_ttn_pdf_falls_back_to_printable_html_without_weasyprint(monkeypatch):
    real_import = builtins.__import__

    def import_without_weasyprint(name, *args, **kwargs):
        if name == "weasyprint":
            raise ImportError("weasyprint intentionally unavailable")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_weasyprint)
    monkeypatch.setattr(
        documents,
        "_load_document_context",
        lambda reference_id, user_id: _authorized_context(),
    )

    response = documents.download_ttn_pdf("trip-real-123", user={"id": "driver-1"})

    assert isinstance(response, HTMLResponse)
    assert response.status_code == 200
    assert response.media_type == "text/html"
    assert response.headers["x-urtruck-pdf-fallback"] == "html"
    assert "Москва" in response.body.decode("utf-8")
    assert "Казань" in response.body.decode("utf-8")
    assert "4200" in response.body.decode("utf-8")
    assert "Алматы" not in response.body.decode("utf-8")


def test_document_context_rejects_non_participant(monkeypatch):
    def reject(reference_id, user_id):
        raise HTTPException(status_code=403, detail="Документ доступен только участникам сделки")

    monkeypatch.setattr(documents, "_load_document_context", reject)

    with pytest.raises(HTTPException) as exc:
        documents.generate_ttn("deal-real-123", user={"id": "outsider"})

    assert exc.value.status_code == 403
