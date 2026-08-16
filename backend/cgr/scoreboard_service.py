"""Live CGR checkpoint data for the driver Border screen.

Important source split:
- /registry/scoreboard + flCheckpoint + flStatus=Pending is the *current*
  checkpoint board and is used for ``queue_length``.
- /registry/public-list is the booking registry for a date range.  It is NOT
  a current-queue counter and must never be globally crawled and truncated.
- checkpoint detail pages are the public source for the current daily limit.

The previous implementation scanned only the first 80 pages of the booking
registry and then wrote ``0`` for every checkpoint not seen in that truncated
window.  With 20k+ future bookings this produced convincing but false
"0 cars / Free" cards.  This module fails closed: a CGR fetch/parse failure
never becomes a zero.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone

from bs4 import BeautifulSoup

from database import cgr_dal

from .client import cgr_client
from .exceptions import CGRException, CGRParseError
from .parsers import parse_public_list
from .settings import cgr_settings

logger = logging.getLogger("cgr.scoreboard")

# Official country reference filters on the CGR checkpoint directory.
_COUNTRY_FILTER = {"CN": "x045", "RU": "x181", "UZ": "x225", "KG": "x109", "TM": "x210"}

# Verified public CGR checkpoint ids for the five KZ↔CN crossings.  They are a
# resilience fallback; seed_checkpoints_from_cgr still discovers ids from the
# official checkpoint links on every backend start.
_KNOWN_CGR_IDS = {
    "Бахты - Покиту": "224749863825000000",
    "Достык - Алашанькоу": "215778822067000000",
    "Калжат - Дулаты": "222979531669000000",
    "Майкапчагай - Зимунай": "224751327844000000",
    "Нур Жолы - Хоргос": "222978891854000000",
}

# code -> official numeric CGR CheckpointId.  Populated by the startup seed.
_external_id_by_code: dict[str, str] = {}

# Metadata which does not belong in cgr_scoreboard's queue time-series.
# code -> {daily_capacity, meta_updated_at, cgr_checkpoint_id, ...}
_live_meta_by_code: dict[str, dict] = {}
_CAPACITY_TTL_SEC = 6 * 60 * 60

# We refresh the 5 China crossings every 5 minutes because they are the main
# international-driver path.  Other checkpoints rotate through a bounded
# batch so we stay below CGR_RATE_LIMIT_REQUESTS_PER_MIN (default 20).
_NON_CN_BATCH = 10
_non_cn_cursor = 0

_metrics_success = 0
_metrics_error = 0


def _parse_total_records(html: str) -> int:
    """Parse CGR's authoritative ``Всего записей N`` counter.

    Zero is valid only when that counter is actually present and equals zero.
    Missing/changed markup raises instead of silently returning 0.
    """
    text = BeautifulSoup(html or "", "lxml").get_text(" ", strip=True)
    m = re.search(r"Всего\s+записей\s*([0-9\s\u00a0]+)", text, flags=re.IGNORECASE)
    if not m:
        raise CGRParseError("CGR total-records marker not found")
    digits = re.sub(r"\D", "", m.group(1))
    if digits == "":
        raise CGRParseError("CGR total-records marker has no number")
    return int(digits)


def _parse_current_capacity(html: str, on_date: date | None = None) -> int | None:
    """Return the latest published ``ТС/сутки`` limit effective on ``on_date``.

    CGR detail pages list future and historic limit changes.  We deliberately
    choose the newest date <= today, not the first number in the page.
    """
    on_date = on_date or datetime.now(timezone.utc).date()
    text = " ".join(BeautifulSoup(html or "", "lxml").stripped_strings)
    changes: list[tuple[date, int]] = []
    for ds, raw_value in re.findall(
        r"C\s*(\d{2}\.\d{2}\.\d{4})\s*([0-9\s\u00a0]+)\s*ТС/сутки",
        text,
        flags=re.IGNORECASE,
    ):
        try:
            effective = datetime.strptime(ds, "%d.%m.%Y").date()
            value = int(re.sub(r"\D", "", raw_value))
        except (ValueError, TypeError):
            continue
        if effective <= on_date:
            changes.append((effective, value))
    if not changes:
        return None
    return max(changes, key=lambda item: item[0])[1]


def _checkpoint_links(html: str) -> list[tuple[str, str]]:
    """Extract (display name, numeric CheckpointId) from the CGR directory."""
    soup = BeautifulSoup(html or "", "lxml")
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = str(a.get("href") or "")
        m = re.search(r"/registry/checkpoint/list/(\d+)/view", href)
        if not m:
            continue
        name = a.get_text(" ", strip=True)
        if " - " not in name or name in seen:
            continue
        seen.add(name)
        found.append((name, m.group(1)))
    return found


def _remember_external_id(name: str, country: str, external_id: str) -> str:
    code = cgr_dal.upsert_checkpoint(name_ru=name, country_to=country)
    _external_id_by_code[code] = str(external_id)
    _live_meta_by_code.setdefault(code, {})["cgr_checkpoint_id"] = str(external_id)
    return code


async def seed_checkpoints_from_cgr() -> int:
    """Refresh checkpoint names/countries and discover official CheckpointIds."""
    seeded_codes: list[str] = []
    count = 0
    for country, country_ref in _COUNTRY_FILTER.items():
        try:
            html = await cgr_client.fetch_checkpoint_list(country_code=country_ref)
            links = _checkpoint_links(html)
        except Exception as exc:  # fail soft: existing DB remains usable
            logger.warning("cgr.scoreboard: seed %s failed: %s", country, exc)
            continue
        for name, external_id in links:
            seeded_codes.append(_remember_external_id(name, country, external_id))
            count += 1

    # Ensure the five strategic China crossings remain resolvable even if the
    # CGR directory page is temporarily incomplete or paginated differently.
    for name, external_id in _KNOWN_CGR_IDS.items():
        code = cgr_dal.get_checkpoint_code_by_name(name)
        if code is None:
            code = _remember_external_id(name, "CN", external_id)
            seeded_codes.append(code)
            count += 1
        else:
            _external_id_by_code[code] = external_id
            _live_meta_by_code.setdefault(code, {})["cgr_checkpoint_id"] = external_id

    # Do not deactivate records from an incomplete/paginated directory fetch.
    # Only perform the old de-duplication when the discovery clearly covered
    # most of the official directory (currently ~50 checkpoints).
    unique_codes = list(dict.fromkeys(seeded_codes))
    if len(unique_codes) >= 40:
        cgr_dal.deactivate_checkpoints_except(unique_codes)

    logger.info(
        "cgr.scoreboard: seeded=%d, external_ids=%d",
        count,
        len(_external_id_by_code),
    )
    return count


async def _current_queue_for(external_id: str) -> int:
    """Current Pending count from the official online scoreboard."""
    response = await cgr_client.get(
        "/ru/registry/scoreboard",
        params={"flCheckpoint": external_id, "flStatus": "Pending"},
    )
    return _parse_total_records(response.text)


async def _capacity_for(external_id: str) -> int | None:
    response = await cgr_client.get(f"/ru/registry/checkpoint/list/{external_id}/view")
    return _parse_current_capacity(response.text)


def _capacity_is_fresh(code: str) -> bool:
    meta = _live_meta_by_code.get(code) or {}
    ts = meta.get("capacity_fetched_at_epoch")
    return bool(ts and time.time() - float(ts) < _CAPACITY_TTL_SEC)


async def _refresh_capacity(code: str, external_id: str) -> None:
    if _capacity_is_fresh(code):
        return
    value = await _capacity_for(external_id)
    meta = _live_meta_by_code.setdefault(code, {})
    meta["daily_capacity"] = value
    meta["capacity_fetched_at_epoch"] = time.time()
    meta["cgr_checkpoint_id"] = external_id


def _queue_targets(checkpoints: list[dict], first_cycle: bool) -> list[dict]:
    """Prioritise all CN checkpoints, then rotate a bounded non-CN slice."""
    global _non_cn_cursor
    cn = [cp for cp in checkpoints if cp.get("country_to") == "CN" and cp.get("code") in _external_id_by_code]
    other = [cp for cp in checkpoints if cp.get("country_to") != "CN" and cp.get("code") in _external_id_by_code]
    if first_cycle or not other:
        return cn

    n = min(_NON_CN_BATCH, len(other))
    selected = [other[(_non_cn_cursor + i) % len(other)] for i in range(n)]
    _non_cn_cursor = (_non_cn_cursor + n) % len(other)
    return cn + selected


async def _aggregate_queue() -> dict[str, int]:
    """Compatibility helper: exact current totals for the current bounded batch."""
    checkpoints = cgr_dal.get_all_checkpoints(active_only=True)
    targets = _queue_targets(checkpoints, first_cycle=False)
    totals: dict[str, int] = {}
    for cp in targets:
        external_id = _external_id_by_code.get(cp["code"])
        if not external_id:
            continue
        try:
            totals[cp["name_ru"]] = await _current_queue_for(external_id)
        except Exception as exc:
            logger.warning("cgr.scoreboard: queue fetch failed for %s: %s", cp["name_ru"], exc)
    return totals


async def fetch_board_rows(
    checkpoint: str | None = None,
    status: str | None = None,
    max_pages: int = 4,
) -> list[dict]:
    """Return booking-register rows, using the official checkpoint filter when known."""
    if not cgr_settings.feature_enabled:
        return []

    external_id = None
    if checkpoint:
        needle = checkpoint.strip().lower()
        for cp in cgr_dal.get_all_checkpoints(active_only=True):
            if needle in str(cp.get("name_ru") or "").lower():
                external_id = _external_id_by_code.get(cp["code"])
                break

    out: list[dict] = []
    prev_sig = None
    for page in range(1, max_pages + 1):
        params: dict = {"p": page}
        if status:
            params["flStatus"] = status
        if external_id:
            params["flCheckpoint"] = external_id
        response = await cgr_client.get("/ru/registry/public-list", params=params)
        rows = parse_public_list(response.text)
        if not rows:
            break
        sig = (rows[0]["plate"], rows[0]["checkpoint"], len(rows))
        if sig == prev_sig:
            break
        prev_sig = sig
        out.extend(rows)
        if len(rows) < 15:
            break

    if checkpoint and not external_id:
        needle = checkpoint.strip().lower()
        out = [r for r in out if needle in (r.get("checkpoint") or "").lower()]
    return out


async def fetch_and_store() -> dict:
    """Refresh exact current queue values without ever manufacturing zeros."""
    global _metrics_success, _metrics_error

    if not cgr_settings.feature_enabled:
        return {"skipped": True}

    # A process may call this before the bootstrap seed completed.  Populate
    # official ids first rather than falling back to the old global crawl.
    if not _external_id_by_code:
        await seed_checkpoints_from_cgr()

    checkpoints = cgr_dal.get_all_checkpoints(active_only=True)
    cn_capacity_missing = any(
        cp.get("country_to") == "CN"
        and cp.get("code") in _external_id_by_code
        and not _capacity_is_fresh(cp["code"])
        for cp in checkpoints
    )
    targets = _queue_targets(checkpoints, first_cycle=cn_capacity_missing)

    stored = 0
    failed = 0
    queue_total = 0
    for cp in targets:
        code = cp["code"]
        external_id = _external_id_by_code.get(code)
        if not external_id:
            continue
        try:
            count = await _current_queue_for(external_id)
            # A literal 0 from CGR's own "Всего записей 0" is valid.  Fetch or
            # parse failures never reach this insert path.
            cgr_dal.insert_scoreboard_entry(
                checkpoint_code=code,
                direction="IN",
                queue_length=count,
                estimated_wait_minutes=None,
                raw_payload={"source": "cgr_scoreboard", "checkpoint_id": external_id},
            )
            stored += 1
            queue_total += count
        except Exception as exc:
            failed += 1
            _metrics_error += 1
            logger.warning("cgr.scoreboard: current queue failed for %s: %s", cp.get("name_ru"), exc)
        await asyncio.sleep(0.08)

    # On the first cycle this adds at most five detail requests.  Combined
    # with the five country-directory seed requests and five CN queue requests
    # it remains within the configured 20 req/min integration budget.
    for cp in checkpoints:
        if cp.get("country_to") != "CN":
            continue
        code = cp["code"]
        external_id = _external_id_by_code.get(code)
        if not external_id or _capacity_is_fresh(code):
            continue
        try:
            await _refresh_capacity(code, external_id)
        except Exception as exc:
            _metrics_error += 1
            logger.warning("cgr.scoreboard: capacity failed for %s: %s", cp.get("name_ru"), exc)
        await asyncio.sleep(0.08)

    if stored:
        _metrics_success += 1
    logger.info(
        "cgr.scoreboard: exact current queues stored=%d failed=%d batch_total=%d",
        stored,
        failed,
        queue_total,
    )
    return {"checkpoints": stored, "failed": failed, "total_in_queue": queue_total}


def metrics() -> dict[str, int]:
    return {"success": _metrics_success, "error": _metrics_error}


def build_scoreboard_response() -> dict:
    """Combine latest exact queue rows with cached public checkpoint metadata."""
    checkpoints = cgr_dal.get_all_checkpoints(active_only=True)
    latest = cgr_dal.get_latest_scoreboard()
    latest_idx: dict[tuple[str, str], dict] = {
        (r["checkpoint_code"], r["direction"]): r for r in latest
    }

    now = datetime.now(timezone.utc)
    stale_threshold = timedelta(minutes=60)
    out = []

    for cp in checkpoints:
        in_row = latest_idx.get((cp["code"], "IN"))
        out_row = latest_idx.get((cp["code"], "OUT"))
        most_recent = None
        for row in (in_row, out_row):
            if row and row.get("fetched_at"):
                try:
                    t = datetime.fromisoformat(str(row["fetched_at"]).replace("Z", "+00:00"))
                except ValueError:
                    t = None
                if t and (most_recent is None or t > most_recent):
                    most_recent = t

        if most_recent is None:
            status = "unavailable"
        else:
            aware = most_recent.replace(tzinfo=timezone.utc) if most_recent.tzinfo is None else most_recent
            status = "stale" if now - aware > stale_threshold else "ok"

        meta = _live_meta_by_code.get(cp["code"], {})
        external_id = _external_id_by_code.get(cp["code"]) or meta.get("cgr_checkpoint_id")
        out.append({
            "code": cp["code"],
            "name_ru": cp["name_ru"],
            "name_kz": cp.get("name_kz"),
            "name_cn": cp.get("name_cn"),
            "name_en": cp.get("name_en"),
            "country_to": cp["country_to"],
            "cgr_checkpoint_id": external_id,
            "directions": {
                "in": {
                    "queue_length": in_row["queue_length"] if in_row else None,
                    "estimated_wait_minutes": in_row["estimated_wait_minutes"] if in_row else None,
                },
                "out": {
                    "queue_length": out_row["queue_length"] if out_row else None,
                    "estimated_wait_minutes": out_row["estimated_wait_minutes"] if out_row else None,
                },
            },
            "daily_capacity": meta.get("daily_capacity"),
            # The public waiting-area register has no checkpoint filter: do not
            # fake a per-checkpoint count from its global total.
            "waiting_area_count": None,
            # Exact free booking date lives inside the authenticated booking
            # flow; leave unknown until an official endpoint/token is available.
            "next_available_booking": None,
            "booking_url": (
                f"https://cgr.qoldau.kz/ru/application/list/op/-1/-1/CreateV2Create?CheckpointId={external_id}"
                if external_id else None
            ),
            "status": status,
            "last_updated": most_recent.isoformat() if most_recent else None,
        })

    return {"fetched_at": now.isoformat(), "checkpoints": out}
