"""DAL отдельной сущности Vehicle."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


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


def upsert_vehicle(owner_user_id: str, payload: dict, vehicle_id: str | None = None):
    with get_conn() as c:
        if vehicle_id:
            existing = c.execute(
                "SELECT id FROM vehicles WHERE id = ? AND owner_user_id = ?",
                (vehicle_id, owner_user_id),
            ).fetchone()
        else:
            existing = c.execute(
                "SELECT id FROM vehicles WHERE owner_user_id = ? AND license_plate = ?",
                (owner_user_id, payload["license_plate"]),
            ).fetchone()
        if existing:
            vid = existing["id"]
            sets = ", ".join(f"{key} = ?" for key in payload)
            c.execute(
                f"UPDATE vehicles SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?",
                (*payload.values(), vid, owner_user_id),
            )
        else:
            vid = vehicle_id or new_id()
            c.execute(
                "INSERT INTO vehicles (id, owner_user_id, " + ", ".join(payload) + ") VALUES (?, ?, " + ", ".join("?" for _ in payload) + ")",
                (vid, owner_user_id, *payload.values()),
            )
        row = c.execute("SELECT * FROM vehicles WHERE id = ?", (vid,)).fetchone()
    return dict(row)
