"""Complete public CGR checkpoint directory loader.

The CGR checkpoint directory is paginated.  The driver Border screen must show
all official checkpoints, but opening the screen itself stays DB-only.  This
module is used only by the one-time backend bootstrap (and as a resolver
fallback after a tap).
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from database import cgr_dal
from database.db import get_conn

from .client import cgr_client
from .exceptions import CGRParseError

logger = logging.getLogger("cgr.checkpoint_catalog")

# Text printed by CGR in every checkpoint card -> stable app country code.
_COUNTRY_BY_LABEL = {
    "Китай": "CN",
    "Россия": "RU",
    "Узбекистан": "UZ",
    "Кыргызстан": "KG",
    "Туркменистан": "TM",
    "Страны Каспийского моря": "CASPIAN",
}

_MAX_DIRECTORY_PAGES = 10
_external_id_by_code: dict[str, str] = {}


@dataclass(frozen=True)
class CheckpointDirectoryEntry:
    name: str
    external_id: str
    country: str


def _country_from_anchor(anchor) -> str | None:
    """Read the country from the closest CGR card row around a detail link."""
    node = anchor
    # Current CGR markup puts the country on the 5th ancestor (`row h-100`).
    # Walk a little further for resilience, but never up to the whole page.
    for _ in range(7):
        node = getattr(node, "parent", None)
        if node is None:
            break
        text = " ".join(node.stripped_strings)
        for label, code in _COUNTRY_BY_LABEL.items():
            if label in text:
                return code
    return None


def parse_directory_page(page: str) -> list[CheckpointDirectoryEntry]:
    """Parse checkpoint name/id/country from one public CGR directory page."""
    soup = BeautifulSoup(page or "", "lxml")
    out: list[CheckpointDirectoryEntry] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/registry/checkpoint/list/(\d+)/view", href)
        if not match:
            continue
        external_id = match.group(1)
        if external_id in seen:
            continue
        name = anchor.get_text(" ", strip=True)
        # #293: sanitize scraped name — strip control chars, escape HTML entities
        from .parsers import _sanitize_text
        name = _sanitize_text(name, max_len=200)
        # Detail links are authoritative; do not require a dash because CGR
        # also has single-name checkpoints such as "Порт Курык".
        if not name:
            continue
        country = _country_from_anchor(anchor)
        if not country:
            raise CGRParseError(f"CGR country not found for checkpoint {name}")
        seen.add(external_id)
        out.append(CheckpointDirectoryEntry(name=name, external_id=external_id, country=country))

    return out


def _remember(entry: CheckpointDirectoryEntry) -> str:
    code = cgr_dal.upsert_checkpoint(entry.name, country_to=entry.country)
    # Older upsert_checkpoint versions did not refresh country_to on conflict.
    # Correct it here so an existing partial seed is repaired immediately.
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE border_checkpoints
               SET name_ru = ?, country_from = 'KZ', country_to = ?,
                   is_active = 1, updated_at = CURRENT_TIMESTAMP
             WHERE code = ?
            """,
            (entry.name, entry.country, code),
        )
    _external_id_by_code[code] = entry.external_id
    return code


async def seed_full_catalog(max_pages: int = _MAX_DIRECTORY_PAGES) -> dict:
    """Walk every CGR directory page and upsert the complete official catalogue.

    Pagination stops when a page has no checkpoint rows or contributes no new
    checkpoint ids.  With the current official directory this is four pages and
    51 records, but the implementation intentionally does not hardcode 51.
    """
    active_codes: list[str] = []
    seen_external_ids: set[str] = set()
    pages = 0

    for page_number in range(1, max_pages + 1):
        html = await cgr_client.fetch_checkpoint_list(page=page_number)
        entries = parse_directory_page(html)
        if not entries:
            break
        new_entries = [e for e in entries if e.external_id not in seen_external_ids]
        if not new_entries:
            break
        pages += 1
        for entry in new_entries:
            seen_external_ids.add(entry.external_id)
            active_codes.append(_remember(entry))

    unique_codes = list(dict.fromkeys(active_codes))
    # Deactivate stale rows only after a clearly complete official scan.
    if len(unique_codes) >= 40:
        cgr_dal.deactivate_checkpoints_except(unique_codes)

    by_country: dict[str, int] = {}
    for code in unique_codes:
        cp = cgr_dal.get_checkpoint(code)
        country = str((cp or {}).get("country_to") or "XX")
        by_country[country] = by_country.get(country, 0) + 1

    result = {
        "records": len(unique_codes),
        "pages": pages,
        "countries": by_country,
    }
    logger.info("cgr.checkpoint_catalog: full seed %s", result)
    return result


async def resolve_external_id(cp: dict) -> str:
    """Resolve an official CGR id for one DB checkpoint without fan-out live data."""
    code = str(cp.get("code") or "")
    if code and code in _external_id_by_code:
        return _external_id_by_code[code]

    # A tap can arrive in the first few seconds after process start.  Perform
    # one lightweight full-directory seed rather than failing or guessing.
    await seed_full_catalog()
    if code and code in _external_id_by_code:
        return _external_id_by_code[code]

    name = str(cp.get("name_ru") or "")
    for candidate_code, external_id in _external_id_by_code.items():
        candidate = cgr_dal.get_checkpoint(candidate_code)
        if candidate and str(candidate.get("name_ru") or "") == name:
            return external_id
    raise CGRParseError(f"CGR checkpoint id not found for {name or code}")


def cached_external_id_count() -> int:
    return len(_external_id_by_code)


def clear_external_id_cache() -> None:
    _external_id_by_code.clear()
