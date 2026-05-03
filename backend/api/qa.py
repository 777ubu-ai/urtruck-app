"""QA cleanup endpoint.

Soft-cancels marketplace records left behind by the QA agents (Serik / Boris)
after a `npm run qa:full` run. Only enabled when QA_CLEANUP_TOKEN is set in
the env — otherwise the endpoint is mounted but every request returns 403,
so the surface is invisible to anyone without the token.

Why an endpoint instead of just a script:
  - The previous client-side cleanup needed every owner's bearer token,
    which we don't always have once a QA run finishes.
  - With a server-side cancel we can do everything in one transaction and
    return reliable counts back to the QA framework.

Targets are records whose visible text fields contain the QA marker
"[ar-..." (the per-run tag the agents embed). Never DELETEs — only flips
status to 'cancelled' for trips/cargos and 'rejected' for bids. Accepted /
in_progress / delivered records are deliberately left alone, since by then
the QA flow has graduated into the deal/order pipeline that real users see.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database.db import get_conn

qa_router = APIRouter()

# Marker substring all QA agents inject. Change in lockstep with
# qa/utils/qaConfig.js if you ever want to rebrand the prefix.
QA_TAG_PREFIX = "[ar-"


def _require_token(provided: Optional[str]) -> None:
    expected = os.getenv("QA_CLEANUP_TOKEN")
    if not expected:
        # Endpoint is effectively disabled in production until the operator
        # opts in by setting the env var. 503 is more honest than 403 here
        # because the feature isn't configured at all.
        raise HTTPException(status_code=503, detail="QA cleanup endpoint not configured (QA_CLEANUP_TOKEN unset)")
    if not provided or provided != expected:
        raise HTTPException(status_code=403, detail="Invalid X-QA-Cleanup-Token")


class CleanupIn(BaseModel):
    run_id: Optional[str] = None    # narrow scope to a single QA run
    all: bool = False               # all [ar-...] markers when True
    confirm: bool = False           # required for non-dry mutations
    dry_run: bool = False           # report only, do not mutate


def _filter_clause(run_id: Optional[str], all_qa: bool):
    """Build a (sql_clause, params) pair matching QA-tagged rows.

    For trips: scans driver_name, from_city, to_city, transit, truck_type.
    For cargos: scans cargo_desc, from_city, to_city, cargo_type.
    For bids: scans bidder_name, message.
    """
    needle = f"%{QA_TAG_PREFIX}{run_id}]%" if (run_id and not all_qa) else f"%{QA_TAG_PREFIX}%"
    return needle


def _select_qa_trips(c, needle):
    return [dict(r) for r in c.execute(
        """
        SELECT id, driver_id, driver_name, from_city, to_city, transit, status
        FROM trips
        WHERE status = 'active' AND (
            (driver_name LIKE ?) OR (from_city LIKE ?) OR (to_city LIKE ?)
            OR (transit LIKE ?) OR (truck_type LIKE ?)
        )
        """,
        (needle, needle, needle, needle, needle),
    ).fetchall()]


def _select_qa_cargos(c, needle):
    return [dict(r) for r in c.execute(
        """
        SELECT id, owner_id, cargo_desc, from_city, to_city, cargo_type, status
        FROM cargos
        WHERE status = 'active' AND (
            (cargo_desc LIKE ?) OR (from_city LIKE ?) OR (to_city LIKE ?)
            OR (cargo_type LIKE ?)
        )
        """,
        (needle, needle, needle, needle),
    ).fetchall()]


def _select_qa_bids(c, needle, cargo_ids: List[str], trip_ids: List[str]):
    rows = []
    if cargo_ids or trip_ids:
        placeholders_c = ",".join("?" * len(cargo_ids)) if cargo_ids else None
        placeholders_t = ",".join("?" * len(trip_ids)) if trip_ids else None
        clauses = []
        params: list = []
        if placeholders_c:
            clauses.append(f"cargo_id IN ({placeholders_c})")
            params.extend(cargo_ids)
        if placeholders_t:
            clauses.append(f"trip_id IN ({placeholders_t})")
            params.extend(trip_ids)
        rows.extend([dict(r) for r in c.execute(
            f"SELECT id, bidder_id, status FROM bids "
            f"WHERE status IN ('pending', 'countered') AND ({' OR '.join(clauses)})",
            params,
        ).fetchall()])
    # Bids whose own message carries the marker — even if cargo/trip is gone
    rows.extend([dict(r) for r in c.execute(
        "SELECT id, bidder_id, status FROM bids "
        "WHERE status IN ('pending', 'countered') AND ("
        " (message LIKE ?) OR (bidder_name LIKE ?))",
        (needle, needle),
    ).fetchall()])
    # de-dup by id
    seen = set()
    out = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        out.append(r)
    return out


@qa_router.post("/cleanup")
def qa_cleanup(body: CleanupIn, x_qa_cleanup_token: Optional[str] = Header(None)):
    _require_token(x_qa_cleanup_token)
    if not body.all and not body.run_id:
        raise HTTPException(status_code=400, detail="Specify run_id or set all=true")
    if not body.dry_run and not body.confirm:
        raise HTTPException(status_code=400, detail="Mutating call requires confirm=true (or use dry_run=true)")

    needle = _filter_clause(body.run_id, body.all)

    with get_conn() as c:
        trips = _select_qa_trips(c, needle)
        cargos = _select_qa_cargos(c, needle)
        cargo_ids = [r["id"] for r in cargos]
        trip_ids = [r["id"] for r in trips]
        bids = _select_qa_bids(c, needle, cargo_ids, trip_ids)

        result = {
            "needle": needle,
            "dry_run": body.dry_run,
            "trips_found": len(trips),
            "cargos_found": len(cargos),
            "bids_found": len(bids),
            "trip_ids": trip_ids,
            "cargo_ids": cargo_ids,
            "bid_ids": [b["id"] for b in bids],
        }

        if body.dry_run:
            return result

        # Apply mutations. Each UPDATE is bounded to the IDs we just SELECTed
        # so there's no risk of the LIKE expression matching newer rows mid-run.
        if trip_ids:
            ph = ",".join("?" * len(trip_ids))
            c.execute(
                f"UPDATE trips SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                trip_ids,
            )
        if cargo_ids:
            ph = ",".join("?" * len(cargo_ids))
            c.execute(
                f"UPDATE cargos SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                cargo_ids,
            )
        if bids:
            bid_ids = [b["id"] for b in bids]
            ph = ",".join("?" * len(bid_ids))
            c.execute(
                f"UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                bid_ids,
            )
        # Recompute bids_count on every cargo so the public counter doesn't
        # drift after we mass-reject pending QA bids.
        c.execute(
            """
            UPDATE cargos SET bids_count = (
                SELECT COUNT(*) FROM bids b
                WHERE b.cargo_id = cargos.id
                  AND b.status IN ('pending', 'countered', 'accepted')
            )
            """
        )

    result["applied"] = True
    return result


@qa_router.get("/cleanup/info")
def qa_cleanup_info(x_qa_cleanup_token: Optional[str] = Header(None)):
    """Lightweight ping so the cleanup script can detect presence."""
    _require_token(x_qa_cleanup_token)
    return {
        "ok": True,
        "tag_prefix": QA_TAG_PREFIX,
        "endpoint": "/api/v1/qa/cleanup",
    }
