"""DAL отдельной сущности Vehicle."""
from pathlib import Path
import sqlite3
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


class VehicleNotOwned(Exception):
    """Track: Vehicle Security & Trip Integrity Repair (2026-09-11).

    Raised when a caller supplies a vehicle_id that either does not exist at
    all, or exists but belongs to a different owner_user_id. Deliberately a
    SINGLE exception for both cases -- the API layer maps this to ONE 404,
    so a caller cannot distinguish "not yours" from "does not exist" (closes
    the existence-oracle finding from the overnight forensic audit: a PUT
    against a foreign vehicle_id used to fall through to an INSERT that hit
    the id PRIMARY KEY collision and returned a distinguishable 409).
    """


def init_vehicles_schema():
    schema = Path(__file__).resolve().parent / "vehicles_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))


def list_vehicles(owner_user_id: str):
    with get_conn() as c:
        return [dict(row) for row in c.execute(
            "SELECT * FROM vehicles WHERE owner_user_id = ? ORDER BY updated_at DESC, created_at DESC",
            (owner_user_id,),
        ).fetchall()]


def get_vehicle(owner_user_id: str, vehicle_id: str):
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM vehicles WHERE owner_user_id = ? AND id = ?",
            (owner_user_id, vehicle_id),
        ).fetchone()
    return dict(row) if row else None


def vehicle_owned_by(owner_user_id: str, vehicle_id: str) -> bool:
    """Existence + ownership in one check, for callers (e.g. create_trip)
    that only need a yes/no and must not leak which reason a 'no' was."""
    if not vehicle_id:
        return False
    return get_vehicle(owner_user_id, vehicle_id) is not None


def _payload_matches_row(row: dict, payload: dict) -> bool:
    """True when every field in payload already holds that exact value on
    row -- used to tell a genuine retry (same data, resubmitted after a
    client timeout) apart from a real conflict (a second, different vehicle
    that happens to share a license plate with an existing one)."""
    return all(row.get(key) == value for key, value in payload.items())


def upsert_vehicle(owner_user_id: str, payload: dict, vehicle_id: str | None = None):
    """Create or update a Vehicle owned by owner_user_id.

    Track: Vehicle Security & Trip Integrity Repair (2026-09-11).

    - vehicle_id given but not owned by owner_user_id (missing OR belongs to
      someone else) -> raises VehicleNotOwned, before any write. Previously
      this fell through to the "create" branch with vid = vehicle_id,
      producing an INSERT that collided with the foreign row's PRIMARY KEY
      and leaked a distinguishable 409 (existence oracle) -- and, for a
      *non-existent* vehicle_id, silently created a NEW row using someone
      else's id shape with no ownership problem at all, which was simply
      the wrong operation for an "update my own vehicle" call.
    - No vehicle_id, license_plate collides with an existing vehicle for
      the SAME owner, and the submitted payload is byte-for-byte identical
      to what's already stored -> idempotent replay: return the existing
      row instead of raising. Covers a client retrying an already-
      successful create after a timeout without silently duplicating or
      hard-failing a request the user will just retry again.
    - No vehicle_id, license_plate collides, but the payload actually
      differs -> genuine conflict, still raises (UNIQUE constraint
      violation) for the API layer to map to 409.

    Concurrency: the actual duplicate-prevention guarantee is the DB-level
    UNIQUE(owner_user_id, license_plate) index (vehicles_schema.sql), not
    this function's own SELECT-before-INSERT (which can race). Two
    near-simultaneous creates with the same plate: SQLite serializes the
    two INSERTs at commit time regardless of what either SELECT saw, so the
    second INSERT always fails the UNIQUE constraint even if both SELECTs
    ran before either commit -- see test_vehicle_save_concurrency.py.
    """
    with get_conn() as c:
        if vehicle_id:
            existing = c.execute(
                "SELECT id FROM vehicles WHERE id = ? AND owner_user_id = ?",
                (vehicle_id, owner_user_id),
            ).fetchone()
            if not existing:
                raise VehicleNotOwned(vehicle_id)
            vid = existing["id"]
            sets = ", ".join(f"{key} = ?" for key in payload)
            c.execute(
                f"UPDATE vehicles SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?",
                (*payload.values(), vid, owner_user_id),
            )
            row = c.execute("SELECT * FROM vehicles WHERE id = ?", (vid,)).fetchone()
            return dict(row)

        try:
            vid = new_id()
            c.execute(
                "INSERT INTO vehicles (id, owner_user_id, " + ", ".join(payload) + ") VALUES (?, ?, " + ", ".join("?" for _ in payload) + ")",
                (vid, owner_user_id, *payload.values()),
            )
            row = c.execute("SELECT * FROM vehicles WHERE id = ?", (vid,)).fetchone()
            return dict(row)
        except sqlite3.IntegrityError:
            # UNIQUE(owner_user_id, license_plate) fired -- either this is a
            # retried request for a plate we already saved (idempotent: hand
            # back the existing row), or a genuine second, different vehicle
            # trying to reuse a plate that's already taken (real conflict:
            # re-raise so the API returns 409).
            existing_row = c.execute(
                "SELECT * FROM vehicles WHERE owner_user_id = ? AND license_plate = ?",
                (owner_user_id, payload["license_plate"]),
            ).fetchone()
            if existing_row and _payload_matches_row(dict(existing_row), payload):
                return dict(existing_row)
            raise
