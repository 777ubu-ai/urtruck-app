#!/usr/bin/env python3
"""Secret-safe smoke for Yandex Router API.

Reads a key from an environment variable or backend .env file, never prints it,
and proves both truck routing in Kazakhstan and a KZ→RU road route.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://api.routing.yandex.net/v2/route"


def _read_key(env_file: str | None) -> str:
    key = (os.getenv("YANDEX_ROUTER_API_KEY") or "").strip()
    if key:
        return key
    if not env_file:
        return ""
    path = Path(env_file)
    if not path.is_file():
        return ""
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("YANDEX_ROUTER_API_KEY="):
            return line.split("=", 1)[1].strip()
    return ""


def _route(key: str, waypoints: str, mode: str) -> tuple[int, float, float]:
    query = urllib.parse.urlencode({
        "waypoints": waypoints,
        "mode": mode,
        "traffic": "disabled",
        "apikey": key,
    })
    request = urllib.request.Request(f"{BASE}?{query}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = json.load(response)

    route = data.get("route") or {}
    legs = route.get("legs") or []
    if not legs:
        raise RuntimeError(f"{mode}: no legs")
    points = 0
    distance = 0.0
    duration = 0.0
    for leg in legs:
        if leg.get("status") != "OK":
            raise RuntimeError(f"{mode}: leg status {leg.get('status')}")
        for step in leg.get("steps") or []:
            distance += float(step.get("length") or 0)
            duration += float(step.get("duration") or 0)
            points += len((step.get("polyline") or {}).get("points") or [])
    if points < 2 or distance <= 0 or duration <= 0:
        raise RuntimeError(f"{mode}: empty geometry/summary")
    return points, distance, duration


def main() -> int:
    env_file = sys.argv[1] if len(sys.argv) > 1 else None
    key = _read_key(env_file)
    if not key:
        print("YANDEX_ROUTER_SMOKE=fail reason=missing_key")
        return 2

    # Truck entitlement/routing in Kazakhstan.
    truck_points, truck_distance, _ = _route(
        key,
        "43.238949,76.889709|51.169392,71.449074",
        "truck",
    )
    if truck_distance < 500_000:
        raise RuntimeError("truck KZ route implausibly short")

    # Cross-border road availability for the exact class of production bug.
    # Driving is used for the smoke because a generic Moscow city-centre point
    # can be truck-restricted; backend still tries truck first in real deals.
    ru_points, ru_distance, ru_duration = _route(
        key,
        "43.238949,76.889709|55.755864,37.617698",
        "driving",
    )
    if ru_distance < 2_000_000:
        raise RuntimeError("KZ-RU route implausibly short")

    print(
        "YANDEX_ROUTER_SMOKE=ok "
        f"kz_points={truck_points} kzru_points={ru_points} "
        f"kzru_km={round(ru_distance / 1000)} kzru_hours={round(ru_duration / 3600, 1)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
