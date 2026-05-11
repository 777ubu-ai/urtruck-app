#!/usr/bin/env python3
"""Stage 52 / P0-6: read-only отчёт по «грязным» ставкам в bids.

На TestFlight build 1.0.0 (1) пользователь увидел в cargo detail список
из 15 ставок, в которых смешаны реальные водители и тестовые/гостевые
записи (guest_<uuid>, agent-<id>, "Bid Serik [ar-...]", rejected).

Этот скрипт НЕ удаляет ничего. Он только показывает, сколько и каких
именно ставок попали бы под cleanup-критерий, чтобы можно было принять
решение по-человечески перед отдельной cleanup-миграцией.

Usage:
  python3 backend/scripts/dirty_bids_report.py
  DB_PATH=/path/to/security.db python3 backend/scripts/dirty_bids_report.py

Если потребуется реальный cleanup — он пойдёт отдельным скриптом по
аналогии с cleanup_dirty_cargos.py (с обязательным бэкапом БД).
"""
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import config  # type: ignore
    DEFAULT_DB = config.DB_PATH
except Exception:
    DEFAULT_DB = os.getenv(
        "DB_PATH",
        "/home/ubuntu/urtruck/backend/database/security.db",
    )

DIRTY_BIDDER_PREFIXES = ("guest_", "agent-", "test_", "qa_")
DIRTY_NAME_TOKENS = (
    "test", "demo", "seed", "mock", "qa", "playwright",
    "тест", "тестер", "баке", "володя", "автотест", "трусы",
    "белик", "серик", "serik", "boris",
)
HIDDEN_STATUSES = ("cancelled", "rejected")


def _has_dirty_token(*fields):
    blob = " ".join(str(f or "") for f in fields).lower()
    return any(tok in blob for tok in DIRTY_NAME_TOKENS)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB
    if not Path(db_path).exists():
        print(f"❌ DB не найдена: {db_path}", file=sys.stderr)
        sys.exit(2)
    print(f"DB: {db_path}")
    print()

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    total = cur.execute("SELECT COUNT(*) FROM bids").fetchone()[0]
    print(f"Всего bids: {total}")
    print()

    # 1. По статусам
    print("=== bids по статусам ===")
    for status, n in cur.execute(
        "SELECT COALESCE(status,'(null)'), COUNT(*) FROM bids GROUP BY status ORDER BY 2 DESC"
    ):
        marker = " ← скрыт в public" if status in HIDDEN_STATUSES else ""
        print(f"  {status:15} {n:5}{marker}")
    print()

    # 2. По префиксу bidder_id
    print("=== bidder_id по префиксу ===")
    prefix_counts = {}
    other_count = 0
    for (bid_id,) in cur.execute("SELECT bidder_id FROM bids"):
        bid_id_l = (bid_id or "").lower()
        matched = False
        for p in DIRTY_BIDDER_PREFIXES:
            if bid_id_l.startswith(p):
                prefix_counts[p] = prefix_counts.get(p, 0) + 1
                matched = True
                break
        if not matched:
            other_count += 1
    for p in DIRTY_BIDDER_PREFIXES:
        n = prefix_counts.get(p, 0)
        print(f"  {p:10} {n:5} ← prefix считается dirty")
    print(f"  {'(other)':10} {other_count:5}")
    print()

    # 3. По имени/телефону (DIRTY_NAME_TOKENS)
    print("=== bids с dirty name/phone (substring match) ===")
    dirty_name_count = 0
    samples = []
    for row in cur.execute("SELECT id, bidder_id, bidder_name, bidder_phone, status FROM bids"):
        if _has_dirty_token(row["bidder_name"], row["bidder_phone"]):
            dirty_name_count += 1
            if len(samples) < 10:
                samples.append(row)
    print(f"  всего: {dirty_name_count}")
    for r in samples:
        print(f"    [{r['status']:9}] {r['bidder_id']} | {r['bidder_name']!r:30} | {r['bidder_phone']!r}")
    print()

    # 4. По cargo_id — сколько cargo имеют только dirty bids
    print("=== cargos с количеством грязных ставок ===")
    rows = cur.execute("""
        SELECT cargo_id, COUNT(*) as n FROM bids
        WHERE cargo_id IS NOT NULL
        GROUP BY cargo_id ORDER BY n DESC LIMIT 10
    """).fetchall()
    for r in rows:
        dirty_in_cargo = cur.execute("""
            SELECT COUNT(*) FROM bids WHERE cargo_id = ? AND (
                LOWER(bidder_id) LIKE 'guest_%' OR
                LOWER(bidder_id) LIKE 'agent-%' OR
                LOWER(bidder_id) LIKE 'test_%' OR
                LOWER(bidder_id) LIKE 'qa_%' OR
                status IN ('cancelled', 'rejected')
            )
        """, (r["cargo_id"],)).fetchone()[0]
        print(f"  cargo={r['cargo_id']}: bids={r['n']:3} (dirty/hidden={dirty_in_cargo})")
    print()

    # 5. Итоговый счёт — сколько bids останется в public listing
    hidden_total = cur.execute(f"""
        SELECT COUNT(*) FROM bids WHERE
            LOWER(bidder_id) LIKE 'guest_%' OR
            LOWER(bidder_id) LIKE 'agent-%' OR
            LOWER(bidder_id) LIKE 'test_%' OR
            LOWER(bidder_id) LIKE 'qa_%' OR
            status IN {HIDDEN_STATUSES!r}
    """).fetchone()[0]
    print(f"=== ИТОГ ===")
    print(f"Скрыто из public list_bids: ~{hidden_total} / {total}")
    print(f"Останется видимыми (active/accepted/countered, не-dirty): ~{total - hidden_total}")
    print()
    print("Этот отчёт ничего не меняет в БД.")
    print("Полноценный cleanup делается отдельным скриптом (по примеру")
    print("cleanup_dirty_cargos.py), с обязательным бэкапом БД.")


if __name__ == "__main__":
    main()
