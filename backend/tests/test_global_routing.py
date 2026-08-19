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
    for key in ("YANDEX_ROUTER_API_KEY", "OPENROUTESERVICE_API_KEY", "ORS_API_KEY"):
        os.environ.pop(key, None)


def test_routing_fails_closed_without_server_key():
    response = client.post(
        "/api/v1/routing/road-route",
        json={"points": [{"lat": 43.2389, "lng": 76.8897}, {"lat": 55.7558, "lng": 37.6176}]},
    )
    assert response.status_code == 503, response.text
    assert response.json()["detail"] == "road_routing_not_configured"


def test_yandex_truck_params_include_real_vehicle_restrictions():
    body = routing.RoadRouteRequest(
        points=[routing.RoutePoint(lat=43.2389, lng=76.8897), routing.RoutePoint(lat=55.7558, lng=37.6176)],
        vehicle=routing.VehicleSpec(
            height_m=4.0,
            width_m=2.55,
            length_m=16.5,
            weight_t=23.0,
            axle_load_t=10.0,
            has_trailer=True,
        ),
    )
    params = routing._yandex_params(body, "secret", "truck")
    assert params["mode"] == "truck"
    assert params["weight"] == 23.0
    assert params["axle_weight"] == 10.0
    assert params["height"] == 4.0
    assert params["width"] == 2.55
    assert params["length"] == 16.5
    assert params["has_trailer"] == "true"
    assert params["waypoints"].startswith("43.2389,76.8897|")


def test_payload_t_maps_to_yandex_payload_param_not_weight():
    """Round-2 independent re-review on PR #239 (2026-08-19): weight_t and
    payload_t are DIFFERENT quantities per Yandex Router API semantics —
    weight = actual full vehicle mass, payload = mass of goods carried.
    trip capacity / cargo weight is payload-shaped data, never a real full
    vehicle mass, so it must reach Yandex as `payload`, never `weight`."""
    body = routing.RoadRouteRequest(
        points=[routing.RoutePoint(lat=43.2389, lng=76.8897), routing.RoutePoint(lat=55.7558, lng=37.6176)],
        vehicle=routing.VehicleSpec(payload_t=18.5),
    )
    params = routing._yandex_params(body, "secret", "truck")
    assert params["payload"] == 18.5
    assert "weight" not in params


def test_weight_t_and_payload_t_both_present_map_to_distinct_yandex_params():
    body = routing.RoadRouteRequest(
        points=[routing.RoutePoint(lat=43.2389, lng=76.8897), routing.RoutePoint(lat=55.7558, lng=37.6176)],
        vehicle=routing.VehicleSpec(weight_t=23.0, payload_t=18.5),
    )
    params = routing._yandex_params(body, "secret", "truck")
    assert params["weight"] == 23.0
    assert params["payload"] == 18.5


def test_ors_weight_restriction_ignores_payload_t_when_full_mass_unknown():
    """Same round-2 requirement, applied to the OpenRouteService fallback:
    ORS's restrictions.weight also means the vehicle's actual full mass, so
    a payload-only VehicleSpec must not produce a weight restriction —
    doing so would misrepresent the real weight limit a road/bridge
    enforces."""
    options = routing._ors_options(routing.VehicleSpec(payload_t=18.5))
    restrictions = options.get("profile_params", {}).get("restrictions", {})
    assert "weight" not in restrictions

    options_with_weight = routing._ors_options(routing.VehicleSpec(weight_t=23.0, payload_t=18.5))
    assert options_with_weight["profile_params"]["restrictions"]["weight"] == 23.0


def test_almaty_moscow_uses_yandex_first_and_caches(monkeypatch):
    os.environ["YANDEX_ROUTER_API_KEY"] = "yandex-test-key"
    calls = []

    async def fake_yandex(body, api_key):
        calls.append((body, api_key))
        return {
            "ok": True,
            "provider": "yandex",
            "profile": "truck",
            "distance_m": 4123000,
            "duration_s": 219600,
            "geometry": [
                [43.2389, 76.8897],
                [51.1694, 71.4491],
                [55.7558, 37.6176],
            ],
            "cached": False,
        }

    monkeypatch.setattr(routing, "_request_yandex", fake_yandex)
    response = client.post(
        "/api/v1/routing/road-route",
        json={"points": [{"lat": 43.2389, "lng": 76.8897}, {"lat": 55.7558, "lng": 37.6176}]},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["provider"] == "yandex"
    assert data["distance_m"] == 4123000
    assert data["duration_s"] == 219600
    assert len(data["geometry"]) == 3
    assert len(calls) == 1

    response2 = client.post(
        "/api/v1/routing/road-route",
        json={"points": [{"lat": 43.2389, "lng": 76.8897}, {"lat": 55.7558, "lng": 37.6176}]},
    )
    assert response2.status_code == 200
    assert response2.json()["cached"] is True
    assert len(calls) == 1


def test_china_corridor_prefers_global_hgv_when_configured(monkeypatch):
    os.environ["YANDEX_ROUTER_API_KEY"] = "yandex-test-key"
    os.environ["OPENROUTESERVICE_API_KEY"] = "global-test-key"
    calls = []

    async def fake_global(body, api_key):
        calls.append(("global", api_key))
        return {
            "ok": True,
            "provider": "openrouteservice",
            "profile": "driving-hgv",
            "distance_m": 5843000,
            "duration_s": 331200,
            "geometry": [[23.1291, 113.2644], [43.8256, 87.6168], [51.1694, 71.4491]],
            "cached": False,
        }

    async def unexpected_yandex(*_args, **_kwargs):
        raise AssertionError("China corridor should prefer configured global HGV provider")

    monkeypatch.setattr(routing, "_request_ors", fake_global)
    monkeypatch.setattr(routing, "_request_yandex", unexpected_yandex)
    response = client.post(
        "/api/v1/routing/road-route",
        json={"points": [{"lat": 23.1291, "lng": 113.2644}, {"lat": 51.1694, "lng": 71.4491}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["provider"] == "openrouteservice"
    assert calls == [("global", "global-test-key")]


def test_yandex_failure_can_fall_back_to_real_global_road(monkeypatch):
    os.environ["YANDEX_ROUTER_API_KEY"] = "yandex-test-key"
    os.environ["OPENROUTESERVICE_API_KEY"] = "global-test-key"

    async def fail_yandex(*_args, **_kwargs):
        raise RuntimeError("yandex unavailable")

    async def fake_global(body, api_key):
        return {
            "ok": True,
            "provider": "openrouteservice",
            "profile": "driving-hgv",
            "distance_m": 4100000,
            "duration_s": 210000,
            "geometry": [[43.2389, 76.8897], [55.7558, 37.6176]],
            "cached": False,
        }

    monkeypatch.setattr(routing, "_request_yandex", fail_yandex)
    monkeypatch.setattr(routing, "_request_ors", fake_global)
    response = client.post(
        "/api/v1/routing/road-route",
        json={"points": [{"lat": 43.2389, "lng": 76.8897}, {"lat": 55.7558, "lng": 37.6176}]},
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "openrouteservice"


def test_yandex_parser_returns_polyline_distance_and_duration():
    parsed = routing._parse_yandex_route(
        {
            "route": {
                "legs": [{
                    "status": "OK",
                    "steps": [
                        {"length": 1000, "duration": 100, "polyline": {"points": [[43.2, 76.8], [44.0, 70.0]]}},
                        {"length": 2500, "duration": 200, "polyline": {"points": [[44.0, 70.0], [55.7, 37.6]]}},
                    ],
                }],
            }
        },
        "truck",
    )
    assert parsed["provider"] == "yandex"
    assert parsed["profile"] == "truck"
    assert parsed["distance_m"] == 3500
    assert parsed["duration_s"] == 300
    assert parsed["geometry"] == [[43.2, 76.8], [44.0, 70.0], [55.7, 37.6]]
