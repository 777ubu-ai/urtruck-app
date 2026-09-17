import builtins

from fastapi.responses import HTMLResponse

from api import documents


def test_ttn_pdf_falls_back_to_printable_html_without_weasyprint(monkeypatch):
    real_import = builtins.__import__

    def import_without_weasyprint(name, *args, **kwargs):
        if name == "weasyprint":
            raise ImportError("weasyprint intentionally unavailable")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_weasyprint)
    monkeypatch.setattr(documents, "_require_ttn_participant", lambda *_: {
        "id": 'trip-"unsafe', "from_city": "Алматы", "to_city": "Астана",
        "cargo": "Товары", "capacity_tons": 20, "volume_m3": 82,
        "truck_type": "tent", "price": 1500, "driver_id": "test-user",
    })

    response = documents.download_ttn_pdf('trip-"unsafe', user={"id": "test-user"})

    assert isinstance(response, HTMLResponse)
    assert response.status_code == 200
    assert response.media_type == "text/html"
    assert response.headers["x-urtruck-pdf-fallback"] == "html"
    assert response.headers["content-disposition"] == 'inline; filename="TTN-trip-un.html"'
    assert "Товарно-транспортная накладная" in response.body.decode("utf-8")
