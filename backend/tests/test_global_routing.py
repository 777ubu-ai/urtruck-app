import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.verification_gate import get_user
from api import routing


app = FastAPI()
app.include_router(routing.routing_router, prefix="/api/v1/routing")
app.dependency_overrides[get_user] = lambda: {"id": "routing-test-user", "role": "driver"}
client = TestClient(app)


def setup_function():
    routing._route_cache.clear()
    os.environ.pop("OPENROUTESERVICE_API_KEY", None)
    os.environ.pop("ORS_API_KEY", None)


def test_global_routing_fails_closed_without_server_key():
    response = client.post(
        "/api/v1/routing/road-route",
        json={
            "points": [
                {"lat": 23.1291, "lng": 113.2644},
                {"lat": 51.1694, "lng": 71.4491},
            ]
        },
    )
    assert response.status_code == 503, response.text
    assert response.json()["detail"] == "global_routing_not_configured"


def test_hgv_options_use_real_vehicle_restrictions():
    vehicle = routing.VehicleSpec(
        height_m=4.0,
        width_m=2.55,
        length_m=16.5,
        weight_t=23.0,
        axle_load_t=10.0,
    )
    options = routing._ors_options(vehicle)
    assert options["vehicle_type"] == "hgv"
    restrictions = options["profile_params"]["restrictions"]
    assert restrictions == {
        "height": 4.0,
        "width": 2.55,
        "length": 16.5,
        "weight": 23.0,
        "axleload": 10.0,
    }


def test_global_route_returns_real_geometry_distance_and_duration(monkeypatch):
    os.environ["OPENROUTESERVICE_API_KEY"] = "unit-test-key"
    calls = []

    async def fake_provider(body, api_key):
        calls.append((body, api_key))
        return {
            "ok": True,
            "provider": "openrouteservice",
            "profile": "driving-hgv",
            "distance_m": 5843000,
            "duration_s": 331200,
            "geometry": [
                [23.1291, 113.2644],
                [43.8256, 87.6168],
                [51.1694, 71.4491],
            ],
            "cached": False,
        }

    monkeypatch.setattr(routing, "_request_ors", fake_provider)
    response = client.post(
        "/api/v1/routing/road-route",
        json={
            "points": [
                {"lat": 23.1291, "lng": 113.2644},
                {"lat": 51.1694, "lng": 71.4491},
            ],
            "vehicle": {"weight_t": 23},
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["distance_m"] == 5843000
    assert data["duration_s"] == 331200
    assert len(data["geometry"]) == 3
    assert data["provider"] == "openrouteservice"
    assert calls and calls[0][1] == "unit-test-key"

    # The second identical request must use the short cache instead of
    # charging the external provider again.
    response2 = client.post(
        "/api/v1/routing/road-route",
        json={
            "points": [
                {"lat": 23.1291, "lng": 113.2644},
                {"lat": 51.1694, "lng": 71.4491},
            ],
            "vehicle": {"weight_t": 23},
        },
    )
    assert response2.status_code == 200
    assert response2.json()["cached"] is True
    assert len(calls) == 1
