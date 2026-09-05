"""Backfill cargos/trips.{from,to}_location_id из каталога (Main Route Filter V2).

Идемпотентен: трогает только строки, где location_id ещё NULL, и только когда
точка однозначно опознана. Неопознанные остаются NULL — они видны в scope
«вся страна», но не всплывают в фильтре по чужому городу. Ничего не удаляет
и не перезаписывает: только COALESCE-заполнение NULL-колонок.

Запуск вручную:
    python3 backend/scripts/backfill_location_ids.py            # запись
    python3 backend/scripts/backfill_location_ids.py --dry-run  # только счётчики

Автозапуск: main.py startup() вызывает backfill() после init-схем (P1-B,
аудит 2026-09-05) — иначе легаси-объявления никогда не находятся фильтром
по городу. Повторный запуск дешёвый: сканируются только строки с NULL.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.db import get_conn                      # noqa: E402
from services import geo_catalog                      # noqa: E402


def backfill(dry_run: bool = False) -> dict:
    """Заполнить NULL-location_id по каталогу.

    Возвращает per-table статистику:
      scanned      — строк с NULL location_id просмотрено;
      updated      — строк обновлено (в dry-run это would-update);
      unresolved   — строк, где ни одна из двух точек не опознана
                     (останутся NULL и в следующем прогоне попадут в scanned).
    """
    stats = {"dry_run": dry_run}
    with get_conn() as c:
        for table in ("cargos", "trips"):
            rows = c.execute(
                f"SELECT id, from_country, from_point_name, from_city, "
                f"to_country, to_point_name, to_city, "
                f"from_location_id, to_location_id FROM {table} "
                f"WHERE from_location_id IS NULL OR to_location_id IS NULL"
            ).fetchall()
            done = 0
            unresolved = 0
            for r in rows:
                d = dict(r)
                fid = tid = None
                if d["from_location_id"] is None:
                    fid = (geo_catalog.resolve_location_id(d["from_country"], d["from_point_name"])
                           or geo_catalog.resolve_location_id(d["from_country"], d["from_city"]))
                tid_needed = d["to_location_id"] is None
                if tid_needed:
                    tid = (geo_catalog.resolve_location_id(d["to_country"], d["to_point_name"])
                           or geo_catalog.resolve_location_id(d["to_country"], d["to_city"]))
                if not fid and not tid:
                    unresolved += 1
                    continue
                if not dry_run:
                    c.execute(
                        f"UPDATE {table} SET "
                        f"from_location_id = COALESCE(from_location_id, ?), "
                        f"to_location_id = COALESCE(to_location_id, ?) WHERE id = ?",
                        (fid, tid, d["id"]))
                done += 1
            stats[table] = {"scanned": len(rows), "updated": done,
                            "unresolved": unresolved}
        if not dry_run:
            c.commit()
    return stats


def _summary(stats: dict) -> str:
    mode = "DRY-RUN (без записи)" if stats.get("dry_run") else "запись"
    lines = [f"backfill_location_ids [{mode}]:"]
    for table in ("cargos", "trips"):
        s = stats.get(table) or {}
        verb = "would-update" if stats.get("dry_run") else "updated"
        lines.append(
            f"  {table}: scanned={s.get('scanned', 0)} "
            f"{verb}={s.get('updated', 0)} unresolved={s.get('unresolved', 0)}")
    total_unresolved = sum((stats.get(t) or {}).get("unresolved", 0)
                           for t in ("cargos", "trips"))
    if total_unresolved:
        lines.append(
            f"  итого unresolved: {total_unresolved} строк — точки не опознаны "
            f"каталогом, останутся NULL (видны в scope «вся страна»).")
    return "\n".join(lines)


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv[1:]
    print(_summary(backfill(dry_run=dry)))
