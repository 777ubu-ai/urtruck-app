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


# Ночной аудит: цена, участники и HTML должны происходить из проверенного рейса.
def test_ttn_html_escapes_user_fields():
    payload = '<img src="http://127.0.0.1/private"><script>alert(1)</script>'
    html = documents._ttn_html(
        {"id": "trip-safe", "from": payload, "to": "Москва & Алматы",
         "cargo": payload, "price": 8888},
        {"full_name": payload, "phone": payload}, client_name=payload,
    )
    assert "<script>" not in html and "<img " not in html
    assert "&lt;img" in html and "&lt;script&gt;" in html
    assert "Москва &amp; Алматы" in html
    assert "$8888" in html


def test_ttn_uses_trip_price_and_carrier_for_shipper(monkeypatch):
    from database import registration_dal
    seen = []
    monkeypatch.setattr(documents, "_require_ttn_participant", lambda *_: {
        "id": "trip-safe", "from_city": "Хоргос", "to_city": "Москва",
        "driver_id": "carrier-id", "price": 8888, "available_m3": 120,
        "capacity_tons": 15, "truck_type": "refrigerator", "transit": "Нур Жолы",
    })
    def get_driver(uid):
        seen.append(uid)
        return {"full_name": "Реальный перевозчик", "vehicle_type": "refrigerator"}
    monkeypatch.setattr(registration_dal, "get_driver", get_driver)
    response = documents.generate_ttn("trip-safe", user={"id": "shipper-id", "full_name": "Отправитель"})
    html = response.body.decode()
    assert seen == ["carrier-id"]
    assert "$8888" in html and "$1500" not in html
    assert "Реальный перевозчик" in html and "Отправитель" in html
    assert "120 м³" in html and "Нур Жолы" in html


def test_ttn_pdf_and_html_use_same_trip_data(monkeypatch):
    from database import registration_dal
    import types
    captured = {}
    monkeypatch.setattr(documents, "_require_ttn_participant", lambda *_: {
        "id": "trip-safe", "from_city": "Хоргос", "to_city": "Москва",
        "driver_id": "carrier-id", "price": 7777, "available_m3": 119,
        "capacity_tons": 14, "truck_type": "tent", "transit": "Нур Жолы",
    })
    monkeypatch.setattr(registration_dal, "get_driver", lambda uid: {
        "full_name": "Перевозчик " + uid, "vehicle_type": "tent",
    })
    class SafePDF:
        def __init__(self, string):
            captured["html"] = string
        def write_pdf(self):
            return b"%PDF-test"
    monkeypatch.setitem(__import__("sys").modules, "weasyprint", types.SimpleNamespace(HTML=SafePDF))
    response = documents.download_ttn_pdf("trip-safe", user={"id": "shipper-id", "full_name": "Отправитель"})
    assert response.media_type == "application/pdf"
    for value in ("$7777", "119 м³", "Нур Жолы", "Перевозчик carrier-id", "Отправитель"):
        assert value in captured["html"]


def test_ttn_driver_is_not_invented_as_shipper(monkeypatch):
    from database import registration_dal
    monkeypatch.setattr(documents, "_require_ttn_participant", lambda *_: {
        "id": "trip-safe", "driver_id": "carrier-id", "from_city": "Алматы", "to_city": "Москва",
    })
    monkeypatch.setattr(registration_dal, "get_driver", lambda _: {"full_name": "Перевозчик"})
    html = documents.generate_ttn("trip-safe", user={"id": "carrier-id", "full_name": "Перевозчик"}).body.decode()
    shipper_part = html.split("<h3>Грузоотправитель</h3>")[1]
    assert "Перевозчик" not in shipper_part
    assert "$1500" not in html and "$—" in html


def test_ttn_denies_before_reading_carrier(monkeypatch):
    from database import registration_dal
    from fastapi import HTTPException
    import pytest
    def denied(*_):
        raise HTTPException(status_code=403)
    def forbidden_lookup(_):
        raise AssertionError("Данные перевозчика нельзя читать до проверки доступа")
    monkeypatch.setattr(documents, "_require_ttn_participant", denied)
    monkeypatch.setattr(registration_dal, "get_driver", forbidden_lookup)
    for endpoint in (documents.generate_ttn, documents.download_ttn_pdf):
        with pytest.raises(HTTPException) as exc:
            endpoint("trip-foreign", user={"id": "stranger"})
        assert exc.value.status_code == 403


def test_ttn_participant_gate_on_real_isolated_database():
    from database.db import get_conn
    from fastapi import HTTPException
    from uuid import uuid4
    import pytest
    trip_id, deal_id = str(uuid4()), str(uuid4())
    with get_conn() as conn:
        conn.execute("INSERT INTO trips(id,driver_id,from_city,to_city,price) VALUES(?,?,?,?,?)",
                     (trip_id, "ttn-carrier", "Хоргос", "Москва", 8888))
        conn.execute("INSERT INTO deals(id,trip_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status) VALUES(?,?,?,?,?,?,?,?,?)",
                     (deal_id, trip_id, str(uuid4()), "ttn-shipper", "ttn-carrier", "Хоргос", "Москва", 8888, "accepted"))
    for uid in ("ttn-carrier", "ttn-shipper"):
        assert documents._require_ttn_participant(trip_id, {"id": uid})["id"] == trip_id
    with pytest.raises(HTTPException) as exc:
        documents._require_ttn_participant(trip_id, {"id": "ttn-stranger"})
    assert exc.value.status_code == 403
    with get_conn() as conn:
        conn.execute("UPDATE deals SET status='cancelled' WHERE id=?", (deal_id,))
    with pytest.raises(HTTPException) as exc:
        documents._require_ttn_participant(trip_id, {"id": "ttn-shipper"})
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        documents._require_ttn_participant("missing-trip", {"id": "ttn-carrier"})
    assert exc.value.status_code == 404
