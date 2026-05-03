#!/usr/bin/env python3
"""Soft-cleanup of dirty/stale cargos and their bids.

What it does (dry-run by default):
  1. Backs up the SQLite DB to <db>.backup_<YYYYmmddHHMMSS>
  2. Marks dirty/stale ACTIVE cargos as 'cancelled'
  3. Marks bids tied to those cargos as 'rejected' (only pending/countered)
  4. Recomputes bids_count on every cargo to match remaining clean bids
  5. Marks dirty trips as 'cancelled' too (driver_name contains test tokens)
  6. Never deletes rows; never touches accepted bids, taken cargos, deals,
     or completed history.

Usage:
  python3 backend/scripts/cleanup_dirty_cargos.py            # dry-run, prints plan
  python3 backend/scripts/cleanup_dirty_cargos.py --apply    # actually mutate
  DB_PATH=/path/to/security.db python3 ... --apply           # override DB

Run this once on production after deploying the new marketplace.py filter.
The API filter alone hides dirty rows from the public feed; this script makes
the DB itself reflect the same truth so admin UIs and aggregates are clean.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Use the same defaults as the FastAPI runtime if config.py is importable;
# fall back to env / hard-coded path otherwise so the script also runs from
# a freshly cloned tree.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import config  # type: ignore
    DEFAULT_DB = config.DB_PATH
except Exception:
    DEFAULT_DB = os.getenv(
        "DB_PATH", "/home/ubuntu/urtruck/backend/database/security.db"
    )

# Same set as marketplace.py:_is_dirty_text — keep in sync if you change one.
DIRTY_TOKENS = (
    "test", "demo", "seed", "mock", "qa", "playwright",
    "тест", "тестер", "баке", "володя", "автотест", "трусы",
    "белик", "серик",
)

PUBLIC_CUTOFF_DATE = "2026-05-01"


def is_dirty_text(*fields) -> bool:
    blob = " ".join(str(f or "") for f in fields).lower()
    return any(tok in blob for tok in DIRTY_TOKENS)


def parse_date(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:len(fmt.replace('%', '')) + 4], fmt).date()
        except Exception:
            continue
    return None


def is_stale_cargo(row: sqlite3.Row, today) -> bool:
    pickup = parse_date(row["pickup_date"])
    created = parse_date(row["created_at"])
    cutoff = parse_date(PUBLIC_CUTOFF_DATE)
    # Stale pickup
    if pickup and pickup < (today - timedelta(days=1)):
        return True
    # Pre-cutoff create with no future pickup
    if created and cutoff and created < cutoff and (not pickup or pickup < today):
        return True
    # No pickup AND older than 2 days
    if not pickup and created and created < (today - timedelta(days=2)):
        return True
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Actually mutate the DB. Default is dry-run.")
    ap.add_argument("--db", default=DEFAULT_DB, help=f"Path to security.db (default: {DEFAULT_DB})")
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"❌ DB not found: {db_path}", file=sys.stderr)
        sys.exit(2)

    today = datetime.utcnow().date()

    # 1. Backup (only when --apply; dry-run shouldn't create files)
    if args.apply:
        ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        backup = db_path.with_suffix(db_path.suffix + f".backup_{ts}")
        shutil.copy2(db_path, backup)
        print(f"💾 Backup: {backup}")
    else:
        print("(dry-run — no backup, no writes)")

    conn = sqlite3.connect(str(db_path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")

    # 2. Identify dirty/stale ACTIVE cargos
    cargos = conn.execute("SELECT * FROM cargos WHERE status = 'active'").fetchall()
    dirty_cargo_ids = []
    for row in cargos:
        dirty = is_dirty_text(row["cargo_desc"], row["from_city"], row["to_city"], row["cargo_type"])
        stale = is_stale_cargo(row, today)
        if dirty or stale:
            dirty_cargo_ids.append((row["id"], "dirty" if dirty else "stale", row["cargo_desc"] or ""))

    print(f"\n🚛 Cargos to cancel: {len(dirty_cargo_ids)} of {len(cargos)} active")
    for cid, why, desc in dirty_cargo_ids[:20]:
        snippet = desc[:60].replace("\n", " ")
        print(f"  [{why:5}] {cid}  {snippet}")
    if len(dirty_cargo_ids) > 20:
        print(f"  … +{len(dirty_cargo_ids) - 20} more")

    # 3. Identify bids on those cargos that are still pending/countered
    bid_ids_to_reject = []
    if dirty_cargo_ids:
        placeholders = ",".join("?" * len(dirty_cargo_ids))
        rows = conn.execute(
            f"SELECT id, status FROM bids WHERE cargo_id IN ({placeholders}) "
            f"AND status IN ('pending', 'countered')",
            [c[0] for c in dirty_cargo_ids],
        ).fetchall()
        bid_ids_to_reject = [r["id"] for r in rows]

    # Also: bids from dirty bidders themselves (Тестер, Баке…) regardless of cargo
    dirty_bidder_rows = conn.execute(
        "SELECT id, bidder_name, bidder_phone, status FROM bids "
        "WHERE status IN ('pending', 'countered')"
    ).fetchall()
    dirty_bidder_ids = [
        r["id"] for r in dirty_bidder_rows
        if is_dirty_text(r["bidder_name"], r["bidder_phone"])
    ]
    print(f"\n💰 Bids to reject from dirty cargos:    {len(bid_ids_to_reject)}")
    print(f"💰 Bids to reject from dirty bidders:   {len(dirty_bidder_ids)}")

    # 4. Identify dirty TRIPS too
    trips = conn.execute("SELECT * FROM trips WHERE status = 'active'").fetchall()
    dirty_trip_ids = [
        t["id"] for t in trips
        if is_dirty_text(t["driver_name"], t["from_city"], t["to_city"], t["truck_type"])
    ]
    print(f"\n🛻 Trips to cancel: {len(dirty_trip_ids)} of {len(trips)} active")

    if not args.apply:
        print("\n→ run with --apply to perform the changes")
        conn.close()
        return

    # 5. Apply mutations
    cur = conn.cursor()
    if dirty_cargo_ids:
        placeholders = ",".join("?" * len(dirty_cargo_ids))
        cur.execute(
            f"UPDATE cargos SET status = 'cancelled' WHERE id IN ({placeholders})",
            [c[0] for c in dirty_cargo_ids],
        )
    all_bid_ids = list(set(bid_ids_to_reject + dirty_bidder_ids))
    if all_bid_ids:
        placeholders = ",".join("?" * len(all_bid_ids))
        cur.execute(
            f"UPDATE bids SET status = 'rejected', "
            f"updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
            all_bid_ids,
        )
    if dirty_trip_ids:
        placeholders = ",".join("?" * len(dirty_trip_ids))
        cur.execute(
            f"UPDATE trips SET status = 'cancelled' WHERE id IN ({placeholders})",
            dirty_trip_ids,
        )

    # 6. Recompute bids_count on every cargo to reflect remaining clean bids
    cur.execute("""
        UPDATE cargos SET bids_count = (
            SELECT COUNT(*) FROM bids b
            WHERE b.cargo_id = cargos.id
              AND b.status IN ('pending', 'countered', 'accepted')
        )
    """)

    conn.commit()
    conn.close()
    print("\n✅ Cleanup applied. API will see clean feed on next request.")


if __name__ == "__main__":
    main()
