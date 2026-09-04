"""Backfill cargos/trips.{from,to}_location_id из каталога (Main Route Filter V2).

Идемпотентен: трогает только строки, где location_id ещё NULL, и только когда
точка однозначно опознана. Неопознанные остаются NULL — они видны в scope
«вся страна», но не всплывают в фильтре по чужому городу.

Запуск: python3 backend/scripts/backfill_location_ids.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.db import get_conn                      # noqa: E402
from services import geo_catalog                      # noqa: E402


def backfill() -> dict:
    stats = {}
    with get_conn() as c:
        for table in ("cargos", "trips"):
            rows = c.execute(
                f"SELECT id, from_country, from_point_name, from_city, "
                f"to_country, to_point_name, to_city FROM {table} "
                f"WHERE from_location_id IS NULL OR to_location_id IS NULL"
            ).fetchall()
            done = 0
            for r in rows:
                d = dict(r)
                fid = (geo_catalog.resolve_location_id(d["from_country"], d["from_point_name"])
                       or geo_catalog.resolve_location_id(d["from_country"], d["from_city"]))
                tid = (geo_catalog.resolve_location_id(d["to_country"], d["to_point_name"])
                       or geo_catalog.resolve_location_id(d["to_country"], d["to_city"]))
                if not fid and not tid:
                    continue
                c.execute(
                    f"UPDATE {table} SET "
                    f"from_location_id = COALESCE(from_location_id, ?), "
                    f"to_location_id = COALESCE(to_location_id, ?) WHERE id = ?",
                    (fid, tid, d["id"]))
                done += 1
            stats[table] = {"scanned": len(rows), "updated": done}
        c.commit()
    return stats


if __name__ == "__main__":
    print(backfill())
