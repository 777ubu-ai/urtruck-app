import builtins

from fastapi.responses import HTMLResponse
from database.db import get_conn
from fastapi import HTTPException

from api import documents


def _seed_ttn():
    with get_conn() as conn:
        conn.execute("DELETE FROM deals WHERE id='doc-deal-a'")
        conn.execute("DELETE FROM trips WHERE id='doc-trip-a'")
        conn.execute("DELETE FROM cargos WHERE id='doc-cargo-a'")
        conn.execute("DELETE FROM drivers_registration WHERE id IN ('doc-driver-a','doc-shipper-a','doc-outsider')")
        conn.execute(
            "INSERT INTO drivers_registration(id, phone, full_name, role, status, vehicle_type, vehicle_plate, vehicle_brand, vehicle_year) VALUES (?,?,?,?,?,?,?,?,?)",
            ('doc-driver-a', '+70000000001', 'Driver A', 'driver', 'approved', 'tent', 'A001AA', 'Volvo', 2024),
        )
        conn.execute(
            "INSERT INTO drivers_registration(id, phone, full_name, role, status) VALUES (?,?,?,?,?)",
            ('doc-shipper-a', '+70000000002', 'Shipper A', 'client', 'approved'),
        )
        conn.execute(
            "INSERT INTO drivers_registration(id, phone, full_name, role, status) VALUES (?,?,?,?,?)",
            ('doc-outsider', '+70000000003', 'Outsider', 'client', 'approved'),
        )
        conn.execute(
            "INSERT INTO cargos(id, owner_id, from_city, to_city, cargo_desc, weight_tons, volume_m3, status) VALUES (?,?,?,?,?,?,?,?)",
            ('doc-cargo-a', 'doc-shipper-a', 'Shymkent', 'Astana', 'Industrial parts', 12, 45, 'taken'),
        )
        conn.execute(
            "INSERT INTO trips(id, driver_id, from_city, to_city, transit, truck_type, capacity_tons, available_m3, departure, arrival, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            ('doc-trip-a', 'doc-driver-a', 'Shymkent', 'Astana', 'KZ', 'tent', 20, 82, '2026-09-10', '2026-09-12', 'booked'),
        )
        conn.execute(
            "INSERT INTO deals(id, cargo_id, trip_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            ('doc-deal-a', 'doc-cargo-a', 'doc-trip-a', 'doc-bid-a', 'doc-shipper-a', 'doc-driver-a', 'Shymkent', 'Astana', 2400, 'accepted'),
        )


def test_ttn_pdf_falls_back_to_printable_html_without_weasyprint(monkeypatch):
    _seed_ttn()
    real_import = builtins.__import__

    def import_without_weasyprint(name, *args, **kwargs):
        if name == "weasyprint":
            raise ImportError("weasyprint intentionally unavailable")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_weasyprint)

    response = documents.download_ttn_pdf('doc-trip-a', user={"id": "doc-driver-a"})

    assert isinstance(response, HTMLResponse)
    assert response.status_code == 200
    assert response.media_type == "text/html"
    assert response.headers["x-urtruck-pdf-fallback"] == "html"
    assert response.headers["content-disposition"] == 'inline; filename="TTN-doc-trip.html"'
    assert "Товарно-транспортная накладная" in response.body.decode("utf-8")
    body = response.body.decode("utf-8")
    assert "Shymkent" in body
    assert "Astana" in body
    assert "Industrial parts" in body
    assert "$2400" in body
    assert "Алматы" not in body


def test_ttn_rejects_outsider_and_missing_trip():
    _seed_ttn()
    try:
        documents.generate_ttn("doc-trip-a", user={"id": "doc-outsider"})
        assert False, "outsider must be rejected"
    except HTTPException as exc:
        assert exc.status_code == 403
    try:
        documents.generate_ttn("missing-trip", user={"id": "doc-driver-a"})
        assert False, "missing trip must be rejected"
    except HTTPException as exc:
        assert exc.status_code == 404


def test_ttn_does_not_invent_missing_required_data():
    _seed_ttn()
    with get_conn() as conn:
        conn.execute("UPDATE cargos SET weight_tons=0 WHERE id='doc-cargo-a'")
    try:
        documents.generate_ttn("doc-trip-a", user={"id": "doc-driver-a"})
        assert False, "incomplete TTN data must be visible"
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "tons" in exc.detail["missing"]
