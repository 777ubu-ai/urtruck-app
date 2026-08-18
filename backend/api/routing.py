"""Server-side global road routing for routes outside Yandex routing coverage.

The map itself remains Yandex. This endpoint only returns road geometry +
summary so UrTruck can render a real international route (e.g. China → KZ)
without exposing a third-party routing key to browsers/mobile clients.
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

# HeiGIT announced api.openrouteservice.org shutdown for 2026-08-24.
# Use the replacement URL now so UrTruck does not ship a route service that
# is scheduled to disappear days after release.
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
    weight_t: Optional[float] = Field(default=None, gt=0, le=100)
    axle_load_t: Optional[float] = Field(default=None, gt=0, le=30)


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
        f"|wt={vehicle.weight_t}|ax={vehicle.axle_load_t}"
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
    """Keep route shape while protecting mobile/web payload size."""
    if len(points) <= limit:
        return points
    step = max(1, math.ceil((len(points) - 2) / (limit - 2)))
    sampled = [points[0], *points[1:-1:step], points[-1]]
    return sampled[:limit - 1] + [points[-1]] if len(sampled) > limit else sampled


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
    if vehicle.weight_t is not None:
        restrictions["weight"] = vehicle.weight_t
    if vehicle.axle_load_t is not None:
        restrictions["axleload"] = vehicle.axle_load_t
    result = {"vehicle_type": "hgv"}
    if restrictions:
        result["profile_params"] = {"restrictions": restrictions}
    return result


async def _request_ors(body: RoadRouteRequest, api_key: str) -> dict:
    # ORS expects [longitude, latitude]; UrTruck/Yandex components use
    # [latitude, longitude]. Convert only at the provider boundary.
    # Default ORS summary is distance in metres and duration in seconds.
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
    timeout = httpx.Timeout(20.0, connect=7.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(_ORS_URL, headers=headers, json=request_body)

    if response.status_code >= 400:
        detail = "global_router_failed"
        try:
            data = response.json()
            detail = data.get("error", {}).get("message") or data.get("error") or detail
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"routing_provider_error: {detail}")

    try:
        data = response.json()
        feature = (data.get("features") or [])[0]
        props = feature.get("properties") or {}
        summary = props.get("summary") or {}
        raw_geometry = ((feature.get("geometry") or {}).get("coordinates") or [])
        if len(raw_geometry) < 2:
            raise ValueError("empty geometry")
        geometry = _downsample([[float(lat), float(lng)] for lng, lat in raw_geometry])
        distance_m = float(summary.get("distance"))
        duration_s = float(summary.get("duration"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="routing_provider_invalid_response") from exc

    if not math.isfinite(distance_m) or distance_m <= 0 or not math.isfinite(duration_s) or duration_s <= 0:
        raise HTTPException(status_code=502, detail="routing_provider_invalid_summary")

    return {
        "ok": True,
        "provider": "openrouteservice",
        "profile": "driving-hgv",
        "distance_m": round(distance_m),
        "duration_s": round(duration_s),
        "geometry": geometry,
        "cached": False,
    }


@routing_router.post("/road-route")
async def build_road_route(body: RoadRouteRequest, _user=Depends(get_user)):
    """Return a real road polyline for authenticated UrTruck users.

    The provider key is server-only. We intentionally fail closed when it is
    missing: a straight line must never be presented as a real road route.
    """
    api_key = (os.getenv("OPENROUTESERVICE_API_KEY") or os.getenv("ORS_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="global_routing_not_configured")

    key = _cache_key(body)
    cached = _cache_get(key)
    if cached:
        return cached

    payload = await _request_ors(body, api_key)
    _cache_put(key, payload)
    return payload
