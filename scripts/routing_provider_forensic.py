#!/usr/bin/env python3
"""Secret-safe provider trace using the backend's ORS request contract."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson"
ROUTES = {
    "local_almaty": [[76.8512, 43.2220], [76.9000, 43.3000]],
    "intra_country_almaty_horgos": [[76.8512, 43.2220], [80.4137, 44.2113]],
    "international_yiwu_almaty": [[120.0762, 29.3079], [76.8512, 43.2220]],
    "phone_baseline_yiwu_moscow": [[120.0762, 29.3079], [37.6176, 55.7558]],
}


def safe_error(raw: bytes) -> dict:
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return {"body_class": "non_json"}
    if not isinstance(data, dict):
        return {"body_class": type(data).__name__}
    out = {"body_keys": sorted(data.keys())}
    err = data.get("error")
    if isinstance(err, dict):
        for key in ("code", "message", "status", "title", "detail"):
            if err.get(key) is not None:
                out[key] = err[key]
    for key in ("code", "message", "status", "title", "detail"):
        if data.get(key) is not None:
            out[key] = data[key]
    return out


def probe(name: str, coordinates: list[list[float]], key: str) -> None:
    payload = {
        "coordinates": coordinates,
        "preference": "recommended",
        "instructions": False,
        "geometry": True,
        "options": {"vehicle_type": "hgv"},
    }
    request = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": key,
            "Content-Type": "application/json",
            "Accept": "application/geo+json, application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            data = json.loads(response.read().decode("utf-8"))
        feature = (data.get("features") or [None])[0]
        geometry = ((feature or {}).get("geometry") or {}).get("coordinates") or []
        summary = ((feature or {}).get("properties") or {}).get("summary") or {}
        print(json.dumps({
            "route": name,
            "http": response.status,
            "provider": "openrouteservice",
            "geometry_count": len(geometry),
            "distance_m": summary.get("distance"),
            "duration_s": summary.get("duration"),
            "first_lon_lat": geometry[0] if geometry else None,
            "last_lon_lat": geometry[-1] if geometry else None,
        }, ensure_ascii=False))
    except urllib.error.HTTPError as exc:
        print(json.dumps({
            "route": name,
            "http": exc.code,
            "provider": "openrouteservice",
            "error": safe_error(exc.read()),
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "route": name,
            "http": 0,
            "provider": "openrouteservice",
            "error_class": type(exc).__name__,
            "error": str(exc)[:240],
        }, ensure_ascii=False))


def main() -> int:
    key = (os.getenv("OPENROUTESERVICE_API_KEY") or "").strip()
    if not key:
        print("ROUTING_FORENSIC=FAIL reason=missing_provider_key")
        return 2
    for name, coordinates in ROUTES.items():
        probe(name, coordinates, key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
