"""Server-side road routing for UrTruck.

Visual map stays Yandex. Road geometry is calculated server-side so web/native
clients receive one trusted polyline + distance/duration without exposing
provider keys.

Policy:
- KZ/RU/CIS: Yandex Router API, truck first.
- If a city-level destination cannot be reached in truck mode (for example a
  restricted city centre), retry Yandex driving mode to keep a real road plan;
  precise truck restrictions take over once a precise address/vehicle is known.
- China / unsupported Yandex corridors: global HGV provider fallback.
- Never fabricate road distance/ETA from a straight line.
"""
from __future__ import annotations

import math
import os
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.verification_gate import get_user

routing_router = APIRouter(tags=["routing"])

_YANDEX_URL = "https://api.routing.yandex.net/v2/route"
_ORS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson"
_CACHE_TTL_SECONDS = 15 * 60
_CACHE_MAX_ITEMS = 256
_route_cache: dict[str, tuple[float, dict]] = {}


class RoutePoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class VehicleSpec(BaseModel):
    height_m: Optional[float] = Field(default=None, gt=0, le=6)
    width_m: Optional[float] = Field(default=None, gt=0, le=5)
    length_m: Optional[float] = Field(default=None, gt=0, le=40)
    # 2026-08-19 (P1 re-review, независимый merge-block на PR #239): weight_t
    # и payload_t — РАЗНЫЕ величины по семантике Yandex Router API, путать
    # их нельзя. weight_t — фактическая полная масса автомобиля (тягач +
    # прицеп + груз), уходит в параметр Yandex `weight`. payload_t —
    # грузоподъёмность/масса перевозимого груза, уходит в отдельный
    # параметр Yandex `payload`. У нас нигде не собирается фактическая
    # полная масса тягача — только грузоподъёмность рейса
    # (trips.capacity_tons) и вес конкретного груза (cargos.weight_tons).
    # Раньше это ошибочно подставлялось в weight_t, что искажает весовые
    # ограничения маршрута (заниженная оценка полной массы автомобиля).
    weight_t: Optional[float] = Field(default=None, gt=0, le=100)
    payload_t: Optional[float] = Field(default=None, gt=0, le=100)
    axle_load_t: Optional[float] = Field(default=None, gt=0, le=30)
    has_trailer: Optional[bool] = None


class RoadRouteRequest(BaseModel):
    points: List[RoutePoint] = Field(min_length=2, max_length=20)
    vehicle: Optional[VehicleSpec] = None


def _cache_key(body: RoadRouteRequest) -> str:
    point_key = ";".join(f"{p.lat:.5f},{p.lng:.5f}" for p in body.points)
    vehicle = body.vehicle
    if not vehicle:
        return point_key
    return (
        f"{point_key}|h={vehicle.height_m}|w={vehicle.width_m}|l={vehicle.length_m}"
        f"|wt={vehicle.weight_t}|pl={vehicle.payload_t}|ax={vehicle.axle_load_t}|tr={vehicle.has_trailer}"
    )


def _cache_get(key: str) -> Optional[dict]:
    item = _route_cache.get(key)
    if not item:
        return None
    created_at, payload = item
    if time.time() - created_at > _CACHE_TTL_SECONDS:
        _route_cache.pop(key, None)
        return None
    return {**payload, "cached": True}


def _cache_put(key: str, payload: dict) -> None:
    if len(_route_cache) >= _CACHE_MAX_ITEMS:
        oldest = min(_route_cache.items(), key=lambda entry: entry[1][0])[0]
        _route_cache.pop(oldest, None)
    _route_cache[key] = (time.time(), payload)


def _downsample(points: list[list[float]], limit: int = 5000) -> list[list[float]]:
    if len(points) <= limit:
        return points
    step = max(1, math.ceil((len(points) - 2) / (limit - 2)))
    sampled = [points[0], *points[1:-1:step], points[-1]]
    return sampled[:limit - 1] + [points[-1]] if len(sampled) > limit else sampled


def _append_polyline(target: list[list[float]], points) -> None:
    for raw in points or []:
        if not isinstance(raw, (list, tuple)) or len(raw) < 2:
            continue
        lat = float(raw[0])
        lng = float(raw[1])
        if not (math.isfinite(lat) and math.isfinite(lng)):
            continue
        point = [lat, lng]
        if target and abs(target[-1][0] - lat) < 1e-7 and abs(target[-1][1] - lng) < 1e-7:
            continue
        target.append(point)


def _looks_like_china_corridor(points: List[RoutePoint]) -> bool:
    for p in points:
        if p.lng >= 90 and 18 <= p.lat <= 55:
            return True
        if p.lng >= 105 and p.lat < 45:
            return True
    return False


def _yandex_params(body: RoadRouteRequest, api_key: str, mode: str = "truck") -> dict:
    params = {
        "waypoints": "|".join(f"{p.lat},{p.lng}" for p in body.points),
        "mode": mode,
        "traffic": "disabled",
        "apikey": api_key,
    }
    vehicle = body.vehicle
    if mode == "truck" and vehicle:
        # weight = фактическая полная масса автомобиля, payload = масса
        # только перевозимого груза — Yandex различает эти параметры,
        # подставлять одно вместо другого нельзя (см. VehicleSpec).
        if vehicle.weight_t is not None:
            params["weight"] = vehicle.weight_t
        if vehicle.payload_t is not None:
            params["payload"] = vehicle.payload_t
        if vehicle.axle_load_t is not None:
            params["axle_weight"] = vehicle.axle_load_t
        if vehicle.height_m is not None:
            params["height"] = vehicle.height_m
        if vehicle.width_m is not None:
            params["width"] = vehicle.width_m
        if vehicle.length_m is not None:
            params["length"] = vehicle.length_m
        if vehicle.has_trailer is not None:
            params["has_trailer"] = "true" if vehicle.has_trailer else "false"
    return params


def _parse_yandex_route(data: dict, mode: str) -> dict:
    route = data.get("route") or {}
    legs = route.get("legs") or []
    if not legs:
        raise RuntimeError(f"yandex_{mode}_no_legs")

    geometry: list[list[float]] = []
    distance_m = 0.0
    duration_s = 0.0
    for leg in legs:
        if leg.get("status") != "OK":
            raise RuntimeError(f"yandex_{mode}_leg_{leg.get('status') or 'FAIL'}")
        for step in leg.get("steps") or []:
            distance_m += float(step.get("length") or 0)
            duration_s += float(step.get("duration") or 0)
            _append_polyline(geometry, (step.get("polyline") or {}).get("points") or [])

    if len(geometry) < 2 or distance_m <= 0 or duration_s <= 0:
        raise RuntimeError(f"yandex_{mode}_empty_route")

    return {
        "ok": True,
        "provider": "yandex",
        "profile": mode,
        "distance_m": round(distance_m),
        "duration_s": round(duration_s),
        "geometry": _downsample(geometry),
        "cached": False,
    }


async def _request_yandex_mode(body: RoadRouteRequest, api_key: str, mode: str) -> dict:
    timeout = httpx.Timeout(25.0, connect=7.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(_YANDEX_URL, params=_yandex_params(body, api_key, mode))

    if response.status_code >= 400:
        detail = "router_failed"
        try:
            data = response.json()
            errors = data.get("errors")
            if isinstance(errors, list) and errors:
                detail = str(errors[0])
        except Exception:
            pass
        raise RuntimeError(f"yandex_{mode}_http_{response.status_code}: {detail}")

    try:
        return _parse_yandex_route(response.json(), mode)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"yandex_{mode}_invalid_response") from exc


async def _request_yandex(body: RoadRouteRequest, api_key: str) -> dict:
    """Truck route first; driving is a real-road city-level fallback.

    The fallback is intentionally not presented as truck-restriction-aware;
    `profile` tells clients/tests which route was returned.
    """
    errors = []
    for mode in ("truck", "driving"):
        try:
            return await _request_yandex_mode(body, api_key, mode)
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError("; ".join(errors) or "yandex_route_unavailable")


def _ors_options(vehicle: Optional[VehicleSpec]) -> dict:
    if not vehicle:
        return {"vehicle_type": "hgv"}
    restrictions = {}
    if vehicle.height_m is not None:
        restrictions["height"] = vehicle.height_m
    if vehicle.width_m is not None:
        restrictions["width"] = vehicle.width_m
    if vehicle.length_m is not None:
        restrictions["length"] = vehicle.length_m
    # 2026-08-19 (P1 re-review): ORS's "weight" restriction means the
    # vehicle's actual full weight, same as Yandex's `weight` param —
    # deliberately reads ONLY vehicle.weight_t, never payload_t/cargo
    # weight. We don't collect a truck's actual full mass anywhere, so
    # this restriction stays unset until that data exists; do not derive
    # it from payload capacity or cargo weight (would misrepresent the
    # real weight limit a bridge/road enforces).
    if vehicle.weight_t is not None:
        restrictions["weight"] = vehicle.weight_t
    if vehicle.axle_load_t is not None:
        restrictions["axleload"] = vehicle.axle_load_t
    result = {"vehicle_type": "hgv"}
    if restrictions:
        result["profile_params"] = {"restrictions": restrictions}
    return result


async def _request_ors(body: RoadRouteRequest, api_key: str) -> dict:
    coordinates = [[p.lng, p.lat] for p in body.points]
    request_body = {
        "coordinates": coordinates,
        "preference": "recommended",
        "instructions": False,
        "geometry": True,
        "options": _ors_options(body.vehicle),
    }
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
        "Accept": "application/geo+json, application/json",
    }
    timeout = httpx.Timeout(25.0, connect=7.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(_ORS_URL, headers=headers, json=request_body)

    if response.status_code >= 400:
        detail = "global_router_failed"
        try:
            data = response.json()
            err = data.get("error")
            if isinstance(err, dict):
                detail = err.get("message") or detail
            elif err:
                detail = str(err)
        except Exception:
            pass
        raise RuntimeError(f"global_router_http_{response.status_code}: {detail}")

    try:
        data = response.json()
        feature = (data.get("features") or [])[0]
        summary = (feature.get("properties") or {}).get("summary") or {}
        raw_geometry = ((feature.get("geometry") or {}).get("coordinates") or [])
        geometry = _downsample([[float(lat), float(lng)] for lng, lat in raw_geometry])
        distance_m = float(summary.get("distance"))
        duration_s = float(summary.get("duration"))
    except Exception as exc:
        raise RuntimeError("global_router_invalid_response") from exc

    if len(geometry) < 2 or distance_m <= 0 or duration_s <= 0:
        raise RuntimeError("global_router_empty_route")

    return {
        "ok": True,
        "provider": "openrouteservice",
        "profile": "driving-hgv",
        "distance_m": round(distance_m),
        "duration_s": round(duration_s),
        "geometry": geometry,
        "cached": False,
    }


# 2026-08-19 (owner, live production report: "3978 км за 2 дня 5 часов не
# реально, ещё и границы проезжать") — Yandex/ORS duration_s is pure
# nonstop driving time. For a multi-day international route that is
# neither legal nor physically sustainable for one commercial driver:
# КЗ/РФ international cargo drivers operate under driving-hour limits
# close to the AETR standard other CIS carriers also follow in practice —
# roughly 9h of driving per day before mandatory rest. Presenting the raw
# nonstop figure as "time in transit" overpromises delivery speed to both
# sides of a deal. Convert it into a realistic calendar-time estimate:
# every day beyond the first adds the mandatory rest hours (24 minus the
# daily driving cap) on top of that day's actual driving.
#
# Border-crossing wait time is intentionally NOT modeled here — this repo
# has no reliable live border-wait data source wired into this endpoint
# (see the separate borders/queues domain), and a made-up fixed number
# would just be a different kind of dishonest estimate. This is a lower
# bound on realistic delivery time, not an upper one.
_MAX_DRIVING_HOURS_PER_DAY = 9


def _realistic_duration_s(raw_duration_s: float) -> float:
    if not raw_duration_s or raw_duration_s <= 0:
        return raw_duration_s
    raw_hours = raw_duration_s / 3600
    driving_days = math.ceil(raw_hours / _MAX_DRIVING_HOURS_PER_DAY)
    if driving_days <= 1:
        return raw_duration_s  # fits in one legal driving day, no adjustment
    rest_hours = (driving_days - 1) * (24 - _MAX_DRIVING_HOURS_PER_DAY)
    return raw_duration_s + rest_hours * 3600


def _apply_realistic_duration(payload: dict) -> dict:
    raw = payload.get("duration_s")
    if not isinstance(raw, (int, float)) or raw <= 0:
        return payload
    payload["driving_duration_s"] = round(raw)
    payload["duration_s"] = round(_realistic_duration_s(raw))
    return payload


@routing_router.post("/road-route")
async def build_road_route(body: RoadRouteRequest, _user=Depends(get_user)):
    key = _cache_key(body)
    cached = _cache_get(key)
    if cached:
        return cached

    yandex_key = (os.getenv("YANDEX_ROUTER_API_KEY") or "").strip()
    ors_key = (os.getenv("OPENROUTESERVICE_API_KEY") or os.getenv("ORS_API_KEY") or "").strip()
    prefer_global = _looks_like_china_corridor(body.points)

    if prefer_global and ors_key:
        try:
            payload = _apply_realistic_duration(await _request_ors(body, ors_key))
            _cache_put(key, payload)
            return payload
        except Exception:
            pass

    if yandex_key:
        try:
            payload = _apply_realistic_duration(await _request_yandex(body, yandex_key))
            _cache_put(key, payload)
            return payload
        except Exception:
            pass

    if ors_key:
        try:
            payload = _apply_realistic_duration(await _request_ors(body, ors_key))
            _cache_put(key, payload)
            return payload
        except Exception:
            pass

    if not yandex_key and not ors_key:
        raise HTTPException(status_code=503, detail="road_routing_not_configured")
    raise HTTPException(status_code=502, detail="road_route_unavailable")
