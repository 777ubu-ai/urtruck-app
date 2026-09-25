"""DAL отдельной сущности Vehicle."""
from pathlib import Path
import re
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
            plate_key = re.sub(r"[^0-9A-ZА-ЯЁ]", "", str(payload["license_plate"]).upper())
            candidates = c.execute(
                "SELECT id, license_plate FROM vehicles WHERE owner_user_id = ? "
                "ORDER BY updated_at DESC, created_at DESC",
                (owner_user_id,),
            ).fetchall()
            existing = next((
                row for row in candidates
                if re.sub(r"[^0-9A-ZА-ЯЁ]", "", str(row["license_plate"]).upper()) == plate_key
            ), None)
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


def has_active_references(owner_user_id: str, vehicle_id: str) -> bool:
    """Не даёт удалить машину, которая участвует в незавершённой работе."""
    checks = (
        (
            "SELECT 1 FROM trips WHERE driver_id = ? AND vehicle_id = ? "
            "AND status IN ('active', 'booked', 'in_transit') LIMIT 1",
            (owner_user_id, vehicle_id),
        ),
        (
            "SELECT 1 FROM bids WHERE bidder_id = ? AND vehicle_id = ? "
            "AND status IN ('pending', 'accepted', 'countered') LIMIT 1",
            (owner_user_id, vehicle_id),
        ),
        (
            "SELECT 1 FROM deals WHERE driver_id = ? AND vehicle_id = ? "
            "AND status NOT IN ('completed', 'cancelled', 'rejected', 'expired') LIMIT 1",
            (owner_user_id, vehicle_id),
        ),
    )
    with get_conn() as c:
        return any(c.execute(sql, params).fetchone() for sql, params in checks)


def delete_vehicle(owner_user_id: str, vehicle_id: str) -> bool:
    with get_conn() as c:
        cursor = c.execute(
            "DELETE FROM vehicles WHERE id = ? AND owner_user_id = ?",
            (vehicle_id, owner_user_id),
        )
        return cursor.rowcount > 0
