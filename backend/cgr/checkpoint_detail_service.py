"""Lazy per-checkpoint CGR detail loader.

Design goals:
- opening Border screen never fans out to CGR;
- a checkpoint tap fetches only that checkpoint's public CGR pages;
- results are cached for five minutes to avoid duplicate CGR traffic;
- booking availability is parsed from CGR's public "Загруженность поста" grid;
- no missing value is converted to zero.
"""
from __future__ import annotations

import asyncio
import html as html_lib
import re
import time
from datetime import date, datetime, timezone

from bs4 import BeautifulSoup

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRParseError

_CACHE_TTL_SEC = 5 * 60
_cache: dict[str, tuple[float, dict]] = {}
_locks: dict[str, asyncio.Lock] = {}
_external_id_cache: dict[str, str] = {}

_COUNTRY_FILTER = {"CN": "x045", "RU": "x181", "UZ": "x225", "KG": "x109", "TM": "x210"}
_KNOWN_IDS = {
    "Бахты - Покиту": "224749863825000000",
    "Достык - Алашанькоу": "215778822067000000",
    "Калжат - Дулаты": "222979531669000000",
    "Майкапчагай - Зимунай": "224751327844000000",
    "Нур Жолы - Хоргос": "222978891854000000",
}
_RU_MONTHS = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "сент": 9, "окт": 10, "ноя": 11, "дек": 12,
}


def _lock_for(code: str) -> asyncio.Lock:
    lock = _locks.get(code)
    if lock is None:
        lock = asyncio.Lock()
        _locks[code] = lock
    return lock


def _checkpoint_links(page: str) -> dict[str, str]:
    soup = BeautifulSoup(page or "", "lxml")
    out: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = str(a.get("href") or "")
        match = re.search(r"/registry/checkpoint/list/(\d+)/view", href)
        if not match:
            continue
        name = a.get_text(" ", strip=True)
        if " - " in name:
            out[name] = match.group(1)
    return out


async def _resolve_external_id(cp: dict) -> str:
    code = str(cp["code"])
    if code in _external_id_cache:
        return _external_id_cache[code]

    name = str(cp.get("name_ru") or "")
    if name in _KNOWN_IDS:
        external_id = _KNOWN_IDS[name]
        _external_id_cache[code] = external_id
        return external_id

    stored = cp.get("cgr_external_id")
    if stored:
        external_id = str(stored)
        _external_id_cache[code] = external_id
        return external_id

    country = str(cp.get("country_to") or "").upper()
    country_filter = _COUNTRY_FILTER.get(country)
    page = await cgr_client.fetch_checkpoint_list(country_code=country_filter)
    links = _checkpoint_links(page)
    external_id = links.get(name)
    if not external_id:
        raise CGRParseError(f"CGR checkpoint id not found for {name}")
    _external_id_cache[code] = external_id
    return external_id


def _parse_total_records(page: str) -> int:
    text = BeautifulSoup(page or "", "lxml").get_text(" ", strip=True)
    match = re.search(r"Всего\s+записей\s*([0-9\s\u00a0]+)", text, flags=re.I)
    if not match:
        raise CGRParseError("CGR total-records marker not found")
    digits = re.sub(r"\D", "", match.group(1))
    if digits == "":
        raise CGRParseError("CGR total-records marker has no number")
    return int(digits)


def _parse_source_updated_at(page: str) -> str | None:
    text = " ".join(BeautifulSoup(page or "", "lxml").stripped_strings)
    match = re.search(r"Актуально\s+на:\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})", text, flags=re.I)
    if not match:
        return None
    try:
        dt = datetime.strptime(match.group(1), "%d.%m.%Y %H:%M")
        return dt.isoformat()
    except ValueError:
        return None


def _parse_capacity(page: str, today: date | None = None) -> int | None:
    today = today or datetime.now(timezone.utc).date()
    text = " ".join(BeautifulSoup(page or "", "lxml").stripped_strings)
    changes: list[tuple[date, int]] = []
    for ds, raw in re.findall(
        r"C\s*(\d{2}\.\d{2}\.\d{4})\s*([0-9\s\u00a0]+)\s*ТС/сутки",
        text,
        flags=re.I,
    ):
        try:
            effective = datetime.strptime(ds, "%d.%m.%Y").date()
            value = int(re.sub(r"\D", "", raw))
        except (ValueError, TypeError):
            continue
        if effective <= today:
            changes.append((effective, value))
    return max(changes, key=lambda item: item[0])[1] if changes else None


def _date_from_tooltip(day: int, month_token: str, today: date) -> date | None:
    month = _RU_MONTHS.get(month_token.lower().strip("."))
    if not month:
        return None
    year = today.year
    try:
        candidate = date(year, month, day)
    except ValueError:
        return None
    # CGR grid spans forward. If month wrapped past December, move to next year.
    if candidate < today and (today - candidate).days > 120:
        try:
            candidate = date(year + 1, month, day)
        except ValueError:
            return None
    return candidate


def _parse_booking_grid(page: str, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    soup = BeautifulSoup(page or "", "lxml")
    days: list[dict] = []

    for square in soup.select(".square-chart-container .square"):
        raw_title = square.get("title")
        if not raw_title:
            continue
        title = html_lib.unescape(str(raw_title))
        text = BeautifulSoup(title, "lxml").get_text(" ", strip=True)

        off = re.search(r"(\d{1,2})\s+([А-Яа-яA-Za-z]+).*Выходной\s+день", text, flags=re.I)
        if off:
            parsed = _date_from_tooltip(int(off.group(1)), off.group(2), today)
            if parsed and parsed >= today:
                days.append({
                    "date": parsed.isoformat(),
                    "standard_free": None,
                    "premium_free": None,
                    "is_day_off": True,
                })
            continue

        match = re.search(
            r"Свободно\s+на\s+(\d{1,2})\s+([А-Яа-яA-Za-z]+).*?за\s+1\s+МРП:\s*([0-9\s\u00a0]+).*?за\s+100\s+МРП:\s*([0-9\s\u00a0]+)",
            text,
            flags=re.I,
        )
        if not match:
            continue
        parsed = _date_from_tooltip(int(match.group(1)), match.group(2), today)
        if not parsed or parsed < today:
            continue
        standard = int(re.sub(r"\D", "", match.group(3)) or "0")
        premium = int(re.sub(r"\D", "", match.group(4)) or "0")
        days.append({
            "date": parsed.isoformat(),
            "standard_free": standard,
            "premium_free": premium,
            "is_day_off": False,
        })

    # Deduplicate because some detail pages can contain multiple square charts.
    unique: dict[str, dict] = {}
    for item in sorted(days, key=lambda x: x["date"]):
        current = unique.get(item["date"])
        if current is None:
            unique[item["date"]] = item
            continue
        # Prefer a real availability row over a day-off/empty duplicate.
        if current.get("standard_free") is None and item.get("standard_free") is not None:
            unique[item["date"]] = item
    calendar = list(unique.values())

    standard = next((d for d in calendar if not d["is_day_off"] and (d.get("standard_free") or 0) > 0), None)
    premium = next((d for d in calendar if not d["is_day_off"] and (d.get("premium_free") or 0) > 0), None)
    return {
        "calendar": calendar,
        "nearest_standard": standard,
        "nearest_premium": premium,
    }


def catalog() -> list[dict]:
    """Local-only catalogue. This function makes no CGR/network requests."""
    rows = cgr_dal.get_all_checkpoints(active_only=True)
    return [
        {
            "id": cp["code"],
            "code": cp["code"],
            "name": cp["name_ru"],
            "country": cp.get("country_to"),
        }
        for cp in rows
    ]


async def _fetch_live_uncached(code: str) -> dict:
    cp = cgr_dal.get_checkpoint(code)
    if not cp or not cp.get("is_active", 1):
        raise KeyError(code)

    external_id = await _resolve_external_id(cp)

    # Only two public CGR requests for a tap: detail + current scoreboard.
    detail_response, scoreboard_response = await asyncio.gather(
        cgr_client.get(f"/ru/registry/checkpoint/list/{external_id}/view"),
        cgr_client.get(
            "/ru/registry/scoreboard",
            params={"flCheckpoint": external_id, "flStatus": "Pending"},
        ),
    )

    booking = _parse_booking_grid(detail_response.text)
    nearest = booking["nearest_standard"]
    premium = booking["nearest_premium"]
    now = datetime.now(timezone.utc).isoformat()

    return {
        "id": code,
        "code": code,
        "name": cp["name_ru"],
        "country": cp.get("country_to"),
        "cgr_checkpoint_id": external_id,
        "source_type": "official",
        "source": "CGR",
        "fetched_at": now,
        "source_updated_at": _parse_source_updated_at(detail_response.text),
        "current_board_count": _parse_total_records(scoreboard_response.text),
        "daily_capacity": _parse_capacity(detail_response.text),
        "nearest_booking": nearest["date"] if nearest else None,
        "nearest_booking_free": nearest.get("standard_free") if nearest else None,
        "nearest_premium_booking": premium["date"] if premium else None,
        "nearest_premium_free": premium.get("premium_free") if premium else None,
        "booking_calendar": booking["calendar"],
        # CGR's public waiting-area checkpoint filter currently does not scope
        # results correctly. Do not show the global count as checkpoint-local.
        "waiting_area_count": None,
        "waiting_area_supported": False,
        "official_url": f"https://cgr.qoldau.kz/ru/registry/checkpoint/list/{external_id}/view",
    }


async def live_detail(code: str, force: bool = False) -> tuple[dict, bool]:
    now = time.time()
    cached = _cache.get(code)
    if not force and cached and now - cached[0] < _CACHE_TTL_SEC:
        return cached[1], True

    async with _lock_for(code):
        # Another request may have populated the cache while we waited.
        cached = _cache.get(code)
        if not force and cached and time.time() - cached[0] < _CACHE_TTL_SEC:
            return cached[1], True
        value = await _fetch_live_uncached(code)
        _cache[code] = (time.time(), value)
        return value, False


def clear_cache() -> None:
    _cache.clear()
