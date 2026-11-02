"""Локальный воспроизводимый benchmark старого и ограниченного vehicle scan.

Работает только на синтетической временной SQLite; к QA2/Telegram не подключается.
"""
import argparse
import json
import sqlite3
import tempfile
import time
from pathlib import Path

from services.external_freight_classifier import has_vehicle_supply_signal

MAX_SCAN = 50
VEHICLE_LOOKAHEAD = 500
PARSER_REVISION = "20261101-core-fields-v17"
ACTIVE_SECONDS = 10 * 24 * 3600


def make_source(path: Path, rows: int, now: float, vehicle_count: int):
    db = sqlite3.connect(path)
    db.executescript("""
    CREATE TABLE app_messages(
      id INTEGER PRIMARY KEY, source TEXT, source_id TEXT, source_message INTEGER,
      source_date REAL, text TEXT, phones TEXT, revision TEXT, received_at REAL, updated_at REAL
    );
    CREATE INDEX app_messages_published ON app_messages(source_date DESC,updated_at DESC,id DESC);
    """)
    data = []
    vehicle_positions = {rows - 1}
    if vehicle_count > 1:
        vehicle_positions.update(round((rows - 1) * i / (vehicle_count - 1)) for i in range(vehicle_count))
    for i in range(rows):
        text = ("Машина свободна\nТашкент → Алматы" if i in vehicle_positions else
                "Нужен тент для перевозки груза\nАлматы → Москва")
        stamp = now - (rows - i)
        data.append(("approved_source", "synthetic", i + 1, stamp, text, "[]", "r1", stamp, stamp))
        if len(data) == 2000:
            db.executemany("INSERT INTO app_messages(source,source_id,source_message,source_date,text,phones,revision,received_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", data)
            data.clear()
    if data:
        db.executemany("INSERT INTO app_messages(source,source_id,source_message,source_date,text,phones,revision,received_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", data)
    db.commit()
    db.close()


def scan(path: Path, state_path: Path, now: float, bounded: bool):
    calls = 0

    def hint(text):
        nonlocal calls
        calls += 1
        return has_vehicle_supply_signal(text or "")

    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("ATTACH DATABASE ? AS bridge_state", (state_path.as_uri(),))
    db.create_function("bridge_vehicle_hint", 1, hint, deterministic=True)
    unseen = "NOT EXISTS(SELECT 1 FROM bridge_state.incoming_bridge_seen s WHERE s.source_queue_id=q.id AND s.source_revision=q.revision || ':' || ?)"
    query = f"SELECT q.* FROM app_messages q WHERE source_date>=? AND source_date<=? AND {unseen} AND lower(q.source)<>?"
    args = (now - ACTIVE_SECONDS, now + 300, PARSER_REVISION, "urtruck")
    started = time.perf_counter()
    if bounded:
        lookahead = db.execute(query + " ORDER BY source_date DESC,updated_at DESC,id DESC LIMIT ?", (*args, VEHICLE_LOOKAHEAD)).fetchall()
        vehicles = [row for row in lookahead if hint(row["text"])][:10]
    else:
        scope = "lower(q.source)<>?"
        old_hint = f"CASE WHEN {scope} AND {unseen} THEN bridge_vehicle_hint(q.text) ELSE 0 END"
        vehicles = db.execute(query + f" AND {old_hint} ORDER BY source_date DESC,updated_at DESC,id DESC LIMIT 10",
                              (*args, "urtruck", PARSER_REVISION)).fetchall()
    newest = db.execute(query + " ORDER BY source_date DESC,updated_at DESC,id DESC LIMIT 10", args).fetchall()
    oldest = db.execute(query + " ORDER BY source_date ASC,updated_at ASC,id ASC LIMIT ?", (*args, MAX_SCAN)).fetchall()
    selected = {row["id"]: row for row in (*vehicles, *newest, *oldest)}
    chosen = list(selected.values())[:MAX_SCAN]
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    db.close()
    return {"scan_ms": elapsed_ms, "hint_calls": calls, "selected_rows": len(chosen),
            "vehicle_candidates": len(vehicles)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--vehicle-count", type=int, default=2)
    args = parser.parse_args()
    if not 100 <= args.rows <= 1_000_000 or not 1 <= args.repeats <= 10 or not 1 <= args.vehicle_count <= 20:
        parser.error("rows must be 100..1000000, repeats 1..10, vehicle-count 1..20")
    now = time.time()
    with tempfile.TemporaryDirectory(prefix="feed13-scan-") as directory:
        root = Path(directory)
        source = root / "source.sqlite3"
        state = root / "bridge.sqlite3"
        state_db = sqlite3.connect(state)
        state_db.execute("CREATE TABLE incoming_bridge_seen(source_queue_id INTEGER PRIMARY KEY,source_revision TEXT NOT NULL)")
        state_db.commit(); state_db.close()
        make_source(source, args.rows, now, args.vehicle_count)
        results = {}
        for name, bounded in (("old", False), ("candidate", True)):
            results[name] = [scan(source, state, now, bounded) for _ in range(args.repeats)]
        report = {"scope": "local synthetic SQLite scan only", "rows": args.rows,
                  "repeats": args.repeats, "mix": {"vehicle_rows": args.vehicle_count,
                  "cargo_rows": args.rows-args.vehicle_count},
                  "old": results["old"], "candidate": results["candidate"],
                  "candidate_hint_call_bound": VEHICLE_LOOKAHEAD}
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
