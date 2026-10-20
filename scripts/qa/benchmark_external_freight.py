#!/usr/bin/env python3
"""Изолированный SQLite-бенчмарк внешней ленты (по умолчанию 100k записей)."""
import argparse
import os
import statistics
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--size", type=int, default=100000)
args = parser.parse_args()
if args.size < 1000:
    raise SystemExit("--size must be at least 1000")

db_file = tempfile.NamedTemporaryFile(prefix="urtruck-external-feed-", suffix=".sqlite3", delete=False)
db_file.close()
os.environ["DB_PATH"] = db_file.name
ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(ROOT / "backend"))

from database import db
from database import external_freight_dal as dal

db.init_db()
dal.init_schema()
now = datetime.now(timezone.utc)
base = now - timedelta(days=5)
rows, bodies = [], []
with db.get_conn() as conn:
    for i in range(args.size):
        kind = "cargo" if i % 2 == 0 else "vehicle"
        city_ok = i % 10 == 0
        origin = "Алматы" if city_ok else f"Город-{i % 400}"
        destination = "Ташкент" if city_ok else f"Город-{(i + 37) % 400}"
        published = base + timedelta(seconds=i % (5 * 24 * 3600))
        item_id = f"bench-{i:07d}"
        source_message = f"{i:07d}"
        currency = "USD" if i % 3 else "KZT"
        amount = float(100 + (i % 5000))
        expiry = published + timedelta(hours=120)
        rows.append((item_id, kind, "bench", source_message, "0", published.isoformat(), now.isoformat(), now.isoformat(), expiry.isoformat(), "Нужен тент, груз готов", f"rev-{i}", origin, destination, "KZ", "UZ", origin.casefold(), destination.casefold(), "Тестовый груз", '["tent"]', 20.0, 100.0, 1, None, None, amount, currency, "known", "[]", "active", "synthetic", None))
        bodies.append((item_id, "tent"))
        if len(rows) == 5000:
            conn.executemany("""INSERT INTO external_freight_items(id,kind,source_id,source_message_id,segment_id,source_published_at,ingested_at,updated_at,expires_at,original_text,source_revision,origin,destination,origin_country,destination_country,origin_folded,destination_folded,cargo_name,body_types,weight,volume,vehicle_count,loading_date,ready_text,amount,currency,price_state,contacts,status,origin_source,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
            conn.executemany("INSERT INTO external_freight_item_body_types(item_id,body_type) VALUES(?,?)", bodies)
            rows.clear(); bodies.clear()
    if rows:
        conn.executemany("""INSERT INTO external_freight_items(id,kind,source_id,source_message_id,segment_id,source_published_at,ingested_at,updated_at,expires_at,original_text,source_revision,origin,destination,origin_country,destination_country,origin_folded,destination_folded,cargo_name,body_types,weight,volume,vehicle_count,loading_date,ready_text,amount,currency,price_state,contacts,status,origin_source,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
        conn.executemany("INSERT INTO external_freight_item_body_types(item_id,body_type) VALUES(?,?)", bodies)

date_from = (now - timedelta(days=5)).isoformat()
date_to = now.isoformat()
latencies = []
for _ in range(30):
    start = time.perf_counter()
    dal.list_items(kind="cargo", origin="алматы", destination="ташкент", origin_country="KZ", destination_country="UZ",
                   body_type="tent", published_from=date_from, published_to=date_to,
                   currency="USD", min_price=100, max_price=2500, sort="newest", limit=30)
    latencies.append((time.perf_counter() - start) * 1000)
ordered = sorted(latencies)
p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
print({"synthetic_rows": args.size, "sqlite_file": db_file.name, "query": "all route/body/date/currency/price filters + stable newest order + page 30", "runs": len(latencies), "p50_ms": round(statistics.median(latencies), 2), "p95_ms": round(p95, 2), "max_ms": round(max(latencies), 2)})
Path(db_file.name).unlink(missing_ok=True)
