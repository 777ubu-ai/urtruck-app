import builtins

import pytest
from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from api import documents
from database.db import get_conn


@pytest.fixture(autouse=True)
def _ttn_data():
    with get_conn() as conn:
        for table, ids in {
            "deals": ("ttn-deal-a", "ttn-deal-b"),
            "cargos": ("ttn-cargo-a", "ttn-cargo-b"),
            "trips": ("ttn-trip-a", "ttn-trip-b"),
            "drivers_registration": ("ttn-shipper", "ttn-driver", "ttn-other"),
        }.items():
            placeholders = ",".join("?" for _ in ids)
            conn.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", ids)
        conn.execute(
            "INSERT INTO drivers_registration(id, full_name, phone, role, vehicle_type, vehicle_brand) VALUES (?,?,?,?,?,?)",
            ("ttn-shipper", "Shipper A", "+70000000001", "client", None, None),
        )
        conn.execute(
            "INSERT INTO drivers_registration(id, full_name, phone, role, vehicle_type, vehicle_brand) VALUES (?,?,?,?,?,?)",
            ("ttn-driver", "Driver A", "+70000000002", "driver", "tent", "Truck A"),
        )
        conn.execute(
            "INSERT INTO drivers_registration(id, full_name, phone, role) VALUES (?,?,?,?)",
            ("ttn-other", "Outsider", "+70000000003", "client"),
        )
        for suffix, origin, destination, cargo, amount in (
            ("a", "Shymkent", "Astana", "Steel parts", 2400),
            ("b", "Almaty", "Bishkek", "Food cargo", 3100),
        ):
            conn.execute(
                "INSERT INTO cargos(id, owner_id, from_city, to_city, cargo_desc, cargo_type, weight_tons, volume_m3, price, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (f"ttn-cargo-{suffix}", "ttn-shipper", origin, destination, cargo, "tent", 12, 44, amount, "taken"),
            )
            conn.execute(
                "INSERT INTO trips(id, driver_id, from_city, to_city, truck_type, capacity_tons, available_m3, price, status) VALUES (?,?,?,?,?,?,?,?,?)",
                (f"ttn-trip-{suffix}", "ttn-driver", origin, destination, "tent", 20, 82, amount, "booked"),
            )
            conn.execute(
                "INSERT INTO deals(id, cargo_id, trip_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (f"ttn-deal-{suffix}", f"ttn-cargo-{suffix}", f"ttn-trip-{suffix}", f"ttn-bid-{suffix}", "ttn-shipper", "ttn-driver", origin, destination, amount, "accepted"),
            )
    yield


def _without_weasyprint(name, real_import):
    if name == "weasyprint":
        raise ImportError("weasyprint intentionally unavailable")
    return real_import(name)


def test_ttn_uses_canonical_deal_data_and_html_pdf_fallback(monkeypatch):
    real_import = builtins.__import__
    monkeypatch.setattr(builtins, "__import__", lambda name, *a, **k: _without_weasyprint(name, real_import))

    response = documents.download_ttn_pdf("ttn-trip-a", user={"id": "ttn-shipper"})

    assert isinstance(response, HTMLResponse)
    body = response.body.decode("utf-8")
    assert response.headers["x-urtruck-pdf-fallback"] == "html"
    assert "Shymkent" in body and "Astana" in body
    assert "Steel parts" in body and "$2400" in body
    assert "Алматы" not in body
    assert "Food cargo" not in body


def test_ttn_different_deal_cannot_leak_into_document():
    response = documents.generate_ttn("ttn-trip-b", user={"id": "ttn-driver"})
    body = response.body.decode("utf-8")
    assert "Almaty" in body and "Bishkek" in body
    assert "Food cargo" in body and "$3100" in body
    assert "Steel parts" not in body


def test_ttn_outsider_and_unknown_reference_are_denied():
    with pytest.raises(HTTPException) as outsider:
        documents.generate_ttn("ttn-trip-a", user={"id": "ttn-other"})
    assert outsider.value.status_code == 403

    with pytest.raises(HTTPException) as missing:
        documents.generate_ttn("missing-trip", user={"id": "ttn-shipper"})
    assert missing.value.status_code == 404


def test_ttn_missing_required_data_is_fail_visible():
    with get_conn() as conn:
        conn.execute("UPDATE cargos SET weight_tons = 0 WHERE id = 'ttn-cargo-a'")
    with pytest.raises(HTTPException) as exc:
        documents.generate_ttn("ttn-trip-a", user={"id": "ttn-shipper"})
    assert exc.value.status_code == 409
    assert "weight" in exc.value.detail["fields"]
