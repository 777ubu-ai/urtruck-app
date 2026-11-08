"""DAL отдельной сущности Vehicle."""
from pathlib import Path
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


def normalize_plate_key(value: str) -> str:
    """Canonical plate key that preserves non-Latin registration symbols."""
    return "".join(ch for ch in str(value).strip().upper() if ch.isalnum())


def _migrate_legacy_plate_identity(c):
    """SQLite не удаляет табличный UNIQUE через ALTER: переносим таблицу атомарно."""
    quote = lambda name: '"' + name.replace('"', '""') + '"'
    legacy = False
    for index in c.execute('PRAGMA index_list(vehicles)').fetchall():
        columns = [row['name'] for row in c.execute(f'PRAGMA index_info({quote(index["name"])})')]
        if index['unique'] and columns == ['owner_user_id', 'license_plate']:
            legacy = True
    if not legacy:
        return
    foreign_keys = c.execute('PRAGMA foreign_keys').fetchone()[0]
    c.execute('PRAGMA foreign_keys=OFF')
    try:
        c.execute('BEGIN IMMEDIATE')
        indexes = c.execute('PRAGMA index_list(vehicles)').fetchall()
        if not any(index['unique'] and [row['name'] for row in c.execute(f'PRAGMA index_info({quote(index["name"])})')] == ['owner_user_id', 'license_plate'] for index in indexes):
            c.commit()
            return
        original_sql = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='vehicles'").fetchone()[0]
        revised, count = re.subn(
            r'UNIQUE\s*\(\s*owner_user_id\s*,\s*license_plate\s*\)',
            'UNIQUE(owner_user_id, vehicle_registration_country_code, license_plate)',
            original_sql, flags=re.IGNORECASE,
        )
        if count != 1:
            raise RuntimeError('Неизвестная старая схема vehicles: миграция остановлена')
        revised, renamed = re.subn(r'^(CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?(?:"vehicles"|`vehicles`|\[vehicles\]|vehicles)(?=\s|\()',
                                  r'\1vehicles_identity_migration', revised, count=1, flags=re.IGNORECASE)
        if renamed != 1:
            raise RuntimeError('Не удалось подготовить копию vehicles')
        extra_objects = c.execute("SELECT sql FROM sqlite_master WHERE tbl_name='vehicles' AND type IN ('index','trigger') AND sql IS NOT NULL").fetchall()
        previous_violations = set(tuple(row) for row in c.execute('PRAGMA foreign_key_check'))
        columns = ','.join(quote(row['name']) for row in c.execute('PRAGMA table_info(vehicles)'))
        c.execute(revised)
        c.execute(f'INSERT INTO vehicles_identity_migration ({columns}) SELECT {columns} FROM vehicles')
        c.execute('DROP TABLE vehicles')
        c.execute('ALTER TABLE vehicles_identity_migration RENAME TO vehicles')
        for obj in extra_objects:
            c.execute(obj['sql'])
        if set(tuple(row) for row in c.execute('PRAGMA foreign_key_check')) - previous_violations:
            raise RuntimeError('Миграция vehicles нарушила внешние связи')
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.execute(f'PRAGMA foreign_keys={int(bool(foreign_keys))}')


def init_vehicles_schema():
    schema = Path(__file__).resolve().parent / "vehicles_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        _migrate_legacy_plate_identity(c)


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
            plate_key = normalize_plate_key(payload["license_plate"])
            country = str(payload["vehicle_registration_country_code"]).strip().upper()
            candidates = c.execute(
                "SELECT id, license_plate, vehicle_registration_country_code FROM vehicles WHERE owner_user_id = ? "
                "ORDER BY updated_at DESC, created_at DESC",
                (owner_user_id,),
            ).fetchall()
            existing = next((
                row for row in candidates
                if str(row["vehicle_registration_country_code"]).strip().upper() == country
                and normalize_plate_key(row["license_plate"]) == plate_key
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
